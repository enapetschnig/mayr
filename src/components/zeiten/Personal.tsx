import { useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Check, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, Karte, StatusPille } from "@/components/Bausteine";
import FormularDialog from "@/components/FormularDialog";
import { fehlerText } from "@/components/stamm/stammDaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, isoTag, stunden, zahl } from "@/lib/format";
import { ABWESENHEIT_ART, ABWESENHEIT_STATUS, name, type AbwesenheitArt, type Profil } from "@/lib/types";
import { abwesenheitsTage } from "@/lib/zeitkonto";
import { cn } from "@/lib/utils";
import { useAbwesenheiten, useAntraege, useKonto } from "./personalDaten";

const artText = (a: string) => ABWESENHEIT_ART[a as AbwesenheitArt]?.text ?? a;
const zeitraum = (von: string, bis: string) => (von === bis ? datum(von) : `${datum(von).slice(0, 6)} – ${datum(bis)}`);
const tageText = (n: number) => (n === 1 ? "1 Tag" : `${zahl(n)} Tage`);

/** Überstunden und Resturlaub einer Person, dazu „Abwesenheit“ und (Chef) Korrektur */
export function KontoKarte({ person, onAbwesenheit }: { person: Profil; onAbwesenheit: () => void }) {
  const { istChef, profil } = useSitzung();
  const { data: k } = useKonto(person);
  const [korrektur, setKorrektur] = useState(false);
  return (
    <Karte titel={person.id === profil?.id ? "Mein Konto" : `Konto ${person.vorname || name(person)}`}>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Überstunden</dt>
          <dd className={cn("zahl text-2xl font-bold", (k?.saldo ?? 0) < 0 && "text-destructive")}>
            {k ? `${k.saldo > 0 ? "+" : ""}${stunden(k.saldo)}` : "…"}
          </dd>
          {k && <p className="text-xs text-muted-foreground">seit {datum(person.konto_ab)}</p>}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Resturlaub</dt>
          <dd className="zahl text-2xl font-bold">{k ? tageText(k.urlaubRest) : "…"}</dd>
          {k && (
            <p className="text-xs text-muted-foreground">
              von {zahl(k.urlaubAnspruch)}{k.urlaubGeplant > 0 && ` · ${tageText(k.urlaubGeplant)} geplant`}{k.urlaubBeantragt > 0 && ` · ${tageText(k.urlaubBeantragt)} beantragt`}
            </p>
          )}
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 gap-1.5" onClick={onAbwesenheit}>
          <CalendarOff className="h-4 w-4" /> {istChef ? "Abwesenheit eintragen" : "Urlaub, Krank & Co."}
        </Button>
        {istChef && <Button variant="ghost" className="h-11" onClick={() => setKorrektur(true)}>Konto korrigieren</Button>}
      </div>
      {istChef && <KontoDialog open={korrektur} onOpenChange={setKorrektur} person={person} />}
    </Karte>
  );
}

