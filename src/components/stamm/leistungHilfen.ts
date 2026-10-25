import { leistungMaterialEk, leistungMaterialVk, leistungPreis, runden2, type LeistungsMaterial } from "@/lib/preise";
import type { Firma, Leistung } from "@/lib/types";

/** Reine Hilfen für den Leistungskatalog — ohne Oberfläche, damit testbar. */

type Ordnung = Pick<Leistung, "id" | "kategorie" | "nummer" | "reihenfolge" | "kurztext">;

const gleicheKategorie = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Nächste Nummer in der Kategorie: „01.09“ → „01.10“. Neue Kategorie in
 * einem Katalog mit „01.01“-Nummern: nächste Hauptnummer („09.01“).
 * Leer, wenn sich nichts ableiten lässt.
 */
export function naechsteNummer(liste: Ordnung[], kategorie: string): string {
  if (!kategorie.trim()) return "";
  const inKategorie = liste.filter((l) => gleicheKategorie(l.kategorie, kategorie) && l.nummer?.trim());
  let best: { vorne: string; n: number; breite: number } | null = null;
  for (const l of inKategorie) {
    const m = l.nummer!.trim().match(/^(.*?)(\d+)$/);
    if (m && (!best || Number(m[2]) > best.n)) best = { vorne: m[1], n: Number(m[2]), breite: m[2].length };
  }
  if (best) return best.vorne + String(best.n + 1).padStart(best.breite, "0");
  if (inKategorie.length) return "";

  let haupt = -1;
  let breite = 2;
  let unterBreite = 2;
  for (const l of liste) {
    const m = l.nummer?.trim().match(/^(\d+)\.(\d+)$/);
    if (m && Number(m[1]) > haupt) {
      haupt = Number(m[1]);
      breite = m[1].length;
      unterBreite = m[2].length;
    }
  }
  return haupt >= 0 ? `${String(haupt + 1).padStart(breite, "0")}.${"1".padStart(unterBreite, "0")}` : "";
}

/**
 * Reihenfolge für eine neue (oder umgezogene) Leistung: ans Ende ihrer
 * Kategorie; eine neue Kategorie bekommt den nächsten Hunderter, damit sie
 * hinten im Katalog steht und Platz zum Einsortieren bleibt.
 */
export function naechsteReihenfolge(liste: Ordnung[], kategorie: string, ohneId?: string): number {
  const andere = liste.filter((l) => l.id !== ohneId);
  const inKategorie = andere.filter((l) => gleicheKategorie(l.kategorie, kategorie));
  if (inKategorie.length) return Math.max(...inKategorie.map((l) => Number(l.reihenfolge) || 0)) + 1;
  const max = andere.reduce((m, l) => Math.max(m, Number(l.reihenfolge) || 0), 0);
  return (Math.floor(max / 100) + 1) * 100 + 1;
}

const nummernVergleich = (a: string | null, b: string | null) =>
  (a ?? "").localeCompare(b ?? "", "de", { numeric: true });

/** Nach Kategorie gruppiert; Kategorien in der Reihenfolge ihrer ersten Leistung. */
export function nachKategorie<T extends Ordnung>(liste: T[]): { kategorie: string; leistungen: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const l of liste) {
    const k = l.kategorie?.trim() || "Allgemein";
    const g = gruppen.get(k);
    if (g) g.push(l);
    else gruppen.set(k, [l]);
  }
  const sortiert = (g: T[]) => [...g].sort((a, b) =>
    (Number(a.reihenfolge) || 0) - (Number(b.reihenfolge) || 0) || nummernVergleich(a.nummer, b.nummer) || a.kurztext.localeCompare(b.kurztext, "de"));
  return [...gruppen.entries()]
    .map(([kategorie, g]) => ({ kategorie, leistungen: sortiert(g) }))
    .sort((a, b) => (Number(a.leistungen[0].reihenfolge) || 0) - (Number(b.leistungen[0].reihenfolge) || 0) || a.kategorie.localeCompare(b.kategorie, "de"));
}

/** Alle Wörter müssen vorkommen — in Nummer, Kurztext, Langtext, Suchwörtern oder Kategorie. */
export function passtZuSuche(
  l: Pick<Leistung, "nummer" | "kurztext" | "langtext" | "suchwoerter" | "kategorie">,
  suchtext: string,
): boolean {
  const woerter = suchtext.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = [l.nummer, l.kurztext, l.langtext, l.suchwoerter, l.kategorie].filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

export interface Kalkulation {
  materialEk: number;
  materialVk: number;
  /** Montagezeit × Stundensatz */
  lohn: number;
  stundensatz: number;
  /** Preis ohne festen Preis (Material-VK + Lohn) */
  berechnet: number;
  /** Was die Leistung kostet — fester Preis, sonst berechnet */
  preis: number;
  /** Preis − Material-EK: was für Arbeitszeit und Betrieb bleibt */
  rohertrag: number;
  rohertragProzent: number | null;
  /** Rohertrag je Arbeitsstunde — Vergleich mit dem Stundensatz */
  jeStunde: number | null;
}

/** Kalkulation einer Leistung; Preise kommen aus lib/preise.ts. */
export function kalkulieren(
  l: { preis: number | null; minuten: number },
  material: LeistungsMaterial[],
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined,
): Kalkulation {
  const minuten = Number(l.minuten) || 0;
  const stundensatz = Number(firma?.stundensatz ?? 0);
  const materialEk = leistungMaterialEk(material);
  const preis = leistungPreis({ preis: l.preis, minuten }, material, firma);
  const rohertrag = runden2(preis - materialEk);
  return {
    materialEk,
    materialVk: leistungMaterialVk(material, firma),
    lohn: runden2((minuten / 60) * stundensatz),
    stundensatz,
    berechnet: leistungPreis({ preis: null, minuten }, material, firma),
    preis,
    rohertrag,
    rohertragProzent: preis > 0 ? (rohertrag / preis) * 100 : null,
    jeStunde: minuten > 0 ? runden2(rohertrag / (minuten / 60)) : null,
  };
}
