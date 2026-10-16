import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, datumKurz, euro, zahl, zahlLesen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { neuePosition, preisText, zahlText, type EditorPosition } from "./editor";

export interface ImportErgebnis {
  positionen: EditorPosition[];
  zeitIds: string[];
  materialIds: string[];
  leistungVon?: string;
  leistungBis?: string;
}

type StundenArt = "summe" | "tag";
type MaterialArt = "einzeln" | "pauschale";

function Wahl<T extends string>({ wert, setze, optionen }: { wert: T; setze: (w: T) => void; optionen: [T, string][] }) {
  return (
    <div className="flex rounded-lg border overflow-hidden w-fit">
      {optionen.map(([w, t], i) => (
        <button key={w} type="button" onClick={() => setze(w)}
          className={cn("px-3 py-1.5 text-sm font-medium", i > 0 && "border-l", wert === w ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * Stunden und Material eines Projekts in den Beleg holen.
 *
 * Nur die EIGENEN Buchungen — verrechnen kann man ja nur, was man selbst
 * geleistet hat. Schon verrechnete Einträge (in einer anderen Rechnung)
 * stehen nicht zur Wahl.
 *
 * Material wahlweise einzeln oder zusammengefasst als eine
 * "Materialpauschale" — jeweils mit Aufschlag auf den Einkaufspreis.
 */
export function ImportDialog({
  open, onOpenChange, projektId, belegId, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projektId: string;
  belegId?: string;
  onUebernehmen: (e: ImportErgebnis) => void;
}) {
  const { firma } = useSitzung();
  const [satz, setSatz] = useState("");
  const [aufschlag, setAufschlag] = useState("");
  const [stundenArt, setStundenArt] = useState<StundenArt>("summe");
  const [materialArt, setMaterialArt] = useState<MaterialArt>("pauschale");
  const [zeitWahl, setZeitWahl] = useState<Set<string>>(new Set());
  const [matWahl, setMatWahl] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["import", projektId, belegId, firma?.id, open],
    enabled: open && !!firma,
    queryFn: async () => {
      const frei = belegId ? `rechnung_id.is.null,rechnung_id.eq.${belegId}` : "rechnung_id.is.null";
      const [z, m] = await Promise.all([
        supabase.from("zeiten").select("*").eq("projekt_id", projektId).eq("firma_id", firma!.id).or(frei).order("datum"),
        supabase.from("material").select("*").eq("projekt_id", projektId).eq("firma_id", firma!.id).or(frei).order("datum"),
      ]);
      return { zeiten: z.data ?? [], material: m.data ?? [] };
    },
  });

  useEffect(() => {
    if (!open || !firma) return;
    setSatz(preisText(Number(firma.stundensatz)));
    setAufschlag(zahlText(Number(firma.material_aufschlag)));
  }, [open, firma]);

  useEffect(() => {
    if (!data) return;
    setZeitWahl(new Set(data.zeiten.map((z) => z.id)));
    setMatWahl(new Set(data.material.map((m) => m.id)));
  }, [data]);

  const zeiten = useMemo(() => data?.zeiten ?? [], [data]);
  const material = useMemo(() => data?.material ?? [], [data]);
  const gewZeiten = zeiten.filter((z) => zeitWahl.has(z.id));
  const gewMat = material.filter((m) => matWahl.has(m.id));
  const summeStd = gewZeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const faktor = 1 + zahlLesen(aufschlag) / 100;
  const ekSumme = gewMat.reduce((s, m) => s + Number(m.menge) * Number(m.ek_preis ?? 0), 0);
  const ohnePreis = gewMat.filter((m) => m.ek_preis == null).length;

  const umschalten = (set: Set<string>, setze: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setze(n);
  };

  const uebernehmen = () => {
    const pos: EditorPosition[] = [];
    const sz = zahlLesen(satz);
    if (gewZeiten.length) {
      if (stundenArt === "summe") {
        const tage = [...new Set(gewZeiten.map((z) => z.datum))].sort();
        pos.push(neuePosition({
          art: "stunden",
          bezeichnung: "Arbeitsleistung Elektroinstallation",
          beschreibung: tage.length > 1 ? `Leistungszeitraum ${datumText(tage[0])} – ${datumText(tage[tage.length - 1])}` : tage.length ? `am ${datumText(tage[0])}` : "",
          menge: zahlText(summeStd), einheit: "h", einzelpreis: preisText(sz),
        }));
      } else {
        const proTag = new Map<string, { h: number; t: string[] }>();
        gewZeiten.forEach((z) => {
          const e = proTag.get(z.datum) ?? { h: 0, t: [] };
          e.h += Number(z.stunden);
          if (z.taetigkeit) e.t.push(z.taetigkeit);
          proTag.set(z.datum, e);
        });
        [...proTag.entries()].sort().forEach(([d, e]) => pos.push(neuePosition({
          art: "stunden", bezeichnung: `Arbeitsleistung ${datumText(d)}`, beschreibung: e.t.join("; "),
          menge: zahlText(e.h), einheit: "h", einzelpreis: preisText(sz),
        })));
      }
    }
    if (gewMat.length) {
      if (materialArt === "pauschale") {
        pos.push(neuePosition({
          art: "pauschale",
          bezeichnung: "Materialpauschale",
          beschreibung: `Installationsmaterial lt. Aufstellung (${gewMat.length} ${gewMat.length === 1 ? "Position" : "Positionen"})`,
          menge: "1", einheit: "Psch", einzelpreis: preisText(ekSumme * faktor),
        }));
      } else {
        gewMat.forEach((m) => pos.push(neuePosition({
          art: "material", bezeichnung: m.bezeichnung, beschreibung: "",
          menge: zahlText(Number(m.menge)), einheit: m.einheit, einzelpreis: preisText(Number(m.ek_preis ?? 0) * faktor),
        })));
      }
    }
    const alleTage = [...gewZeiten.map((z) => z.datum), ...gewMat.map((m) => m.datum)].sort();
    onUebernehmen({
      positionen: pos,
      zeitIds: gewZeiten.map((z) => z.id),
      materialIds: gewMat.map((m) => m.id),
      leistungVon: alleTage[0],
      leistungBis: alleTage[alleTage.length - 1],
    });
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Aus dem Projekt übernehmen"
      beschreibung="Eigene Stunden und eigenes Material, die noch nicht verrechnet sind."
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={uebernehmen} disabled={!gewZeiten.length && !gewMat.length}>
            Übernehmen ({euro(summeStd * zahlLesen(satz) + ekSumme * faktor)} netto)
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Stunden — {zahl(summeStd)} h</h3>
          {zeiten.length === 0 ? <p className="text-sm text-muted-foreground">Keine offenen Stunden.</p> : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="i-satz" className="text-xs">Stundensatz € netto</Label>
                  <Input id="i-satz" inputMode="decimal" className="w-28" value={satz} onChange={(e) => setSatz(e.target.value)} />
                </div>
                <Wahl<StundenArt> wert={stundenArt} setze={setStundenArt} optionen={[["summe", "Eine Zeile"], ["tag", "Pro Tag"]]} />
              </div>
              <div className="rounded-lg border divide-y max-h-80 overflow-y-auto">
                {zeiten.map((z) => (
                  <label key={z.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={zeitWahl.has(z.id)} onCheckedChange={() => umschalten(zeitWahl, setZeitWahl, z.id)} />
                    <span className="text-xs w-20 shrink-0">{datumKurz(z.datum)}</span>
                    <span className="text-sm flex-1 truncate">{z.taetigkeit || "—"}</span>
                    <span className="text-sm font-semibold">{zahl(z.stunden)} h</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Material — EK {euro(ekSumme)}</h3>
          {material.length === 0 ? <p className="text-sm text-muted-foreground">Kein offenes Material.</p> : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="i-aufschlag" className="text-xs">Aufschlag %</Label>
                  <Input id="i-aufschlag" inputMode="decimal" className="w-24" value={aufschlag} onChange={(e) => setAufschlag(e.target.value)} />
                </div>
                <Wahl<MaterialArt> wert={materialArt} setze={setMaterialArt} optionen={[["pauschale", "Als Pauschale"], ["einzeln", "Einzeln"]]} />
              </div>
              <p className="text-sm">
                Verkauf: <strong>{euro(ekSumme * faktor)}</strong>
                <span className="text-muted-foreground"> ({euro(ekSumme)} + {zahl(zahlLesen(aufschlag))} %)</span>
              </p>
              {ohnePreis > 0 && (
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />
                  {ohnePreis} Position{ohnePreis === 1 ? "" : "en"} ohne Einkaufspreis — zählt mit 0 €.</p>
              )}
              <div className="rounded-lg border divide-y max-h-80 overflow-y-auto">
                {material.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={matWahl.has(m.id)} onCheckedChange={() => umschalten(matWahl, setMatWahl, m.id)} />
                    <span className="text-sm flex-1 truncate">{m.bezeichnung}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{zahl(m.menge)} {m.einheit}</span>
                    <span className="text-sm font-semibold w-20 text-right">{m.ek_preis != null ? euro(Number(m.menge) * Number(m.ek_preis)) : "–"}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </FormularDialog>
  );
}