/** Anfangsbestand, Auszahlung, Übertrag — eine Bewegung mit Vorzeichen */
function KontoDialog({ open, onOpenChange, person }: { open: boolean; onOpenChange: (o: boolean) => void; person: Profil }) {
  const neuLaden = useNeuLaden();
  const [art, setArt] = useState<"ueberstunden" | "urlaub">("ueberstunden");
  const [menge, setMenge] = useState("");
  const [text, setText] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const speichern = async () => {
    const m = dezimalLesen(menge);
    if (!m) return toast.error("Bitte eine Menge eintragen — Auszahlung mit Minus.");
    if (!text.trim()) return toast.error("Bitte kurz dazuschreiben, wofür.");
    setSpeichert(true);
    const { error } = await supabase.from("konto_buchungen").insert({ user_id: person.id, art, menge: m, text: text.trim(), datum: isoTag() });
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success("Konto korrigiert");
    setMenge("");
    setText("");
    await neuLaden("zeiten");
    onOpenChange(false);
  };
  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel={`Konto ${name(person)}`} beschreibung="Anfangsbestand, Auszahlung oder Übertrag." gesperrt={speichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-32">Buchen</Button>
        </>
      }
    >
      <div className="max-w-md space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {(["ueberstunden", "urlaub"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={art === a} onClick={() => setArt(a)}
              className={cn("h-12 rounded-md border text-sm font-medium", art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
              {a === "urlaub" ? "Urlaub (Tage)" : "Überstunden (h)"}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="ko-menge">{art === "urlaub" ? "Tage" : "Stunden"} <span className="font-normal text-muted-foreground">(minus = weniger)</span></Label>
          <Input id="ko-menge" inputMode="text" className="h-12 w-32" value={menge} onChange={(e) => setMenge(e.target.value)} placeholder="z. B. -10" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ko-text">Wofür?</Label>
          <Input id="ko-text" className="h-12" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Auszahlung Oktober" />
        </div>
      </div>
    </FormularDialog>
  );
}

/** Für den Chef: offene Anträge genehmigen oder ablehnen */
export function AntraegeKarte() {
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const { data: antraege = [] } = useAntraege(istChef);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  if (!antraege.length) return null;
  const entscheiden = async (id: string, status: "genehmigt" | "abgelehnt") => {
    setLaeuft(id);
    const { error } = await supabase.from("abwesenheiten").update({ status }).eq("id", id);
    setLaeuft(null);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(status === "genehmigt" ? "Genehmigt — steht jetzt im Kalender" : "Abgelehnt");
    await neuLaden("abwesenheiten", "zeiten");
  };
  return (
    <Karte titel={`Anträge · ${antraege.length}`}>
      <ul className="divide-y">
        {antraege.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar profil={a.profiles} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{name(a.profiles)} · {artText(a.art)}</p>
              <p className="text-xs text-muted-foreground">{zeitraum(a.von, a.bis)} · {tageText(abwesenheitsTage(a).length)}{a.notiz && ` · ${a.notiz}`}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 gap-1.5" disabled={!!laeuft} onClick={() => void entscheiden(a.id, "abgelehnt")}><X className="h-4 w-4" /> Ablehnen</Button>
              <Button className="h-11 gap-1.5" disabled={!!laeuft} onClick={() => void entscheiden(a.id, "genehmigt")}>
                {laeuft === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Genehmigen
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Karte>
  );
}

/** Abwesenheiten einer Person: was kommt, was war. Offene Anträge lassen sich zurückziehen. */
export function AbwesenheitListe({ userId }: { userId: string }) {
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const { data: liste = [] } = useAbwesenheiten(userId);
  const heute = isoTag();
  const relevant = liste.filter((a) => a.bis >= heute || a.status === "beantragt").reverse();
  if (!relevant.length) return null;
  const weg = async (id: string) => {
    const { data, error } = await supabase.from("abwesenheiten").delete().eq("id", id).select("id");
    if (error || !data?.length) return toast.error("Nicht gelöscht", { description: error ? fehlerText(error) : "Genehmigtes kann nur der Chef löschen." });
    toast.success("Gelöscht");
    await neuLaden("abwesenheiten", "zeiten");
  };
  return (
    <Karte titel="Abwesenheiten" ohnePolster>
      <ul className="divide-y">
        {relevant.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-2 lg:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{artText(a.art)}{a.stunden ? ` · ${stunden(Number(a.stunden))}` : ""}</p>
              <p className="text-xs text-muted-foreground">{zeitraum(a.von, a.bis)} · {tageText(abwesenheitsTage(a).length)}</p>
            </div>
            <StatusPille eintrag={ABWESENHEIT_STATUS[a.status] ?? { ton: "grau", text: a.status }} />
            {(istChef || a.status === "beantragt") && (
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${artText(a.art)} ${zeitraum(a.von, a.bis)} löschen`} onClick={() => void weg(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Karte>
  );
}
