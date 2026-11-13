/**
 * Stundenauswertung: filtern und gruppieren ohne Datenbank — nach
 * Mitarbeiter, Projekt, Tag, Woche oder Art. Getestet in stundenAuswertung.test.ts.
 */

export type ZeitZeile = {
  id: string;
  user_id: string;
  person: string;
  projekt_id: string | null;
  projekt: string | null;
  datum: string;
  stunden: number;
  art: string;
  km: number | null;
  verrechnet: boolean;
  /** Uhrzeit „07:00“ — fehlt bei Buchungen nur mit Stunden */
  von?: string | null;
  bis?: string | null;
  pause_minuten?: number | null;
  taetigkeit?: string | null;
  /** Stunden ohne Projekt: Büro, Lager … (unproduktiv) */
  intern?: string | null;
};

export type Gruppierung = "person" | "projekt" | "tag" | "woche" | "art";

export type Filter = {
  personen: string[];
  projekte: string[];
  arten: string[];
  /** nur verrechnete / nur offene / alle */
  verrechnet: "alle" | "ja" | "nein";
};

export type Gruppe = {
  schluessel: string;
  titel: string;
  stunden: number;
  km: number;
  jeArt: Record<string, number>;
  /** davon ohne Projekt (intern) */
  unproduktiv: number;
  zeilen: ZeitZeile[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ISO-Kalenderwoche: „2026-W46“ (Montag als erster Tag, Woche mit dem 4. Jänner ist W1) */
export function isoWoche(iso: string): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  const wt = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wt);
  const jahrBeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const woche = Math.ceil(((d.getTime() - jahrBeginn.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(woche).padStart(2, "0")}`;
}

export function filtern(zeilen: ZeitZeile[], f: Filter): ZeitZeile[] {
  return zeilen.filter((z) => (!f.personen.length || f.personen.includes(z.user_id))
    && (!f.projekte.length || f.projekte.includes(z.projekt_id ?? "-"))
    && (!f.arten.length || f.arten.includes(z.art))
    && (f.verrechnet === "alle" || (f.verrechnet === "ja") === z.verrechnet));
}

export function gruppieren(zeilen: ZeitZeile[], nach: Gruppierung, artText: (a: string) => string = (a) => a): Gruppe[] {
  const schluessel = (z: ZeitZeile): [string, string] => {
    switch (nach) {
      case "person": return [z.user_id, z.person];
      case "projekt": return z.projekt_id ? [z.projekt_id, z.projekt ?? "?"] : [`-${z.intern ?? ""}`, z.intern ? `Intern · ${z.intern}` : "Ohne Projekt"];
      case "tag": return [z.datum, z.datum];
      case "woche": { const w = isoWoche(z.datum); return [w, `KW ${Number(w.slice(6))} / ${w.slice(0, 4)}`]; }
      default: return [z.art, artText(z.art)];
    }
  };
  const m = new Map<string, Gruppe>();
  zeilen.forEach((z) => {
    const [k, t] = schluessel(z);
    const g = m.get(k) ?? { schluessel: k, titel: t, stunden: 0, km: 0, jeArt: {}, unproduktiv: 0, zeilen: [] };
    g.stunden = r2(g.stunden + z.stunden);
    if (!z.projekt_id) g.unproduktiv = r2(g.unproduktiv + z.stunden);
    g.km = r2(g.km + (z.km ?? 0));
    g.jeArt[z.art] = r2((g.jeArt[z.art] ?? 0) + z.stunden);
    g.zeilen.push(z);
    m.set(k, g);
  });
  const liste = [...m.values()];
  liste.forEach((g) => g.zeilen.sort((a, b) => a.datum.localeCompare(b.datum) || a.person.localeCompare(b.person, "de")));
  // Zeit nach der Zeit, alles andere nach Stunden (meiste zuerst)
  return nach === "tag" || nach === "woche"
    ? liste.sort((a, b) => a.schluessel.localeCompare(b.schluessel))
    : liste.sort((a, b) => b.stunden - a.stunden || a.titel.localeCompare(b.titel, "de"));
}

/** Ein Arbeitstag einer Person: von wann bis wann, mit den einzelnen Blöcken */
export type Tag = {
  user_id: string;
  person: string;
  datum: string;
  /** frühester Beginn / spätestes Ende, „HH:MM“; null = nur Stunden gebucht */
  beginn: string | null;
  ende: string | null;
  pause: number;
  stunden: number;
  bloecke: { von: string; bis: string; art: string; projekt: string | null; taetigkeit: string | null }[];
  ohneZeit: number;
  projekte: string[];
  hinweise: string[];
};

const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.round(n % 60)).padStart(2, "0")}`;

/**
 * Von–Bis je Person und Tag. Hinweise: Beginn vor 6:00, Ende nach 19:00,
 * mehr als 10 Stunden, Blöcke überschneiden sich, Lücke über einer Stunde.
 */
export function tagesnachweis(zeilen: ZeitZeile[]): Tag[] {
  const m = new Map<string, ZeitZeile[]>();
  zeilen.forEach((z) => { const k = `${z.user_id}|${z.datum}`; m.set(k, [...(m.get(k) ?? []), z]); });
  return [...m.values()].map((liste) => {
    const mitZeit = liste.filter((z) => z.von && z.bis).sort((a, b) => a.von!.localeCompare(b.von!));
    const bloecke = mitZeit.map((z) => ({ von: z.von!.slice(0, 5), bis: z.bis!.slice(0, 5), art: z.art, projekt: z.projekt, taetigkeit: z.taetigkeit ?? null }));
    const stunden = r2(liste.reduce((s, z) => s + z.stunden, 0));
    const hinweise: string[] = [];
    const beginn = bloecke.length ? bloecke[0].von : null;
    const ende = bloecke.length ? bloecke.reduce((e, b) => (b.bis > e ? b.bis : e), bloecke[0].bis) : null;
    if (beginn && min(beginn) < 6 * 60) hinweise.push("Beginn vor 6 Uhr");
    if (ende && min(ende) > 19 * 60) hinweise.push("Ende nach 19 Uhr");
    if (stunden > 10) hinweise.push("über 10 Stunden");
    for (let i = 1; i < bloecke.length; i++) {
      const vorEnde = Math.max(...bloecke.slice(0, i).map((b) => min(b.bis)));
      if (min(bloecke[i].von) < vorEnde) { hinweise.push("Zeiten überschneiden sich"); break; }
      if (min(bloecke[i].von) - vorEnde > 60) { hinweise.push("Lücke über 1 Stunde"); break; }
    }
    const z0 = liste[0];
    return {
      user_id: z0.user_id, person: z0.person, datum: z0.datum, beginn, ende,
      pause: liste.reduce((s, z) => s + (z.pause_minuten ?? 0), 0),
      stunden, bloecke,
      ohneZeit: r2(liste.filter((z) => !z.von || !z.bis).reduce((s, z) => s + z.stunden, 0)),
      projekte: [...new Set(liste.map((z) => z.projekt ?? "Ohne Projekt"))],
      hinweise,
    };
  }).sort((a, b) => a.person.localeCompare(b.person, "de") || a.datum.localeCompare(b.datum));
}

/** Ø Beginn und Ø Ende über die Tage mit Uhrzeit */
export function schnitt(tage: Pick<Tag, "beginn" | "ende">[]): { beginn: string | null; ende: string | null } {
  const b = tage.filter((t) => t.beginn).map((t) => min(t.beginn!));
  const e = tage.filter((t) => t.ende).map((t) => min(t.ende!));
  const avg = (l: number[]) => (l.length ? hhmm(l.reduce((s, x) => s + x, 0) / l.length) : null);
  return { beginn: avg(b), ende: avg(e) };
}
