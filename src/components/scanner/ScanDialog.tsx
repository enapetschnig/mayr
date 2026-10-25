import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Camera, CameraOff, Check, Flashlight, FlashlightOff, Loader2, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { TON_KLASSE } from "@/lib/types";
import { cn } from "@/lib/utils";
import { leserErstellen, type Leser } from "./leser";

/**
 * Strichcode lesen — Kamera am Handy, Code eintippen als Rückfall.
 *
 * SCHNITTSTELLE (bleibt stabil, andere Module bauen darauf):
 *   open / onOpenChange  wie jeder Dialog
 *   onCode(code)         jeder gelesene Code (EAN-13/8, UPC-A/E, Code 128/39, QR), getrimmt
 *   dauerhaft            true = nach einem Treffer weiterscannen (Serienscan),
 *                        false = nach dem ersten Code schließen
 *   titel                Überschrift, z. B. „Material ausfassen“
 * Zusätzlich (optional, abwärtskompatibel):
 *   onCode darf ein Promise mit einer Rückmeldung liefern — z. B.
 *   `{ text: "LS-Schalter B16", unter: "3 Stk in der Liste" }` oder nur einen
 *   Text. Die steht dann im Scanner, solange kein neuer Code kommt;
 *   `ton: "warnung"` zeigt sie gelb (unbekannter Code, keine Verbindung).
 *   anzahl               Zähler im Kopf (z. B. Positionen der Liste);
 *                        ohne: Treffer seit dem Öffnen
 *
 * Kamera: Rückkamera, läuft bei `dauerhaft` weiter. Derselbe Code zählt erst
 * wieder, wenn er 1,5 s nicht mehr im Bild war — wer einen Artikel ruhig
 * hinhält, bucht ihn nicht dreimal. Für fünf gleiche Teile: weghalten und
 * wieder hinhalten, oder in der Liste auf + tippen.
 *
 * Eintippen geht immer: ohne Kamera-Erlaubnis, ohne Kamera, ohne https und
 * am PC (dort startet die Kamera erst auf Knopfdruck; ein USB-Handscanner
 * tippt einfach ins Feld).
 */

export type ScanRueckmeldung = {
  /** z. B. der Artikelname */
  text: string;
  /** zweite Zeile, z. B. „jetzt 3 Stk in der Liste“ */
  unter?: string;
  ton?: "ok" | "warnung";
};

type Antwort = ScanRueckmeldung | string | null | undefined | void;

const ENTPRELLEN_MS = 1500;

type Zustand = "aus" | "startet" | "laeuft" | "fehler";
type Letzte = { nr: number; code: string; laedt: boolean; rm: ScanRueckmeldung | null };
type Faehigkeiten = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number };
  focusMode?: string[];
};

function vibrieren(muster: number | number[]) {
  try {
    navigator.vibrate?.(muster);
  } catch {
    /* manche Browser sperren das — egal */
  }
}

function rueckmeldungLesen(a: Antwort): ScanRueckmeldung | null {
  if (!a) return null;
  if (typeof a === "string") return { text: a };
  return a.text ? a : null;
}

function kameraFehlerText(e: unknown): string {
  const n = (e as { name?: string } | null)?.name ?? "";
  if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") {
    return "Die Kamera ist für diese Seite nicht erlaubt. In den Browser-Einstellungen erlauben — oder den Code eintippen.";
  }
  if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") {
    return "Keine Kamera gefunden. Code eintippen oder einen Handscanner verwenden.";
  }
  if (n === "NotReadableError" || n === "TrackStartError" || n === "AbortError") {
    return "Die Kamera ist gerade belegt (andere App offen?). Schließen und noch einmal versuchen.";
  }
  return "Die Kamera ließ sich nicht starten. Code bitte eintippen.";
}

