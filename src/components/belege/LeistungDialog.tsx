import { useMemo, useState } from "react";
import { ListChecks, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormularDialog } from "@/components/FormularDialog";
import { Leer } from "@/components/Bausteine";
import { euro, zahl } from "@/lib/format";
import { leistungPreis } from "@/lib/preise";
import { normalisieren } from "@/lib/sprachParser";
import type { Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { mengeInGruppe, type EditorPosition, type KatalogLeistung } from "./editor";

/**
 * Leistungskatalog als Kacheln, nach Kategorie. Antippen = +1 im gewählten
 * Raum; die Zahl auf der Kachel zeigt, wie viele dort schon stehen.
 * Der Raum lässt sich oben wechseln, ohne den Dialog zu schließen.
 */
export function LeistungDialog({
  open, onOpenChange, katalog, laedt, positionen, titelId, onTitelWahl, onNeuerTitel, onPlus, onMinus, firma, stundensatz,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  katalog: KatalogLeistung[];
  laedt: boolean;
  positionen: EditorPosition[];
  titelId: string | null;
  onTitelWahl: (id: string | null) => void;
  onNeuerTitel: () => void;
  onPlus: (l: KatalogLeistung) => void;
  onMinus: (l: KatalogLeistung) => void;
  firma: Firma | null;
  stundensatz: number;
}) {
  const [suche, setSuche] = useState("");
  const titel = positionen.filter((p) => p.art === "titel");

  const gruppen = useMemo(() => {
    const q = normalisieren(suche.trim());
    const treffer = katalog.filter((l) => !q
      || q.split(/\s+/).every((w) => normalisieren(`${l.nummer ?? ""} ${l.kurztext} ${l.suchwoerter ?? ""} ${l.kategorie}`).includes(w)));
    const map = new Map<string, KatalogLeistung[]>();
    treffer.forEach((l) => map.set(l.kategorie || "Sonstiges", [...(map.get(l.kategorie || "Sonstiges") ?? []), l]));
    return [...map.entries()];
  }, [katalog, suche]);

  const gewaehlt = titel.find((t) => t.id === titelId);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Leistung hinzufügen"
      beschreibung={gewaehlt ? `Landet unter „${gewaehlt.bezeichnung}“ — antippen = +1` : "Antippen = +1"}
      breite="breit"
      fuss={<Button className="h-12 sm:min-w-40" onClick={() => onOpenChange(false)}>Fertig</Button>}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen – Steckdose, FI, Wallbox …"
          className="h-12 pl-9"
          inputMode="search"
          enterKeyHint="search"
        />
      </div>

      {/* Raum wählen */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-2 pb-1">
          {titel.length > 0 && <RaumChip aktiv={!titelId} onClick={() => onTitelWahl(null)}>Ohne Raum</RaumChip>}
          {titel.map((t) => (
            <RaumChip key={t.id} aktiv={t.id === titelId} onClick={() => onTitelWahl(t.id)}>{t.bezeichnung || "Ohne Namen"}</RaumChip>
          ))}
          <button
            type="button"
            onClick={onNeuerTitel}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-dashed px-3.5 text-sm font-medium text-primary hover:border-primary"
          >
            <Plus className="h-4 w-4" /> Raum
          </button>
        </div>
      </div>

      {laedt && <p className="py-6 text-center text-sm text-muted-foreground">Katalog wird geladen …</p>}
      {!laedt && gruppen.length === 0 && (
        <Leer icon={ListChecks} text={katalog.length ? "Keine Leistung gefunden." : "Der Leistungskatalog ist noch leer."} />
      )}

      {gruppen.map(([kategorie, liste]) => (
        <section key={kategorie} className="space-y-2">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{kategorie}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {liste.map((l) => {
              const anzahl = mengeInGruppe(positionen, titelId, l.id);
              const preis = leistungPreis(l, l.leistung_material ?? [], firma, stundensatz);
              return (
                <div key={l.id} className={cn("relative rounded-lg border bg-card transition-colors", anzahl > 0 && "border-primary bg-primary-soft")}>
                  <button
                    type="button"
                    onClick={() => onPlus(l)}
                    className="flex min-h-[5.5rem] w-full flex-col justify-between gap-1.5 p-3 text-left active:scale-[0.98]"
                  >
                    <span lang="de" className="line-clamp-2 hyphens-auto break-words pr-7 text-sm font-medium leading-snug">{l.kurztext}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="zahl font-semibold text-foreground">{euro(preis)}</span> / {l.einheit}
                    </span>
                  </button>
                  {anzahl > 0 && (
                    <>
                      <span className="zahl pointer-events-none absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                        {zahl(anzahl)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onMinus(l)}
                        aria-label={`${l.kurztext} eins weniger`}
                        className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </FormularDialog>
  );
}

function RaumChip({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        aktiv ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60",
      )}
    >
      {children}
    </button>
  );
}
