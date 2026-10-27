import type { EingangAnteil, Eingangsrechnung } from "@/lib/types";

/**
 * Eingangsrechnungen: Rechnen ohne Datenbank — Zuordnung, Rest, Status,
 * Netto/Brutto. Getestet in eingangLogik.test.ts.
 */

export const KATEGORIEN = [
  { wert: "material", text: "Material" },
  { wert: "fremdleistung", text: "Fremdleistung" },
  { wert: "werkzeug", text: "Werkzeug" },
  { wert: "fahrzeug", text: "Fahrzeug" },
  { wert: "buero", text: "Büro" },
  { wert: "sonstiges", text: "Sonstiges" },
] as const;

export const kategorieText = (k: string) => KATEGORIEN.find((x) => x.wert === k)?.text ?? k;

const runden2 = (n: number) => Math.round(n * 100) / 100;

/** Netto aus Brutto und umgekehrt — die USt ergibt sich als Differenz */
export const nettoAusBrutto = (brutto: number, satz: number) => runden2(brutto / (1 + satz / 100));
export const bruttoAusNetto = (netto: number, satz: number) => runden2(netto * (1 + satz / 100));

export type Zuordnung = "zuzuordnen" | "teilweise" | "zugeordnet";

/** Was noch auf kein Projekt verteilt ist (netto) */
export function rest(netto: number, anteile: Pick<EingangAnteil, "betrag">[]): number {
  return runden2(netto - anteile.reduce((s, a) => s + Number(a.betrag), 0));
}

/**
 * Zugeordnet heißt: ganz auf Projekte verteilt, oder der Rest gehört dem
 * Betrieb (Lager, Werkzeug, Büro). Ein Betrag von 0 € gibt es nichts zu verteilen.
 */
export function zuordnung(r: Pick<Eingangsrechnung, "netto" | "betrieb">, anteile: Pick<EingangAnteil, "betrag">[]): Zuordnung {
  if (r.betrieb || Number(r.netto) === 0) return "zugeordnet";
  const offen = rest(Number(r.netto), anteile);
  if (Math.abs(offen) < 0.005) return "zugeordnet";
  return anteile.length ? "teilweise" : "zuzuordnen";
}

/** Zahlstatus: bezahlt, überfällig (nach dem Fälligkeitstag) oder offen */
export function zahlung(r: Pick<Eingangsrechnung, "bezahlt_am" | "faellig_am">, heute: string): "bezahlt" | "ueberfaellig" | "offen" {
  if (r.bezahlt_am) return "bezahlt";
  if (r.faellig_am && r.faellig_am < heute) return "ueberfaellig";
  return "offen";
}

export type AnteilEntwurf = {
  /** null = neu */
  id: string | null;
  schluessel: string;
  projekt_id: string;
  betrag: string;
  text: string;
  /** an eine Ausgangsrechnung gebunden — fest */
  rechnung_id: string | null;
};

/**
 * Prüft die Aufteilung vor dem Speichern. Gibt einen Satz für den Benutzer
 * zurück oder null. `lesen` wandelt die Eingabe in eine Zahl (Komma!).
 */
export function aufteilungFehler(netto: number, anteile: AnteilEntwurf[], lesen: (s: string) => number | null): string | null {
  for (const a of anteile) {
    if (!a.projekt_id) return "Bei jedem Anteil ein Projekt wählen — oder den Anteil entfernen.";
    const b = lesen(a.betrag);
    if (b === null || b === 0) return "Bei jedem Anteil einen Betrag eintragen.";
    if (netto > 0 && b < 0) return "Ein Anteil kann nicht negativ sein.";
  }
  const summe = runden2(anteile.reduce((s, a) => s + (lesen(a.betrag) ?? 0), 0));
  if (Math.abs(summe) > Math.abs(netto) + 0.005) {
    return "Die Anteile sind zusammen mehr als der Nettobetrag der Rechnung.";
  }
  return null;
}
