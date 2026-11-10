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
export const bruttoAusNetto = (netto: number, satz: number) => {
  const n = runden2(netto);
  return runden2(n + runden2(n * satz / 100));
};

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

// ── Ablauf: prüfen → freigeben → überweisen ──────────────────────────────

export type Ablauf = "pruefen" | "freigegeben" | "ueberwiesen" | "abgelehnt";

export function ablauf(r: Pick<Eingangsrechnung, "freigabe" | "bezahlt_am">): Ablauf {
  if (r.bezahlt_am) return "ueberwiesen";
  if (r.freigabe === "abgelehnt") return "abgelehnt";
  if (r.freigabe === "freigegeben") return "freigegeben";
  return "pruefen";
}

/**
 * Was zu überweisen ist: brutto, mit Skonto solange die Frist läuft
 * (bis einschließlich Skontotag).
 */
export function zuZahlen(r: Pick<Eingangsrechnung, "brutto" | "skonto_prozent" | "skonto_bis">, heute: string) {
  const brutto = Number(r.brutto);
  const p = Number(r.skonto_prozent ?? 0);
  if (p > 0 && r.skonto_bis && r.skonto_bis >= heute) {
    const betrag = runden2(brutto * (1 - p / 100));
    return { betrag, skonto: runden2(brutto - betrag), bis: r.skonto_bis };
  }
  return { betrag: runden2(brutto), skonto: 0, bis: null as string | null };
}

// ── Positionen ───────────────────────────────────────────────────────────

export type PositionEntwurf = {
  schluessel: string;
  artikelnummer: string;
  bezeichnung: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
  gesamt: string;
  lieferschein_nr: string;
  projekt_id: string;
};

/**
 * Projekt-Anteile aus den Positionen: je Projekt die Summe der Zeilen (netto).
 * Zeilen ohne Projekt bleiben übrig (Lager/Betrieb). Gerechnet in Cent.
 */
export function anteileAusPositionen(positionen: { gesamt: number; projekt_id: string | null }[]): { projekt_id: string; betrag: number }[] {
  const je = new Map<string, number>();
  positionen.forEach((p) => {
    if (!p.projekt_id) return;
    je.set(p.projekt_id, (je.get(p.projekt_id) ?? 0) + Math.round(p.gesamt * 100));
  });
  return [...je.entries()].map(([projekt_id, cent]) => ({ projekt_id, betrag: cent / 100 })).filter((a) => a.betrag !== 0);
}

// ── Abgleich Lieferschein ↔ Rechnung ─────────────────────────────────────

type Zeile = { artikelnummer?: string | null; bezeichnung: string; menge: number | null };
export type AbgleichZeile = {
  bezeichnung: string;
  artikelnummer: string | null;
  verrechnet: number | null;
  geliefert: number | null;
  status: "passt" | "menge" | "nicht_geliefert" | "nicht_verrechnet";
};

const nummer = (s: string | null | undefined) => (s ?? "").replace(/[\s.\-/]/g, "").replace(/^0+/, "").toLowerCase();
const woerter = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N},]+/gu, " ").split(" ").filter((w) => w.length > 1));
/** Anteil gemeinsamer Wörter (0–1), bezogen auf den kürzeren Text */
export function textAehnlich(a: string, b: string): number {
  const wa = woerter(a);
  const wb = woerter(b);
  if (!wa.size || !wb.size) return 0;
  let gleich = 0;
  wa.forEach((w) => { if (wb.has(w)) gleich += 1; });
  return gleich / Math.min(wa.size, wb.size);
}

/**
 * Rechnungszeilen gegen die gelieferten Zeilen (ein oder mehrere Lieferscheine):
 * zuerst über die Artikelnummer, sonst über den Text (≥ 60 % gleiche Wörter).
 * Mengen gleicher Artikel werden zusammengezählt. Zeilen ohne Gegenstück
 * auf der Rechnung: „nicht geliefert“; auf dem Lieferschein: „nicht verrechnet“.
 */
export function abgleich(rechnung: Zeile[], geliefert: Zeile[]): AbgleichZeile[] {
  const frei = geliefert.map((g, i) => ({ ...g, i }));
  const benutzt = new Set<number>();
  const ergebnis: AbgleichZeile[] = rechnung.map((r) => {
    const nr = nummer(r.artikelnummer);
    let treffer = nr ? frei.filter((g) => !benutzt.has(g.i) && nummer(g.artikelnummer) === nr) : [];
    if (!treffer.length) {
      const beste = frei.filter((g) => !benutzt.has(g.i))
        .map((g) => ({ g, w: textAehnlich(r.bezeichnung, g.bezeichnung) }))
        .filter((x) => x.w >= 0.6)
        .sort((a, b) => b.w - a.w)[0];
      treffer = beste ? [beste.g] : [];
    }
    treffer.forEach((g) => benutzt.add(g.i));
    const menge = treffer.length ? treffer.reduce((s, g) => s + Number(g.menge ?? 0), 0) : null;
    const status: AbgleichZeile["status"] = !treffer.length ? "nicht_geliefert"
      : r.menge != null && menge != null && Math.abs(Number(r.menge) - menge) > 0.0005 ? "menge" : "passt";
    return { bezeichnung: r.bezeichnung, artikelnummer: r.artikelnummer ?? null, verrechnet: r.menge, geliefert: menge, status };
  });
  frei.filter((g) => !benutzt.has(g.i)).forEach((g) => ergebnis.push({
    bezeichnung: g.bezeichnung, artikelnummer: g.artikelnummer ?? null, verrechnet: null, geliefert: g.menge, status: "nicht_verrechnet",
  }));
  return ergebnis;
}
