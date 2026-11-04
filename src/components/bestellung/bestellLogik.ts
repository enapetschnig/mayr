import type { StatusEintrag } from "@/lib/types";

const runden3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * Bestellungen ohne Datenbank: Status, Bestellvorschlag aus dem
 * Mindestbestand, Materialbedarf aus einem Angebot, offene Mengen.
 */

export type BestellStatus = "entwurf" | "bestellt" | "teilgeliefert" | "geliefert" | "erledigt" | "storniert";

export const BESTELL_STATUS: Record<BestellStatus, StatusEintrag> = {
  entwurf: { ton: "cyan", text: "Entwurf" },
  bestellt: { ton: "blau", text: "Bestellt" },
  teilgeliefert: { ton: "gelb", text: "Teilweise geliefert" },
  geliefert: { ton: "gruen", text: "Geliefert" },
  erledigt: { ton: "gruen", text: "Erledigt" },
  storniert: { ton: "rosa", text: "Storniert", durchgestrichen: true },
};

/** Noch etwas zu erwarten: Wareneingang möglich */
export const istOffen = (s: string) => s === "bestellt" || s === "teilgeliefert";

/** Lieferant „Eigen“ ist der Standard für selbst angelegte Artikel — kein echter Großhändler */
export const LIEFERANT_OHNE = "Eigen";

export const offeneMenge = (p: { menge: number | string; geliefert: number | string }) =>
  Math.max(0, runden3(Number(p.menge) - Number(p.geliefert)));

export type VorschlagPosition = { artikel_id: string; menge: number; ek_preis: number | null; bezeichnung?: string };
export type Vorschlag = { lieferant: string; positionen: VorschlagPosition[] };

type ArtikelMitLieferant = {
  id: string; lieferant: string | null; ek_preis: number | string | null; bezeichnung: string;
  /** Packungsgröße beim Großhändler (100-m-Ring, 100er-Beutel), leer = ganze Einheiten */
  bestell_vpe?: number | string | null;
};

/** Auf ganze Packungen aufrunden: 432,5 m bei Ringen à 100 m → 500 m */
export function aufPackung(menge: number, vpe: number | string | null | undefined): number {
  const v = Number(vpe);
  if (!(v > 0)) return Math.ceil(runden3(menge));
  return runden3(Math.ceil(runden3(menge / v)) * v);
}

/** Nach Lieferant gruppieren (alphabetisch, „Eigen“ zuletzt), Positionen nach Bezeichnung. */
function gruppieren(zeilen: { artikel: ArtikelMitLieferant; menge: number }[]): Vorschlag[] {
  const karte = new Map<string, { artikel: ArtikelMitLieferant; menge: number }[]>();
  for (const z of zeilen) {
    const l = z.artikel.lieferant?.trim() || LIEFERANT_OHNE;
    karte.set(l, [...(karte.get(l) ?? []), z]);
  }
  return [...karte.entries()]
    .sort(([a], [b]) => (a === LIEFERANT_OHNE ? 1 : b === LIEFERANT_OHNE ? -1 : a.localeCompare(b, "de")))
    .map(([lieferant, liste]) => ({
      lieferant,
      positionen: liste
        .sort((a, b) => a.artikel.bezeichnung.localeCompare(b.artikel.bezeichnung, "de"))
        .map((z) => ({
          artikel_id: z.artikel.id, menge: z.menge, ek_preis: z.artikel.ek_preis == null ? null : Number(z.artikel.ek_preis), bezeichnung: z.artikel.bezeichnung,
        })),
    }));
}

/**
 * Nachbestellen bis zum Mindestbestand: fehlt = Mindestbestand − Bestand,
 * davon ab, was schon bestellt und noch nicht geliefert ist; ganze Einheiten.
 */
export function vorschlagAusLager(
  zeilen: { artikel: ArtikelMitLieferant; fehlt: number }[],
  schonBestellt: Map<string, number>,
): Vorschlag[] {
  return gruppieren(zeilen
    .map((z) => ({ artikel: z.artikel, menge: aufPackung(runden3(z.fehlt - (schonBestellt.get(z.artikel.id) ?? 0)), z.artikel.bestell_vpe) }))
    .filter((z) => z.menge > 0));
}

export type AngebotsPosition = { art: string; menge: number | string; artikel_id: string | null; leistung_id: string | null };

