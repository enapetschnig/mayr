import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { ProjektWahl } from "@/components/ProjektWahl";
import { KundeWahl } from "@/components/KundeWahl";
import { PersonenWahl } from "@/components/PersonenWahl";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useMitarbeiter, useNeuLaden, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag, tageDazu } from "@/lib/format";
import { PRIORITAET, WIEDERHOLUNG } from "@/lib/aufgaben";
import type { Aufgabe } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Aufgabe anlegen oder ändern. Pflicht ist nur der Titel; vorbelegt: ich
 * bin zuständig (Monteur) bzw. niemand (Chef wählt), Projekt aus dem Aufruf.
 */
export function AufgabeDialog({
  open, onOpenChange, aufgabe, projektId: vorProjekt, onGespeichert,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  aufgabe?: Aufgabe | null;
  projektId?: string;
  onGespeichert?: (id: string) => void;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [zustaendig, setZustaendig] = useState<string[]>([]);
  const [faellig, setFaellig] = useState("");
  const [prio, setPrio] = useState("normal");
  const [projektId, setProjektId] = useState("");
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [wiederholung, setWiederholung] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitel(aufgabe?.titel ?? "");
    setBeschreibung(aufgabe?.beschreibung ?? "");
    setZustaendig(aufgabe?.zustaendig ?? (istChef || !profil ? [] : [profil.id]));
    setFaellig(aufgabe?.faellig_am ?? "");
    setPrio(aufgabe?.prioritaet ?? "normal");
    setProjektId(aufgabe?.projekt_id ?? vorProjekt ?? "");
    setKundeId(aufgabe?.kunde_id ?? null);
    setWiederholung(aufgabe?.wiederholung ?? "");
  }, [open, aufgabe, vorProjekt, istChef, profil]);

  const heute = isoTag();
  const schnell: [string, string][] = [["Heute", heute], ["Morgen", tageDazu(heute, 1)], ["In 1 Woche", tageDazu(heute, 7)]];
  const ungespeichert = !aufgabe && !!(titel.trim() || beschreibung.trim());

  const speichern = async () => {
    if (!titel.trim()) return toast.error("Bitte sagen, was zu tun ist (Titel).");
    if (wiederholung && !faellig) return toast.error("Eine wiederkehrende Aufgabe braucht ein erstes Fälligkeitsdatum.");
    setSpeichert(true);
    const daten = {
      titel: titel.trim(),
      beschreibung: beschreibung.trim() || null,
      zustaendig,
      faellig_am: faellig || null,
      prioritaet: prio,
      projekt_id: projektId || null,
      kunde_id: kundeId,
      wiederholung: wiederholung || null,
    };
    const { data, error } = aufgabe
      ? await supabase.from("aufgaben").update(daten).eq("id", aufgabe.id).select("id").maybeSingle()
      : await supabase.from("aufgaben").insert(daten).select("id").single();
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    if (!data) return toast.error("Nicht gespeichert — ändern kann das nur, wer die Aufgabe angelegt hat, oder der Chef.");
    toast.success(aufgabe ? "Aufgabe geändert" : "Aufgabe angelegt");
    await neuLaden("aufgaben");
    onGespeichert?.(data.id);
    onOpenChange(false);
  };

  const pille = (an: boolean) => cn("min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted");

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel={aufgabe ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
      gesperrt={speichert} ungespeichert={ungespeichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={() => void speichern()} disabled={speichert} className="min-w-40">
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {aufgabe ? "Speichern" : "Aufgabe anlegen"}
          </Button>
        </>
      }>
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="a-titel">Was ist zu tun?</Label>
          <Input id="a-titel" className="h-12 text-base" value={titel} onChange={(e) => setTitel(e.target.value)}
            placeholder="z. B. Zählertausch bei Huber vereinbaren" autoFocus={!aufgabe} />
        </div>

        <div className="space-y-2">
          <Label>Wer ist zuständig?</Label>
          <PersonenWahl personen={mitarbeiter} teams={teams} gewaehlt={zustaendig} onChange={setZustaendig} ich={profil?.id} label="Zuständig" />
          {zustaendig.length === 0 && <p className="text-xs text-muted-foreground">Niemand gewählt — die Aufgabe sieht dann nur, wer sie anlegt, und der Chef.</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="a-faellig">Fällig am</Label>
          <div className="flex flex-wrap gap-2">
            {schnell.map(([t, d]) => <button key={t} type="button" className={pille(faellig === d)} onClick={() => setFaellig(d)}>{t}</button>)}
            <button type="button" className={pille(!faellig)} onClick={() => setFaellig("")}>Ohne Termin</button>
          </div>
          <Input id="a-faellig" type="date" className="h-12 w-full sm:w-56" value={faellig} onChange={(e) => setFaellig(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Wie dringend?</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Priorität">
            {Object.entries(PRIORITAET).map(([w, p]) => (
              <button key={w} type="button" role="radio" aria-checked={prio === w} className={pille(prio === w)} onClick={() => setPrio(w)}>{p.text}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="a-text">Beschreibung <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <DiktatKnopf onText={(t) => setBeschreibung((alt) => `${alt}${alt && !alt.endsWith(" ") ? " " : ""}${t}`)} />
          </div>
          <Textarea id="a-text" rows={3} className="text-base sm:text-sm" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="a-projekt">Projekt <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1"><ProjektWahl id="a-projekt" wert={projektId} onChange={(id) => setProjektId(id)} leerText="Kein Projekt" /></div>
            {projektId && (
              <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label="Projekt entfernen" onClick={() => setProjektId("")}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!projektId && (
          <div className="space-y-2">
            <Label>Kunde <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <KundeWahl wert={kundeId} onChange={(k) => setKundeId(k?.id ?? null)} />
          </div>
        )}

        <div className="space-y-2">
          <Label>Wiederholen</Label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pille(!wiederholung)} onClick={() => setWiederholung("")}>Einmalig</button>
            {Object.entries(WIEDERHOLUNG).map(([w, t]) => (
              <button key={w} type="button" className={pille(wiederholung === w)}
                onClick={() => { setWiederholung(w); if (!faellig) setFaellig(heute); /* erste Runde: heute, statt Fehlermeldung */ }}>{t}</button>
            ))}
          </div>
          {wiederholung && <p className="text-xs text-muted-foreground">Ist sie erledigt, legt die App die nächste an — mit dem Termin eine Runde später.</p>}
        </div>
      </div>
    </FormularDialog>
  );
}
