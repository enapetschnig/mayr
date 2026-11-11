import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Bug, FileText, HelpCircle, Lightbulb, Loader2, Maximize2, MessageSquarePlus, Mic, MonitorPlay, Paperclip, Pencil, Send, Square, Trash2, X,
} from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { bildschirmfotoMachen, datenUrlZuBlob } from "@/lib/bildschirmfoto";
import {
  AUFNAHME_AUSBLENDEN, AUFNAHME_MAX_SEKUNDEN, UPLOAD_MAX_BYTES, aufnahmeBeenden, aufnahmeMoeglich, aufnahmeStand, aufnahmeStarten,
  aufnahmeVerlorenBeimLaden, aufnahmeVerwerfen, endeHinweis, mikrofonGrund, mikrofonHinweis, tonAufnahmeTyp, tonMoeglich, useAufnahme,
} from "@/lib/bildschirmAufnahme";
import { MAX_ANHAENGE, anhaengeHochladen, dateienText, pruefeAnhaenge } from "@/lib/wunschAnhaenge";
import { cn } from "@/lib/utils";
import { BildMarkierenDialog } from "./BildMarkieren";

/** Neue Tabelle, noch nicht in den generierten Typen */
const wuensche = () => (supabase.from("aenderungswuensche" as never) as any);
const ABLAGE = "aenderungswuensche";

type Art = "wunsch" | "fehler" | "frage";
const ARTEN: { wert: Art; titel: string; icon: typeof Bug; hilfe: string }[] = [
  { wert: "wunsch", titel: "Wunsch", icon: Lightbulb, hilfe: "Fehlt oder ginge einfacher" },
  { wert: "fehler", titel: "Passt nicht", icon: Bug, hilfe: "Geht nicht oder ist falsch" },
  { wert: "frage", titel: "Frage", icon: HelpCircle, hilfe: "Wie geht das?" },
];

const endung = (mime: string) => (mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm");
const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
const groesse = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

// Der Knopf im Seitenkopf sagt nur „melden“ — Bild, Dialog und Aufnahme hält WunschMelden (einmal in App.tsx)
const MELDEN = "mayr:melden";
let arbeitet = false;
const hoerer = new Set<() => void>();
const setArbeitet = (a: boolean) => { arbeitet = a; hoerer.forEach((h) => h()); };
const useArbeitet = () => useSyncExternalStore((h) => { hoerer.add(h); return () => hoerer.delete(h); }, () => arbeitet);

/** „Änderung melden“ im Seitenkopf. Während einer Bildschirmaufnahme beendet er sie. */
export function WunschKnopf({ className }: { className?: string }) {
  const laeuft = useArbeitet();
  const aufnahme = useAufnahme();
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event(MELDEN))} disabled={laeuft}
      title="Änderung melden — ein Bild vom Bildschirm ist dabei" aria-label="Änderung melden"
      data-bildschirmfoto="aus" className={cn("h-9 gap-1.5 px-2.5 print:hidden", className)}>
      {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : aufnahme.stand === "laeuft" ? <Square className="h-4 w-4 text-destructive" /> : <MessageSquarePlus className="h-4 w-4" />}
      <span className="hidden xl:inline">{aufnahme.stand === "laeuft" ? "Aufnahme beenden" : "Änderung melden"}</span>
    </Button>
  );
}

/**
 * „Änderung melden“ wie in Lengauer Stockner: ERST das Bildschirmfoto, DANN der
 * Dialog (sonst wäre nur das Meldefenster im Bild). Im Dialog:
 * - das Bild groß ansehen und mit dem Finger einkreisen (`BildMarkieren`)
 * - Sprachnachricht aufnehmen — abgeschrieben wird im Hintergrund (`sprache-zu-text`)
 * - „Bildschirm aufnehmen & erklären“: Dialog zu, durch die App klicken und dazu
 *   reden, unten „Fertig“ — rrweb zeichnet die Seite auf (lib/bildschirmAufnahme.ts),
 *   der Ton läuft mit; Claude macht daraus die einzelnen Wünsche
 * - Dateien anhängen (PDF, Fotos …)
 * Steht einmal in App.tsx, weil die Aufnahme Seitenwechsel überleben muss.
 * Weiter geht der Wunsch per Trigger ans Cockpit, dort setzt ihn der Roboter um.
 */