/**
 * Material laut Angebot: Artikel-Positionen direkt, Leistungen über ihr
 * Material (leistung_material × Menge). Ergebnis je Artikel, aufgerundet.
 */
export function bedarfAusAngebot(
  positionen: AngebotsPosition[],
  leistungMaterial: Map<string, { artikel_id: string; menge: number }[]>,
): Map<string, number> {
  const bedarf = new Map<string, number>();
  const dazu = (id: string, m: number) => bedarf.set(id, runden3((bedarf.get(id) ?? 0) + m));
  for (const p of positionen) {
    const menge = Number(p.menge) || 0;
    if (menge <= 0 || p.art === "titel" || p.art === "text" || p.art === "abzug") continue;
    if (p.artikel_id) dazu(p.artikel_id, menge);
    else if (p.leistung_id) for (const lm of leistungMaterial.get(p.leistung_id) ?? []) dazu(lm.artikel_id, menge * lm.menge);
  }
  for (const [id, m] of bedarf) bedarf.set(id, Math.ceil(m - 1e-9));
  return bedarf;
}

/** Bedarf → Vorschlag je Lieferant (Artikel, die nicht mehr aktiv sind, fallen weg). */
export function vorschlagAusBedarf(bedarf: Map<string, number>, artikel: ArtikelMitLieferant[]): Vorschlag[] {
  const karte = new Map(artikel.map((a) => [a.id, a]));
  return gruppieren([...bedarf.entries()]
    .filter(([id, m]) => m > 0 && karte.has(id))
    .map(([id, menge]) => ({ artikel: karte.get(id)!, menge: aufPackung(menge, karte.get(id)!.bestell_vpe) })));
}

/**
 * Wareneingang per Scan: welche Position nimmt diesen Artikel? Zuerst eine
 * mit offenem Rest, sonst die erste mit dem Artikel (Überlieferung).
 */
export function positionFuerArtikel<T extends { artikel_id: string; menge: number | string; geliefert: number | string }>(
  positionen: T[],
  artikelId: string,
  schonErfasst: (p: T) => number,
): T | null {
  const passend = positionen.filter((p) => p.artikel_id === artikelId);
  return passend.find((p) => offeneMenge(p) - schonErfasst(p) > 0) ?? passend[0] ?? null;
}

/** Summe EK netto einer Bestellung (Positionen ohne Preis zählen 0) */
export const bestellSumme = (positionen: { menge: number | string; ek_preis: number | string | null }[]) =>
  Math.round(positionen.reduce((s, p) => s + Number(p.menge) * Number(p.ek_preis ?? 0), 0) * 100) / 100;

export type OffenePosition = { id: string; artikel_id: string; menge: number | string; geliefert: number | string };

/**
 * Wareneingang ohne Bestellung im Kopf (Scanner, Modus „Wareneingang“):
 * die Menge der Reihe nach auf offene Bestellpositionen desselben Artikels
 * verteilen — älteste zuerst, wie übergeben. Was übrig bleibt, geht ohne
 * Bestellung ins Lager (`position: null`).
 */
export function aufBestellungenVerteilen(artikelId: string, menge: number, offen: OffenePosition[]): { position: string | null; menge: number }[] {
  const teile: { position: string | null; menge: number }[] = [];
  let rest = runden3(menge);
  for (const p of offen) {
    if (rest <= 0) break;
    if (p.artikel_id !== artikelId) continue;
    const m = Math.min(rest, offeneMenge(p));
    if (m <= 0) continue;
    teile.push({ position: p.id, menge: runden3(m) });
    rest = runden3(rest - m);
  }
  if (rest > 0 || !teile.length) teile.push({ position: null, menge: rest });
  return teile;
}

/**
 * Bestand, der für den Mindestbestand zählt: nur Lagerorte der Art „lager“
 * (die Busse füllt man aus dem Lager nach, nicht beim Großhändler), je Ort
 * negativ auf 0 — ein Buchungsfehler im Bus darf das Lager nicht leerrechnen.
 * Gibt es kein Lager, zählen alle Orte.
 */
export function bestandFuerMindest(jeOrt: Map<string, number>, orte: { id: string; art: string }[]): number {
  const lager = orte.filter((o) => o.art === "lager");
  return runden3((lager.length ? lager : orte).reduce((s, o) => s + Math.max(0, jeOrt.get(o.id) ?? 0), 0));
}
