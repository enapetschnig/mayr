import type { Json } from "@/integrations/supabase/types";
import type { Firma } from "@/lib/types";
import { runden2 } from "@/lib/preise";

/**
 * Einfache Kalkulation im Angebot: mehrere Stundensätze, Preis aus Einkauf +
 * Aufschlag + Arbeitszeit, alle Preise um einige Prozent ändern.
 * Getestet in kalkulation.test.ts.
 */

export type Lohnart = { name: string; satz: number; standard?: boolean };

/** Weitere Stundensätze aus `firma.stundensaetze` — Unlesbares fällt weg */
export function stundensaetzeLesen(j: Json | null | undefined): Lohnart[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const name = typeof x.name === "string" ? x.name.trim() : "";
    const satz = Number(x.satz);
    return name && satz > 0 ? [{ name, satz }] : [];
  });
}

/** Standardsatz (Projekt oder Betrieb) zuerst, dann die weiteren des Betriebs */
export function lohnarten(firma: Pick<Firma, "stundensaetze"> | null | undefined, standardSatz: number): Lohnart[] {
  return [{ name: "Standard", satz: standardSatz, standard: true }, ...stundensaetzeLesen(firma?.stundensaetze)];
}

/** Bezeichnung der Arbeitszeit-Position: „Arbeitszeit“ bzw. „Arbeitszeit Meister“ */
export const arbeitszeitText = (l: Lohnart) => (l.standard ? "Arbeitszeit" : `Arbeitszeit ${l.name}`);

/** Einzelpreis = Einkauf + Aufschlag + Arbeitszeit (Minuten) × Stundensatz */
export function kalkPreis(k: { ek: number; aufschlag: number; minuten: number; satz: number }): number {
  return runden2(k.ek * (1 + k.aufschlag / 100) + (k.minuten / 60) * k.satz);
}

/** Neuer Preis nach ± Prozent — z. B. +5 % Aufschlag oder −3 % Rabatt */
export const umProzent = (preis: number, prozent: number) => runden2(preis * (1 + prozent / 100));

/**
 * Was vom Netto nach dem Material bleibt — gesamt und je Arbeitsstunde.
 * Lohnkosten kennt die App nicht; „je Stunde“ zeigt, ob die Arbeit sich rechnet.
 */
export function rohertrag(netto: number, ek: number, stunden: number) {
  const bleibt = runden2(netto - ek);
  return { bleibt, jeStunde: stunden > 0 ? runden2(bleibt / stunden) : null, anteil: netto > 0 ? bleibt / netto : null };
}
