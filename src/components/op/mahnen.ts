import { mahnPdfErstellen } from "@/lib/mahnPdf";
import { runden2 } from "@/lib/preise";
import type { Firma } from "@/lib/types";
import type { Mahnung, OpBeleg, Zahlung } from "./opDaten";

/**
 * PDF einer festgehaltenen Mahnung — „bezahlt“ zählt nur Zahlungen bis zum
 * Mahntag, damit eine später nachgedruckte Mahnung dasselbe zeigt wie die
 * verschickte.
 */
export function mahnungPdf(
  firma: Firma,
  rechnung: Pick<OpBeleg, "nummer" | "datum" | "faellig_am" | "brutto" | "empf_name" | "empf_zusatz" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_uid">,
  zahlungen: Pick<Zahlung, "betrag" | "datum">[],
  mahnung: Pick<Mahnung, "stufe" | "datum" | "frist_bis" | "offen" | "spesen" | "zinsen">,
) {
  const bezahlt = runden2(zahlungen.filter((z) => z.datum <= mahnung.datum).reduce((s, z) => s + Number(z.betrag), 0));
  return mahnPdfErstellen({
    firma,
    rechnung,
    bezahlt,
    mahnung: { ...mahnung, offen: Number(mahnung.offen), spesen: Number(mahnung.spesen), zinsen: Number(mahnung.zinsen) },
    zinssatz: Number(firma.verzugszinsen),
  });
}
