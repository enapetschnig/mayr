import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Feld, useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText, useArtikelGruppen, useLieferanten } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, zahl } from "@/lib/format";
import { KATEGORIEN_ARTIKEL } from "@/lib/types";

type Auswahl = { kategorie: string | null; hersteller: string | null; lieferant: string | null };
const ALLE = "_alle";

/**
 * Aufschlag für viele Artikel auf einmal — je Kategorie, Hersteller oder
 * Lieferant (vorbelegt mit dem Filter der Artikelliste). Leer = zurück auf
 * den Aufschlag des Betriebs. Ein fester VK am Artikel geht weiter vor.
 * Die Datenbank ändert in Häppchen (artikel_aufschlag_setzen), die App ruft
 * so lange, bis nichts mehr übrig ist.
 */
export function AufschlagDialog({ open, onOpenChange, vorgabe }: { open: boolean; onOpenChange: (o: boolean) => void; vorgabe: Auswahl }) {
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: lieferanten = [] } = useLieferanten();
  const [a, setA] = useState<Auswahl>(vorgabe);
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState<number | null>(null);
  const { data: gruppen = [] } = useArtikelGruppen(a.lieferant);
  const hersteller = [...new Set(gruppen.map((g) => g.hersteller).filter((h): h is string => !!h))].sort((x, y) => x.localeCompare(y, "de"));
  useBeimOeffnen(open ? "offen" : null, () => { setA(vorgabe); setText(""); });

  const leer = !a.kategorie && !a.hersteller && !a.lieferant;
  const { data: anzahl, isFetching } = useQuery({
    queryKey: ["artikel", "aufschlag-anzahl", a],
    enabled: open && !leer,
    queryFn: async () => {
      let q = supabase.from("artikel").select("id", { count: "exact", head: true }).eq("aktiv", true);
      if (a.kategorie) q = q.eq("kategorie", a.kategorie);
      if (a.hersteller) q = q.eq("hersteller", a.hersteller);
      if (a.lieferant) q = q.eq("lieferant", a.lieferant);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const wert = text.trim() ? dezimalLesen(text) : null;
  const ungueltig = !!text.trim() && (wert === null || wert < -100 || wert > 1000);

  const setzen = async () => {
    if (leer) return toast.error("Bitte Kategorie, Hersteller oder Lieferant wählen.");
    if (ungueltig) return toast.error("Aufschlag zwischen −100 und 1000 %.");
    setLaeuft(0);
    let summe = 0;
    try {
      for (let i = 0; i < 100; i++) {
        const { data, error } = await supabase.rpc("artikel_aufschlag_setzen", {
          p_aufschlag: wert as number, p_kategorie: a.kategorie ?? undefined, p_hersteller: a.hersteller ?? undefined, p_lieferant: a.lieferant ?? undefined,
        });
        if (error) throw error;
        summe += data ?? 0;
        setLaeuft(summe);
        if (!data) break;
      }
      await neuLaden("artikel", "leistungen");
      toast.success(`${zahl(summe)} Artikel geändert`, { description: wert == null ? "Sie rechnen wieder mit dem Aufschlag des Betriebs." : `Aufschlag ${zahl(wert)} %` });
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht geändert", { description: `${fehlerText(e as { message?: string })}${summe ? ` — ${zahl(summe)} Artikel sind schon geändert.` : ""}` });
    } finally {
      setLaeuft(null);
    }
  };

  const wahl = (k: keyof Auswahl, v: string) => setA((x) => ({ ...x, [k]: v === ALLE ? null : v, ...(k === "lieferant" ? { hersteller: null } : {}) }));

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Aufschlag für mehrere Artikel"
      beschreibung={`Standard des Betriebs: ${zahl(firma?.material_aufschlag ?? 0)} %. Artikel mit festem VK behalten ihren VK.`}
      gesperrt={laeuft !== null}
      fuss={
        <>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={laeuft !== null}>Abbrechen</Button>
          <Button className="h-11 min-w-48" onClick={() => void setzen()} disabled={laeuft !== null || leer || ungueltig || !anzahl}>
            {laeuft !== null && <Loader2 className="h-4 w-4 animate-spin" />}
            {laeuft !== null ? `${zahl(laeuft)} geändert …` : `${anzahl != null ? zahl(anzahl) : "…"} Artikel ändern`}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label="Kategorie">
            <Select value={a.kategorie ?? ALLE} onValueChange={(v) => wahl("kategorie", v)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle Kategorien</SelectItem>
                {KATEGORIEN_ARTIKEL.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
          <Feld label="Lieferant">
            <Select value={a.lieferant ?? ALLE} onValueChange={(v) => wahl("lieferant", v)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle Lieferanten</SelectItem>
                {lieferanten.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
          <Feld label="Hersteller">
            <Select value={a.hersteller ?? ALLE} onValueChange={(v) => wahl("hersteller", v)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle Hersteller</SelectItem>
                {(a.hersteller && !hersteller.includes(a.hersteller) ? [a.hersteller, ...hersteller] : hersteller).map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
        </div>
        <Feld id="auf-wert" label="Aufschlag %" hinweis={ungueltig ? "Zwischen −100 und 1000 %." : "Leer = zurück auf den Standard des Betriebs."}>
          <Input id="auf-wert" className="zahl h-12 w-40 text-base" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder={zahl(firma?.material_aufschlag ?? 0)} />
        </Feld>
        <p className="text-sm text-muted-foreground">
          {leer ? "Bitte zuerst eingrenzen — Kategorie, Lieferant oder Hersteller." : isFetching ? "Wird gezählt …" : `${zahl(anzahl ?? 0)} aktive Artikel passen.`}
        </p>
      </div>
    </FormularDialog>
  );
}
