import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjekte } from "@/hooks/useDaten";
import { dezimalLesen, euro } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PositionEntwurf } from "./eingangLogik";

export const leerePosition = (): PositionEntwurf => ({
  schluessel: crypto.randomUUID(), artikelnummer: "", bezeichnung: "", menge: "", einheit: "", einzelpreis: "", gesamt: "", lieferschein_nr: "", projekt_id: "",
});

/**
 * Positionen der Eingangsrechnung — jede Zeile einem Projekt zuordnen
 * (oder keinem = Lager/Betrieb). „Alle auf …“ ordnet alles auf einmal zu.
 */
export function EingangPositionen({
  positionen, setPositionen, onAnteile, anteileGesperrt,
}: {
  positionen: PositionEntwurf[];
  setPositionen: (f: (alt: PositionEntwurf[]) => PositionEntwurf[]) => void;
  /** Aufteilung auf Projekte aus den Zeilen übernehmen */
  onAnteile: () => void;
  /** schon weiterverrechnet — Aufteilung bleibt */
  anteileGesperrt: boolean;
}) {
  const { data: projekte = [] } = useProjekte();
  const [offen, setOffen] = useState(positionen.length > 0 && positionen.length <= 12);
  const aktive = projekte.filter((p) => p.status !== "abgeschlossen" || positionen.some((x) => x.projekt_id === p.id));
  const aendern = (k: string, w: Partial<PositionEntwurf>) => setPositionen((alt) => alt.map((p) => (p.schluessel === k ? { ...p, ...w } : p)));
  const summe = positionen.reduce((s, p) => s + (dezimalLesen(p.gesamt) ?? 0), 0);
  const zugeordnet = positionen.filter((p) => p.projekt_id).length;

  const projektAuswahl = (wert: string, onChange: (v: string) => void, label: string, leer = "Kein Projekt (Lager/Betrieb)") => (
    <select value={wert} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm">
      <option value="">{leer}</option>
      {aktive.map((p) => <option key={p.id} value={p.id}>{p.nummer} {p.name}</option>)}
    </select>
  );

  return (
    <section className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-left">
        <span className="flex-1 text-sm font-medium">
          Positionen {positionen.length > 0 && <span className="font-normal text-muted-foreground">· {positionen.length} Zeilen · {zugeordnet} zugeordnet · {euro(summe)}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", offen && "rotate-180")} />
      </button>
      {offen && (
        <div className="space-y-2 border-t p-3">
          {positionen.length === 0 && <p className="text-sm text-muted-foreground">Keine Positionen — „Mit KI ausfüllen“ liest sie vom Beleg, oder selbst eintragen.</p>}
          {positionen.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">Alle auf</span>
              {projektAuswahl("", (v) => setPositionen((alt) => alt.map((p) => ({ ...p, projekt_id: v }))), "Alle Positionen einem Projekt zuordnen", "Projekt wählen …")}
            </div>
          )}
          <ul className="divide-y rounded-md border">
            {positionen.map((p) => (
              <li key={p.schluessel} className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <Input value={p.bezeichnung} placeholder="Bezeichnung" aria-label="Bezeichnung" className="h-10 flex-1"
                    onChange={(e) => aendern(p.schluessel, { bezeichnung: e.target.value })} />
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground" aria-label="Zeile entfernen"
                    onClick={() => setPositionen((alt) => alt.filter((x) => x.schluessel !== p.schluessel))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-[4.5rem_3.5rem_1fr] gap-1.5 sm:grid-cols-[4.5rem_3.5rem_6.5rem_minmax(0,1fr)]">
                  <Input value={p.menge} placeholder="Menge" aria-label="Menge" inputMode="decimal" className="zahl h-10 text-right"
                    onChange={(e) => aendern(p.schluessel, { menge: e.target.value })} />
                  <Input value={p.einheit} placeholder="Einh." aria-label="Einheit" className="h-10 px-2"
                    onChange={(e) => aendern(p.schluessel, { einheit: e.target.value })} />
                  <Input value={p.gesamt} placeholder="netto €" aria-label="Betrag netto" inputMode="decimal" className="zahl h-10 text-right"
                    onChange={(e) => aendern(p.schluessel, { gesamt: e.target.value })} />
                  <div className="col-span-3 sm:col-span-1">{projektAuswahl(p.projekt_id, (v) => aendern(p.schluessel, { projekt_id: v }), `Projekt für ${p.bezeichnung}`)}</div>
                </div>
                {(p.artikelnummer || p.lieferschein_nr) && (
                  <p className="text-xs text-muted-foreground">{[p.artikelnummer && `Art.-Nr. ${p.artikelnummer}`, p.lieferschein_nr && `Lieferschein ${p.lieferschein_nr}`].filter(Boolean).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setPositionen((alt) => [...alt, leerePosition()])}><Plus className="h-4 w-4" /> Zeile</Button>
            {zugeordnet > 0 && (
              <Button variant="outline" disabled={anteileGesperrt} onClick={onAnteile}
                title={anteileGesperrt ? "Schon an den Kunden weiterverrechnet" : undefined}>
                Aufteilung aus den Positionen übernehmen
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
