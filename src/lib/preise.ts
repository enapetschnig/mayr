import type { Artikel, Firma, Leistung, Projekt } from "@/lib/types";

/**
 * Die eine Stelle, an der Preise entstehen. Angebot, Rechnung, Regiebericht
 * und Projektmaterial rechnen alle hierüber — sonst stehen im Angebot andere
 * Preise als später in der Rechnung.
 */

/**
 * Auf Cent runden wie Postgres `round(…, 2)` beim Fertigstellen: ab einem
 * halben Cent weg von null — auch negativ, sonst weicht eine Stornorechnung
 * um einen Cent von der Rechnung ab. toPrecision schluckt Gleitkomma-Reste
 * (1,5 × 0,33 = 0,49499999… ist genau 0,495).
 */
export const runden2 = (n: number) => {
  const x = Number(n) || 0;
  return (Math.sign(x) * Math.round(Number((Math.abs(x) * 100).toPrecision(12)))) / 100 || 0;
};

/** Stundensatz: am Projekt hinterlegt (nur über 0 € zählt), sonst der des Betriebs. */
export function stundensatzFuer(projekt: Pick<Projekt, "stundensatz"> | null | undefined, firma: Pick<Firma, "stundensatz"> | null | undefined): number {
  const eigener = Number(projekt?.stundensatz);
  return eigener > 0 ? eigener : Number(firma?.stundensatz ?? 0);
}

/** Verkaufspreis je Einheit: fester VK, sonst EK + Aufschlag, sonst Listenpreis. */
export function artikelVk(
  a: Pick<Artikel, "vk_preis" | "ek_preis" | "listenpreis"> | null | undefined,
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
): number {
  if (!a) return 0;
  if (a.vk_preis != null) return runden2(Number(a.vk_preis));
  if (a.ek_preis != null) return runden2(Number(a.ek_preis) * (1 + Number(firma?.material_aufschlag ?? 0) / 100));
  if (a.listenpreis != null) return runden2(Number(a.listenpreis));
  return 0;
}

/** Verkaufswert einer Materialbuchung je Einheit: Artikelpreis, bei freiem Text EK + Aufschlag. */
export function buchungVk(
  m: { ek_preis: number | null; artikel: Pick<Artikel, "vk_preis" | "ek_preis" | "listenpreis"> | null },
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
): number {
  if (m.artikel) return artikelVk(m.artikel, firma);
  return runden2(Number(m.ek_preis ?? 0) * (1 + Number(firma?.material_aufschlag ?? 0) / 100));
}

export type LeistungsMaterial ={ menge: number; artikel: Pick<Artikel, "vk_preis" | "ek_preis" | "listenpreis"> | null };

/** Was eine Leistung kostet: fester Preis oder Material-VK + Montagezeit × Stundensatz. */
export function leistungPreis(
  l: Pick<Leistung, "preis" | "minuten">,
  material: LeistungsMaterial[],
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined,
  stundensatz = Number(firma?.stundensatz ?? 0),
): number {
  if (l.preis != null) return runden2(Number(l.preis));
  return runden2(leistungMaterialVk(material, firma) + (Number(l.minuten) / 60) * stundensatz);
}

export function leistungMaterialVk(material: LeistungsMaterial[], firma: Pick<Firma, "material_aufschlag"> | null | undefined): number {
  return runden2(material.reduce((s, m) => s + artikelVk(m.artikel, firma) * Number(m.menge), 0));
}

export function leistungMaterialEk(material: LeistungsMaterial[]): number {
  return runden2(material.reduce((s, m) => s + Number(m.artikel?.ek_preis ?? 0) * Number(m.menge), 0));
}

/** Netto, USt und Brutto eines Belegs (Titel- und Textzeilen zählen nicht). */
export function belegSummen(
  positionen: { art: string; menge: number; einzelpreis: number }[],
  ustSatz: number,
  ohneUst: boolean,
) {
  const netto = runden2(
    positionen
      .filter((p) => p.art !== "titel" && p.art !== "text")
      .reduce((s, p) => s + runden2(Number(p.menge) * Number(p.einzelpreis)), 0),
  );
  const ust = ohneUst ? 0 : runden2((netto * Number(ustSatz)) / 100);
  return { netto, ust, brutto: runden2(netto + ust) };
}
