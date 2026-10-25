import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormularDialog } from "@/components/FormularDialog";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { zahl } from "@/lib/format";
import type { Artikel } from "@/lib/types";

/** Artikel aus dem Stamm suchen — jedes Antippen fügt eine Einheit hinzu. */
export function ArtikelDialog({
  open, onOpenChange, ziel, onArtikel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Wohin es geht, z. B. „Küche“ */
  ziel: string | null;
  onArtikel: (a: Artikel) => void;
}) {
  const [zuletzt, setZuletzt] = useState<{ id: string; name: string; anzahl: number }[]>([]);
  useEffect(() => { if (open) setZuletzt([]); }, [open]);

  const wahl = (a: Artikel) => {
    onArtikel(a);
    setZuletzt((l) => {
      const da = l.find((x) => x.id === a.id);
      return da
        ? l.map((x) => (x.id === a.id ? { ...x, anzahl: x.anzahl + 1 } : x))
        : [{ id: a.id, name: a.bezeichnung, anzahl: 1 }, ...l].slice(0, 4);
    });
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Artikel hinzufügen"
      beschreibung={ziel ? `Landet unter „${ziel}“ — antippen = +1` : "Antippen = +1, Preis = Verkaufspreis"}
      fuss={<Button className="h-12 sm:min-w-40" onClick={() => onOpenChange(false)}>Fertig</Button>}
    >
      {zuletzt.length > 0 && (
        <ul className="space-y-1 rounded-lg border bg-primary-soft p-2.5 text-sm">
          {zuletzt.map((z) => (
            <li key={z.id} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{z.name}</span>
              <span className="zahl font-semibold">+{zahl(z.anzahl)}</span>
            </li>
          ))}
        </ul>
      )}
      <ArtikelSuche onWahl={wahl} autoFocus listeKlasse="max-h-[60dvh]" />
    </FormularDialog>
  );
}