export function WunschMelden() {
  const ort = useLocation();
  const { profil } = useSitzung();
  const [offen, setOffen] = useState(false);
  const [bild, setBild] = useState<string | null>(null);
  const [seite, setSeite] = useState("");
  const aufnahme = useAufnahme();
  const [jetzt, setJetzt] = useState(Date.now());
  const ortRef = useRef("");
  ortRef.current = ort.pathname + ort.search;

  useEffect(() => {
    const melden = async () => {
      // Während „Zeigen & erklären“ heißt Melden: Aufnahme beenden, der Dialog kommt mit ihr wieder
      const stand = aufnahmeStand();
      if (stand === "laeuft") { void aufnahmeBeenden(); return; }
      if (stand === "startet" || arbeitet) return;
      setArbeitet(true);
      setSeite(ortRef.current);
      try { setBild(await bildschirmfotoMachen()); } catch { setBild(null); }
      setArbeitet(false);
      setOffen(true);
    };
    const auf = () => { void melden(); };
    window.addEventListener(MELDEN, auf);
    return () => window.removeEventListener(MELDEN, auf);
  }, []);

  useEffect(() => {
    if (aufnahmeVerlorenBeimLaden()) {
      toast("Die Bildschirmaufnahme ist beim Neuladen verloren gegangen", { description: "Bitte noch einmal aufnehmen — dabei die Seite nicht neu laden.", duration: 10000 });
    }
  }, []);

  useEffect(() => {
    if (aufnahme.stand === "fertig") {
      setOffen(true);
      const hinweis = endeHinweis(aufnahme.aufnahme.grund);
      if (hinweis) toast("Aufnahme beendet", { description: hinweis });
    }
    if (aufnahme.stand !== "laeuft") return;
    const u = window.setInterval(() => setJetzt(Date.now()), 500);
    return () => window.clearInterval(u);
  }, [aufnahme]);

  // Abgemeldet: keine Aufnahme und kein Dialog bleiben stehen
  useEffect(() => {
    if (!profil) { aufnahmeVerwerfen(); setOffen(false); setBild(null); }
  }, [profil]);

  if (!profil) return null;
  const sek = aufnahme.stand === "laeuft" ? Math.min(AUFNAHME_MAX_SEKUNDEN, Math.max(0, Math.floor((jetzt - aufnahme.beginn) / 1000))) : 0;

  return (
    <>
      {aufnahme.stand === "laeuft" && (
        <div className={cn(AUFNAHME_AUSBLENDEN, "fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 print:hidden")}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }} data-bildschirmfoto="aus" data-aufnahme-leiste>
          <div className="flex w-full max-w-md items-center gap-3 rounded-full border bg-card py-2 pl-4 pr-2">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="min-w-0 flex-1 text-sm leading-tight">
              <span className="zahl">{mmss(sek)}</span><span className="text-muted-foreground"> / {mmss(AUFNAHME_MAX_SEKUNDEN)}</span>
              <span className="block truncate text-xs text-muted-foreground">{aufnahme.mitTon ? "Zeigen und Hochdeutsch dazu reden" : "Ohne Ton — nachher dazuschreiben"}</span>
            </span>
            <button type="button" onClick={aufnahmeVerwerfen} aria-label="Aufnahme verwerfen" title="Verwerfen"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void aufnahmeBeenden()}
              className="flex h-10 items-center gap-1.5 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground">
              <Square className="h-3.5 w-3.5" /> Fertig
            </button>
          </div>
        </div>
      )}
      <WunschDialog key={profil.id} open={offen} onOpenChange={setOffen} bild={bild} seite={seite || ort.pathname} />
    </>
  );
}

