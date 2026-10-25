import { useEffect, useState } from "react";
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
import { useNeuLaden, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahlLesen } from "@/lib/format";
import { PROJEKT_STATUS, TON_KLASSE, type Kunde, type ProjektStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Projekt anlegen oder bearbeiten. Pflicht ist nur der Name — die Nummer
 * (2026-0001 …) vergibt die Datenbank. Wird ein Kunde gewählt, übernimmt
 * die Baustellenadresse seine Anschrift, solange dort noch nichts steht.
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
  const [name, setName] = useState("");
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjektStatus>("aktiv");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [stundensatz, setStundensatz] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(projekt?.name ?? "");
    setKundeId(projekt?.kunde_id ?? null);
    setStatus((projekt?.status as ProjektStatus) ?? "aktiv");
    setStrasse(projekt?.strasse ?? "");
    setPlz(projekt?.plz ?? "");
    setOrt(projekt?.ort ?? "");
    setBeschreibung(projekt?.beschreibung ?? "");
    setStundensatz(projekt?.stundensatz != null ? String(projekt.stundensatz).replace(".", ",") : "");
  }, [open, projekt]);

  const kundeGewaehlt = (k: Kunde | null) => {
    setKundeId(k?.id ?? null);
    if (k && !strasse && !ort) {
      setStrasse(k.strasse ?? "");
      setPlz(k.plz ?? "");
      setOrt(k.ort ?? "");
    }
    if (k && !name.trim()) setName(k.name);
  };

  const speichern = async () => {
    if (!name.trim()) return toast.error("Bitte einen Projektnamen eingeben");
    setSpeichert(true);
    const daten = {
      name: name.trim(),
      kunde_id: kundeId,
      status,
      strasse: strasse.trim() || null,
      plz: plz.trim() || null,
      ort: ort.trim() || null,
      beschreibung: beschreibung.trim() || null,
      stundensatz: istChef && stundensatz.trim() ? zahlLesen(stundensatz) : projekt?.stundensatz ?? null,
    };
    const { data, error } = projekt
      ? await supabase.from("projekte").update(daten).eq("id", projekt.id).select("id, nummer").single()
      : await supabase.from("projekte").insert(daten).select("id, nummer").single();
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    await neuLaden("projekte");
    toast.success(projekt ? "Projekt gespeichert" : `Projekt ${data.nummer} angelegt`);
    onOpenChange(false);
    if (!projekt && oeffnen) navigate(`/projekte/${data.id}`);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={projekt ? `Projekt ${projekt.nummer} bearbeiten` : "Neues Projekt"}
      beschreibung={projekt ? undefined : "Die Projektnummer vergibt die App automatisch."}
      gesperrt={speichert}
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
          <KundeWahl wert={kundeId} onChange={kundeGewaehlt} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-name">Projektname</Label>
          <Input id="p-name" className="h-12" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Neubau EFH Huber" />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(PROJEKT_STATUS) as ProjektStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={cn("flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                  status === s ? cn(TON_KLASSE[PROJEKT_STATUS[s].ton], "border-current") : "bg-card hover:bg-muted")}>
                {PROJEKT_STATUS[s].text}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-strasse">Baustelle</Label>
          <Input id="p-strasse" className="h-12" value={strasse} onChange={(e) => setStrasse(e.target.value)} placeholder="Straße und Hausnummer" />
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input className="h-12" inputMode="numeric" value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="PLZ" aria-label="PLZ" />
            <Input className="h-12" value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Ort" aria-label="Ort" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-beschr">Beschreibung <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="p-beschr" rows={3} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Was ist zu tun?" />
        </div>

        {istChef && (
          <div className="space-y-2">
            <Label htmlFor="p-satz">Eigener Stundensatz <span className="font-normal text-muted-foreground">(leer = aus den Einstellungen)</span></Label>
            <div className="flex items-center gap-2">
              <Input id="p-satz" className="h-12 max-w-32" inputMode="decimal" value={stundensatz} onChange={(e) => setStundensatz(e.target.value)} placeholder="z. B. 68" />
              <span className="text-sm text-muted-foreground">€ / Stunde netto</span>
            </div>
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
