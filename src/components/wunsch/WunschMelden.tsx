import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Bug, HelpCircle, Lightbulb, Loader2, MessageSquarePlus, Mic, Send, Square, Trash2 } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { bildschirmfotoMachen, datenUrlZuBlob } from "@/lib/bildschirmfoto";
import { cn } from "@/lib/utils";

/** Neue Tabelle, noch nicht in den generierten Typen */
const wuensche = () => (supabase.from("aenderungswuensche" as never) as any);

type Art = "wunsch" | "fehler" | "frage";
const ARTEN: { wert: Art; titel: string; icon: typeof Bug; hilfe: string }[] = [
  { wert: "wunsch", titel: "Wunsch", icon: Lightbulb, hilfe: "Fehlt oder ginge einfacher" },
  { wert: "fehler", titel: "Passt nicht", icon: Bug, hilfe: "Geht nicht oder ist falsch" },
  { wert: "frage", titel: "Frage", icon: HelpCircle, hilfe: "Wie geht das?" },
];

const tonTyp = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
};
const endung = (mime: string) => (mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm");

/**
 * „Änderung melden“: ERST das Bildschirmfoto, DANN der Dialog — sonst wäre nur
 * das Meldefenster im Bild. Reden statt tippen: die Sprachnachricht geht mit,
 * abgeschrieben wird im Hintergrund (Edge Function `sprache-zu-text`).
 * Weiter geht der Wunsch per Trigger ans Cockpit, dort setzt ihn der Roboter um.
 */
export function WunschKnopf({ className }: { className?: string }) {
  const ort = useLocation();
  const [offen, setOffen] = useState(false);
  const [bild, setBild] = useState<string | null>(null);
  const [seite, setSeite] = useState("");
  const [arbeitet, setArbeitet] = useState(false);

  const starten = async () => {
    setArbeitet(true);
    setSeite(ort.pathname + ort.search);
    setBild(await bildschirmfotoMachen());
    setArbeitet(false);
    setOffen(true);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void starten()} disabled={arbeitet}
        title="Änderung melden — ein Bild vom Bildschirm ist dabei" aria-label="Änderung melden"
        data-bildschirmfoto="aus" className={cn("h-9 gap-1.5 px-2.5 print:hidden", className)}>
        {arbeitet ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
        <span className="hidden xl:inline">Änderung melden</span>
      </Button>
      <WunschDialog open={offen} onOpenChange={setOffen} bild={bild} seite={seite} />
    </>
  );
}

function WunschDialog({ open, onOpenChange, bild, seite }: {
  open: boolean; onOpenChange: (o: boolean) => void; bild: string | null; seite: string;
}) {
  const [art, setArt] = useState<Art>("wunsch");
  const [text, setText] = useState("");
  const [bildJetzt, setBildJetzt] = useState<string | null>(bild);
  const [ton, setTon] = useState<Blob | null>(null);
  const [nimmtAuf, setNimmtAuf] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const [sendet, setSendet] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);
  const tonUrl = ton ? URL.createObjectURL(ton) : null;
  useEffect(() => () => { if (tonUrl) URL.revokeObjectURL(tonUrl); }, [tonUrl]);

  const aufnahmeStoppen = () => {
    rec.current?.state === "recording" && rec.current.stop();
    rec.current = null;
    if (uhr.current) clearInterval(uhr.current);
    setNimmtAuf(false);
  };

  useEffect(() => {
    if (open) setBildJetzt(bild);
    else aufnahmeStoppen();
  }, [open, bild]);

  const aufnehmen = async () => {
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const typ = tonTyp();
      const r = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined);
      const stuecke: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) stuecke.push(e.data); };
      r.onstop = () => {
        strom.getTracks().forEach((t) => t.stop());
        const blob = new Blob(stuecke, { type: typ || "audio/webm" });
        if (blob.size < 1000) { toast("Die Aufnahme war zu kurz — noch einmal?"); return; }
        setTon(blob);
      };
      r.start();
      rec.current = r;
      setSekunden(0);
      setNimmtAuf(true);
      uhr.current = setInterval(() => setSekunden((s) => s + 1), 1000);
    } catch {
      toast.error("Kein Zugriff aufs Mikrofon", { description: "Im Browser freigeben — oder einfach tippen." });
    }
  };

  const zuruecksetzen = () => { setArt("wunsch"); setText(""); setTon(null); setBildJetzt(null); setSekunden(0); };

  const senden = async () => {
    if (!text.trim() && !ton) return toast.error("Kurz sagen oder tippen, was anders sein soll.");
    setSendet(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet.");
      // Bild: scheitert es, geht die Meldung trotzdem
      let bildPfad: string | null = null;
      if (bildJetzt) {
        const pfad = `${user.id}/${Date.now()}-bild.jpg`;
        const { error } = await supabase.storage.from("aenderungswuensche").upload(pfad, datenUrlZuBlob(bildJetzt), { contentType: "image/jpeg" });
        if (!error) bildPfad = pfad;
      }
      let audioPfad: string | null = null;
      if (ton) {
        const pfad = `${user.id}/${Date.now()}-ton.${endung(ton.type)}`;
        const { error } = await supabase.storage.from("aenderungswuensche").upload(pfad, ton, { contentType: ton.type || "audio/webm" });
        if (error) throw new Error(`Sprachnachricht nicht hochgeladen: ${error.message}`);
        audioPfad = pfad;
      }
      const { data: neu, error } = await wuensche().insert({
        erstellt_von: user.id, art, text: text.trim(), seite, app_version: __APP_BUILD__,
        bild_pfad: bildPfad, audio_pfad: audioPfad, abschrift: audioPfad ? "offen" : "fertig",
      }).select("id").single();
      if (error) throw error;
      // Abschrift im Hintergrund — bewusst ohne await
      if (audioPfad && neu?.id) {
        supabase.functions.invoke("sprache-zu-text", { body: { wunschId: neu.id, audioPfad } }).catch(() => {});
      }
      toast.success("Danke — der Wunsch ist angekommen", {
        description: audioPfad ? "Die Sprachnachricht wird gerade abgeschrieben." : undefined,
      });
      zuruecksetzen();
      onOpenChange(false);
    } catch (f) {
      toast.error("Konnte nicht gesendet werden", { description: f instanceof Error ? f.message : undefined });
    } finally {
      setSendet(false);
    }
  };

  const mmss = `${Math.floor(sekunden / 60)}:${String(sekunden % 60).padStart(2, "0")}`;

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Was sollen wir ändern?" gesperrt={sendet}
      beschreibung="Einfach sagen oder tippen — das Bild vom Bildschirm ist schon dabei."
      ungespeichert={!!(text.trim() || ton)}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sendet}>Abbrechen</Button>
          <Button onClick={() => void senden()} disabled={sendet || nimmtAuf || (!text.trim() && !ton)} className="gap-2">
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendet ? "Wird gesendet …" : "Abschicken"}
          </Button>
        </>
      }>
      <div className="space-y-5" data-wunsch-dialog>
        <div className="grid grid-cols-3 gap-2">
          {ARTEN.map((a) => (
            <button key={a.wert} type="button" onClick={() => setArt(a.wert)} aria-pressed={art === a.wert}
              className={cn("flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center text-sm",
                art === a.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
              <a.icon className="h-5 w-5" />
              <span className="font-medium">{a.titel}</span>
              <span className="text-xs text-muted-foreground">{a.hilfe}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Sagen statt tippen</Label>
          <div className="rounded-lg border border-dashed p-3">
            {ton ? (
              <div className="flex flex-wrap items-center gap-2">
                <audio controls src={tonUrl ?? undefined} className="h-10 min-w-0 flex-1" />
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setTon(null)}>
                  <Trash2 className="h-4 w-4" /> Verwerfen
                </Button>
              </div>
            ) : nimmtAuf ? (
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                <span className="text-sm">Nimmt auf … <span className="zahl">{mmss}</span></span>
                <Button type="button" variant="destructive" className="ml-auto gap-2" onClick={aufnahmeStoppen}>
                  <Square className="h-4 w-4" /> Fertig
                </Button>
              </div>
            ) : (
              <Button type="button" className="h-12 w-full gap-2 text-base" onClick={() => void aufnehmen()}>
                <Mic className="h-5 w-5" /> Sprachnachricht aufnehmen
              </Button>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Bitte möglichst Hochdeutsch — die Aufnahme wird automatisch abgeschrieben. Nicht warten: abschicken genügt.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wunsch-text">… oder tippen</Label>
          <Textarea id="wunsch-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-24"
            placeholder="Zum Beispiel: Beim Angebot hätte ich gern die Summe auch oben." />
        </div>

        <div className="space-y-2">
          <Label>Bild vom Bildschirm</Label>
          {bildJetzt ? (
            <div className="space-y-2">
              <img src={bildJetzt} alt="Bildschirm beim Melden" className="max-h-56 w-full rounded-lg border bg-muted/30 object-contain" />
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setBildJetzt(null)}>
                <Trash2 className="h-4 w-4" /> Ohne Bild schicken
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Kein Bild dabei — der Hinweis allein hilft auch.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Mitgeschickt wird auch die Seite ({seite}).</p>
      </div>
    </FormularDialog>
  );
}
