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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SichtbarkeitWahl } from "@/components/Bausteine";
import { RollenWahl, type RollenMap } from "@/components/RollenWahl";
import { useNeuLaden, type ProjektMitRollen } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import type { Sichtbarkeit } from "@/lib/types";
import { ChevronDown } from "lucide-react";

const LEER = {
  name: "", kunde_name: "", kunde_strasse: "", kunde_plz: "", kunde_ort: "", kunde_telefon: "",
  kunde_email: "", kunde_uid: "", adresse: "", plz: "", ort: "", beschreibung: "", start_datum: "", end_datum: "",
};
type Felder = typeof LEER;

/** Rollen in der Datenbank ersetzen (erst weg, dann neu — wegen "nur ein GU"). */
export async function rollenSpeichern(projektId: string, rollen: RollenMap) {
  const { error: e1 } = await supabase.from("projekt_rollen").delete().eq("projekt_id", projektId);
  if (e1) throw e1;
  const zeilen = Object.entries(rollen)
    .filter(([, r]) => r === "GU" || r === "SU")
    .map(([firma_id, rolle]) => ({ projekt_id: projektId, firma_id, rolle: rolle as string }));
  if (zeilen.length) {
    const { error: e2 } = await supabase.from("projekt_rollen").insert(zeilen);
    if (e2) throw e2;
  }
}

