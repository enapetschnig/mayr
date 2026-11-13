import { isoTag, isoZuDatum, tageDazu } from "@/lib/format";

/**
 * Sollzeit, österreichische Feiertage, Überstunden- und Urlaubskonto,
 * Taggeld — alles ohne Datenbank. Abwesenheiten sind keine Zeitbuchungen:
 * das Konto rechnet sie mit der Sollzeit des Tages.
 */

const runden2 = (n: number) => Math.round(n * 100) / 100;

/** Ostersonntag (Gauß, gregorianisch) */
function ostern(jahr: number): string {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return isoTag(new Date(jahr, monat - 1, tag, 12));
}

const feiertagCache = new Map<number, Map<string, string>>();

/** Gesetzliche Feiertage in Österreich (Karfreitag, 24.12. und 31.12. sind keine) */
export function feiertage(jahr: number): Map<string, string> {
  const da = feiertagCache.get(jahr);
  if (da) return da;
  const o = ostern(jahr);
  const j = (mt: string) => `${jahr}-${mt}`;
  const m = new Map<string, string>([
    [j("01-01"), "Neujahr"],
    [j("01-06"), "Heilige Drei Könige"],
    [tageDazu(o, 1), "Ostermontag"],
    [j("05-01"), "Staatsfeiertag"],
    [tageDazu(o, 39), "Christi Himmelfahrt"],
    [tageDazu(o, 50), "Pfingstmontag"],
    [tageDazu(o, 60), "Fronleichnam"],
    [j("08-15"), "Mariä Himmelfahrt"],
    [j("10-26"), "Nationalfeiertag"],
    [j("11-01"), "Allerheiligen"],
    [j("12-08"), "Mariä Empfängnis"],
    [j("12-25"), "Christtag"],
    [j("12-26"), "Stefanitag"],
  ]);
  feiertagCache.set(jahr, m);
  return m;
}

export const feiertagName = (iso: string) => feiertage(Number(iso.slice(0, 4))).get(iso) ?? null;

/** Montag bis Freitag und kein Feiertag */
export function istArbeitstag(iso: string): boolean {
  const t = isoZuDatum(iso).getDay();
  return t !== 0 && t !== 6 && !feiertagName(iso);
}

/** Sollstunden eines Tages: Wochenstunden gleichmäßig auf Montag bis Freitag */
export const sollTag = (iso: string, wochenstunden: number) => (istArbeitstag(iso) ? wochenstunden / 5 : 0);

export function sollZeitraum(von: string, bis: string, wochenstunden: number): number {
  let s = 0;
  for (let t = von; t <= bis; t = tageDazu(t, 1)) s += sollTag(t, wochenstunden);
  return runden2(s);
}

export type AbwesenheitKurz = { art: string; von: string; bis: string; stunden: number | string | null; status?: string };

/** Die Arbeitstage einer Abwesenheit im Zeitraum — Wochenenden und Feiertage zählen nicht */
export function abwesenheitsTage(a: Pick<AbwesenheitKurz, "von" | "bis">, von = a.von, bis = a.bis): string[] {
  const tage: string[] = [];
  const start = a.von > von ? a.von : von, ende = a.bis < bis ? a.bis : bis;
  for (let t = start; t <= ende; t = tageDazu(t, 1)) if (istArbeitstag(t)) tage.push(t);
  return tage;
}

/** Stunden einer Abwesenheit an diesem Tag: was eingetragen ist, höchstens die Sollzeit */
export function abwesenheitStunden(a: Pick<AbwesenheitKurz, "stunden">, iso: string, wochenstunden: number): number {
  const soll = sollTag(iso, wochenstunden);
  return a.stunden == null ? soll : Math.min(Number(a.stunden), soll);
}

export type KontoProfil = { wochenstunden: number | string; urlaub_tage: number | string; konto_ab: string };
export type KontoBuchung = { art: string; menge: number | string; datum: string };

export type Konto = {
  soll: number; ist: number; korrektur: number;
  /** Überstunden: Ist − Soll + Korrekturen. Positiv = Guthaben */
  saldo: number;
  urlaubAnspruch: number; urlaubGenommen: number; urlaubGeplant: number; urlaubBeantragt: number; urlaubRest: number;
};

/**
 * Konto bis gestern gerechnet, damit der laufende Tag nicht als Minus zählt.
 * Zeitausgleich zählt nicht als Ist: er braucht Guthaben auf.
 * Urlaub je Kalenderjahr, Übertrag und Auszahlung als Kontobewegung.
 */
