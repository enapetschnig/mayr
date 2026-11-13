import { FOERDER_STATUS, type FoerderStatus, type StatusEintrag } from "@/lib/types";

/**
 * Förderstatus am Projekt (PV in Österreich). Getestet in foerderung.test.ts.
 */

/** Vorschläge fürs Feld Förderstelle — frei überschreibbar */
export const FOERDER_STELLEN = ["OeMAG (EAG-Investitionszuschuss)", "Klima- und Energiefonds", "Land Steiermark", "Gemeinde"];

/** Schritte, bei denen noch etwas zu tun ist — nur dort zählt eine Frist */
const OFFEN: FoerderStatus[] = ["vorbereitet", "eingereicht", "zugesagt", "fertig_gemeldet"];

export const istFoerderStatus = (s: string | null | undefined): s is FoerderStatus => !!s && s in FOERDER_STATUS;

/** Pille für Kachel und Kopf: „Förderung zugesagt“ — ohne Erfassung oder „keine“ nichts */
export function foerderPille(status: string | null | undefined): StatusEintrag | null {
  if (!istFoerderStatus(status) || status === "keine") return null;
  const e = FOERDER_STATUS[status];
  return { ...e, text: status === "vorbereitet" ? "Förderantrag vorbereitet" : `Förderung ${e.text.toLowerCase()}` };
}

const tageZwischen = (von: string, bis: string) =>
  Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);

/**
 * Steht eine Frist an? Nur bei offenen Schritten, überfällig oder in den
 * nächsten `tage` Tagen. `inTagen` < 0 = überfällig.
 */
export function foerderFrist(
  p: { foerder_status: string | null; foerder_frist: string | null },
  heute: string,
  tage = 30,
): { inTagen: number; ueberfaellig: boolean } | null {
  if (!p.foerder_frist || !istFoerderStatus(p.foerder_status) || !OFFEN.includes(p.foerder_status)) return null;
  const inTagen = tageZwischen(heute, p.foerder_frist);
  if (inTagen > tage) return null;
  return { inTagen, ueberfaellig: inTagen < 0 };
}

/** „heute“, „in 5 Tagen“, „seit 3 Tagen vorbei“ */
export function fristText(inTagen: number): string {
  if (inTagen === 0) return "heute";
  if (inTagen === 1) return "morgen";
  if (inTagen > 0) return `in ${inTagen} Tagen`;
  return inTagen === -1 ? "seit gestern vorbei" : `seit ${-inTagen} Tagen vorbei`;
}
