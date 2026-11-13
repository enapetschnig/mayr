import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { fehlerText, useLieferanten } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { dezimalLesen, euro, zahl } from "@/lib/format";
import { ekAusListe } from "./artikelLogik";
import type { ArtikelLieferant } from "./artikelDaten";

type Form = { lieferant: string; lieferanten_nr: string; listenpreis: string; rabatt: string; ek_preis: string; lieferzeit_tage: string; bevorzugt: boolean; notiz: string };

const formAus = (l: ArtikelLieferant | null): Form => ({
  lieferant: l?.lieferant ?? "",
  lieferanten_nr: l?.lieferanten_nr ?? "",
  listenpreis: zahlFeld(l?.listenpreis),
  rabatt: zahlFeld(l?.rabatt),
  ek_preis: zahlFeld(l?.ek_preis),
  lieferzeit_tage: l?.lieferzeit_tage != null ? String(l.lieferzeit_tage) : "",
  bevorzugt: l?.bevorzugt ?? false,
  notiz: l?.notiz ?? "",
});

/**
 * Weiterer Lieferant eines Artikels mit eigener Nummer und eigenem Preis.
 * EK leer = Listenpreis − Rabatt. „Bevorzugt“ nimmt die Bestellung zuerst,
 * sonst den günstigsten.
 */
