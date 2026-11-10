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

/**
 * Aufschlag aufs Material, den ein Preis enthält: (Preis − Arbeitsanteil) / EK − 1.
 * Ohne Einkaufspreis gibt es keinen Aufschlag (null).
 */
export function aufschlagAus(k: { preis: number; ek: number | null; minuten: number | null; satz: number }): number | null {
  if (!k.ek || k.ek <= 0) return null;
  const material = k.preis - ((k.minuten ?? 0) / 60) * k.satz;
  return Math.round((material / k.ek - 1) * 1000) / 10;
}

/** Position, wie sie der Beleg-Aufschlag braucht (Menge/Preis schon als Zahl egal) */
export type KalkPosition = { art: string; einheit: string; einzelpreis: number; ek_preis: number | null; minuten: number | null };

/**
 * Aufschläge für den ganzen Beleg neu setzen:
 * - Material-Aufschlag: jede Position mit Einkaufspreis bekommt EK × (1 + %) + Arbeitsanteil
 * - Stundensatz: Arbeitszeit in Stunden zum alten Standardsatz → neuer Satz; der
 *   Arbeitsanteil kalkulierter Positionen (Minuten) rechnet mit dem neuen Satz
 * Positionen ohne EK und ohne Minuten (freie Preise, Pauschalen) bleiben.
 * Gibt je Position den neuen Preis zurück, oder null = unverändert.
 */
export function aufschlaegeSetzen(
  positionen: KalkPosition[],
  neu: { material: number | null; satz: number | null },
  alterSatz: number,
): (number | null)[] {
  const satz = neu.satz ?? alterSatz;
  return positionen.map((p) => {
    if (p.art === "titel" || p.art === "text" || p.art === "abzug") return null;
    if (p.art === "arbeit") {
      // nur Stunden zum alten Standardsatz — Meister- oder Sondersätze bleiben
      if (neu.satz == null || p.einheit !== "h" || runden2(p.einzelpreis) !== runden2(alterSatz)) return null;
      return runden2(neu.satz);
    }
    const ek = p.ek_preis != null && p.ek_preis > 0 ? p.ek_preis : null;
    if (ek == null && !p.minuten) return null;
    const auf = neu.material ?? (ek != null ? aufschlagAus({ preis: p.einzelpreis, ek, minuten: p.minuten, satz: alterSatz }) ?? 0 : 0);
    const preis = kalkPreis({ ek: ek ?? 0, aufschlag: auf, minuten: p.minuten ?? 0, satz });
    return preis === runden2(p.einzelpreis) ? null : preis;
  });
}
