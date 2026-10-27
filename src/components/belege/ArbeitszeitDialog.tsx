import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { dezimalLesen, euro, stunden } from "@/lib/format";
import { arbeitszeitText, type Lohnart } from "@/lib/kalkulation";
import { runden2 } from "@/lib/preise";
import { leerePosition, preisText, zahlText, type EditorPosition } from "./editor";

/**
 * Arbeitszeit auf einmal eingeben: für jeden Stundensatz (Standard, Meister,
 * Lehrling …) die Stunden — daraus wird je Satz eine Position.
 */
export function ArbeitszeitDialog({
  open, onOpenChange, lohnarten, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lohnarten: Lohnart[];
  onUebernehmen: (positionen: EditorPosition[]) => void;
}) {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  useEffect(() => { if (open) { setWerte({}); setText(""); } }, [open]);

  const zeilen = lohnarten
    .map((l) => ({ l, h: dezimalLesen(werte[l.name] ?? "") ?? 0 }))
    .filter((z) => z.h > 0);
  const summe = runden2(zeilen.reduce((s, z) => s + runden2(z.h * z.l.satz), 0));
  const negativ = lohnarten.some((l) => (dezimalLesen(werte[l.name] ?? "") ?? 0) < 0);

  const uebernehmen = () => {
    onUebernehmen(zeilen.map((z) => leerePosition("arbeit", {
      bezeichnung: arbeitszeitText(z.l),
      langtext: text.trim(),
      menge: zahlText(z.h),
      einheit: "h",
      einzelpreis: preisText(z.l.satz),
    })));
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Arbeitszeit"
      beschreibung="Stunden je Stundensatz eintragen — jeder Satz wird eine Position."
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!zeilen.length || negativ} onClick={uebernehmen}>
            {zeilen.length ? `Übernehmen · ${euro(summe)}` : "Übernehmen"}
          </Button>
        </>
      )}
    >
      <div className="divide-y rounded-lg border bg-card">
        {lohnarten.map((l) => {
          const h = dezimalLesen(werte[l.name] ?? "") ?? 0;
          return (
            <div key={l.name} className="flex items-center gap-3 px-3 py-2.5">
              <Label htmlFor={`az-${l.name}`} className="min-w-0 flex-1">
                <span className="block font-medium">{l.standard ? "Standard" : l.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">{euro(l.satz)} je Stunde{h > 0 && <> · {euro(runden2(h * l.satz))}</>}</span>
              </Label>
              <Input id={`az-${l.name}`} inputMode="decimal" placeholder="Std." className="zahl h-12 w-24 text-right"
                value={werte[l.name] ?? ""} onChange={(e) => setWerte({ ...werte, [l.name]: e.target.value })} />
            </div>
          );
        })}
      </div>
      {zeilen.length > 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          Zusammen <span className="zahl font-medium text-foreground">{stunden(zeilen.reduce((s, z) => s + z.h, 0))}</span> ·{" "}
          <span className="zahl font-medium text-foreground">{euro(summe)}</span> netto
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="az-text">Was wird gemacht? <span className="font-normal text-muted-foreground">(optional, steht klein darunter)</span></Label>
        <Input id="az-text" className="h-11" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Montage und Inbetriebnahme" />
      </div>
      {lohnarten.length === 1 && (
        <p className="px-1 text-xs text-muted-foreground">Weitere Stundensätze (Meister, Lehrling …) unter Einstellungen → Betrieb → Kalkulation.</p>
      )}
    </FormularDialog>
  );
}
