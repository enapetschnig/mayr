import { isoZuDatum, tageDazu } from "@/lib/format";
import { abwesenheitStunden, feiertagName, sollTag, type AbwesenheitKurz } from "@/lib/zeitkonto";

/**
 * Monatsansicht der Stunden einer Person: je Tag Ist, Soll, Abwesenheit und
 * eine Farbe; je Woche und für den Monat die Summen. Abwesenheit zählt wie
 * im Konto mit der Sollzeit des Tages (Zeitausgleich nicht). Getestet in
 * monatsKalender.test.ts.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export type MonatsZeit = { datum: string; stunden: number | string; projekt_id: string | null };

/**
 * voll = Soll erreicht, knapp = gearbeitet, aber weniger als Soll,
 * fehlt = vergangener Arbeitstag ohne alles, frei = Wochenende/Feiertag,
 * abwesend = Urlaub, Krank …, kommt = heute oder später
 */
export type TagTon = "voll" | "knapp" | "fehlt" | "frei" | "abwesend" | "kommt";

export type KalenderTag = {
  iso: string;
  tag: number;
  /** gebucht (alle Stunden) */
  ist: number;
  /** davon ohne Projekt (Büro, Lager …) */
  intern: number;
  soll: number;
  abwesend: { art: string; stunden: number } | null;
  feiertag: string | null;
  ton: TagTon;
};

export type KalenderWoche = { kw: number; tage: (KalenderTag | null)[]; ist: number; soll: number };

export type Monat = {
  wochen: KalenderWoche[];
  ist: number;
  intern: number;
  abwesend: number;
  soll: number;
  /** Soll bis heute (ohne die kommenden Tage) — dagegen misst man den Stand */
  sollBisHeute: number;
  differenz: number;
};

/** ISO-Kalenderwoche als Zahl */
export function kw(iso: string): number {
  const d = isoZuDatum(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const erste = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d.getTime() - erste.getTime()) / 86400000 - 3 + ((erste.getDay() + 6) % 7)) / 7);
}

/** "2026-11" → erster und letzter Tag */
export function monatsGrenzen(monat: string): { von: string; bis: string } {
  const [j, m] = monat.split("-").map(Number);
  const von = `${monat}-01`;
  const naechster = m === 12 ? `${j + 1}-01-01` : `${j}-${String(m + 1).padStart(2, "0")}-01`;
  return { von, bis: tageDazu(naechster, -1) };
}

/** "2026-11" + 1 → "2026-12" */
export function monatDazu(monat: string, n: number): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(j, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monatsKalender(
  monat: string,
  zeiten: MonatsZeit[],
  abwesenheiten: AbwesenheitKurz[],
  wochenstunden: number,
  heute: string,
): Monat {
  const { von, bis } = monatsGrenzen(monat);
  const jeTag = new Map<string, { ist: number; intern: number }>();
  zeiten.forEach((z) => {
    if (z.datum < von || z.datum > bis) return;
    const e = jeTag.get(z.datum) ?? { ist: 0, intern: 0 };
    e.ist += Number(z.stunden);
    if (!z.projekt_id) e.intern += Number(z.stunden);
    jeTag.set(z.datum, e);
  });
  const genehmigt = abwesenheiten.filter((a) => (a.status ?? "genehmigt") === "genehmigt");

  const tage: KalenderTag[] = [];
  for (let iso = von; iso <= bis; iso = tageDazu(iso, 1)) {
    const g = jeTag.get(iso) ?? { ist: 0, intern: 0 };
    const soll = sollTag(iso, wochenstunden);
    const a = genehmigt.find((x) => x.von <= iso && x.bis >= iso);
    const abw = a && soll > 0 ? { art: a.art, stunden: a.art === "zeitausgleich" ? 0 : abwesenheitStunden(a, iso, wochenstunden) } : null;
    const ist = r2(g.ist);
    const zusammen = ist + (abw?.stunden ?? 0);
    const ton: TagTon = abw && ist === 0 ? "abwesend"
      : soll === 0 ? (ist > 0 ? "voll" : "frei")
      : zusammen >= soll - 0.01 ? "voll"
      : iso >= heute ? (ist > 0 ? "knapp" : "kommt")
      : ist > 0 || abw ? "knapp" : "fehlt";
    tage.push({ iso, tag: Number(iso.slice(8)), ist, intern: r2(g.intern), soll: r2(soll), abwesend: abw, feiertag: feiertagName(iso), ton });
  }

  // Wochen Montag bis Sonntag, Lücken am Rand bleiben leer
  const wochen: KalenderWoche[] = [];
  tage.forEach((t) => {
    const wt = (isoZuDatum(t.iso).getDay() + 6) % 7;
    if (wt === 0 || !wochen.length) wochen.push({ kw: kw(t.iso), tage: Array(7).fill(null), ist: 0, soll: 0 });
    const w = wochen[wochen.length - 1];
    w.tage[wt] = t;
    w.ist = r2(w.ist + t.ist + (t.abwesend?.stunden ?? 0));
    w.soll = r2(w.soll + t.soll);
  });

  const ist = r2(tage.reduce((s, t) => s + t.ist, 0));
  const abwesend = r2(tage.reduce((s, t) => s + (t.abwesend?.stunden ?? 0), 0));
  const sollBisHeute = r2(tage.filter((t) => t.iso < heute).reduce((s, t) => s + t.soll, 0));
  const bisHeute = r2(tage.filter((t) => t.iso < heute).reduce((s, t) => s + t.ist + (t.abwesend?.stunden ?? 0), 0));
  return {
    wochen,
    ist,
    intern: r2(tage.reduce((s, t) => s + t.intern, 0)),
    abwesend,
    soll: r2(tage.reduce((s, t) => s + t.soll, 0)),
    sollBisHeute,
    differenz: r2(bisHeute - sollBisHeute),
  };
}
