/**
 * Artikel und Lager ohne Datenbank: welcher Lieferant beim Bestellen, Bestand
 * nach jeder Bewegung, Lieferschein-Zeile → Artikel, Material laut Angebot
 * fürs Ausfassen. Tests in artikelLogik.test.ts.
 */

const runden3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const runden4 = (n: number) => Math.round((Number(n) || 0) * 10000) / 10000;

// ── Lieferanten ────────────────────────────────────────────────────────

export type WeitererLieferant = {
  lieferant: string;
  lieferanten_nr: string | null;
  ek_preis: number | string | null;
  listenpreis?: number | string | null;
  rabatt?: number | string | null;
  lieferzeit_tage?: number | null;
  bevorzugt: boolean;
};

export type LieferantWahl = {
  lieferant: string;
  ek_preis: number | null;
  nummer: string | null;
  /** haupt = Lieferant am Artikel */
  quelle: "haupt" | "weitere";
  grund: "bevorzugt" | "guenstigst" | "einziger";
};

/** EK aus Listenpreis und Rabatt — leer, wenn einer fehlt. */
export function ekAusListe(liste: number | null | undefined, rabatt: number | null | undefined): number | null {
  if (liste == null || rabatt == null) return null;
  return runden4(Number(liste) * (1 - Number(rabatt) / 100));
}

/** EK eines weiteren Lieferanten: eingetragen, sonst Liste − Rabatt. */
export function ekVon(w: Pick<WeitererLieferant, "ek_preis" | "listenpreis" | "rabatt">): number | null {
  if (w.ek_preis != null && w.ek_preis !== "") return Number(w.ek_preis);
  return ekAusListe(w.listenpreis == null ? null : Number(w.listenpreis), w.rabatt == null ? null : Number(w.rabatt));
}

/**
 * Bei wem bestellen? Ein bevorzugter weiterer Lieferant geht vor, sonst der
 * günstigste EK (Hauptlieferant am Artikel eingeschlossen). Ohne Preis zählt
 * ein Lieferant nicht als günstiger; bei Gleichstand bleibt der Hauptlieferant.
 */
export function besterLieferant(
  haupt: { lieferant: string | null; ek_preis: number | string | null; artikelnummer?: string | null },
  weitere: WeitererLieferant[],
): LieferantWahl {
  const h: LieferantWahl = {
    lieferant: haupt.lieferant?.trim() || "Eigen", ek_preis: haupt.ek_preis == null ? null : Number(haupt.ek_preis),
    nummer: haupt.artikelnummer ?? null, quelle: "haupt", grund: weitere.length ? "guenstigst" : "einziger",
  };
  const bevorzugt = weitere.find((w) => w.bevorzugt);
  if (bevorzugt) return { lieferant: bevorzugt.lieferant, ek_preis: ekVon(bevorzugt), nummer: bevorzugt.lieferanten_nr, quelle: "weitere", grund: "bevorzugt" };
  let best = h;
  for (const w of weitere) {
    const ek = ekVon(w);
    if (ek == null) continue;
    if (best.ek_preis == null || ek < best.ek_preis) {
      best = { lieferant: w.lieferant, ek_preis: ek, nummer: w.lieferanten_nr, quelle: "weitere", grund: "guenstigst" };
    }
  }
  return best;
}

/** Artikel für den Bestellvorschlag mit dem besten Lieferanten und dessen EK. */
export function mitBestemLieferant<A extends { id: string; lieferant: string | null; ek_preis: number | string | null }>(
  artikel: A[],
  weitere: Map<string, WeitererLieferant[]>,
): A[] {
  return artikel.map((a) => {
    const w = weitere.get(a.id);
    if (!w?.length) return a;
    const best = besterLieferant(a, w);
    return best.quelle === "haupt" ? a : { ...a, lieferant: best.lieferant, ek_preis: best.ek_preis };
  });
}

// ── Bewegungen ─────────────────────────────────────────────────────────

export type Bewegung = { id: string; art: string; menge: number | string; lagerort_id: string | null; created_at: string; notiz?: string | null };

export type BewegungsFilter = "alle" | "zugang" | "abgang" | "umbuchung" | "projekt" | "inventur";

/** Was eine Buchung im Lager bewegt (+ rein, − raus, 0 = nur Projekt). */
export function lagerDelta(b: Pick<Bewegung, "art" | "menge" | "lagerort_id">): number {
  if (!b.lagerort_id) return 0;
  const m = Number(b.menge) || 0;
  if (b.art === "zugang" || b.art === "rueckgabe" || b.art === "korrektur") return runden3(m);
  if (b.art === "abgang" || b.art === "ausfassung") return runden3(-m);
  return 0;
}

/** Zu welchem Filter gehört eine Buchung? Umbuchung = Abgang/Zugang mit Notiz „Umbuchung …“ (Scan-Seite). */
export function bewegungsGruppe(b: Pick<Bewegung, "art" | "notiz">): Exclude<BewegungsFilter, "alle"> {
  if ((b.art === "zugang" || b.art === "abgang") && /^Umbuchung\b/.test(b.notiz ?? "")) return "umbuchung";
  if (b.art === "zugang") return "zugang";
  if (b.art === "abgang") return "abgang";
  if (b.art === "korrektur") return "inventur";
  return "projekt";
}

/**
 * Bestand nach jeder Bewegung — über alle Lagerorte oder nur einen. Die
 * Buchungen kommen in beliebiger Reihenfolge, zurück kommen sie neueste zuerst.
 */