export function ArtikelLieferantDialog({
  open, onOpenChange, artikelId, hauptLieferant, einheit, eintrag, vergeben,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  artikelId: string;
  hauptLieferant: string;
  einheit: string;
  /** null = neu */
  eintrag: ArtikelLieferant | null;
  /** schon eingetragene Lieferanten (doppelt geht nicht) */
  vergeben: string[];
}) {
  const neuLaden = useNeuLaden();
  const { data: lieferanten = [] } = useLieferanten();
  const [f, setF] = useState<Form>(formAus(null));
  const [speichert, setSpeichert] = useState(false);
  useBeimOeffnen(open ? eintrag?.id ?? "neu" : null, () => setF(formAus(eintrag)));
  const setze = <K extends keyof Form>(k: K, v: Form[K]) => setF((a) => ({ ...a, [k]: v }));

  const liste = dezimalLesen(f.listenpreis);
  const rabatt = dezimalLesen(f.rabatt);
  const ekBerechnet = ekAusListe(liste, rabatt);

  const speichern = async () => {
    const lieferant = f.lieferant.trim();
    if (!lieferant) return toast.error("Bitte den Lieferanten eintragen.");
    if (lieferant.toLowerCase() === hauptLieferant.trim().toLowerCase()) {
      return toast.error(`${lieferant} ist schon der Lieferant am Artikel.`, { description: "Dessen Preis steht beim Artikel selbst." });
    }
    if (vergeben.some((v) => v.toLowerCase() === lieferant.toLowerCase() && v !== eintrag?.lieferant)) {
      return toast.error(`${lieferant} ist schon eingetragen.`);
    }
    for (const [k, text, max] of [["listenpreis", "Listenpreis", Infinity], ["rabatt", "Rabatt", 100], ["ek_preis", "EK", Infinity], ["lieferzeit_tage", "Lieferzeit", 365]] as const) {
      const roh = f[k].trim();
      const n = dezimalLesen(roh);
      if (roh && (n === null || n < 0 || n > max)) return toast.error(`${text}: „${roh}“ geht nicht.`);
    }
    const daten = {
      artikel_id: artikelId,
      lieferant,
      lieferanten_nr: leerNull(f.lieferanten_nr),
      listenpreis: liste,
      rabatt,
      ek_preis: dezimalLesen(f.ek_preis),
      lieferzeit_tage: f.lieferzeit_tage.trim() ? Math.round(dezimalLesen(f.lieferzeit_tage) ?? 0) : null,
      bevorzugt: f.bevorzugt,
      notiz: leerNull(f.notiz),
    };
    setSpeichert(true);
    try {
      // Nur einer ist bevorzugt (eindeutiger Index) — die anderen erst zurücknehmen
      if (daten.bevorzugt) {
        let q = supabase.from("artikel_lieferanten").update({ bevorzugt: false }).eq("artikel_id", artikelId).eq("bevorzugt", true);
        if (eintrag) q = q.neq("id", eintrag.id);
        const { error } = await q;
        if (error) throw error;
      }
      const { error } = eintrag
        ? await supabase.from("artikel_lieferanten").update(daten).eq("id", eintrag.id)
        : await supabase.from("artikel_lieferanten").insert(daten);
      if (error) throw error;
      await neuLaden("artikel", "bestellungen");
      toast.success(eintrag ? "Lieferant gespeichert" : "Lieferant hinzugefügt");
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  const entfernen = async () => {
    if (!eintrag) return;
    setSpeichert(true);
    const { error } = await supabase.from("artikel_lieferanten").delete().eq("id", eintrag.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht entfernt", { description: fehlerText(error) });
    await neuLaden("artikel", "bestellungen");
    toast.success(`${eintrag.lieferant} entfernt`);
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={eintrag ? `Lieferant ${eintrag.lieferant}` : "Weiterer Lieferant"}
      beschreibung={`Preise je ${einheit}. Der Lieferant am Artikel (${hauptLieferant}) bleibt der EK für Angebote.`}
      gesperrt={speichert}
      fuss={
        <>
          {eintrag && (
            <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" onClick={() => void entfernen()} disabled={speichert}>
              <Trash2 className="h-4 w-4" /> Entfernen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={() => void speichern()} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld id="al-lief" label="Lieferant">
            <Input id="al-lief" className="h-11" list="al-lieferanten" value={f.lieferant} onChange={(e) => setze("lieferant", e.target.value)}
              placeholder="z. B. Rexel" autoFocus={!eintrag} />
            <datalist id="al-lieferanten">{lieferanten.filter((l) => l !== hauptLieferant).map((l) => <option key={l} value={l} />)}</datalist>
          </Feld>
          <Feld id="al-nr" label={<>Artikelnummer<Zusatz>beim Lieferanten</Zusatz></>}>
            <Input id="al-nr" className="h-11" value={f.lieferanten_nr} onChange={(e) => setze("lieferanten_nr", e.target.value)} />
          </Feld>
          <Feld id="al-liste" label="Listenpreis">
            <Input id="al-liste" className="zahl h-11" inputMode="decimal" value={f.listenpreis} onChange={(e) => setze("listenpreis", e.target.value)} />
          </Feld>
          <Feld id="al-rabatt" label="Rabatt %">
            <Input id="al-rabatt" className="zahl h-11" inputMode="decimal" value={f.rabatt} onChange={(e) => setze("rabatt", e.target.value)} />
          </Feld>
          <Feld id="al-ek" label="EK" hinweis={f.ek_preis.trim() ? null : ekBerechnet != null ? `Leer = ${euro(ekBerechnet)} (Liste − ${zahl(rabatt)} %)` : "Leer = Liste − Rabatt"}>
            <Input id="al-ek" className="zahl h-11" inputMode="decimal" value={f.ek_preis} onChange={(e) => setze("ek_preis", e.target.value)}
              placeholder={ekBerechnet != null ? zahl(ekBerechnet) : ""} />
          </Feld>
          <Feld id="al-zeit" label={<>Lieferzeit<Zusatz>Tage</Zusatz></>}>
            <Input id="al-zeit" className="zahl h-11" inputMode="numeric" value={f.lieferzeit_tage} onChange={(e) => setze("lieferzeit_tage", e.target.value)} />
          </Feld>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2">
          <span>
            <span className="block text-sm font-medium">Bevorzugt bestellen</span>
            <span className="block text-xs text-muted-foreground">Sonst nimmt die Bestellung den günstigsten Lieferanten</span>
          </span>
          <Switch checked={f.bevorzugt} onCheckedChange={(v) => setze("bevorzugt", v)} />
        </label>
        <Feld id="al-notiz" label={<>Notiz<Zusatz>(optional)</Zusatz></>}>
          <Input id="al-notiz" className="h-11" value={f.notiz} onChange={(e) => setze("notiz", e.target.value)} placeholder="z. B. nur in 10er-Packungen" />
        </Feld>
      </div>
    </FormularDialog>
  );
}
