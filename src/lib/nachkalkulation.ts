import type { Lohnart } from "@/lib/kalkulation";
import { runden2 } from "@/lib/preise";
import type { StatusTon } from "@/lib/types";

/**
 * Nachkalkulation je Projekt: Pauschale (Angebot gegen Aufwand) und Regie
 * getrennt — Regieberichte sind Zusatzarbeit nach Aufwand und würden sonst
 * das Angebot „überziehen“. Lohnkosten und Verrechnungssatz je Person mit
 * „gültig ab“. Getestet in nachkalkulation.test.ts.
 */

export type MitarbeiterSatz = {
  user_id: string;
  gueltig_ab: string;
  lohnkosten: number | null;
  verrechnungssatz: number | null;
};

/** Der Satz, der an `datum` galt: die jüngste Zeile mit gültig ab ≤ Datum */
export function satzAm(saetze: MitarbeiterSatz[], userId: string, datum: string): MitarbeiterSatz | null {
  let treffer: MitarbeiterSatz | null = null;
  for (const s of saetze) {
    if (s.user_id !== userId || s.gueltig_ab > datum) continue;
    if (!treffer || s.gueltig_ab > treffer.gueltig_ab) treffer = s;
  }
  return treffer;
}

/** Überstunden kosten mehr — beim Kunden wie im Lohn */
export const STUNDEN_FAKTOR: Record<string, number> = { ue50: 1.5, ue100: 2 };

export type Saetze = {
  saetze: MitarbeiterSatz[];
  /** Lohnart je Person (`profiles.lohnart`) */
  lohnartVon: Record<string, string | null | undefined>;
  /** Lohnarten des Betriebs samt „Standard“ (= Projekt- bzw. Betriebssatz) */
  lohnarten: Lohnart[];
  /** Projekt- bzw. Betriebssatz */
  standardSatz: number;
  /** `firma.kostensatz` — für Personen ohne eigene Lohnkosten */
  standardKosten: number | null;
};

/**
 * Verrechnungssatz einer Stunde: eigener Satz der Person (am Tag gültig),
 * sonst ihre Lohnart, sonst Projekt-/Betriebssatz. Lohnkosten: eigene, sonst
 * die des Betriebs, sonst null (unbekannt).
 */
export function stundenSaetze(s: Saetze, userId: string, datum: string): { verrechnung: number; kosten: number | null; eigener: boolean } {
  const eigen = satzAm(s.saetze, userId, datum);
  const lohnart = s.lohnarten.find((l) => !l.standard && l.name === s.lohnartVon[userId]);
  const verrechnung = Number(eigen?.verrechnungssatz) > 0 ? Number(eigen!.verrechnungssatz) : lohnart?.satz ?? s.standardSatz;
  const kosten = eigen?.lohnkosten != null ? Number(eigen.lohnkosten) : s.standardKosten != null && Number(s.standardKosten) > 0 ? Number(s.standardKosten) : null;
  return { verrechnung, kosten, eigener: Number(eigen?.verrechnungssatz) > 0 };
}

/** Angebotsposition, soweit sie für die Stunden zählt */
export type AngebotsPosition = { art: string; menge: number; einheit: string | null; minuten: number | null };

const STUNDEN_EINHEIT = /^(h|std\.?|stunden?)$/i;

/**
 * Angebotene Stunden: Arbeitszeit-Positionen in Stunden (menge) plus die
 * Montagezeit jeder Leistung/jedes Artikels (menge × Minuten).
 */
export function angeboteneStunden(positionen: AngebotsPosition[]): number {
  return runden2(positionen.reduce((s, p) => {
    if (p.art === "titel" || p.art === "text" || p.art === "abzug") return s;
    const menge = Number(p.menge) || 0;
    if (p.art === "arbeit" && STUNDEN_EINHEIT.test((p.einheit ?? "").trim())) return s + menge;
    const min = Number(p.minuten) || 0;
    return min > 0 ? s + (menge * min) / 60 : s;
  }, 0));
}

