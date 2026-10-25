import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KundeWahl } from "@/components/KundeWahl";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import { PROJEKT_STATUS, TON_KLASSE, type Kunde, type ProjektStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Werte = {
  name: string;
  kundeId: string | null;
  status: ProjektStatus;
  strasse: string;
  plz: string;
  ort: string;
  beschreibung: string;
  stundensatz: string;
};

const werteAus = (p: ProjektMitKunde | null | undefined): Werte => ({
  name: p?.name ?? "",
  kundeId: p?.kunde_id ?? null,
  status: (p?.status as ProjektStatus) ?? "aktiv",
  strasse: p?.strasse ?? "",
  plz: p?.plz ?? "",
  ort: p?.ort ?? "",
  beschreibung: p?.beschreibung ?? "",
  stundensatz: p?.stundensatz != null ? String(p.stundensatz).replace(".", ",") : "",
});

/**
 * Eigener Stundensatz aus dem Eingabefeld: leer = der des Betriebs (null),
 * sonst ein Betrag über 0 € — „abc“ oder „-50“ sind kein Satz (undefined).
 */
export function stundensatzLesen(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = dezimalLesen(text);
  return n !== null && n > 0 ? runden2(n) : undefined;
}

/** Spalten für die Tabelle projekte — der Stundensatz nur, wenn der Chef ihn sieht */
function spalten(w: Werte, mitSatz: boolean) {
  return {
    name: w.name.trim(),
    kunde_id: w.kundeId,
    status: w.status,
    strasse: w.strasse.trim() || null,
    plz: w.plz.trim() || null,
    ort: w.ort.trim() || null,
    beschreibung: w.beschreibung.trim() || null,
    ...(mitSatz ? { stundensatz: stundensatzLesen(w.stundensatz) ?? null } : {}),
  };
}

/**
 * Projekt anlegen oder bearbeiten. Pflicht ist nur der Name — die Nummer
 * (2026-0001 …) vergibt die Datenbank. Wird ein Kunde gewählt, übernimmt
 * die Baustellenadresse seine Anschrift, solange dort noch nichts steht.
 *
 * Gefüllt wird nur beim Öffnen (Nachladen überschreibt keine Eingabe), und
 * gespeichert nur, was sich geändert hat — ändert jemand anderer inzwischen
 * ein anderes Feld, bleibt seine Änderung stehen.
 */
export function ProjektDialog({
  open, onOpenChange, projekt, oeffnen = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projekt?: ProjektMitKunde | null;
  /** Nach dem Anlegen gleich ins neue Projekt springen */
  oeffnen?: boolean;
}) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const [w, setW] = useState<Werte>(werteAus(null));
  const [basis, setBasis] = useState<Werte>(werteAus(null));
  const [speichert, setSpeichert] = useState(false);
  const setze = (teil: Partial<Werte>) => setW((x) => ({ ...x, ...teil }));

  useBeimOeffnen(open ? projekt?.id ?? "neu" : null, () => {
    const v = werteAus(projekt);
    setW(v);
    setBasis(v);
  });

  const kundeGewaehlt = (k: Kunde | null) => {
    setW((x) => ({
      ...x,
      kundeId: k?.id ?? null,
      ...(k && !x.strasse && !x.ort ? { strasse: k.strasse ?? "", plz: k.plz ?? "", ort: k.ort ?? "" } : {}),
      ...(k && !x.name.trim() ? { name: k.name } : {}),
    }));
  };

  const speichern = async () => {
    if (!w.name.trim()) return toast.error("Bitte einen Projektnamen eingeben");
    if (istChef && stundensatzLesen(w.stundensatz) === undefined) {
      return toast.error(`Stundensatz: „${w.stundensatz.trim()}“ ist kein Betrag über 0 €.`, {
        description: "Leer lassen, dann gilt der Stundensatz aus den Einstellungen.",
      });
    }
    const daten = spalten(w, istChef);
    let geaendert: Partial<typeof daten> = daten;
    if (projekt) {
      const vorher = spalten(basis, istChef);
      geaendert = Object.fromEntries(
        Object.entries(daten).filter(([k, v]) => v !== vorher[k as keyof typeof vorher]),
      ) as Partial<typeof daten>;
      if (Object.keys(geaendert).length === 0) return onOpenChange(false);
    }
    setSpeichert(true);
    const { data, error } = projekt
      ? await supabase.from("projekte").update(geaendert).eq("id", projekt.id).select("id, nummer").single()
      : await supabase.from("projekte").insert(daten).select("id, nummer").single();
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("projekte");
    toast.success(projekt ? "Projekt gespeichert" : `Projekt ${data.nummer} angelegt`);
    // Erst weiter, dann schließen: das neue Projekt ersetzt den Verlaufseintrag
    // des Formulars — Zurück führt dann dorthin, wo „Neues Projekt“ getippt wurde
    if (!projekt && oeffnen) navigate(`/projekte/${data.id}`, { replace: true });
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={projekt ? `Projekt ${projekt.nummer} bearbeiten` : "Neues Projekt"}
      beschreibung={projekt ? undefined : "Die Projektnummer vergibt die App automatisch."}
      gesperrt={speichert}
      ungespeichert={JSON.stringify(w) !== JSON.stringify(basis)}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-40 gap-2">
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />}{projekt ? "Speichern" : "Projekt anlegen"}
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label>Kunde</Label>
          <KundeWahl wert={w.kundeId} onChange={kundeGewaehlt} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-name">Projektname</Label>
          <Input id="p-name" className="h-12" value={w.name} onChange={(e) => setze({ name: e.target.value })} placeholder="z. B. Neubau EFH Huber" />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(PROJEKT_STATUS) as ProjektStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => setze({ status: s })}
                className={cn("flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                  w.status === s ? cn(TON_KLASSE[PROJEKT_STATUS[s].ton], "border-current") : "bg-card hover:bg-muted")}>
                {PROJEKT_STATUS[s].text}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-strasse">Baustelle</Label>
          <Input id="p-strasse" className="h-12" value={w.strasse} onChange={(e) => setze({ strasse: e.target.value })} placeholder="Straße und Hausnummer" />
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input className="h-12" inputMode="numeric" value={w.plz} onChange={(e) => setze({ plz: e.target.value })} placeholder="PLZ" aria-label="PLZ" />
            <Input className="h-12" value={w.ort} onChange={(e) => setze({ ort: e.target.value })} placeholder="Ort" aria-label="Ort" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-beschr">Beschreibung <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="p-beschr" rows={3} value={w.beschreibung} onChange={(e) => setze({ beschreibung: e.target.value })}
            placeholder="Was ist zu tun?" />
        </div>

        {istChef && (
          <div className="space-y-2">
            <Label htmlFor="p-satz">Eigener Stundensatz <span className="font-normal text-muted-foreground">(leer = aus den Einstellungen)</span></Label>
            <div className="flex items-center gap-2">
              <Input id="p-satz" className="h-12 max-w-32" inputMode="decimal" value={w.stundensatz}
                onChange={(e) => setze({ stundensatz: e.target.value })} placeholder="z. B. 68"
                aria-invalid={stundensatzLesen(w.stundensatz) === undefined} />
              <span className="text-sm text-muted-foreground">€ / Stunde netto</span>
            </div>
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