export function mitBestandDanach<B extends Bewegung>(buchungen: B[], lagerortId: string | null = null): (B & { delta: number; bestand: number })[] {
  const alt = [...buchungen].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  let bestand = 0;
  const aus = alt.map((b) => {
    const delta = !lagerortId || b.lagerort_id === lagerortId ? lagerDelta(b) : 0;
    bestand = runden3(bestand + delta);
    return { ...b, delta, bestand };
  });
  return aus.reverse();
}

// ── Lieferschein → Artikel ─────────────────────────────────────────────

/** Nummern vergleichbar machen: ohne Leerzeichen, Punkte, Striche, Schrägstriche; Groß/klein egal. */
export const nummerNorm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[\s.\-/_]/g, "");

/** „Sonepar Österreich GmbH“ passt zu „Sonepar“ — erstes Wort genügt. */
export function lieferantPasst(a: string | null | undefined, b: string | null | undefined): boolean {
  const wort = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  const x = wort(a ?? ""), y = wort(b ?? "");
  if (!x.length || !y.length) return false;
  return x[0] === y[0] || x.includes(y[0]) || y.includes(x[0]);
}

export type ZuordnungKandidat = {
  id: string;
  lieferant: string | null;
  artikelnummer: string | null;
  hersteller_nr: string | null;
  ean: string | null;
  aktiv?: boolean;
  /** Nummern bei weiteren Lieferanten */
  weitere?: { lieferant: string; lieferanten_nr: string | null }[];
};

export type Zuordnung = { artikel_id: string; grund: string; sicher: boolean };

/**
 * Welcher Artikel ist diese Lieferschein-Zeile? Genau eine Nummer muss
 * passen. Reihenfolge: Artikelnummer beim selben Lieferanten (auch weitere
 * Lieferanten), EAN, Hersteller-Nr., Artikelnummer eines anderen Lieferanten.
 * Mehrdeutig (zwei Artikel gleich gut) → nur ein Vorschlag, nicht sicher.
 */
export function zeileZuordnen(
  zeile: { artikelnummer: string | null },
  lieferant: string | null,
  kandidaten: ZuordnungKandidat[],
): Zuordnung | null {
  const nr = nummerNorm(zeile.artikelnummer);
  if (nr.length < 3) return null;
  const stufen: { grund: string; passt: (k: ZuordnungKandidat) => boolean }[] = [
    {
      grund: "Artikelnummer des Lieferanten",
      passt: (k) => (nummerNorm(k.artikelnummer) === nr && lieferantPasst(k.lieferant, lieferant))
        || !!k.weitere?.some((w) => nummerNorm(w.lieferanten_nr) === nr && lieferantPasst(w.lieferant, lieferant)),
    },
    { grund: "EAN", passt: (k) => nummerNorm(k.ean) === nr },
    { grund: "Hersteller-Nr.", passt: (k) => nummerNorm(k.hersteller_nr) === nr },
    {
      grund: "Artikelnummer",
      passt: (k) => nummerNorm(k.artikelnummer) === nr || !!k.weitere?.some((w) => nummerNorm(w.lieferanten_nr) === nr),
    },
  ];
  const aktive = kandidaten.filter((k) => k.aktiv !== false);
  for (const s of stufen) {
    const treffer = aktive.filter(s.passt);
    if (treffer.length === 1) return { artikel_id: treffer[0].id, grund: s.grund, sicher: true };
    if (treffer.length > 1) return { artikel_id: treffer[0].id, grund: `${s.grund} — mehrere Artikel passen`, sicher: false };
  }
  return null;
}

// ── Ausfassen: Material laut Angebot ───────────────────────────────────

export type AusfassVorschlag = { artikel_id: string; soll: number; schon: number; offen: number };

/**
 * Laut Angebot gebraucht (Bedarf je Artikel) minus schon aufs Projekt
 * gebracht (ausgefasst − zurück + direkt). Reihenfolge wie im Angebot,
 * Erledigtes zuletzt.
 */
export function ausfassVorschlag(bedarf: Map<string, number>, verbraucht: Map<string, number>): AusfassVorschlag[] {
  const liste = [...bedarf.entries()]
    .filter(([, soll]) => soll > 0)
    .map(([artikel_id, soll]) => {
      const schon = Math.max(0, runden3(verbraucht.get(artikel_id) ?? 0));
      return { artikel_id, soll, schon, offen: Math.max(0, runden3(soll - schon)) };
    });
  return [...liste.filter((v) => v.offen > 0), ...liste.filter((v) => v.offen === 0)];
}

/** Aufschlag in %, der aus EK und VK folgt (für „VK fest“ als Hinweis). */
export function aufschlagAus(ek: number | null | undefined, vk: number | null | undefined): number | null {
  if (ek == null || vk == null || !(Number(ek) > 0)) return null;
  return Math.round(((Number(vk) - Number(ek)) / Number(ek)) * 1000) / 10;
}

/**
 * Nebenkosten auf dem Lieferschein (Fracht, Verpackung, Maut …) — keine Ware
 * fürs Lager. Ohne zugeordneten Artikel startet die Zeile deshalb als „nicht
 * einbuchen“, statt das Einbuchen zu sperren.
 */
export const istNebenkosten = (text: string | null | undefined) =>
  /fracht|versand|porto|verpackung|transport|zustell|anliefer|maut|logistik|mindermengen|kleinmengen|energiezuschlag|palette/i.test(text ?? "");
