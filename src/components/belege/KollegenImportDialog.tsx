import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FirmaBadge, Leer } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, zahl, zahlLesen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { neuePosition, preisText, zahlText, type EditorPosition } from "./editor";

/**
 * Für den Generalunternehmer: die Rechnungen der Subunternehmer in die
 * eigene Kundenrechnung übernehmen — als eine Zeile je Rechnung
 * ("Elektroinstallation lt. Rechnung NORD-2026-004") oder Position für
 * Position, jeweils mit optionalem Aufschlag.
 */
export function KollegenImportDialog({
  open, onOpenChange, projektId, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projektId?: string | null;
  onUebernehmen: (p: EditorPosition[]) => void;
}) {
  const { firma, firmaVon } = useSitzung();
  const [wahl, setWahl] = useState<Set<string>>(new Set());
  const [aufschlag, setAufschlag] = useState("0");
  const [art, setArt] = useState<"zeile" | "einzeln">("zeile");

  const { data } = useQuery({
    queryKey: ["rechnungen", "eingang-import", projektId, firma?.id, open],
    enabled: open && !!firma,
    queryFn: async () => {
      let q = supabase.from("rechnungen").select("*, rechnung_positionen(*)")
        .eq("empfaenger_firma_id", firma!.id).eq("typ", "rechnung").in("status", ["offen", "bezahlt"])
        .order("datum");
      if (projektId) q = q.eq("projekt_id", projektId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Ohne Daten eine feste leere Liste — ein frisches [] je Rendern hätte den
  // Effekt unten bei jedem Durchlauf neu ausgelöst (Endlosschleife).
  const belege = useMemo(() => data ?? [], [data]);
  useEffect(() => { if (open) setWahl(new Set(belege.map((b) => b.id))); }, [open, belege]);

  const faktor = 1 + zahlLesen(aufschlag) / 100;
  const gewaehlt = belege.filter((b) => wahl.has(b.id));
  const summe = gewaehlt.reduce((s, b) => s + Number(b.netto), 0);

  const uebernehmen = () => {
    const pos: EditorPosition[] = [];
    gewaehlt.forEach((b) => {
      const f = firmaVon(b.firma_id);
      if (art === "zeile") {
        pos.push(neuePosition({
          art: "fremdleistung",
          bezeichnung: b.betreff || "Elektroinstallation (Subunternehmerleistung)",
          beschreibung: `lt. Rechnung ${b.nummer} vom ${datum(b.datum)}${f ? ` — ${f.name}` : ""}`,
          menge: "1", einheit: "Psch", einzelpreis: preisText(Number(b.netto) * faktor),
        }));
      } else {
        [...b.rechnung_positionen].sort((x, y) => x.pos - y.pos).forEach((p) => {
          pos.push(neuePosition({
            art: p.art === "text" ? "text" : p.art,
            bezeichnung: p.bezeichnung,
            beschreibung: p.beschreibung || "",
            menge: zahlText(Number(p.menge)),
            einheit: p.einheit,
            einzelpreis: preisText(Number(p.einzelpreis) * faktor),
          }));
        });
      }
    });
    onUebernehmen(pos);
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Rechnungen von Kollegen übernehmen"
      beschreibung={projektId ? "Subunternehmer-Rechnungen zu diesem Projekt" : "Alle Subunternehmer-Rechnungen an deine Firma"}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={uebernehmen} disabled={gewaehlt.length === 0}>Übernehmen ({euro(summe * faktor)} netto)</Button>
        </>
      }
    >
      <div className="max-w-2xl space-y-4">
        {belege.length === 0 ? <Leer icon={Inbox} text="Keine fertigen Rechnungen von Kollegen vorhanden." /> : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="k-aufschlag" className="text-xs">Aufschlag %</Label>
                <Input id="k-aufschlag" inputMode="decimal" className="w-24" value={aufschlag} onChange={(e) => setAufschlag(e.target.value)} />
              </div>
              <div className="flex rounded-lg border overflow-hidden w-fit">
                {([["zeile", "Eine Zeile je Rechnung"], ["einzeln", "Positionen einzeln"]] as const).map(([w, t], i) => (
                  <button key={w} type="button" onClick={() => setArt(w)}
                    className={cn("px-3 py-1.5 text-sm font-medium", i > 0 && "border-l", art === w ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border divide-y">
              {belege.map((b) => (
                <label key={b.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={wahl.has(b.id)} onCheckedChange={() => {
                    const n = new Set(wahl);
                    if (n.has(b.id)) n.delete(b.id); else n.add(b.id);
                    setWahl(n);
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{b.nummer} <span className="font-normal text-muted-foreground">· {datum(b.datum)}</span></p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <FirmaBadge firma={firmaVon(b.firma_id)} /> {b.betreff || `${b.rechnung_positionen.length} Positionen`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{euro(b.netto)}</p>
                    {zahlLesen(aufschlag) > 0 && <p className="text-xs text-muted-foreground">→ {euro(Number(b.netto) * faktor)}</p>}
                  </div>
                </label>
              ))}
            </div>
            {zahlLesen(aufschlag) > 0 && <p className="text-xs text-muted-foreground">Aufschlag {zahl(zahlLesen(aufschlag))} % wird auf jeden Preis gerechnet.</p>}
          </>
        )}
      </div>
    </FormularDialog>
  );
}