/** Welche Angebote zählen: die angenommenen, sonst die offenen */
export function kalkulationsAngebote<T extends { typ: string; status: string }>(belege: T[]): { angebote: T[]; angenommen: boolean } {
  const angenommen = belege.filter((b) => b.typ === "angebot" && b.status === "angenommen");
  if (angenommen.length) return { angebote: angenommen, angenommen: true };
  return { angebote: belege.filter((b) => b.typ === "angebot" && b.status === "offen"), angenommen: false };
}

export type NkZeit = { user_id: string; datum: string; stunden: number; art: string | null; regiebericht_id: string | null };
export type NkMaterial = { menge: number; ek: number; vk: number; regiebericht_id: string | null };

export type NkBlock = {
  stunden: number;
  /** Stunden × Verrechnungssatz (Garantie zählt 0) + Material zum VK */
  wert: number;
  arbeitWert: number;
  lohnkosten: number;
  materialEk: number;
  materialVk: number;
  /** Wert − Lohnkosten − Material-Einkauf */
  ertrag: number;
};

export type Nachkalkulation = {
  pauschal: NkBlock;
  regie: NkBlock;
  /** Stunden, für die keine Lohnkosten bekannt sind (weder Person noch Betrieb) */
  ohneKosten: number;
  /** Personen mit eigenem Verrechnungssatz kamen vor */
  mitEigenemSatz: boolean;
};

const leer = (): NkBlock => ({ stunden: 0, wert: 0, arbeitWert: 0, lohnkosten: 0, materialEk: 0, materialVk: 0, ertrag: 0 });

/**
 * Teilt Stunden und Material in Pauschale (ohne Regiebericht) und Regie
 * (mit Regiebericht). Material mit Vorzeichen übergeben (Rückgabe negativ).
 */
export function nachkalkulieren(zeiten: NkZeit[], material: NkMaterial[], s: Saetze): Nachkalkulation {
  const pauschal = leer();
  const regie = leer();
  let ohneKosten = 0;
  let mitEigenemSatz = false;
  for (const z of zeiten) {
    const b = z.regiebericht_id ? regie : pauschal;
    const h = Number(z.stunden) || 0;
    const faktor = STUNDEN_FAKTOR[z.art ?? "arbeit"] ?? 1;
    const satz = stundenSaetze(s, z.user_id, z.datum);
    if (satz.eigener) mitEigenemSatz = true;
    b.stunden += h;
    // Garantie zahlt der Kunde nicht — sie kostet nur
    if (z.art !== "garantie") b.arbeitWert += h * satz.verrechnung * faktor;
    if (satz.kosten == null) ohneKosten += h;
    else b.lohnkosten += h * satz.kosten * faktor;
  }
  for (const m of material) {
    const b = m.regiebericht_id ? regie : pauschal;
    b.materialEk += Number(m.menge) * m.ek;
    b.materialVk += Number(m.menge) * m.vk;
  }
  for (const b of [pauschal, regie]) {
    b.stunden = runden2(b.stunden);
    b.arbeitWert = runden2(b.arbeitWert);
    b.lohnkosten = runden2(b.lohnkosten);
    b.materialEk = runden2(b.materialEk);
    b.materialVk = runden2(b.materialVk);
    b.wert = runden2(b.arbeitWert + b.materialVk);
    b.ertrag = runden2(b.wert - b.lohnkosten - b.materialEk);
  }
  return { pauschal, regie, ohneKosten: runden2(ohneKosten), mitEigenemSatz };
}

/**
 * Ampel gebucht gegen angeboten: bis 85 % grün, bis 100 % gelb, darüber rot.
 * Ohne angebotene Stunden keine Ampel.
 */
export function stundenAmpel(gebucht: number, angeboten: number): { ton: StatusTon; anteil: number; text: string } | null {
  if (!(angeboten > 0)) return null;
  const anteil = gebucht / angeboten;
  if (anteil > 1) return { ton: "rot", anteil, text: `${runden2(gebucht - angeboten).toLocaleString("de-AT")} h über dem Angebot` };
  if (anteil > 0.85) return { ton: "gelb", anteil, text: `${Math.round(anteil * 100)} % verbraucht — knapp` };
  return { ton: "gruen", anteil, text: `${Math.round(anteil * 100)} % verbraucht` };
}
