import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SichtbarkeitWahl } from "@/components/Bausteine";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";
import type { Sichtbarkeit, Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const KEIN = "__kein__";

/**
 * Termin im gemeinsamen Kalender.
 *
 * Wählt man ein gemeinsames Projekt, springt der Termin von selbst auf
 * "Für alle" — ein Termin auf einer geteilten Baustelle betrifft fast immer
 * alle. Zurückstellen geht trotzdem.
 */
export function TerminDialog({
  open, onOpenChange, termin, datum: vorDatum, projektId: vorProjekt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  termin?: Termin | null;
  datum?: string;
  projektId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { firma, firmen } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(isoTag());
  const [bisDatum, setBisDatum] = useState("");
  const [ganztags, setGanztags] = useState(false);
  const [von, setVon] = useState("08:00");
  const [bis, setBis] = useState("09:00");
  const [projektId, setProjektId] = useState(KEIN);
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [sicht, setSicht] = useState<Sichtbarkeit>("privat");
  const [beteiligt, setBeteiligt] = useState<string[]>([]);
  const [speichert, setSpeichert] = useState(false);

  const istEigen = !termin || termin.firma_id === firma?.id;

  useEffect(() => {
    if (!open) return;
    if (termin) {
      setTitel(termin.titel);
      setDatum(termin.datum);
      setBisDatum(termin.bis_datum || "");
      setGanztags(termin.ganztags);
      setVon(termin.von?.slice(0, 5) || "08:00");
      setBis(termin.bis?.slice(0, 5) || "09:00");
      setProjektId(termin.projekt_id || KEIN);
      setOrt(termin.ort || "");
      setBeschreibung(termin.beschreibung || "");
      setSicht(termin.sichtbarkeit as Sichtbarkeit);
      setBeteiligt(termin.firmen ?? []);
    } else {
      setTitel("");
      setDatum(vorDatum || isoTag());
      setBisDatum("");
      setGanztags(false);
      setVon("08:00");
      setBis("09:00");
      setOrt("");
      setBeschreibung("");
      setBeteiligt(firma ? [firma.id] : []);
      const p = projekte.find((x) => x.id === vorProjekt);
      setProjektId(p ? p.id : KEIN);
      setSicht(p?.sichtbarkeit === "gemeinsam" ? "gemeinsam" : "privat");
      if (p) setOrt([p.adresse, p.ort].filter(Boolean).join(", "));
    }
    // projekte absichtlich nicht in den Abhängigkeiten: Nachladen soll die Eingabe nicht zurücksetzen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, termin, vorDatum, vorProjekt, firma]);

  const projektWaehlen = (id: string) => {
    setProjektId(id);
    const p = projekte.find((x) => x.id === id);
    if (!p) return;
    if (p.sichtbarkeit === "gemeinsam") setSicht("gemeinsam");
    if (!ort) setOrt([p.adresse, p.ort].filter(Boolean).join(", "));
    if (!titel) setTitel(p.name);
  };

  const speichern = async () => {
    if (!titel.trim()) return toast.error("Bitte einen Titel eingeben.");
    if (!ganztags && von && bis && bis <= von && !bisDatum) return toast.error("Das Ende liegt vor dem Beginn.");
    setSpeichert(true);
    const daten = {
      titel: titel.trim(),
      datum,
      bis_datum: bisDatum && bisDatum > datum ? bisDatum : null,
      ganztags,
      von: ganztags ? null : von || null,
      bis: ganztags ? null : bis || null,
      projekt_id: projektId === KEIN ? null : projektId,
      ort: ort.trim() || null,
      beschreibung: beschreibung.trim() || null,
      sichtbarkeit: sicht,
      firmen: beteiligt,
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
    if (error) return toast.error(error.message);
    toast.success("Termin gelöscht");
    await neuLaden("termine");
    onOpenChange(false);
  };

  const gewaehlt = projekte.find((p) => p.id === projektId);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={termin ? "Termin bearbeiten" : "Neuer Termin"}
      gesperrt={speichert}
      fuss={
        <>
          {termin && istEigen && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={loeschen}>
              <Trash2 className="h-4 w-4 mr-2" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-32">
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Speichern
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="t-projekt">Projekt <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Select value={projektId} onValueChange={projektWaehlen}>
            <SelectTrigger id="t-projekt" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={KEIN}>Kein Projekt</SelectItem>
              {projekte.filter((p) => p.status === "aktiv" || p.id === projektId).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    {p.sichtbarkeit === "gemeinsam" && <Users className="h-3.5 w-3.5 text-primary" />}
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {gewaehlt?.sichtbarkeit === "gemeinsam" && (
            <p className="text-xs text-primary flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Gemeinsames Projekt — Termin ist für alle sichtbar.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-titel">Titel</Label>
          <Input id="t-titel" className="h-11" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Abnahme, Baubesprechung" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="t-datum" className="text-xs">Datum</Label>
            <Input id="t-datum" type="date" className="h-11" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-bisdatum" className="text-xs">Bis (mehrtägig, optional)</Label>
            <Input id="t-bisdatum" type="date" className="h-11" min={datum} value={bisDatum} onChange={(e) => setBisDatum(e.target.value)} />
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
              <Input id="t-von" type="time" className="h-11" value={von} onChange={(e) => setVon(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-bis" className="text-xs">Bis</Label>
              <Input id="t-bis" type="time" className="h-11" value={bis} onChange={(e) => setBis(e.target.value)} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="t-ort">Ort</Label>
          <Input id="t-ort" className="h-11" value={ort} onChange={(e) => setOrt(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Wer ist dabei?</Label>
          <div className="flex flex-wrap gap-2">
            {firmen.map((f) => {
              const an = beteiligt.includes(f.id);
              return (
                <button key={f.id} type="button"
                  onClick={() => setBeteiligt((v) => an ? v.filter((x) => x !== f.id) : [...v, f.id])}
                  className={cn("flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-colors",
                    an ? "text-white" : "bg-background text-muted-foreground")}
                  style={an ? { backgroundColor: f.farbe, borderColor: f.farbe } : { borderColor: `${f.farbe}55` }}>
                  {f.kurzname}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Wer sieht den Termin?</Label>
          <SichtbarkeitWahl wert={sicht} onChange={setSicht} gesperrt={!istEigen} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-beschr">Notiz</Label>
          <Textarea id="t-beschr" rows={3} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </div>
      </div>
    </FormularDialog>
  );
}