export function ScanDialog({
  open,
  onOpenChange,
  onCode,
  dauerhaft = false,
  titel = "Strichcode scannen",
  anzahl,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCode: (code: string) => void | Promise<Antwort>;
  dauerhaft?: boolean;
  titel?: string;
  anzahl?: number;
}) {
  const pc = useIstPc();
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [zustand, setZustand] = useState<Zustand>("aus");
  const [fehler, setFehler] = useState("");
  const [lichtMoeglich, setLichtMoeglich] = useState(false);
  const [licht, setLicht] = useState(false);
  const [zoomBereich, setZoomBereich] = useState<{ min: number; max: number } | null>(null);
  const [zoomAn, setZoomAn] = useState(false);
  const [treffer, setTreffer] = useState(0);
  const [letzte, setLetzte] = useState<Letzte | null>(null);
  const [blitz, setBlitz] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [tastatur, setTastatur] = useState<"numeric" | "text">("numeric");

  const streamRef = useRef<MediaStream | null>(null);
  const laufRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const blitzTimer = useRef<number | null>(null);
  const leserRef = useRef<Promise<Leser> | null>(null);
  const zuletztRef = useRef({ code: "", zeit: 0 });
  const meldungRef = useRef(0);
  const fertigRef = useRef(false);
  const kameraSoll = useRef(false);
  const eingabeRef = useRef<HTMLInputElement>(null);

  // Immer die aktuellen Rückrufe — die Scan-Schleife läuft länger als ein Render
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const dauerhaftRef = useRef(dauerhaft);
  dauerhaftRef.current = dauerhaft;

  // Handy und Tablet: Kamera sofort. PC (feiner Zeiger): erst auf Knopfdruck.
  const kameraAuto = !pc || (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);

  const blitzen = () => {
    setBlitz(true);
    if (blitzTimer.current) window.clearTimeout(blitzTimer.current);
    blitzTimer.current = window.setTimeout(() => setBlitz(false), 280);
  };

  /** Ein Code ist da — melden und Rückmeldung abwarten. */
  const melden = useCallback((roh: string) => {
    const code = roh.trim();
    if (!code || fertigRef.current) return;
    vibrieren(35);
    const nr = ++meldungRef.current;
    setTreffer((n) => n + 1);
    setLetzte({ nr, code, laedt: true, rm: null });
    blitzen();

    let antwort: void | Promise<Antwort>;
    try {
      antwort = onCodeRef.current(code);
    } catch (e) {
      console.error(e);
    }
    if (!dauerhaftRef.current) {
      fertigRef.current = true;
      onOpenChangeRef.current(false);
      return;
    }
    if (antwort && typeof (antwort as Promise<Antwort>).then === "function") {
      (antwort as Promise<Antwort>).then(
        (a) => {
          if (meldungRef.current !== nr) return;
          const rm = rueckmeldungLesen(a);
          setLetzte({ nr, code, laedt: false, rm });
          if (rm?.ton === "warnung") vibrieren([70, 60, 70]);
        },
        () => {
          if (meldungRef.current !== nr) return;
          setLetzte({ nr, code, laedt: false, rm: { text: "Nicht verarbeitet", unter: code, ton: "warnung" } });
        },
      );
    } else {
      setLetzte({ nr, code, laedt: false, rm: null });
    }
  }, []);

  /** Aus der Kamera: derselbe Code erst wieder, wenn er 1,5 s weg war. */
  const erkannt = useCallback((code: string) => {
    const jetzt = performance.now();
    const z = zuletztRef.current;
    const gleich = z.code === code && jetzt - z.zeit < ENTPRELLEN_MS;
    zuletztRef.current = { code, zeit: jetzt };
    if (!gleich) melden(code);
  }, [melden]);

  const kameraStoppen = useCallback(() => {
    laufRef.current++;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoEl) {
      try {
        videoEl.pause();
      } catch {
        /* egal */
      }
      videoEl.srcObject = null;
    }
    setLicht(false);
    setZoomAn(false);
  }, [videoEl]);

  const kameraStarten = useCallback(async () => {
    const video = videoEl;
    if (!video) return;
    kameraStoppen();
    const lauf = ++laufRef.current;
    kameraSoll.current = true;
    setFehler("");

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setZustand("fehler");
      setFehler("Die Kamera geht nur über eine sichere Verbindung (https). Code bitte eintippen.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setZustand("fehler");
      setFehler("Dieser Browser gibt die Kamera nicht frei. Code bitte eintippen.");
      return;
    }
    setZustand("startet");
    // Leser schon laden, während der Browser nach der Kamera fragt
    if (!leserRef.current) leserRef.current = leserErstellen();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      // Manche Geräte mögen die Auflösung nicht — dann irgendeine Kamera
      if ((e as { name?: string })?.name === "OverconstrainedError") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (e2) {
          if (lauf !== laufRef.current) return;
          kameraSoll.current = false;
          setZustand("fehler");
          setFehler(kameraFehlerText(e2));
          return;
        }
      } else {
        if (lauf !== laufRef.current) return;
        kameraSoll.current = false;
        setZustand("fehler");
        setFehler(kameraFehlerText(e));
        return;
      }
    }
    // Inzwischen geschlossen? Dann sofort wieder freigeben.
    if (lauf !== laufRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* stumm + playsInline spielt auch ohne Klick */
    }

    const spur = stream.getVideoTracks()[0];
    const caps = (spur?.getCapabilities?.() ?? {}) as Faehigkeiten;
    setLichtMoeglich(!!caps.torch);
    setZoomBereich(caps.zoom && caps.zoom.max >= 1.5 ? { min: caps.zoom.min ?? 1, max: caps.zoom.max } : null);
    if (caps.focusMode?.includes("continuous")) {
      spur.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
    }

    let leser: Leser;
    try {
      leser = await leserRef.current;
    } catch {
      leserRef.current = null;
      if (lauf !== laufRef.current) return;
      setZustand("fehler");
      setFehler("Der Strichcode-Leser ließ sich nicht laden (Verbindung?). Code bitte eintippen.");
      return;
    }
    if (lauf !== laufRef.current) return;
    setZustand("laeuft");

    const takt = leser.art === "nativ" ? 120 : 180;
    const schleife = async () => {
      if (lauf !== laufRef.current) return;
      const code = await leser.lesen(video);
      if (lauf !== laufRef.current) return;
      if (code) erkannt(code);
      timerRef.current = window.setTimeout(schleife, takt);
    };
    void schleife();
  }, [videoEl, kameraStoppen, erkannt]);

  // Jedes Öffnen beginnt frisch
  useEffect(() => {
    if (!open) return;
    setTreffer(0);
    setLetzte(null);
    setEingabe("");
    setFehler("");
    zuletztRef.current = { code: "", zeit: 0 };
    fertigRef.current = false;
  }, [open]);

  // Kamera an das Öffnen koppeln — und beim Schließen sauber freigeben
  useEffect(() => {
    if (!open || !videoEl) return;
    if (kameraAuto) void kameraStarten();
    else {
      kameraSoll.current = false;
      setZustand("aus");
    }
    return () => {
      kameraSoll.current = false;
      kameraStoppen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoEl]);

  // App im Hintergrund → Kamera frei; zurück → wieder an
  useEffect(() => {
    if (!open) return;
    const wechsel = () => {
      if (document.hidden) {
        const soll = kameraSoll.current;
        kameraStoppen();
        kameraSoll.current = soll;
      } else if (kameraSoll.current) {
        void kameraStarten();
      }
    };
    document.addEventListener("visibilitychange", wechsel);
    return () => document.removeEventListener("visibilitychange", wechsel);
  }, [open, kameraStarten, kameraStoppen]);

  useEffect(() => () => {
    if (blitzTimer.current) window.clearTimeout(blitzTimer.current);
  }, []);

  const lichtSchalten = async () => {
    const spur = streamRef.current?.getVideoTracks()[0];
    if (!spur) return;
    const an = !licht;
    try {
      await spur.applyConstraints({ advanced: [{ torch: an } as MediaTrackConstraintSet] });
      setLicht(an);
    } catch {
      setLichtMoeglich(false);
    }
  };

  const zoomSchalten = async () => {
    const spur = streamRef.current?.getVideoTracks()[0];
    if (!spur || !zoomBereich) return;
    const an = !zoomAn;
    const wert = an ? Math.min(2, zoomBereich.max) : Math.max(1, zoomBereich.min);
    try {
      await spur.applyConstraints({ advanced: [{ zoom: wert } as MediaTrackConstraintSet] });
      setZoomAn(an);
    } catch {
      setZoomBereich(null);
    }
  };

  const eintippen = (e: FormEvent) => {
    e.preventDefault();
    const c = eingabe.trim();
    if (!c) return;
    setEingabe("");
    melden(c);
    if (dauerhaftRef.current) eingabeRef.current?.focus();
  };

  const zaehler = anzahl ?? treffer;
  const statusText =
    zustand === "laeuft" ? "Code in den Rahmen halten"
      : zustand === "startet" ? "Kamera startet …"
        : zustand === "fehler" ? "Kamera aus — Code eintippen"
          : "Code eintippen oder Kamera einschalten";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        vollbild
        ohneSchliessen
        className="flex flex-col bg-black text-white"
        onOpenAutoFocus={(e) => {
          // Am Handy keine Tastatur über dem Kamerabild; am PC gleich ins Feld (Handscanner)
          e.preventDefault();
          if (kameraAuto) (e.target as HTMLElement | null)?.focus?.();
          else eingabeRef.current?.focus();
        }}
      >
        {/* Kopf */}
        <div className="flex shrink-0 items-center gap-1.5 px-2 pb-1.5" style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}>
          <Button
            type="button" variant="ghost" size="icon" aria-label="Schließen"
            className="h-11 w-11 shrink-0 text-white hover:bg-white/10 hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold leading-tight text-white">{titel}</DialogTitle>
            <DialogDescription className="truncate text-xs text-white/70">{statusText}</DialogDescription>
          </div>
          {zaehler > 0 && (
            <span className="zahl mr-1 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white/15 px-2.5 text-sm font-semibold"
              aria-label={`${zaehler} erfasst`}>
              {zaehler}
            </span>
          )}
        </div>

        {/* Kamerabild */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          <video
            ref={setVideoEl}
            muted
            playsInline
            autoPlay
            aria-label="Kamerabild"
            className={cn("absolute inset-0 h-full w-full object-cover", zustand !== "laeuft" && "opacity-0")}
          />

          {zustand === "laeuft" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={cn(
                "relative aspect-[4/3] max-h-[78%] w-[86%] max-w-lg rounded-lg border-2 transition-colors duration-150",
                blitz ? "border-primary bg-primary/20" : "border-white/70",
              )}>
                <div className={cn("absolute inset-x-5 top-1/2 h-0.5 -translate-y-1/2 rounded-full", blitz ? "bg-primary" : "animate-pulse bg-primary/90")} />
              </div>
            </div>
          )}

          {zustand !== "laeuft" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              {zustand === "startet" && (
                <>
                  <Loader2 className="h-9 w-9 animate-spin text-white/70" />
                  <p className="text-sm text-white/80">Kamera startet … Bei der Frage nach der Kamera bitte „Erlauben“ tippen.</p>
                </>
              )}
              {zustand === "fehler" && (
                <>
                  <CameraOff className="h-10 w-10 text-white/60" />
                  <p className="max-w-sm text-sm text-white/85">{fehler}</p>
                  <Button type="button" variant="outline" className="h-11 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() => void kameraStarten()}>
                    <Camera className="h-4 w-4" /> Noch einmal versuchen
                  </Button>
                </>
              )}
              {zustand === "aus" && (
                <>
                  <ScanBarcode className="h-10 w-10 text-white/60" />
                  <p className="max-w-sm text-sm text-white/85">Mit dem Handscanner ins Feld scannen oder den Code eintippen.</p>
                  <Button type="button" variant="outline" className="h-11 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() => void kameraStarten()}>
                    <Camera className="h-4 w-4" /> Kamera einschalten
                  </Button>
                </>
              )}
            </div>
          )}

          {zustand === "laeuft" && (lichtMoeglich || zoomBereich) && (
            <div className="absolute bottom-3 right-3 flex gap-2">
              {zoomBereich && (
                <button type="button" onClick={() => void zoomSchalten()} aria-pressed={zoomAn}
                  className={cn("flex h-12 min-w-12 items-center justify-center rounded-full px-3 text-sm font-semibold",
                    zoomAn ? "bg-white text-black" : "bg-black/55 text-white")}>
                  {zoomAn ? "2×" : "1×"}
                </button>
              )}
              {lichtMoeglich && (
                <button type="button" onClick={() => void lichtSchalten()} aria-pressed={licht}
                  aria-label={licht ? "Licht aus" : "Licht an"}
                  className={cn("flex h-12 w-12 items-center justify-center rounded-full", licht ? "bg-white text-black" : "bg-black/55 text-white")}>
                  {licht ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Unten: was zuletzt erkannt wurde, Eintippen, Fertig */}
        <div className="shrink-0 space-y-2.5 bg-background px-3 pt-3 text-foreground"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Treffer letzte={letzte} laeuft={zustand === "laeuft"} />

          <form onSubmit={eintippen} className="flex gap-2">
            <Input
              ref={eingabeRef}
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              inputMode={tastatur}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Code eintippen"
              aria-label="Code eintippen"
              className="h-12 min-w-0 flex-1 font-mono text-base"
            />
            <Button type="button" variant="outline" className="h-12 w-14 shrink-0 px-0 text-xs"
              onClick={() => {
                setTastatur((t) => (t === "numeric" ? "text" : "numeric"));
                window.setTimeout(() => eingabeRef.current?.focus(), 0);
              }}
              aria-label={tastatur === "numeric" ? "Buchstaben-Tastatur" : "Ziffern-Tastatur"}>
              {tastatur === "numeric" ? "ABC" : "123"}
            </Button>
            <Button type="submit" className="h-12 shrink-0 px-5" disabled={!eingabe.trim()}>OK</Button>
          </form>

          {dauerhaft ? (
            <Button type="button" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
              <Check className="h-5 w-5" /> Fertig{zaehler > 0 ? ` · ${zaehler}` : ""}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Rückmeldung zum letzten Code — feste Höhe, damit nichts springt. */
function Treffer({ letzte, laeuft }: { letzte: Letzte | null; laeuft: boolean }) {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-3 rounded-lg border bg-card px-3 py-2" aria-live="polite" role="status">
      {!letzte ? (
        <p className="text-sm text-muted-foreground">
          {laeuft ? "Strichcode in den Rahmen halten — er wird von selbst erkannt." : "Noch kein Code erfasst."}
        </p>
      ) : (
        <>
          <span className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            letzte.rm?.ton === "warnung" ? TON_KLASSE.gelb : "bg-primary-soft text-primary",
          )}>
            {letzte.laedt ? <Loader2 className="h-4 w-4 animate-spin" />
              : letzte.rm?.ton === "warnung" ? <AlertTriangle className="h-4 w-4" />
                : <Check className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {letzte.rm?.text ?? (letzte.laedt ? "Wird gesucht …" : "Erkannt")}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{letzte.rm?.unter ?? letzte.code}</p>
          </div>
        </>
      )}
    </div>
  );
}
