import { datum as datumText, euro } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import { leerePosition, preisText, type EditorPosition } from "./editor";

/**
 * Teil- und Schlussrechnung — Rechnen ohne Datenbank. Getestet in
 * teilrechnung.test.ts.
 *
 * Teilrechnung: eine Pauschale über einen Teil des Angebots (Prozent oder
 * Betrag, netto). Schlussrechnung: die ganze Leistung, je gestellter
 * Teilrechnung eine Abzugsposition über deren Nettobetrag — die USt rechnet
 * sich aus dem Rest, das PDF weist die abgezogene USt je Teilrechnung aus
 * (§ 11 Abs. 1 Z 4 UStG).
 */

export type TeilRechnung = {
  id: string;
  teil_nr: number | null;
  nummer: string | null;
  datum: string;
  netto: number | string;
  ust: number | string;
  brutto: number | string;
  status: string;
};

/** Betrag netto aus Prozent oder Betrag; null = ungültig */
export function teilBetrag(angebotNetto: number, eingabe: { art: "prozent" | "betrag"; wert: number | null }): number | null {
  if (eingabe.wert === null || !isFinite(eingabe.wert) || eingabe.wert <= 0) return null;
  if (eingabe.art === "prozent") return eingabe.wert > 100 ? null : runden2((angebotNetto * eingabe.wert) / 100);
  return runden2(eingabe.wert);
}

/** Was mit den bisherigen (nicht stornierten) Teilrechnungen schon verlangt ist, netto */
export function schonVerlangt(teile: Pick<TeilRechnung, "netto" | "status">[]): number {
  return runden2(teile.filter((t) => t.status !== "storniert").reduce((s, t) => s + Number(t.netto), 0));
}

/** Nächste Nummer: höchste bisherige (nicht storniert) + 1 */
export function naechsteTeilNr(teile: Pick<TeilRechnung, "teil_nr" | "status">[]): number {
  return teile.filter((t) => t.status !== "storniert").reduce((m, t) => Math.max(m, t.teil_nr ?? 0), 0) + 1;
}

/** Zeile der Teilrechnung: „1. Teilrechnung laut Angebot AN-2026-001: 30 % von € 12.000,00 netto“ */
export function teilText(nr: number, angebotNummer: string | null, angebotNetto: number, prozent: number | null): string {
  const laut = angebotNummer ? ` laut Angebot ${angebotNummer}` : "";
  const anteil = prozent != null ? `: ${String(prozent).replace(".", ",")} % von ${euro(angebotNetto).replace(/\s/g, " ")} netto` : "";
  return `${nr}. Teilrechnung${laut}${anteil}`;
}

/** Abzugsposition für eine Teilrechnung in der Schlussrechnung */
export function abzugPosition(t: Pick<TeilRechnung, "id" | "teil_nr" | "nummer" | "datum" | "netto">): EditorPosition {
  return leerePosition("abzug", {
    bezeichnung: `abzüglich ${t.teil_nr ?? ""}. Teilrechnung ${t.nummer ?? ""} vom ${datumText(t.datum)}`.replace(/\s+/g, " "),
    menge: "1",
    einheit: "Psch",
    einzelpreis: preisText(-Number(t.netto)),
    quelle: { zeiten: [], material: [], regie: [], teil: [t.id] },
  });
}

export type Aufstellung = {
  gesamtNetto: number;
  gesamtUst: number;
  gesamtBrutto: number;
  abzuege: { text: string; netto: number; ust: number; brutto: number }[];
};

/**
 * Schlussrechnung fürs PDF: Gesamtleistung = Rest + Abzüge. Die USt der
 * Gesamtleistung ist die USt des Rests plus die schon in Rechnung gestellte
 * — so stimmt die Summe auf den Cent mit den Teilrechnungen überein.
 */
export function schlussAufstellung(
  rest: { netto: number; ust: number; brutto: number },
  abzuege: { text: string; netto: number; ust: number; brutto: number }[],
): Aufstellung {
  const n = abzuege.reduce((s, a) => s + a.netto, 0);
  const u = abzuege.reduce((s, a) => s + a.ust, 0);
  return {
    gesamtNetto: runden2(rest.netto + n),
    gesamtUst: runden2(rest.ust + u),
    gesamtBrutto: runden2(rest.brutto + n + u),
    abzuege,
  };
}
