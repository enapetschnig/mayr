import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { StatusBadge } from "@/components/Bausteine";
import { datum, euro, zahlLesen } from "@/lib/format";
import type { Beleg } from "@/lib/types";
import { cn } from "@/lib/utils";
import { teilrechnungenZu } from "./speichern";
import { naechsteTeilNr, schonVerlangt, teilBetrag } from "./teilrechnung";

const VORSCHLAEGE = [30, 40, 50];

/**
 * Teilrechnung (Anzahlung) zu einem Angebot: Prozent oder Betrag netto
 * eingeben, die bisherigen Teilrechnungen stehen darüber. Angelegt wird ein
 * Rechnungsentwurf mit einer Pauschale — die Schlussrechnung zieht ihn später ab.
 */
export function TeilrechnungDialog({
  open, onOpenChange, angebot, laeuft, onAnlegen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  angebot: Beleg;
  laeuft: boolean;
  onAnlegen: (betragNetto: number, prozent: number | null) => void;
}) {
  const [art, setArt] = useState<"prozent" | "betrag">("prozent");
  const [wert, setWert] = useState("30");
  const { data: teile, isLoading } = useQuery({
    queryKey: ["belege", "teile", angebot.id],
    enabled: open,
    staleTime: 0,
    queryFn: () => teilrechnungenZu(angebot.id),
  });
  useEffect(() => {
    if (open) { setArt("prozent"); setWert("30"); }
  }, [open]);

  const netto = Number(angebot.netto);
  const betrag = teilBetrag(netto, { art, wert: zahlLesen(wert) });
  const bisher = schonVerlangt(teile ?? []);
  const rest = netto - bisher - (betrag ?? 0);
  const nr = naechsteTeilNr(teile ?? []);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={`${nr}. Teilrechnung`}
      beschreibung={`Anzahlung auf Angebot ${angebot.nummer ?? ""} über ${euro(netto)} netto.`}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!betrag || laeuft || isLoading} onClick={() => betrag && onAnlegen(betrag, art === "prozent" ? zahlLesen(wert) : null)}>
            {laeuft && <Loader2 className="h-4 w-4 animate-spin" />}
            {betrag ? `Teilrechnung über ${euro(betrag)} anlegen` : "Teilrechnung anlegen"}
          </Button>
        </>
      )}
    >
      {(teile ?? []).length > 0 && (
        <section className="space-y-1.5">
          <h3 className="px-1 text-sm font-semibold">Bisher gestellt</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {(teile ?? []).map((t) => (
              <li key={t.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", t.status === "storniert" && "opacity-60")}>
                <span className="min-w-0 flex-1 truncate">{t.teil_nr}. Teilrechnung {t.nummer ?? "(Entwurf)"} · {datum(t.datum)}</span>
                <StatusBadge status={t.status} />
                <span className="zahl shrink-0">{euro(Number(t.netto))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-3.5">
        <div className="grid grid-cols-2 gap-2">
          {(["prozent", "betrag"] as const).map((a) => (
            <Button key={a} variant={art === a ? "default" : "outline"} className="h-11"
              onClick={() => { setArt(a); setWert(a === "prozent" ? "30" : ""); }}>
              {a === "prozent" ? "Prozent vom Angebot" : "Fester Betrag"}
            </Button>
          ))}
        </div>
        {art === "prozent" && (
          <div className="flex flex-wrap gap-2">
            {VORSCHLAEGE.map((p) => (
              <Button key={p} variant={zahlLesen(wert) === p ? "default" : "outline"} className="min-w-16" onClick={() => setWert(String(p))}>{p} %</Button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="teil-wert" className="text-sm">{art === "prozent" ? "Prozent" : "Betrag netto €"}</Label>
          <Input id="teil-wert" value={wert} onChange={(e) => setWert(e.target.value)} inputMode="decimal" className="zahl h-11 w-32 text-right" autoFocus={art === "betrag"} />
        </div>
        <dl className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Diese Teilrechnung netto</dt><dd className="zahl font-semibold">{betrag ? euro(betrag) : "–"}</dd></div>
          {bisher > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Schon gestellt</dt><dd className="zahl">{euro(bisher)}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Bleibt für die Schlussrechnung</dt><dd className={cn("zahl", rest < 0 && "text-destructive")}>{euro(rest)}</dd></div>
        </dl>
        {rest < 0 && <p className="text-sm text-destructive">Mehr als das Angebot — bitte prüfen.</p>}
      </section>
    </FormularDialog>
  );
}