function WunschDialog({ open, onOpenChange, bild, seite }: {
  open: boolean; onOpenChange: (o: boolean) => void; bild: string | null; seite: string;
}) {
  const [art, setArt] = useState<Art>("wunsch");
  const [text, setText] = useState("");
  const [dateien, setDateien] = useState<File[]>([]);
  const [bildJetzt, setBildJetzt] = useState<string | null>(bild);
  const [markieren, setMarkieren] = useState(false);
  const [ton, setTon] = useState<Blob | null>(null);
  const [nimmtAuf, setNimmtAuf] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const [sendet, setSendet] = useState(false);
  const sendetRef = useRef(false);
  const rec = useRef<MediaRecorder | null>(null);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);
  const dateiEingabe = useRef<HTMLInputElement>(null);
  const tonUrl = useMemo(() => (ton ? URL.createObjectURL(ton) : null), [ton]);
  useEffect(() => () => { if (tonUrl) URL.revokeObjectURL(tonUrl); }, [tonUrl]);

  const vorfuehrung = useAufnahme();
  const vorgefuehrt = vorfuehrung.stand === "fertig" ? vorfuehrung.aufnahme : null;
  const [startetVorfuehrung, setStartetVorfuehrung] = useState(false);

  const aufnahmeStoppen = () => {
    if (uhr.current) clearInterval(uhr.current);
    uhr.current = null;
    const r = rec.current;
    rec.current = null;
    setNimmtAuf(false);
    // stop() liefert die Aufnahme über onstop — sie bleibt erhalten
    if (r && r.state !== "inactive") { try { r.stop(); } catch { r.stream.getTracks().forEach((t) => t.stop()); } }
  };

  // Was eingegeben wurde, bleibt beim Schließen stehen — erst erfolgreiches Abschicken leert
  // Neues Bild nur bei neuem Melden — nach dem Vorführen bleibt das eingekreiste
  useEffect(() => { setBildJetzt(bild); }, [bild]);
  useEffect(() => { if (!open && rec.current) aufnahmeStoppen(); }, [open]);
  useEffect(() => () => { if (uhr.current) clearInterval(uhr.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const sprachaufnahme = async () => {
    if (!tonMoeglich()) return toast.error("Keine Sprachnachricht möglich", { description: `${mikrofonHinweis("nicht-unterstuetzt")} Bitte tippen.` });
    let strom: MediaStream;
    try {
      strom = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (f) {
      return toast.error("Kein Zugriff aufs Mikrofon", { description: `${mikrofonHinweis(mikrofonGrund(f))} Oder einfach tippen.` });
    }
    const typ = tonAufnahmeTyp();
    const r = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined);
    const stuecke: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) stuecke.push(e.data); };
    r.onstop = () => {
      strom.getTracks().forEach((t) => t.stop());
      if (uhr.current) clearInterval(uhr.current);
      uhr.current = null;
      if (rec.current === r) rec.current = null;
      setNimmtAuf(false);
      const blob = new Blob(stuecke, { type: r.mimeType || typ || "audio/webm" });
      if (blob.size < 1000) { toast("Die Aufnahme war zu kurz — noch einmal?"); setTon(null); return; }
      setTon(blob);
    };
    r.start(1000);
    rec.current = r;
    setSekunden(0);
    setNimmtAuf(true);
    uhr.current = setInterval(() => setSekunden((s) => {
      if (s + 1 >= AUFNAHME_MAX_SEKUNDEN) window.setTimeout(aufnahmeStoppen, 0);
      return s + 1;
    }), 1000);
  };

  /** Dialog zu, vorführen — mit „Fertig“ in der Leiste unten geht er wieder auf */
  const vorfuehren = async () => {
    setStartetVorfuehrung(true);
    try {
      const { ohneTonGrund } = await aufnahmeStarten();
      onOpenChange(false);
      if (ohneTonGrund) toast("Aufnahme läuft ohne Ton", { description: `${mikrofonHinweis(ohneTonGrund)} Zeig einfach vor und schreib nachher dazu.` });
    } catch {
      toast.error("Aufnahme ließ sich nicht starten", { description: "Ist das Internet da? Sonst einfach tippen oder eine Sprachnachricht schicken." });
    } finally {
      setStartetVorfuehrung(false);
    }
  };

  const dateienWaehlen = (liste: FileList | null) => {
    const { angenommen, abgelehnt } = pruefeAnhaenge(dateien.length, Array.from(liste ?? []));
    if (abgelehnt.length) toast.error(`${abgelehnt.length} Datei(en) nicht angehängt`, { description: abgelehnt.map((x) => `${x.name}: ${x.grund}`).join(" · ") });
    if (angenommen.length) setDateien([...dateien, ...angenommen]);
  };

  const zuruecksetzen = () => {
    aufnahmeVerwerfen();
    setArt("wunsch"); setText(""); setDateien([]); setTon(null); setBildJetzt(null); setSekunden(0);
  };

  const leer = !text.trim() && !ton && !vorgefuehrt && !dateien.length;
  const senden = async () => {
    if (sendetRef.current) return;
    if (leer) return toast.error("Kurz sagen, vorführen oder tippen, was anders sein soll.");
    if (navigator.onLine === false) return toast.error("Kein Internet", { description: "Die Meldung bleibt stehen — sobald wieder Netz ist, nochmal abschicken." });
    sendetRef.current = true;
    setSendet(true);
    // Was schon oben ist — scheitert ein späterer Schritt, wird es wieder entfernt
    const hochgeladen: string[] = [];
    const hochladen = async (pfad: string, datei: Blob, typ: string) => {
      if (datei.size > UPLOAD_MAX_BYTES) throw new Error("Die Aufnahme ist zu groß zum Senden — bitte verwerfen und kürzer aufnehmen.");
      const { error } = await supabase.storage.from(ABLAGE).upload(pfad, datei, { contentType: typ });
      if (error) throw error;
      hochgeladen.push(pfad);
      return pfad;
    };
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht mehr angemeldet.");
      const stempel = Date.now();
      // Bild: scheitert es, geht die Meldung trotzdem
      let bildPfad: string | null = null;
      if (bildJetzt) { try { bildPfad = await hochladen(`${user.id}/${stempel}-bild.jpg`, datenUrlZuBlob(bildJetzt), "image/jpeg"); } catch { /* ohne Bild */ } }
      let audioPfad: string | null = null;
      if (ton) audioPfad = await hochladen(`${user.id}/${stempel}-ton.${endung(ton.type)}`, ton, ton.type || "audio/webm");
      // Vorführung: Aufzeichnung der Seite + Ton (der Ton ist dann die Sprachnachricht)
      let aufnahmePfad: string | null = null;
      if (vorgefuehrt) {
        aufnahmePfad = await hochladen(`${user.id}/${stempel}-aufnahme.json.gz`, vorgefuehrt.bildschirm, "application/gzip");
        if (vorgefuehrt.ton && !audioPfad) {
          audioPfad = await hochladen(`${user.id}/${stempel}-ton-aufnahme.${endung(vorgefuehrt.ton.type)}`, vorgefuehrt.ton, vorgefuehrt.ton.type || "audio/webm");
        }
      }
      const anhaenge = await anhaengeHochladen(user.id, dateien);
      hochgeladen.push(...anhaenge);
      const { data: neu, error } = await wuensche().insert({
        erstellt_von: user.id, art, seite, app_version: __APP_BUILD__,
        text: text.trim() || (vorgefuehrt && !audioPfad ? "Bildschirmaufnahme (ohne Ton)" : "") || (!audioPfad ? dateienText(dateien) : ""),
        bild_pfad: bildPfad, audio_pfad: audioPfad, anhaenge, abschrift: audioPfad ? "offen" : "fertig",
        aufnahme_pfad: aufnahmePfad,
        aufnahme_ablauf: vorgefuehrt ? { sekunden: vorgefuehrt.sekunden, schritte: vorgefuehrt.ablauf } : null,
      }).select("id").single();
      if (error) throw error;
      hochgeladen.length = 0;
      // Abschrift im Hintergrund — bewusst ohne await
      if (audioPfad && neu?.id) supabase.functions.invoke("sprache-zu-text", { body: { wunschId: neu.id, audioPfad } }).catch(() => {});
      toast.success("Danke — der Wunsch ist angekommen", {
        description: aufnahmePfad ? "Die Aufnahme wird gerade ausgewertet." : audioPfad ? "Die Sprachnachricht wird gerade abgeschrieben." : undefined,
      });
      zuruecksetzen();
      onOpenChange(false);
    } catch (f) {
      if (hochgeladen.length) void supabase.storage.from(ABLAGE).remove([...hochgeladen]).then(() => {}, () => {});
      const meldung = f instanceof Error ? f.message : (f as { message?: string } | null)?.message;
      toast.error("Konnte nicht gesendet werden", { description: `${meldung ? `${meldung} ` : ""}Nichts ist verloren — einfach nochmal abschicken.` });
    } finally {
      sendetRef.current = false;
      setSendet(false);
    }
  };

  const zeigtSprache = !vorgefuehrt?.ton && (tonMoeglich() || !!ton);
  const zeigtVorfuehren = !!vorgefuehrt || aufnahmeMoeglich();
  const startbar = (zeigtSprache && !ton && !nimmtAuf) || (zeigtVorfuehren && !vorgefuehrt);
  const endeText = vorgefuehrt ? endeHinweis(vorgefuehrt.grund) : null;

  return (
    <>
      <FormularDialog open={open} onOpenChange={onOpenChange} titel="Was sollen wir ändern?" gesperrt={sendet}
        beschreibung="Sagen, vorführen oder tippen — das Bild vom Bildschirm ist schon dabei."
        fuss={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendet}>Abbrechen</Button>
            <Button onClick={() => void senden()} disabled={sendet || nimmtAuf || leer} className="gap-2">
              {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendet ? "Wird gesendet …" : "Abschicken"}
            </Button>
          </>
        }>
        <div className="space-y-5" data-wunsch-dialog data-bildschirmfoto="aus">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Worum geht es?">
            {ARTEN.map((a) => (
              <button key={a.wert} type="button" role="radio" onClick={() => setArt(a.wert)} aria-checked={art === a.wert}
                className={cn("flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center text-sm",
                  art === a.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                <a.icon className="h-5 w-5" />
                <span className="font-medium">{a.titel}</span>
                <span className="text-xs text-muted-foreground">{a.hilfe}</span>
              </button>
            ))}
          </div>

          {(zeigtSprache || zeigtVorfuehren) && (
            <div className="space-y-2">
              <Label>Sagen oder vorführen</Label>
              {vorgefuehrt && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-vorfuehrung-dabei>
                  <MonitorPlay className="h-4 w-4 shrink-0" />
                  <span className="min-w-40 flex-1">
                    Aufnahme ({mmss(vorgefuehrt.sekunden)}){vorgefuehrt.ton ? " mit Ton" : " ohne Ton"} ist dabei.
                    {endeText && <span className="block text-xs text-muted-foreground">{endeText}</span>}
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={aufnahmeVerwerfen}>
                    <Trash2 className="h-4 w-4" /> Verwerfen
                  </Button>
                </div>
              )}
              {zeigtSprache && ton && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  {tonUrl && <audio controls src={tonUrl} className="h-10 min-w-0 flex-1" />}
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setTon(null)}>
                    <Trash2 className="h-4 w-4" /> Verwerfen
                  </Button>
                </div>
              )}
              {zeigtSprache && nimmtAuf && (
                <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                  <span className="text-sm">Nimmt auf … <span className="zahl">{mmss(sekunden)}</span></span>
                  <Button type="button" variant="destructive" className="ml-auto gap-2" onClick={aufnahmeStoppen}>
                    <Square className="h-4 w-4" /> Fertig
                  </Button>
                </div>
              )}
              {startbar && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {zeigtSprache && !ton && !nimmtAuf && (
                    <Button type="button" className="h-12 gap-2 text-base" disabled={startetVorfuehrung} onClick={() => void sprachaufnahme()}>
                      <Mic className="h-5 w-5" /> Sprachnachricht
                    </Button>
                  )}
                  {zeigtVorfuehren && !vorgefuehrt && (
                    <Button type="button" variant="outline" className="h-12 gap-2 text-base" disabled={startetVorfuehrung || nimmtAuf}
                      onClick={() => void vorfuehren()} data-vorfuehren>
                      {startetVorfuehrung ? <Loader2 className="h-5 w-5 animate-spin" /> : <MonitorPlay className="h-5 w-5" />}
                      Bildschirm aufnehmen & erklären
                    </Button>
                  )}
                </div>
              )}
              {startbar && (
                <p className="text-xs text-muted-foreground">
                  Bitte <b className="font-medium text-foreground">Hochdeutsch</b> reden — wird automatisch abgeschrieben.
                  {zeigtVorfuehren && !vorgefuehrt && <> Beim Vorführen geht das Fenster zu: durch die App klicken, dazu reden, unten „Fertig“ (höchstens {AUFNAHME_MAX_SEKUNDEN / 60} Min.).</>}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wunsch-text">… oder tippen</Label>
            <Textarea id="wunsch-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-24"
              placeholder="Zum Beispiel: Beim Angebot hätte ich gern die Summe auch oben." />
          </div>

          <div className="space-y-2">
            <Label>Bild vom Bildschirm</Label>
            {bildJetzt ? (
              <div className="space-y-2">
                <button type="button" onClick={() => setMarkieren(true)} title="Groß ansehen und einkreisen" data-bild-gross
                  className="group relative block w-full overflow-hidden rounded-lg border bg-muted/30">
                  <img src={bildJetzt} alt="Bildschirm beim Melden" className="max-h-56 w-full object-contain" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="h-3.5 w-3.5" /> Groß ansehen & einkreisen
                    </span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="h-10 gap-2" onClick={() => setMarkieren(true)} data-einkreisen>
                    <Pencil className="h-4 w-4" /> Einkreisen
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground" onClick={() => setBildJetzt(null)}>
                    <Trash2 className="h-4 w-4" /> Ohne Bild
                  </Button>
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Kein Bild dabei — der Hinweis allein hilft auch.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Dateien</Label>
            {dateien.map((d, i) => (
              <div key={`${d.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{groesse(d.size)}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`${d.name} entfernen`}
                  onClick={() => setDateien(dateien.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {dateien.length < MAX_ANHAENGE && (
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => dateiEingabe.current?.click()}>
                <Paperclip className="h-4 w-4" /> PDF, Foto oder andere Datei anhängen
              </Button>
            )}
            <input ref={dateiEingabe} type="file" multiple className="hidden" aria-label="Dateien anhängen"
              onChange={(e) => { dateienWaehlen(e.target.files); e.target.value = ""; }} />
          </div>
          <p className="text-xs text-muted-foreground">Mitgeschickt wird auch die Seite ({seite}).</p>
        </div>
        {/* Vollbild zum Einkreisen — verschachtelt, sonst hält der Melde-Dialog das Malen für einen Klick daneben */}
        {bildJetzt && (
          <BildMarkierenDialog open={markieren} bild={bildJetzt} onAbbrechen={() => setMarkieren(false)}
            onFertig={(neu) => { setBildJetzt(neu); setMarkieren(false); }} />
        )}
      </FormularDialog>
    </>
  );
}
