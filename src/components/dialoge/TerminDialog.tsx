import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/Bausteine";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useMitarbeiter, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";
import type { Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Termin im Kalender — mit Einteilung: Wer ist dabei? Ein Projekt füllt
 * Titel und Ort vor, solange dort noch nichts steht.
 */
export function TerminDialog({
  open, onOpenChange, termin, datum: vorDatum, projektId: vorProjekt, mitarbeiterId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  termin?: Termin | null;
  datum?: string;
  projektId?: string;
  /** Aus der Einteilung: dieser Mitarbeiter ist vorausgewählt */
  mitarbeiterId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(isoTag());
  const [bisDatum, setBisDatum] = useState("");
  const [ganztags, setGanztags] = useState(false);
  const [von, setVon] = useState("07:00");
  const [bis, setBis] = useState("15:30");
  const [projektId, setProjektId] = useState("");
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [dabei, setDabei] = useState<string[]>([]);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (termin) {
      setTitel(termin.titel);
      setDatum(termin.datum);
      setBisDatum(termin.bis_datum || "");
      setGanztags(termin.ganztags);
      setVon(termin.von?.slice(0, 5) || "07:00");
      setBis(termin.bis?.slice(0, 5) || "15:30");
      setProjektId(termin.projekt_id || "");
      setOrt(termin.ort || "");
      setBeschreibung(termin.beschreibung || "");
      setDabei(termin.mitarbeiter ?? []);
    } else {
      const p = projekte.find((x) => x.id === vorProjekt);
      setTitel(p?.name ?? "");
      setDatum(vorDatum || isoTag());
      setBisDatum("");
      setGanztags(false);
      setVon("07:00");
      setBis("15:30");
      setProjektId(p?.id ?? "");
      setOrt(p ? [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
      setBeschreibung("");
      setDabei(mitarbeiterId ? [mitarbeiterId] : profil ? [profil.id] : []);
    }
    // projekte absichtlich nicht in den Abhängigkeiten: Nachladen soll die Eingabe nicht zurücksetzen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termin, vorDatum, vorProjekt, mitarbeiterId, profil]);

  const projektWaehlen = (id: string) => {
    setProjektId(id);
    const p = projekte.find((x) => x.id === id);
    if (!p) return;
    if (!ort) setOrt([p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    if (!titel) setTitel(p.name);
  };

  const speichern = async () => {
    if (!titel.trim()) return toast.error("Bitte einen Titel eingeben");
    if (!ganztags && von && bis && bis <= von && !bisDatum) return toast.error("Das Ende liegt vor dem Beginn");
    setSpeichert(true);
    const daten = {
      titel: titel.trim(),
      datum,
      bis_datum: bisDatum && bisDatum > datum ? bisDatum : null,
      ganztags,
      von: ganztags ? null : von || null,
      bis: ganztags ? null : bis || null,
      projekt_id: projektId || null,
      ort: ort.trim() || null,
      beschreibung: beschreibung.trim() || null,
      mitarbeiter: dabei,
    };
    const { error } = termin
      ? await supabase.from("termine").update(daten).eq("id", termin.id)
      : await supabase.from("termine").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success("Termin gespeichert");
    await neuLaden("termine");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!termin) return;
    const { error } = await supabase.from("termine").delete().eq("id", termin.id);
    if (error) return toast.error("Nicht gelöscht", { description: error.message });
    toast.success("Termin gelöscht");
    await neuLaden("termine");
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={termin ? "Termin bearbeiten" : "Neuer Termin"}
      gesperrt={speichert}
      fuss={
        <>
          {termin && (istChef || termin.user_id === profil?.id) && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={loeschen}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-32 gap-2">
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="t-projekt">Projekt <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <ProjektWahl id="t-projekt" wert={projektId} onChange={projektWaehlen} leerText="Kein Projekt" />
          {projektId && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setProjektId("")}>Projekt entfernen</button>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-titel">Titel</Label>
          <Input id="t-titel" className="h-12" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Abnahme, Baubesprechung, Urlaub" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="t-datum" className="text-xs">Datum</Label>
            <Input id="t-datum" type="date" className="h-12" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-bisdatum" className="text-xs">Bis (mehrtägig)</Label>
            <Input id="t-bisdatum" type="date" className="h-12" min={datum} value={bisDatum} onChange={(e) => setBisDatum(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="t-ganztags" checked={ganztags} onCheckedChange={setGanztags} />
          <Label htmlFor="t-ganztags">Ganztägig</Label>
        </div>
        {!ganztags && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="t-von" className="text-xs">Von</Label>
              <Input id="t-von" type="time" className="h-12" value={von} onChange={(e) => setVon(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-bis" className="text-xs">Bis</Label>
              <Input id="t-bis" type="time" className="h-12" value={bis} onChange={(e) => setBis(e.target.value)} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Wer ist dabei?</Label>
          <div className="flex flex-wrap gap-2">
            {mitarbeiter.map((m) => {
              const an = dabei.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={an}
                  onClick={() => setDabei((v) => (an ? v.filter((x) => x !== m.id) : [...v, m.id]))}
                  className={cn("flex h-11 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-colors",
                    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                  <Avatar profil={m} className={cn("h-7 w-7 text-[11px]", !an && "opacity-50")} />
                  {m.vorname || m.nachname}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-ort">Ort</Label>
          <Input id="t-ort" className="h-12" value={ort} onChange={(e) => setOrt(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-beschr">Notiz</Label>
          <Textarea id="t-beschr" rows={3} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </div>
      </div>
    </FormularDialog>
  );
}
