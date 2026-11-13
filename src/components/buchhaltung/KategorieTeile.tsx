import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { euro } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Kategorie, KategorieSumme } from "./buchhaltungLogik";

const OHNE = "_";

/** Kategorie wählen; `vorschlag` steht grau da, solange nichts gewählt ist */
export function KategorieWahl({
  kategorien, wert, vorschlag, onChange, id, className, klein = false,
}: {
  kategorien: Kategorie[];
  wert: string | null;
  vorschlag?: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  className?: string;
  klein?: boolean;
}) {
  const vorschlagName = !wert && vorschlag ? kategorien.find((k) => k.id === vorschlag)?.name : null;
  return (
    <Select value={wert ?? OHNE} onValueChange={(v) => onChange(v === OHNE ? null : v)}>
      <SelectTrigger id={id} className={cn(klein ? "h-11 text-sm" : "h-11", !wert && "text-muted-foreground", className)} aria-label="Kategorie">
        <SelectValue>{wert ? kategorien.find((k) => k.id === wert)?.name ?? "–" : vorschlagName ? `${vorschlagName}?` : "Ohne Kategorie"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={OHNE}>Ohne Kategorie</SelectItem>
        {kategorien.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}{k.id === vorschlag && !wert ? " (Vorschlag)" : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Schlichte Balken je Kategorie (netto); antippen = filtern */
export function KategorieBalken({ summen, aktiv, onWahl }: { summen: KategorieSumme[]; aktiv: string | null | undefined; onWahl: (id: string | null | undefined) => void }) {
  if (!summen.length) return null;
  return (
    <ul className="space-y-1">
      {summen.map((s) => {
        const an = aktiv !== undefined && aktiv === s.id;
        return (
          <li key={s.id ?? "ohne"}>
            <button type="button" onClick={() => onWahl(an ? undefined : s.id)} aria-pressed={an}
              className={cn("grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors sm:grid-cols-[minmax(8rem,14rem)_1fr_auto]",
                an ? "bg-primary-soft" : "hover:bg-muted")}>
              <span className={cn("truncate", s.id === null && "text-muted-foreground")}>{s.name} <span className="text-xs text-muted-foreground">· {s.anzahl}</span></span>
              <span className="col-span-2 row-start-2 h-2.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <span className={cn("block h-full rounded-full", s.id === null ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${Math.max(2, s.anteil * 100)}%` }} />
              </span>
              <span className="zahl col-start-2 row-start-1 w-24 text-right font-medium sm:col-start-3">{euro(s.netto)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