export function ProjektDialog({
  open, onOpenChange, projekt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projekt?: ProjektMitRollen | null;
}) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { firma, firmen } = useSitzung();
  const [f, setF] = useState<Felder>(LEER);
  const [sicht, setSicht] = useState<Sichtbarkeit>("privat");
  const [rollen, setRollen] = useState<RollenMap>({});
  const [mehrOffen, setMehrOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const istEigen = !projekt || projekt.firma_id === firma?.id;

  useEffect(() => {
    if (!open) return;
    if (projekt) {
      const neu = { ...LEER };
      (Object.keys(LEER) as (keyof Felder)[]).forEach((k) => { neu[k] = (projekt[k] as string) ?? ""; });
      setF(neu);
      setSicht(projekt.sichtbarkeit as Sichtbarkeit);
      const r: RollenMap = {};
      projekt.projekt_rollen.forEach((x) => { r[x.firma_id] = x.rolle as "GU" | "SU"; });
      setRollen(r);
      setMehrOffen(true);
    } else {
      setF(LEER);
      setSicht("privat");
      // Vorschlag: ich bin GU, die anderen SU
      const r: RollenMap = {};
      firmen.forEach((x) => { r[x.id] = x.id === firma?.id ? "GU" : "SU"; });
      setRollen(r);
      setMehrOffen(false);
    }
  }, [open, projekt, firma, firmen]);

  const setze = (k: keyof Felder) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const speichern = async () => {
    if (!f.name.trim()) return toast.error("Bitte einen Projektnamen eingeben.");
    setSpeichert(true);
    const daten = {
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v as string).trim() || null])),
      name: f.name.trim(),
      ...(istEigen ? { sichtbarkeit: sicht } : {}),
    };
    try {
      let id = projekt?.id;
      if (projekt) {
        const { error } = await supabase.from("projekte").update(daten).eq("id", projekt.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("projekte").insert(daten as never).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (id && sicht === "gemeinsam") await rollenSpeichern(id, rollen);
      await neuLaden("projekte");
      toast.success(projekt ? "Projekt gespeichert" : sicht === "gemeinsam" ? "Projekt angelegt und mit allen geteilt" : "Projekt angelegt");
      onOpenChange(false);
      if (!projekt && id) navigate(`/projekte/${id}`);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={projekt ? "Projekt bearbeiten" : "Neues Projekt"}
      gesperrt={speichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-40">
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {projekt ? "Speichern" : "Projekt anlegen"}
          </Button>
        </>
      }
    >
      <div className="max-w-2xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="p-name">Projektname</Label>
          <Input id="p-name" className="h-11 text-base" autoFocus={!projekt} value={f.name} onChange={setze("name")}
            placeholder="z. B. EFH Huber, Kremsmünster" />
        </div>

        <div className="space-y-2">
          <Label>Für wen ist das Projekt?</Label>
          <SichtbarkeitWahl
            wert={sicht}
            onChange={setSicht}
            gesperrt={!istEigen}
            textPrivat="Nur für mich"
            textGemeinsam="Mit allen teilen"
            hinweisPrivat="Nur meine Firma sieht es"
            hinweisGemeinsam="Alle drei Firmen arbeiten mit"
          />
          {!istEigen && <p className="text-xs text-muted-foreground">Die Freigabe kann nur die Firma ändern, die das Projekt angelegt hat.</p>}
        </div>

        {sicht === "gemeinsam" && (
          <div className="space-y-2">
            <Label>Wer ist General-, wer Subunternehmer?</Label>
            <RollenWahl rollen={rollen} onChange={setRollen} />
          </div>
        )}

        <Collapsible open={mehrOffen} onOpenChange={setMehrOffen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="px-0 gap-1 text-primary">
              <ChevronDown className={`h-4 w-4 transition-transform ${mehrOffen ? "rotate-180" : ""}`} />
              Kunde, Adresse & Zeitraum {mehrOffen ? "" : "(optional)"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-2">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold mb-2">Auftraggeber</legend>
              <Input className="h-11" placeholder="Name / Firma" value={f.kunde_name} onChange={setze("kunde_name")} aria-label="Kundenname" />
              <Input className="h-11" placeholder="Straße" value={f.kunde_strasse} onChange={setze("kunde_strasse")} aria-label="Kunde Straße" />
              <div className="grid grid-cols-[6rem_1fr] gap-2">
                <Input className="h-11" placeholder="PLZ" value={f.kunde_plz} onChange={setze("kunde_plz")} aria-label="Kunde PLZ" />
                <Input className="h-11" placeholder="Ort" value={f.kunde_ort} onChange={setze("kunde_ort")} aria-label="Kunde Ort" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input className="h-11" placeholder="Telefon" type="tel" value={f.kunde_telefon} onChange={setze("kunde_telefon")} aria-label="Kunde Telefon" />
                <Input className="h-11" placeholder="E-Mail" type="email" value={f.kunde_email} onChange={setze("kunde_email")} aria-label="Kunde E-Mail" />
                <Input className="h-11" placeholder="UID (bei Firmen)" value={f.kunde_uid} onChange={setze("kunde_uid")} aria-label="Kunde UID" />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold mb-2 flex items-center gap-3">
                Baustelle
                {(f.kunde_strasse || f.kunde_ort) && (
                  <button type="button" className="text-xs font-normal text-primary hover:underline"
                    onClick={() => setF((v) => ({ ...v, adresse: v.kunde_strasse, plz: v.kunde_plz, ort: v.kunde_ort }))}>
                    = Adresse des Kunden
                  </button>
                )}
              </legend>
              <Input className="h-11" placeholder="Straße" value={f.adresse} onChange={setze("adresse")} aria-label="Baustelle Straße" />
              <div className="grid grid-cols-[6rem_1fr] gap-2">
                <Input className="h-11" placeholder="PLZ" value={f.plz} onChange={setze("plz")} aria-label="Baustelle PLZ" />
                <Input className="h-11" placeholder="Ort" value={f.ort} onChange={setze("ort")} aria-label="Baustelle Ort" />
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="p-start" className="text-xs">Beginn</Label>
                <Input id="p-start" type="date" className="h-11" value={f.start_datum} onChange={setze("start_datum")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-ende" className="text-xs">Ende</Label>
                <Input id="p-ende" type="date" className="h-11" value={f.end_datum} onChange={setze("end_datum")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-beschr">Beschreibung</Label>
              <Textarea id="p-beschr" rows={3} value={f.beschreibung} onChange={setze("beschreibung")} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </FormularDialog>
  );
}
