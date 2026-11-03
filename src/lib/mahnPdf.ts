import { STUFE_TEXT, type Stufe } from "@/components/op/opLogik";
import {
  RAND, briefkopf, datenBlock, empfaengerBlock, eur, fmt, fmtDatum, fusszeilen, pdfDateiname, pdfLaden, platzPruefen,
  titelZeile, zahlungsQr,
} from "@/lib/pdfBasis";
import { runden2 } from "@/lib/preise";
import type { Beleg, Firma } from "@/lib/types";

/**
 * Zahlungserinnerung / Mahnung als A4-PDF: Briefkopf, Empfänger aus der
 * Rechnung, Tabelle Rechnung – bezahlt – offen, Spesen und Zinsen, neue
 * Frist, Bankverbindung mit Bezahl-QR über den Gesamtbetrag. Der Ton wird
 * mit der Stufe deutlicher; die letzte Mahnung kündigt Inkasso an.
 */

export type MahnPdfDaten = {
  firma: Firma;
  rechnung: Pick<Beleg, "nummer" | "datum" | "faellig_am" | "brutto" | "empf_name" | "empf_zusatz" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_uid">;
  /** bis zum Mahntag bezahlt */
  bezahlt: number;
  mahnung: { stufe: number; datum: string; frist_bis: string; offen: number; spesen: number; zinsen: number };
  /** Zinssatz p. a. — steht im Text, wenn Zinsen verrechnet werden */
  zinssatz: number;
};

const TEXT: Record<Stufe, (frist: string) => string[]> = {
  1: (frist) => [
    "sicher ist es Ihrer Aufmerksamkeit entgangen: Für die unten angeführte Rechnung konnten wir noch keinen vollständigen Zahlungseingang feststellen.",
    `Wir ersuchen Sie, den offenen Betrag bis ${frist} zu überweisen. Haben Sie inzwischen bezahlt, betrachten Sie dieses Schreiben bitte als gegenstandslos.`,
  ],
  2: (frist) => [
    "leider ist die unten angeführte Rechnung trotz unserer Zahlungserinnerung noch nicht beglichen.",
    `Bitte überweisen Sie den Gesamtbetrag bis ${frist}. Haben Sie inzwischen bezahlt, betrachten Sie dieses Schreiben bitte als gegenstandslos.`,
  ],
  3: (frist) => [
    "trotz Zahlungserinnerung und Mahnung ist die unten angeführte Rechnung weiterhin offen.",
    `Wir ersuchen Sie letztmalig, den Gesamtbetrag bis ${frist} zu bezahlen. Geht bis dahin keine Zahlung ein, übergeben wir die Forderung ohne weitere Ankündigung zur Eintreibung; die dadurch entstehenden Kosten gehen zu Ihren Lasten.`,
  ],
};

export function mahnGesamt(m: { offen: number; spesen: number; zinsen: number }): number {
  return runden2(Number(m.offen) + Number(m.spesen) + Number(m.zinsen));
}

