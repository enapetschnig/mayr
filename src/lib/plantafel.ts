import type { Team, Termin } from "@/lib/types";
import { tageDazu } from "@/lib/format";

/**
 * Plantafel: wer und was ist wo eingeteilt, wo hakt es, und was passiert
 * beim Ziehen. Ohne Datenbank, getestet in plantafel.test.ts.
 */

export type PlanTermin = Pick<Termin, "id" | "datum" | "bis_datum" | "ganztags" | "von" | "bis" | "mitarbeiter" | "fahrzeuge" | "team_id">;

/** Eine Zeile der Plantafel */
export type Zeile =
  | { art: "team"; id: string }
  | { art: "person"; id: string }
  | { art: "fahrzeug"; id: string }
  | { art: "offen" };

export const amTag = (t: Pick<Termin, "datum" | "bis_datum">, tag: string) => t.datum <= tag && (t.bis_datum ?? t.datum) >= tag;

const minuten = (hhmm: string | null | undefined, sonst: number) => {
  if (!hhmm) return sonst;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Belegen zwei Einsätze am selben Tag dieselbe Zeit? Ganztägig belegt den ganzen Tag. */
export function ueberschneiden(a: PlanTermin, b: PlanTermin, tag: string): boolean {
  if (!amTag(a, tag) || !amTag(b, tag)) return false;
  // mehrtägig mit Uhrzeit („Mo–Mi 7–15:30“): die Zeit gilt an jedem Tag
  const spanne = (t: PlanTermin): [number, number] => {
    if (t.ganztags || !t.von) return [0, 24 * 60];
    const start = minuten(t.von, 0);
    const ende = minuten(t.bis, 24 * 60);
    return [start, ende > start ? ende : 24 * 60];
  };
  const [a1, a2] = spanne(a);
  const [b1, b2] = spanne(b);
  return a1 < b2 && b1 < a2;
}

export type Konflikt = {
  art: "person_doppelt" | "person_abwesend" | "fahrzeug_doppelt";
  tag: string;
  /** Person oder Fahrzeug */
  ressource: string;
  termine: string[];
};

/**
 * Alle Konflikte in den gezeigten Tagen: eine Person oder ein Fahrzeug in
 * zwei Einsätzen zur selben Zeit, oder eine Person ist eingeteilt, aber
 * abwesend (Urlaub, krank, Berufsschule).
 */
export function konflikte(
  termine: PlanTermin[],
  tage: string[],
  abwesend: { user_id: string; von: string; bis: string }[],
): Konflikt[] {
  const liste: Konflikt[] = [];
  for (const tag of tage) {
    const heute = termine.filter((t) => amTag(t, tag));
    const doppelt = (feld: "mitarbeiter" | "fahrzeuge", art: Konflikt["art"]) => {
      const ids = new Set(heute.flatMap((t) => t[feld]));
      for (const id of ids) {
        const mit = heute.filter((t) => t[feld].includes(id));
        const betroffen = new Set<string>();
        for (let i = 0; i < mit.length; i++) {
          for (let j = i + 1; j < mit.length; j++) {
            if (ueberschneiden(mit[i], mit[j], tag)) { betroffen.add(mit[i].id); betroffen.add(mit[j].id); }
          }
        }
        if (betroffen.size) liste.push({ art, tag, ressource: id, termine: [...betroffen] });
      }
    };
    doppelt("mitarbeiter", "person_doppelt");
    doppelt("fahrzeuge", "fahrzeug_doppelt");
    for (const a of abwesend.filter((x) => x.von <= tag && x.bis >= tag)) {
      const mit = heute.filter((t) => t.mitarbeiter.includes(a.user_id));
      if (mit.length) liste.push({ art: "person_abwesend", tag, ressource: a.user_id, termine: mit.map((t) => t.id) });
    }
  }
  return liste;
}

/** Tage zwischen zwei Daten (b − a) */
export function tageZwischen(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export type Aenderung = Pick<Termin, "datum" | "bis_datum" | "mitarbeiter" | "fahrzeuge" | "team_id">;

const ohne = (liste: string[], id: string | null | undefined) => (id ? liste.filter((x) => x !== id) : liste);
const mit = (liste: string[], id: string | null | undefined) => (id && !liste.includes(id) ? [...liste, id] : liste);

/**
 * Einsatz von einer Zelle in eine andere gezogen. Der Tag verschiebt den
 * ganzen Einsatz (mehrtägig bleibt mehrtägig). Die Zeile entscheidet, wer
 * oder was ihn übernimmt:
 * - Team: das Team mit seinen Leuten und seinem Bus
 * - Person / Fahrzeug: tauscht gegen die Person / das Fahrzeug der alten Zeile,
 *   sonst kommt sie dazu
 * - „Nicht eingeteilt“: die alte Zeile fällt weg
 */
export function ablegen(
  t: PlanTermin,
  von: { zeile: Zeile; tag: string },
  nach: { zeile: Zeile; tag: string },
  teams: Pick<Team, "id" | "mitglieder" | "fahrzeug_id">[],
): Aenderung {
  const verschub = tageZwischen(von.tag, nach.tag);
  let mitarbeiter = [...t.mitarbeiter];
  let fahrzeuge = [...t.fahrzeuge];
  let team_id = t.team_id;
  const alt = von.zeile;
  const neu = nach.zeile;
  const gleicheZeile = alt.art === neu.art && (alt.art === "offen" || (neu.art !== "offen" && alt.id === neu.id));

  if (!gleicheZeile) {
    // aus der alten Zeile lösen
    if (alt.art === "person") mitarbeiter = ohne(mitarbeiter, alt.id);
    if (alt.art === "fahrzeug") fahrzeuge = ohne(fahrzeuge, alt.id);
    if (alt.art === "team" && (neu.art === "team" || neu.art === "offen")) {
      const altTeam = teams.find((x) => x.id === alt.id);
      mitarbeiter = mitarbeiter.filter((m) => !altTeam?.mitglieder.includes(m));
      fahrzeuge = ohne(fahrzeuge, altTeam?.fahrzeug_id);
      team_id = null;
    }
    // in die neue Zeile
    if (neu.art === "team") {
      const neuTeam = teams.find((x) => x.id === neu.id);
      team_id = neu.id;
      for (const m of neuTeam?.mitglieder ?? []) mitarbeiter = mit(mitarbeiter, m);
      fahrzeuge = mit(fahrzeuge, neuTeam?.fahrzeug_id);
    }
    if (neu.art === "person") mitarbeiter = mit(mitarbeiter, neu.id);
    if (neu.art === "fahrzeug") fahrzeuge = mit(fahrzeuge, neu.id);
  }

  return {
    datum: tageDazu(t.datum, verschub),
    bis_datum: t.bis_datum ? tageDazu(t.bis_datum, verschub) : null,
    mitarbeiter,
    fahrzeuge,
    team_id,
  };
}

/** Person oder Fahrzeug aus der Seitenleiste auf einen Einsatz gezogen */
export function zuweisen(t: PlanTermin, was: { art: "person" | "fahrzeug"; id: string }): Pick<Termin, "mitarbeiter" | "fahrzeuge"> {
  return was.art === "person"
    ? { mitarbeiter: mit(t.mitarbeiter, was.id), fahrzeuge: t.fahrzeuge }
    : { mitarbeiter: t.mitarbeiter, fahrzeuge: mit(t.fahrzeuge, was.id) };
}

/** In welcher Zeile steht der Einsatz? (ein Einsatz kann in mehreren stehen) */
export function inZeile(t: PlanTermin, z: Zeile): boolean {
  if (z.art === "team") return t.team_id === z.id;
  if (z.art === "person") return t.mitarbeiter.includes(z.id);
  if (z.art === "fahrzeug") return t.fahrzeuge.includes(z.id);
  return !t.team_id && t.mitarbeiter.length === 0;
}
