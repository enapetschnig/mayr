import type { Termin } from "@/lib/types";
import { amTag } from "@/lib/plantafel";

/**
 * Terminplaner — die Plantafel mit getauschten Achsen (wie SETECs alter
 * Terminplaner): Spalten = Leute nach Gruppen, Zeilen = Tage mit Uhrzeiten.
 * Ohne Datenbank, getestet in terminplaner.test.ts.
 */

type Person = { id: string; rolle: string; gruppe?: string | null };
type TeamKurz = { id: string; name: string; mitglieder: string[] };

export type Gruppe<P extends Person> = { schluessel: string; titel: string; leute: P[]; teamId?: string };

export const GESCHAEFTSFUEHRUNG = "Geschäftsführung";
export const OHNE_TEAM = "Ohne Team";

/** „Max“ → „Team Max“, „Team 1“ bleibt */
export const teamTitel = (name: string) => (/^team\b/i.test(name.trim()) ? name.trim() : `Team ${name.trim()}`);

/** In welche Gruppe gehört jemand? Eigene Gruppe vor Team, sonst Chef = Geschäftsführung */
export function gruppeVon(p: Person, teams: TeamKurz[]): { schluessel: string; titel: string; teamId?: string } {
  const eigene = p.gruppe?.trim();
  if (eigene) return { schluessel: `g:${eigene.toLowerCase()}`, titel: eigene };
  const team = teams.find((t) => t.mitglieder.includes(p.id));
  if (team) return { schluessel: `t:${team.id}`, titel: teamTitel(team.name), teamId: team.id };
  if (p.rolle === "chef") return { schluessel: `g:${GESCHAEFTSFUEHRUNG.toLowerCase()}`, titel: GESCHAEFTSFUEHRUNG };
  return { schluessel: "ohne", titel: OHNE_TEAM };
}

/**
 * Spaltengruppen in der Reihenfolge des Terminplaners: Geschäftsführung,
 * die anderen Gruppen (Büro, Lager … nach Alphabet), die Teams in ihrer
 * Reihenfolge, zuletzt „Ohne Team“. Leere Gruppen fallen weg.
 */
export function gruppenBilden<P extends Person>(leute: P[], teams: TeamKurz[]): Gruppe<P>[] {
  const map = new Map<string, Gruppe<P>>();
  for (const p of leute) {
    const g = gruppeVon(p, teams);
    if (!map.has(g.schluessel)) map.set(g.schluessel, { ...g, leute: [] });
    map.get(g.schluessel)!.leute.push(p);
  }
  const rang = (g: Gruppe<P>) => {
    if (g.schluessel === `g:${GESCHAEFTSFUEHRUNG.toLowerCase()}`) return 0;
    if (g.schluessel.startsWith("g:")) return 1;
    if (g.teamId) return 2 + teams.findIndex((t) => t.id === g.teamId) / 1000;
    return 3;
  };
  return [...map.values()].sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, "de"));
}

/** „07:30“ → 450 */
export function minuten(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
}

/** 450 → „07:30“ */
export const zeitAus = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Auf 15 Minuten runden (oder ein anderes Raster) */
export const einrasten = (min: number, raster = 15) => Math.round(min / raster) * raster;

type ZeitTermin = Pick<Termin, "datum" | "bis_datum" | "ganztags" | "von" | "bis">;

/**
 * Wo liegt ein Einsatz an einem Tag (in Minuten ab Mitternacht)?
 * Ganztägig oder ohne Uhrzeit = der ganze sichtbare Tag; mehrtägig mit
 * Uhrzeit = dieselbe Zeit an jedem Tag. null = an dem Tag nicht.
 */
export function zeitLage(t: ZeitTermin, tag: string, tagAb: number, tagBis: number): { oben: number; unten: number; ganz: boolean } | null {
  if (!amTag(t, tag)) return null;
  const von = minuten(t.von);
  if (t.ganztags || von === null) return { oben: tagAb, unten: tagBis, ganz: true };
  const bisRoh = minuten(t.bis);
  const bis = bisRoh !== null && bisRoh > von ? bisRoh : von + 60;
  const oben = Math.max(tagAb, Math.min(von, tagBis - 15));
  const unten = Math.min(tagBis, Math.max(bis, oben + 15));
  return { oben, unten, ganz: false };
}

/**
 * Sichtbare Stunden: 6–18 Uhr, weiter, wenn ein Einsatz früher anfängt oder
 * später aufhört. Ergebnis in Minuten.
 */
