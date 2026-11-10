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
      case "projekt": return [z.projekt_id ?? "-", z.projekt ?? "Ohne Projekt"];
      case "tag": return [z.datum, z.datum];
      case "woche": { const w = isoWoche(z.datum); return [w, `KW ${Number(w.slice(6))} / ${w.slice(0, 4)}`]; }
      default: return [z.art, artText(z.art)];
    }
  };
  const m = new Map<string, Gruppe>();
  zeilen.forEach((z) => {
    const [k, t] = schluessel(z);
    const g = m.get(k) ?? { schluessel: k, titel: t, stunden: 0, km: 0, jeArt: {}, zeilen: [] };
    g.stunden = r2(g.stunden + z.stunden);
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
