import type { Beleg, Firma } from "@/lib/types";
import { runden2 } from "@/lib/preise";

/**
 * Offene Posten und Mahnen: Rechnen ohne Datenbank — offener Rest,
 * Verzug, Spesen, Zinsen, nächste Mahnstufe. Getestet in opLogik.test.ts.
 *
 * Status „bezahlt“ setzt die Datenbank aus der Summe der Zahlungen
 * (Trigger `zahlungen_status`), nie die App.
 */

export type ZahlungArt = "zahlung" | "skonto" | "ausbuchung";
export const ZAHLUNG_ART: Record<ZahlungArt, string> = {
  zahlung: "Zahlung",
  skonto: "Skonto",
  ausbuchung: "Ausgebucht",
};

export type Stufe = 1 | 2 | 3;
export const STUFE_TEXT: Record<Stufe, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "Letzte Mahnung",
};

type ZahlungMini = { betrag: number | string };
type MahnungMini = { stufe: number; datum: string; frist_bis: string };

/** Was auf der Rechnung noch fehlt (nie unter 0) */
export function offenBetrag(brutto: number | string, zahlungen: ZahlungMini[]): number {
  const bezahlt = zahlungen.reduce((s, z) => s + Number(z.betrag), 0);
  return Math.max(0, runden2(Number(brutto) - bezahlt));
}

/** Tage nach der Fälligkeit (0, solange nicht überfällig) */
export function verzugTage(faelligAm: string | null | undefined, stichtag: string): number {
  if (!faelligAm || stichtag <= faelligAm) return 0;
  return Math.round((Date.parse(stichtag) - Date.parse(faelligAm)) / 86_400_000);
}

/** Verzugszinsen: offen × Satz p. a. × Tage / 365, kaufmännisch gerundet */
export function verzugszinsen(offen: number, prozentProJahr: number, tage: number): number {
  if (offen <= 0 || prozentProJahr <= 0 || tage <= 0) return 0;
  return runden2((offen * prozentProJahr * tage) / 36500);
}

/** Spesen je Stufe aus den Einstellungen (`firma.mahn_spesen` = [Erinnerung, 1. Mahnung, letzte]) */
export function mahnSpesen(spesen: Firma["mahn_spesen"], stufe: Stufe): number {
  const liste = Array.isArray(spesen) ? spesen : [];
  const wert = Number(liste[stufe - 1]);
  return isFinite(wert) && wert > 0 ? runden2(wert) : 0;
}

/** Nächste Stufe nach den schon geschriebenen Mahnungen — null, wenn die letzte Mahnung draußen ist */
export function naechsteStufe(mahnungen: Pick<MahnungMini, "stufe">[]): Stufe | null {
  const hoechste = mahnungen.reduce((m, x) => Math.max(m, x.stufe), 0);
  return hoechste >= 3 ? null : ((hoechste + 1) as Stufe);
}

export type MahnVorschlag = { stufe: Stufe; offen: number; spesen: number; zinsen: number; frist_bis: string; tage: number };

/**
 * Was die nächste Mahnung enthält. Die Zahlungserinnerung ist freundlich: ohne
 * Zinsen (Spesen nur, wenn eingestellt). Ab der 1. Mahnung Zinsen ab Fälligkeit.
 * null = nichts zu mahnen (bezahlt, nicht fällig, oder schon letzte Mahnung).
 */
export function mahnVorschlag(
  beleg: Pick<Beleg, "brutto" | "faellig_am" | "status">,
  zahlungen: ZahlungMini[],
  mahnungen: MahnungMini[],
  firma: Pick<Firma, "mahn_frist_tage" | "mahn_spesen" | "verzugszinsen">,
  heute: string,
): MahnVorschlag | null {
  if (beleg.status !== "offen") return null;
  const offen = offenBetrag(beleg.brutto, zahlungen);
  const tage = verzugTage(beleg.faellig_am, heute);
  const stufe = naechsteStufe(mahnungen);
  if (offen <= 0 || tage <= 0 || !stufe) return null;
  const frist = new Date(Date.parse(heute) + Number(firma.mahn_frist_tage || 10) * 86_400_000).toISOString().slice(0, 10);
  return {
    stufe,
    offen,
    spesen: mahnSpesen(firma.mahn_spesen, stufe),
    zinsen: stufe === 1 ? 0 : verzugszinsen(offen, Number(firma.verzugszinsen), tage),
    frist_bis: frist,
    tage,
  };
}

/** Ist die letzte Mahnung abgelaufen (Frist vorbei, noch offen)? Dann ist die nächste dran. */
export function mahnFristAbgelaufen(mahnungen: MahnungMini[], heute: string): boolean {
  if (!mahnungen.length) return true;
  const letzte = [...mahnungen].sort((a, b) => b.stufe - a.stufe)[0];
  return letzte.frist_bis < heute;
}
