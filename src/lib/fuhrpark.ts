import type { Fahrzeug } from "@/lib/types";
import { tageDazu } from "@/lib/format";

/**
 * Fuhrpark: was ist fällig (Pickerl, Service, Prüfung)? Ohne Datenbank,
 * getestet in fuhrpark.test.ts.
 */

/** So viele Tage vorher gilt etwas als „bald fällig“ */
export const VORLAUF_TAGE = 30;

export type Faelligkeit = { was: string; datum: string; ueberfaellig: boolean };

const PRUEFUNG_TEXT: Record<string, string> = {
  steiger: "Prüfung",
  messgeraet: "Kalibrierung",
  maschine: "Prüfung",
};

export const pruefungText = (art: string) => PRUEFUNG_TEXT[art] ?? "Prüfung";

/** Alles, was überfällig oder in den nächsten 30 Tagen fällig ist — das Früheste zuerst */
export function faelligkeiten(
  f: Pick<Fahrzeug, "art" | "pickerl_bis" | "service_bis" | "pruefung_bis" | "gemietet" | "aktiv">,
  heute: string,
): Faelligkeit[] {
  if (!f.aktiv || f.gemietet) return [];
  const grenze = tageDazu(heute, VORLAUF_TAGE);
  const liste: Faelligkeit[] = [];
  const dazu = (was: string, datum: string | null) => {
    if (datum && datum <= grenze) liste.push({ was, datum, ueberfaellig: datum < heute });
  };
  dazu("Pickerl", f.pickerl_bis);
  dazu("Service", f.service_bis);
  dazu(pruefungText(f.art), f.pruefung_bis);
  return liste.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Kurz für Pillen und Listen: „Pickerl überfällig“, „Service bis 12.11.“ */
export function faelligText(x: Faelligkeit, datumKurz: (iso: string) => string): string {
  return x.ueberfaellig ? `${x.was} überfällig` : `${x.was} bis ${datumKurz(x.datum)}`;
}
