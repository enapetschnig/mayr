import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EditorPosition, Kopf } from "./editor";
import { kategorienAus, vorlageAusEditor, vorlageNetto, vorlageUmfang } from "./vorlagen";
import { useVorlagen, vorlageSpeichern } from "./vorlagenDaten";

/**
 * Das Angebot als Vorlage speichern: Name und Kategorie, Texte auf Wunsch.
 * Gibt es den Namen schon, wird diese Vorlage mit dem Stand des Angebots
 * ersetzt (= aktualisiert) — vorhandene Vorlagen lassen sich dafür antippen.
 */
export function VorlageSpeichernDialog({
  open, onOpenChange, kopf, positionen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kopf: Kopf;
  positionen: EditorPosition[];
}) {
  const qc = useQueryClient();
  const { data: vorlagen = [] } = useVorlagen(open);
  const [name, setName] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [mitTexten, setMitTexten] = useState(true);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(kopf.betreff.trim().slice(0, 120));
    setKategorie("");
    setMitTexten(true);
  }, [open, kopf.betreff]);

  const daten = useMemo(() => vorlageAusEditor(positionen), [positionen]);
  const vorhanden = vorlagen.find((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
  const kategorien = useMemo(() => kategorienAus(vorlagen, true), [vorlagen]);

  const speichern = async () => {
    if (!name.trim()) return;
    setLaeuft(true);
    try {
      await vorlageSpeichern({
        name,
        kategorie: kategorie || null,
        betreff: kopf.betreff || null,
        einleitung: mitTexten ? kopf.einleitung : null,
        schlusstext: mitTexten ? kopf.schlusstext : null,
      }, daten, vorhanden?.id);
      await qc.invalidateQueries({ queryKey: ["angebot_vorlagen"] });
      toast.success(vorhanden ? `Vorlage „${name.trim()}“ aktualisiert` : `Vorlage „${name.trim()}“ gespeichert`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Als Vorlage speichern"
      beschreibung={`${vorlageUmfang(daten)} · ${euro(vorlageNetto(daten))} netto — ohne Kunde und Datum`}
      gesperrt={laeuft}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={laeuft}>Abbrechen</Button>
          <Button className="h-12 sm:min-w-56" onClick={() => void speichern()} disabled={laeuft || !name.trim() || !daten.length}>
            <Save className="h-4 w-4" /> {vorhanden ? "Vorlage ersetzen" : "Vorlage speichern"}
          </Button>
        </>
      )}
    >
      <div className="mx-auto w-full max-w-xl space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="vs-name">Name der Vorlage</Label>
          <Input id="vs-name" className="h-12 text-base" value={name} maxLength={120} autoFocus
            placeholder="z. B. PV 10 kWp Aufdach mit Speicher" onChange={(e) => setName(e.target.value)} />
          {vorhanden && (
            <p className="rounded-md bg-status-gelb px-3 py-2 text-sm text-status-gelb-fg">
              Die Vorlage „{vorhanden.name}“ gibt es schon — sie wird mit diesem Angebot ersetzt.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vs-kat">Kategorie</Label>
          <Input id="vs-kat" className="h-12 text-base" value={kategorie} maxLength={60} list="vorlage-kategorien"
            placeholder="z. B. PV-Anlage, Speicher, Wallbox, E-Befund" onChange={(e) => setKategorie(e.target.value)} />
          <datalist id="vorlage-kategorien">{kategorien.map((k) => <option key={k} value={k} />)}</datalist>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {kategorien.slice(0, 10).map((k) => (
              <button key={k} type="button" onClick={() => setKategorie(k)}
                className={cn("h-9 rounded-full border px-3 text-sm", kategorie === k ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm">
          <Checkbox checked={mitTexten} onCheckedChange={(v) => setMitTexten(!!v)} className="mt-0.5 h-5 w-5" />
          <span>
            Einleitung und Schlusstext mitnehmen
            <span className="block text-xs text-muted-foreground">Ein neues Angebot aus der Vorlage bekommt dann diese Texte statt der Standardtexte.</span>
          </span>
        </label>
        {vorlagen.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Vorhandene Vorlage aktualisieren</p>
            <div className="flex flex-wrap gap-1.5">
              {vorlagen.map((v) => (
                <button key={v.id} type="button" onClick={() => { setName(v.name); setKategorie(v.kategorie ?? ""); }}
                  className={cn("min-h-9 rounded-md border px-3 py-1.5 text-left text-sm", vorhanden?.id === v.id ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                  {v.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </FormularDialog>
  );
}