export function kontoRechnen(
  p: KontoProfil,
  zeiten: { datum: string; stunden: number | string }[],
  abwesenheiten: AbwesenheitKurz[],
  buchungen: KontoBuchung[],
  heute: string,
): Konto {
  const wochen = Number(p.wochenstunden);
  const bis = tageDazu(heute, -1);
  const soll = sollZeitraum(p.konto_ab, bis, wochen);
  let ist = zeiten.filter((z) => z.datum >= p.konto_ab && z.datum <= bis).reduce((s, z) => s + Number(z.stunden), 0);
  const genehmigt = abwesenheiten.filter((a) => (a.status ?? "genehmigt") === "genehmigt");
  for (const a of genehmigt) {
    if (a.art === "zeitausgleich") continue;
    for (const t of abwesenheitsTage(a, p.konto_ab, bis)) ist += abwesenheitStunden(a, t, wochen);
  }
  const jahr = heute.slice(0, 4);
  const imJahr = (t: string) => t.slice(0, 4) === jahr;
  const korrektur = buchungen.filter((b) => b.art === "ueberstunden").reduce((s, b) => s + Number(b.menge), 0);
  const urlaubKorrektur = buchungen.filter((b) => b.art === "urlaub" && imJahr(b.datum)).reduce((s, b) => s + Number(b.menge), 0);
  const urlaubTage = (liste: AbwesenheitKurz[]) => liste.filter((a) => a.art === "urlaub")
    .reduce((s, a) => s + abwesenheitsTage(a).filter(imJahr).length, 0);
  const genommen = genehmigt.filter((a) => a.art === "urlaub")
    .reduce((s, a) => s + abwesenheitsTage(a).filter((t) => imJahr(t) && t < heute).length, 0);
  const alleGenehmigt = urlaubTage(genehmigt);
  const beantragt = urlaubTage(abwesenheiten.filter((a) => a.status === "beantragt"));
  const anspruch = runden2(Number(p.urlaub_tage) + urlaubKorrektur);
  return {
    soll,
    ist: runden2(ist),
    korrektur: runden2(korrektur),
    saldo: runden2(ist - soll + korrektur),
    urlaubAnspruch: anspruch,
    urlaubGenommen: genommen,
    urlaubGeplant: alleGenehmigt - genommen,
    urlaubBeantragt: beantragt,
    urlaubRest: runden2(anspruch - alleGenehmigt),
  };
}

/**
 * Taggeld nach § 26 EStG: über 3 Stunden 1/12 je angefangener Stunde,
 * höchstens der ganze Satz. Nur ein Vorschlag für die Lohnverrechnung —
 * ob ein Anspruch besteht, regelt der Kollektivvertrag.
 */
export function taggeld(stundenAmTag: number, satz: number): number {
  if (!(stundenAmTag > 3) || !(satz > 0)) return 0;
  return runden2((Math.min(12, Math.ceil(stundenAmTag)) / 12) * satz);
}

export type LohnZeit = { datum: string; stunden: number | string; art?: string | null; projekt_id: string | null; km?: number | string | null; intern?: string | null };

export type LohnSumme = {
  soll: number; ist: number; differenz: number;
  arbeit: number; fahrt: number; ue50: number; ue100: number; garantie: number;
  /** auf Projekte gebucht / ohne Projekt (Büro, Lager … — je Art in jeIntern) */
  produktiv: number; unproduktiv: number; jeIntern: Record<string, number>;
  /** Abwesend je Art: Arbeitstage und Stunden */
  abwesend: Record<string, { tage: number; stunden: number }>;
  taggeldTage: number; taggeld: number; km: number; kmGeld: number;
};

/** Eine Person in einem Zeitraum — für Stundennachweis und Lohnliste */
export function lohnSumme(
  wochenstunden: number, von: string, bis: string, zeiten: LohnZeit[], abwesenheiten: AbwesenheitKurz[],
  saetze: { taggeld?: number | null; km?: number | null },
): LohnSumme {
  const summe = (art: string) => runden2(zeiten.filter((z) => (z.art ?? "arbeit") === art).reduce((s, z) => s + Number(z.stunden), 0));
  const abwesend: LohnSumme["abwesend"] = {};
  let abwesendStunden = 0;
  for (const a of abwesenheiten.filter((x) => (x.status ?? "genehmigt") === "genehmigt")) {
    const tage = abwesenheitsTage(a, von, bis);
    if (!tage.length) continue;
    const h = tage.reduce((s, t) => s + abwesenheitStunden(a, t, wochenstunden), 0);
    const e = abwesend[a.art] ?? { tage: 0, stunden: 0 };
    e.tage += tage.length;
    e.stunden = runden2(e.stunden + h);
    abwesend[a.art] = e;
    if (a.art !== "zeitausgleich") abwesendStunden += h;
  }
  const gearbeitet = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const soll = sollZeitraum(von, bis, wochenstunden);
  const ist = runden2(gearbeitet + abwesendStunden);
  const jeTag = new Map<string, number>();
  zeiten.filter((z) => z.projekt_id).forEach((z) => jeTag.set(z.datum, (jeTag.get(z.datum) ?? 0) + Number(z.stunden)));
  const tg = [...jeTag.values()].map((h) => taggeld(h, Number(saetze.taggeld ?? 0))).filter((x) => x > 0);
  const km = runden2(zeiten.reduce((s, z) => s + Number(z.km ?? 0), 0));
  const jeIntern: Record<string, number> = {};
  zeiten.filter((z) => !z.projekt_id).forEach((z) => { const k = z.intern || "Ohne Projekt"; jeIntern[k] = runden2((jeIntern[k] ?? 0) + Number(z.stunden)); });
  const unproduktiv = runden2(Object.values(jeIntern).reduce((s, x) => s + x, 0));
  return {
    soll, ist, differenz: runden2(ist - soll),
    arbeit: summe("arbeit"), fahrt: summe("fahrt"), ue50: summe("ue50"), ue100: summe("ue100"), garantie: summe("garantie"),
    produktiv: runden2(gearbeitet - unproduktiv), unproduktiv, jeIntern,
    abwesend,
    taggeldTage: tg.length,
    taggeld: runden2(tg.reduce((s, x) => s + x, 0)),
    km,
    kmGeld: runden2(km * Number(saetze.km ?? 0)),
  };
}

/** Anteil produktiver Stunden an den gebuchten in Prozent (ganze Zahl); ohne Stunden null */
export function produktivProzent(s: Pick<LohnSumme, "produktiv" | "unproduktiv">): number | null {
  const alle = s.produktiv + s.unproduktiv;
  return alle > 0 ? Math.round((s.produktiv / alle) * 100) : null;
}