export function stundenBereich(termine: ZeitTermin[], tage: string[], ab = 6, bis = 18): [number, number] {
  let a = ab * 60, b = bis * 60;
  for (const t of termine) {
    if (t.ganztags || !t.von || !tage.some((tag) => amTag(t, tag))) continue;
    const v = minuten(t.von)!, e = minuten(t.bis) ?? v + 60;
    a = Math.min(a, Math.floor(v / 60) * 60);
    b = Math.max(b, Math.ceil(Math.max(e, v + 60) / 60) * 60);
  }
  return [Math.max(0, a), Math.min(24 * 60, b)];
}

/**
 * Überlappende Blöcke in einer Zelle nebeneinander: Spalte je Block und wie
 * viele Spalten seine Überlappungsgruppe braucht (wie in jedem Kalender).
 */
export function nebeneinander<T extends { id: string; oben: number; unten: number }>(liste: T[]): Map<string, { spalte: number; anzahl: number }> {
  const sortiert = [...liste].sort((a, b) => a.oben - b.oben || b.unten - a.unten);
  const erg = new Map<string, { spalte: number; anzahl: number }>();
  let haufen: { id: string; spalte: number }[] = [];
  let haufenEnde = -1;
  let enden: number[] = [];
  const abschliessen = () => {
    const anzahl = enden.length;
    for (const h of haufen) erg.set(h.id, { spalte: h.spalte, anzahl });
    haufen = []; enden = [];
  };
  for (const b of sortiert) {
    if (haufen.length && b.oben >= haufenEnde) abschliessen();
    let s = enden.findIndex((e) => e <= b.oben);
    if (s < 0) { s = enden.length; enden.push(0); }
    enden[s] = b.unten;
    haufen.push({ id: b.id, spalte: s });
    haufenEnde = Math.max(haufen.length === 1 ? 0 : haufenEnde, b.unten);
  }
  abschliessen();
  return erg;
}

/**
 * Einsatz im Terminplaner gezogen: um ganze Tage und Minuten verschoben,
 * evtl. in die Spalte einer anderen Person. Die Uhrzeit bleibt im Tag
 * (0–24 Uhr), die Dauer bleibt gleich. Ganztägiges bekommt keine Uhrzeit.
 * `griff = "unten"` zieht nur das Ende.
 */
export function planVerschieben(
  t: ZeitTermin & Pick<Termin, "mitarbeiter">,
  v: { tage: number; minuten: number; vonPerson?: string; nachPerson?: string; griff?: "mitte" | "unten" },
  tageDazu: (iso: string, n: number) => string,
): Pick<Termin, "datum" | "bis_datum" | "von" | "bis" | "mitarbeiter"> {
  let von = t.von, bis = t.bis;
  const v0 = minuten(t.von);
  if (!t.ganztags && v0 !== null) {
    const b0 = minuten(t.bis) ?? v0 + 60;
    if (v.griff === "unten") {
      bis = zeitAus(Math.min(24 * 60 - 15, Math.max(v0 + 15, b0 + v.minuten)));
    } else {
      const dauer = Math.max(15, b0 - v0);
      const neu = Math.max(0, Math.min(24 * 60 - dauer, v0 + v.minuten));
      von = zeitAus(neu);
      bis = zeitAus(Math.min(24 * 60 - 1, neu + dauer));
    }
  }
  const tage = v.griff === "unten" ? 0 : v.tage;
  let mitarbeiter = [...t.mitarbeiter];
  if (v.nachPerson && v.vonPerson && v.nachPerson !== v.vonPerson && v.griff !== "unten") {
    mitarbeiter = mitarbeiter.filter((x) => x !== v.vonPerson && x !== v.nachPerson);
    mitarbeiter.push(v.nachPerson);
  }
  return {
    datum: tageDazu(t.datum, tage),
    bis_datum: t.bis_datum ? tageDazu(t.bis_datum, tage) : null,
    von: von ? von.slice(0, 5) : von,
    bis: bis ? bis.slice(0, 5) : bis,
    mitarbeiter,
  };
}

/** Kalenderwoche nach ISO 8601 */
export function kalenderwoche(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

/** Farbe einer Abwesenheit wie im alten Terminplaner: krank rot, sonst grün (Urlaub, ZA), Schule/Arzt gelb */
export function abwesenheitTon(art: string | null | undefined): "rot" | "gruen" | "gelb" {
  if (art === "krank") return "rot";
  if (art === "berufsschule" || art === "arzt") return "gelb";
  return "gruen";
}
