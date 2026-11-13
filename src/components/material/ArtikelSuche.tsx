import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useSitzung } from "@/hooks/useSitzung";
import { euro } from "@/lib/format";
import { artikelVk } from "@/lib/preise";
import type { Artikel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Verzögert eine Eingabe — die Suche läuft erst, wenn man kurz aufhört zu tippen. */
export function useVerzoegert<T>(wert: T, ms = 250): T {
  const [v, setV] = useState(wert);
  useEffect(() => {
    const t = window.setTimeout(() => setV(wert), ms);
    return () => window.clearTimeout(t);
  }, [wert, ms]);
  return v;
}

/**
 * Artikelsuche im Artikelstamm (Datanorm, eigene, Demo).
 * Alle Wörter müssen vorkommen: „nym 3x1,5“ findet „NYM-J 3x1,5 mm²“.
 * Ein reiner Strichcode oder eine Artikelnummer trifft direkt.
 */
export function useArtikelSuche(suchtext: string, anzahl = 40, hersteller: string | null = null) {
  const q = useVerzoegert(suchtext.trim());
  const abfrage = useQuery({
    queryKey: ["artikel", "suche", q, anzahl, hersteller],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("artikel_suchen", { p_q: q, p_anzahl: anzahl, p_hersteller: hersteller ?? undefined });
      if (error) throw error;
      return (data ?? []) as Artikel[];
    },
    placeholderData: (vorher) => vorher,
  });
  // Treffer gehören (noch) zu einem älteren Suchtext — z. B. Enter nicht auf sie anwenden
  const wartet = q !== suchtext.trim() || abfrage.isPlaceholderData || abfrage.isFetching;
  return { ...abfrage, wartet };
}

/**
 * Suchfeld + Trefferliste. Antippen wählt den Artikel.
 * Wird in Scanner, Regiebericht, Angebot und Leistungskatalog benutzt.
 */
export function ArtikelSuche({
  onWahl,
  autoFocus,
  platzhalter = "Artikel suchen – Name, Nummer, Hersteller …",
  startText = "",
  className,
  listeKlasse,
}: {
  onWahl: (a: Artikel) => void;
  autoFocus?: boolean;
  platzhalter?: string;
  startText?: string;
  className?: string;
  /** z. B. "max-h-80" — Höhe der Trefferliste */
  listeKlasse?: string;
}) {
  const { firma, istChef } = useSitzung();
  const [text, setText] = useState(startText);
  // Hersteller zum Antippen: erst über alle Treffer, dann sucht die Datenbank nur in diesem
  const [hersteller, setHersteller] = useState<string | null>(null);
  const { data: alleTreffer = [] } = useArtikelSuche(text, 80);
  const { data: treffer = [], isFetching } = useArtikelSuche(text, 40, hersteller);
  const marken = useMemo(() => {
    const m = new Map<string, number>();
    alleTreffer.forEach((a) => m.set(a.hersteller ?? "-", (m.get(a.hersteller ?? "-") ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alleTreffer]);
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) window.setTimeout(() => feld.current?.focus(), 50);
  }, [autoFocus]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={feld}
          value={text}
          onChange={(e) => { setText(e.target.value); setHersteller(null); }}
          placeholder={platzhalter}
          className="h-12 pl-9 pr-9 text-base"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {text.trim() && marken.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Nach Hersteller">
          {/* ohne Anzahl: sie zählt nur die besten Treffer, angetippt sucht die Datenbank alle des Herstellers */}
          {["", ...marken.map(([h]) => h)].map((h) => {
            const aktiv = (hersteller ?? "") === h;
            return (
              <button key={h || "alle"} type="button" aria-pressed={aktiv} onClick={() => setHersteller(h || null)}
                className={cn("h-9 shrink-0 rounded-full border px-3 text-sm transition-colors",
                  aktiv ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
                {h === "" ? "Alle" : h === "-" ? "Ohne Hersteller" : h}
              </button>
            );
          })}
        </div>
      )}
      <div className={cn("divide-y rounded-xl border bg-card overflow-y-auto overscroll-contain", listeKlasse ?? "max-h-[50dvh]")}>
        {treffer.length === 0 && !isFetching && (
          <div className="flex flex-col items-center gap-1 py-8 text-sm text-muted-foreground">
            <Package className="h-8 w-8 opacity-40" />
            {text.trim() ? "Nichts gefunden" : "Artikelstamm ist leer"}
          </div>
        )}
        {treffer.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onWahl(a)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug line-clamp-2">{a.bezeichnung}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[a.hersteller, a.hersteller_nr ?? a.artikelnummer].filter(Boolean).join(" · ") || a.lieferant}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">{a.einheit}</p>
              {istChef && <p className="text-sm font-semibold tabular-nums">{euro(artikelVk(a, firma))}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
