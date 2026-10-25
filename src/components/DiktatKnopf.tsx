import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Spracheingabe über die Spracherkennung des Browsers (Chrome/Android,
 * Safari/iPhone). Kostenlos, kein Server, kein Schlüssel.
 *
 * Wo der Browser sie nicht anbietet (manche iPhone-Homescreen-Apps,
 * Firefox), bleibt das Mikrofon der Handy-Tastatur — der Knopf erklärt das.
 */

type Erkennung = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function erkennungBauen(): Erkennung | null {
  const w = window as unknown as { SpeechRecognition?: new () => Erkennung; webkitSpeechRecognition?: new () => Erkennung };
  const K = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return K ? new K() : null;
}

export const diktatMoeglich = () =>
  typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

/**
 * onText bekommt jeden fertig erkannten Satz. zwischen zeigt, was gerade
 * gehört wird (zum Mitlesen), und ist leer, sobald der Satz fertig ist.
 */
export function useDiktat(onText: (text: string) => void, { dauernd = true }: { dauernd?: boolean } = {}) {
  const [aktiv, setAktiv] = useState(false);
  const [zwischen, setZwischen] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const erk = useRef<Erkennung | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  const soll = useRef(false);

  const stop = useCallback(() => {
    soll.current = false;
    erk.current?.stop();
    setAktiv(false);
    setZwischen("");
  }, []);

  const start = useCallback(() => {
    setFehler(null);
    const e = erkennungBauen();
    if (!e) {
      setFehler("Spracheingabe wird hier nicht unterstützt — bitte das Mikrofon der Tastatur verwenden.");
      return;
    }
    e.lang = "de-AT";
    e.continuous = dauernd;
    e.interimResults = true;
    e.onresult = (ev) => {
      let zw = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0].transcript.trim();
        if (r.isFinal) { if (t) callback.current(t); } else zw += t + " ";
      }
      setZwischen(zw.trim());
    };
    e.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setFehler("Mikrofon nicht erlaubt — in den Browser-Einstellungen freigeben.");
        soll.current = false;
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        setFehler("Spracheingabe unterbrochen.");
      }
    };
    // Safari beendet nach jeder Pause — solange der Knopf an ist, neu starten.
    e.onend = () => {
      if (soll.current && dauernd) {
        try { e.start(); return; } catch { /* schon gestartet */ }
      }
      setAktiv(false);
      setZwischen("");
    };
    erk.current = e;
    soll.current = true;
    try {
      e.start();
      setAktiv(true);
    } catch {
      setFehler("Spracheingabe konnte nicht starten.");
    }
  }, [dauernd]);

  useEffect(() => () => { soll.current = false; erk.current?.abort(); }, []);

  return { aktiv, zwischen, fehler, start, stop, moeglich: diktatMoeglich() };
}

/** Runder Mikrofon-Knopf. Hängt erkannten Text über onText an. */
export function DiktatKnopf({
  onText,
  className,
  groesse = "icon",
  beschriftung,
}: {
  onText: (text: string) => void;
  className?: string;
  groesse?: "icon" | "lg";
  beschriftung?: string;
}) {
  const d = useDiktat(onText);
  return (
    <div className={cn("inline-flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant={d.aktiv ? "destructive" : "outline"}
        size={groesse === "lg" ? "lg" : "icon"}
        onClick={d.aktiv ? d.stop : d.start}
        className={cn("shrink-0", d.aktiv && "animate-pulse", groesse === "lg" && "gap-2")}
        aria-label={d.aktiv ? "Diktat beenden" : "Diktieren"}
        title={d.moeglich ? (d.aktiv ? "Diktat beenden" : "Diktieren") : "Mikrofon der Tastatur verwenden"}
      >
        {d.aktiv ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        {groesse === "lg" && (beschriftung ?? (d.aktiv ? "Fertig" : "Diktieren"))}
      </Button>
      {d.aktiv && d.zwischen && <span className="max-w-[16rem] text-right text-xs text-muted-foreground italic">„{d.zwischen}“</span>}
      {d.fehler && <span className="max-w-[16rem] text-right text-xs text-destructive">{d.fehler}</span>}
    </div>
  );
}
