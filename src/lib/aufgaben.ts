import { datum, isoZuDatum } from "@/lib/format";
import type { StatusEintrag } from "@/lib/types";

/**
 * Aufgaben für Mitarbeiter: was ist offen, was überfällig, wie sortiert —
 * ohne Datenbank (getestet in aufgaben.test.ts). Erledigt-Stempel,
 * Verlauf und Wiederholung macht der Server (Migration 20261113117000).
 */

export type AufgabeKurz = {
  id: string;
  titel: string;
  status: string;
  faellig_am: string | null;
  prioritaet: string;
  zustaendig: string[];
  projekt_id: string | null;
  erstellt_von: string | null;
  created_at: string;
};

export type AufgabenFilter = "offen" | "ueberfaellig" | "erledigt" | "alle";

export const PRIORITAET: Record<string, StatusEintrag & { rang: number }> = {
  hoch: { ton: "rot", text: "Dringend", rang: 0 },
  normal: { ton: "grau", text: "Normal", rang: 1 },
  niedrig: { ton: "grau", text: "Wenn Zeit ist", rang: 2 },
};

export const WIEDERHOLUNG: Record<string, string> = {
  taeglich: "Jeden Tag",
  woechentlich: "Jede Woche",
  monatlich: "Jeden Monat",
  jaehrlich: "Jedes Jahr",
};

export const istErledigt = (a: Pick<AufgabeKurz, "status">) => a.status === "erledigt";

export const istUeberfaellig = (a: Pick<AufgabeKurz, "status" | "faellig_am">, heute: string) =>
  !istErledigt(a) && !!a.faellig_am && a.faellig_am < heute;

/** Für die Pille: überfällig geht vor offen / in Arbeit */
export const anzeigeStatus = (a: Pick<AufgabeKurz, "status" | "faellig_am">, heute: string) =>
  (istUeberfaellig(a, heute) ? "ueberfaellig" : a.status);

/** Überfällig zuerst, dann nach Fälligkeit (ohne Termin zuletzt), Dringendes vor Normalem; Erledigtes ganz unten */
export function sortieren<T extends AufgabeKurz>(liste: T[], heute: string): T[] {
  const rang = (a: T) => (istErledigt(a) ? 2 : istUeberfaellig(a, heute) ? 0 : 1);
  return [...liste].sort((a, b) =>
    rang(a) - rang(b)
    || (istErledigt(a) ? 0 : (a.faellig_am ?? "9999").localeCompare(b.faellig_am ?? "9999"))
    || (PRIORITAET[a.prioritaet]?.rang ?? 1) - (PRIORITAET[b.prioritaet]?.rang ?? 1)
    || (istErledigt(a) ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
}

export function filtern<T extends AufgabeKurz>(
  liste: T[],
  f: { status: AufgabenFilter; person?: string | null; projekt?: string | null },
  heute: string,
): T[] {
  return liste.filter((a) =>
    (f.status === "alle"
      || (f.status === "erledigt" && istErledigt(a))
      || (f.status === "offen" && !istErledigt(a))
      || (f.status === "ueberfaellig" && istUeberfaellig(a, heute)))
    && (!f.person || a.zustaendig.includes(f.person) || (f.person === "-" && a.zustaendig.length === 0))
    && (!f.projekt || a.projekt_id === f.projekt));
}

export function zaehlen(liste: AufgabeKurz[], heute: string) {
  const offen = liste.filter((a) => !istErledigt(a));
  return {
    offen: offen.length,
    ueberfaellig: offen.filter((a) => istUeberfaellig(a, heute)).length,
    heute: offen.filter((a) => a.faellig_am === heute).length,
    erledigt: liste.length - offen.length,
  };
}

/** „heute“, „morgen“, „seit 3 Tagen“, „in 5 Tagen“, sonst das Datum */
export function faelligText(faellig: string | null, heute: string): string {
  if (!faellig) return "ohne Termin";
  const tage = Math.round((isoZuDatum(faellig).getTime() - isoZuDatum(heute).getTime()) / 86_400_000);
  if (tage === 0) return "heute fällig";
  if (tage === 1) return "morgen fällig";
  if (tage === -1) return "seit gestern fällig";
  if (tage < 0) return `seit ${-tage} Tagen fällig`;
  if (tage < 7) return `in ${tage} Tagen fällig`;
  return `fällig ${datum(faellig)}`;
}

/** Ein Eintrag im Verlauf als Satz */
export function verlaufText(e: { art: string; text: string | null }, statusText: (s: string) => string): string {
  switch (e.art) {
    case "angelegt": return e.text ? `hat angelegt — ${e.text}` : "hat die Aufgabe angelegt";
    case "status": return `Status: ${statusText(e.text ?? "")}`;
    case "geaendert": return e.text ?? "hat geändert";
    default: return e.text ?? "";
  }
}