export async function mahnPdfErstellen({ firma, rechnung, bezahlt, mahnung, zinssatz }: MahnPdfDaten): Promise<{ blob: Blob; dateiname: string }> {
  const { pdf, autoTable } = await pdfLaden();
  const bw = pdf.internal.pageSize.getWidth();
  const breite = bw - 2 * RAND;
  const stufe = Math.min(3, Math.max(1, mahnung.stufe)) as Stufe;
  const titel = STUFE_TEXT[stufe];
  const gesamt = mahnGesamt(mahnung);

  let y = await briefkopf(pdf, firma);
  const yStart = y + 2;
  const yLinks = empfaengerBlock(pdf, {
    zusatz: rechnung.empf_zusatz, name: rechnung.empf_name, strasse: rechnung.empf_strasse,
    plz: rechnung.empf_plz, ort: rechnung.empf_ort, uid: rechnung.empf_uid,
  }, yStart);
  const yRechts = datenBlock(pdf, [
    ["Datum", fmtDatum(mahnung.datum)],
    ["Rechnung Nr.", rechnung.nummer || "–"],
    ["Zahlbar bis", fmtDatum(mahnung.frist_bis)],
  ], yStart);
  y = Math.max(yLinks, yRechts) + 6;
  y = titelZeile(pdf, `${titel} zu Rechnung ${rechnung.nummer ?? ""}`.trim(), firma, y);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const absatz = (text: string) => {
    const z = pdf.splitTextToSize(text, breite);
    y = platzPruefen(pdf, y, z.length * 4.3 + 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(z, RAND, y);
    y += z.length * 4.3 + 3;
  };
  absatz("Sehr geehrte Damen und Herren,");
  TEXT[stufe](fmtDatum(mahnung.frist_bis)).forEach(absatz);
  y += 1;

  // ── Aufstellung ──
  const zeilen: [string, string][] = [
    [`Rechnung ${rechnung.nummer ?? ""} vom ${fmtDatum(rechnung.datum)}, fällig am ${fmtDatum(rechnung.faellig_am)}`, fmt(Number(rechnung.brutto))],
  ];
  if (bezahlt > 0) zeilen.push(["abzüglich bereits bezahlt", fmt(-bezahlt)]);
  zeilen.push(["Offener Rechnungsbetrag", fmt(Number(mahnung.offen))]);
  if (Number(mahnung.zinsen) > 0) zeilen.push([`Verzugszinsen ${fmt(zinssatz).replace(",00", "")} % p. a. ab Fälligkeit`, fmt(Number(mahnung.zinsen))]);
  if (Number(mahnung.spesen) > 0) zeilen.push(["Mahnspesen", fmt(Number(mahnung.spesen))]);
  autoTable(pdf, {
    startY: y,
    margin: { left: RAND, right: RAND },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1, right: 1 } },
    columnStyles: { 1: { halign: "right", cellWidth: 35 } },
    body: zeilen.map(([t, b]) => [t, b]),
    didParseCell: (d) => {
      if (d.row.index === zeilen.findIndex((z) => z[0] === "Offener Rechnungsbetrag")) d.cell.styles.fontStyle = "bold";
    },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 1;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.line(bw - RAND - 90, y, bw - RAND, y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text("Zu zahlen", bw - RAND - 37, y + 5.5, { align: "right" });
  pdf.text(eur(gesamt), bw - RAND - 1, y + 5.5, { align: "right" });
  y += 14;

  // ── Bank + QR über den Gesamtbetrag ──
  if (firma.iban) {
    const qr = await zahlungsQr(firma, gesamt, rechnung.nummer || "");
    y = platzPruefen(pdf, y, qr ? 26 : 8);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Bankverbindung: ${firma.name}${firma.bank_name ? ` · ${firma.bank_name}` : ""}`, RAND, y);
    pdf.text(`IBAN: ${firma.iban}${firma.bic ? ` · BIC: ${firma.bic}` : ""}`, RAND, y + 4.5);
    pdf.text(`Zahlungsreferenz: ${rechnung.nummer ?? ""}`, RAND, y + 9);
    if (qr) {
      try {
        pdf.addImage(qr, "PNG", bw - RAND - 24, y - 4, 24, 24);
        pdf.setFontSize(6);
        pdf.setTextColor(110, 110, 110);
        pdf.text("Mit der Banking-App scannen", bw - RAND - 12, y + 23, { align: "center" });
        pdf.setTextColor(0, 0, 0);
      } catch { /* ohne QR */ }
      y += 28;
    } else {
      y += 14;
    }
  }
  absatz("Mit freundlichen Grüßen");
  pdf.setFont("helvetica", "bold");
  pdf.text(firma.inhaber || firma.name, RAND, y);

  fusszeilen(pdf, firma);
  const dateiname = pdfDateiname(titel, rechnung.nummer, rechnung.empf_name);
  pdf.setProperties({ title: dateiname.replace(/\.pdf$/, ""), author: firma.name, creator: firma.name });
  return { blob: pdf.output("blob"), dateiname };
}
