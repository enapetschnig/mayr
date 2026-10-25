import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormularDialog from "@/components/FormularDialog";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MengeFeld } from "@/components/material/MengeFeld";
import { zahlLesen } from "@/lib/format";
import { EINHEITEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import { runden3 } from "./materialDaten";

export type FreiePosition = { bezeichnung: string; einheit: string; menge: number; ek_preis: number | null };

/**
 * Material ohne Artikelstamm — direkt gekauft oder geliefert, z. B.
 * „Zählerverteiler vorverdrahtet“ vom Großhändler. Nur bei „Direkt“:
 * Lager kennt nur Artikel.
 */
export function FreiePositionDialog({
  open, onOpenChange, onFertig,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFertig: (p: FreiePosition) => void;
}) {
  const [bezeichnung, setBezeichnung] = useState("");
  const [einheit, setEinheit] = useState("Stk");
  const [menge, setMenge] = useState("1");
  const [ek, setEk] = useState("");

  useEffect(() => {
    if (!open) return;
    setBezeichnung("");
    setEinheit("Stk");
    setMenge("1");
    setEk("");
  }, [open]);

  const dazu = () => {
    const bez = bezeichnung.trim();
    const m = runden3(zahlLesen(menge));
    if (!bez) return toast.error("Bitte eine Bezeichnung eingeben.");
    if (!(m > 0)) return toast.error("Die Menge muss größer als 0 sein.");
    const preis = zahlLesen(ek);
    onFertig({ bezeichnung: bez, einheit, menge: m, ek_preis: preis > 0 ? preis : null });
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Position ohne Artikel"
      beschreibung="Direkt gekauft oder geliefert und nicht im Artikelstamm."
      fuss={
        <>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={dazu} disabled={!bezeichnung.trim()}>Zur Liste</Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="fp-bez">Was?</Label>
            <DiktatKnopf onText={(t) => setBezeichnung((alt) => `${alt}${alt && !alt.endsWith(" ") ? " " : ""}${t}`)} />
          </div>
          <Input id="fp-bez" className="h-12" autoFocus value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
            placeholder="z. B. Zählerverteiler 1 ZP vorverdrahtet" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-menge">Menge</Label>
          <div className="flex items-center gap-2">
            <MengeFeld id="fp-menge" wert={menge} onChange={setMenge} />
            <span className="text-sm text-muted-foreground">{einheit}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Einheit</Label>
          <div className="flex flex-wrap gap-2">
            {EINHEITEN.map((e) => (
              <button key={e} type="button" onClick={() => setEinheit(e)}
                className={cn("h-11 min-w-12 rounded-md border px-3 text-sm font-medium transition-colors",
                  einheit === e ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-ek">Einkaufspreis netto je {einheit} <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="fp-ek" className="zahl h-12 max-w-40" inputMode="decimal" value={ek} onChange={(e) => setEk(e.target.value)} placeholder="0,00" />
          <p className="text-xs text-muted-foreground">Laut Rechnung oder Kassenbon — damit kann es später verrechnet werden.</p>
        </div>
      </div>
    </FormularDialog>
  );
}
