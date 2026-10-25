import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zahlLesen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mengeEingabe, runden3 } from "./materialDaten";

/**
 * Menge mit − und + (große Daumenflächen) und Zahlenfeld dazwischen.
 * Meterware tippt man ein: „25,5“. Der Wert bleibt Text, solange getippt
 * wird — sonst springt „25,“ beim Tippen sofort auf „25“.
 */
export function MengeFeld({
  wert, onChange, min = 1, schritt = 1, className, id, beschriftung = "Menge",
}: {
  wert: string;
  onChange: (text: string) => void;
  /** kleinster Wert für − (Inventur: 0) */
  min?: number;
  schritt?: number;
  className?: string;
  id?: string;
  beschriftung?: string;
}) {
  const n = zahlLesen(wert);
  return (
    <div className={cn("flex items-center", className)}>
      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-r-none"
        onClick={() => onChange(mengeEingabe(Math.max(min, runden3(n - schritt))))}
        disabled={n - schritt < min} aria-label={`${beschriftung} weniger`}>
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        inputMode="decimal"
        autoComplete="off"
        aria-label={beschriftung}
        className={cn("zahl h-11 w-[4.75rem] rounded-none border-x-0 px-1 text-center text-base font-semibold",
          !(n > 0) && min > 0 && "text-destructive")}
      />
      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-l-none"
        onClick={() => onChange(mengeEingabe(runden3((n > 0 ? n : 0) + schritt)))} aria-label={`${beschriftung} mehr`}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
