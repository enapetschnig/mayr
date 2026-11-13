import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

export const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export type Zeitraum = { art: "monat" | "jahr"; jahr: number; monat: number };

/** Von, bis (ISO) und Text eines Zeitraums */
export function zeitraumGrenzen(z: Zeitraum) {
  const monat = z.art === "monat";
  return {
    von: isoTag(new Date(z.jahr, monat ? z.monat : 0, 1)),
    bis: isoTag(new Date(z.jahr, monat ? z.monat + 1 : 12, 0)),
    naechster: isoTag(new Date(z.jahr, monat ? z.monat + 1 : 12, 1)),
    text: monat ? `${MONATE[z.monat]} ${z.jahr}` : `Jahr ${z.jahr}`,
  };
}

/** Monat oder Jahr wählen und blättern — nicht in die Zukunft */
export function ZeitraumWahl({ wert, onChange, nurMonat = false }: { wert: Zeitraum; onChange: (z: Zeitraum) => void; nurMonat?: boolean }) {
  const z = nurMonat ? { ...wert, art: "monat" as const } : wert;
  const g = zeitraumGrenzen(z);
  const blaettern = (um: number) => {
    if (z.art === "jahr") return onChange({ ...z, jahr: z.jahr + um });
    const d = new Date(z.jahr, z.monat + um, 1);
    onChange({ ...z, jahr: d.getFullYear(), monat: d.getMonth() });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border bg-card">
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Zurück" onClick={() => blaettern(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-36 text-center text-sm font-semibold">{g.text}</span>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Vor" disabled={g.naechster > isoTag()} onClick={() => blaettern(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      {!nurMonat && (
        <div className="flex overflow-hidden rounded-lg border bg-card" role="radiogroup" aria-label="Zeitraum">
          {(["monat", "jahr"] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={z.art === a} onClick={() => onChange({ ...z, art: a })}
              className={cn("h-11 px-4 text-sm font-medium", z.art === a ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {a === "monat" ? "Monat" : "Jahr"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
