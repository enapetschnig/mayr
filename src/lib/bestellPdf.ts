import {
  FUSS_PLATZ, RAND, briefkopf, datenBlock, empfaengerBlock, fmt, fmtDatum, fmtMenge, fusszeilen, pdfDateiname, pdfLaden, platzPruefen, titelZeile,
} from "@/lib/pdfBasis";
import type { Firma } from "@/lib/types";
import { pdfText } from "@/components/regie/regieLogik";
import { bestellSumme } from "@/components/bestellung/bestellLogik";
import type { BestellungVoll } from "@/components/bestellung/bestellDaten";

/**
 * Bestellung an den Großhändler als A4-PDF: Lieferant, Lieferadresse
 * (Betrieb oder Baustelle), Positionen mit Artikelnummer des Lieferanten,
 * Hersteller-Nr. und EAN, Einkaufspreis laut Stamm, Summe netto.
 */

const letztesY = (pdf: unknown) => (pdf as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function bestellPdfErstellen(b: BestellungVoll, firma: Firma): Promise<{ blob: Blob; dateiname: string }> {
  const { pdf, autoTable } = await pdfLaden();
  const breite = pdf.internal.pageSize.getWidth() - 2 * RAND;
  const pos = b.bestell_positionen;
  const p = b.projekte;

  let y = await briefkopf(pdf, firma);
  const yKopf = y + 3;
  const yLinks = empfaengerBlock(pdf, { name: pdfText(b.lieferant) }, yKopf);
  const yRechts = datenBlock(pdf, [
    ["Bestellung", b.nummer ?? "–"],
    ["Datum", fmtDatum(b.datum)],
    ...(b.liefertermin ? [["Liefertermin", fmtDatum(b.liefertermin)] as [string, string]] : []),
    ...(p ? [["Projekt", pdfText(p.nummer)] as [string, string]] : []),
  ], yKopf);
  y = Math.max(yLinks, yRechts) + 8;
  y = titelZeile(pdf, `Bestellung ${b.nummer ?? ""}`.trim(), firma, y);

  // Lieferadresse
  const adresse = p
    ? [`Baustelle: ${p.name}`, p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")]
    : [firma.name, b.lagerorte?.name && b.lagerorte.name !== firma.name ? b.lagerorte.name : null, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")];
  pdf.setFontSize(9.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 100, 100);
  pdf.text("Lieferung an", RAND, y);
  pdf.setTextColor(0, 0, 0);
  const zeilen = adresse.filter((z): z is string => !!z?.trim()).map(pdfText);
  pdf.text(zeilen, RAND + 30, y);
  y += zeilen.length * 4.6 + 3;
  if (b.notiz?.trim()) {
    const n = pdf.splitTextToSize(pdfText(b.notiz.trim()), breite - 30) as string[];
    pdf.setTextColor(100, 100, 100);
    pdf.text("Hinweis", RAND, y);
    pdf.setTextColor(0, 0, 0);
    pdf.text(n, RAND + 30, y);
    y += n.length * 4.6 + 3;
  }
  y += 2;
  pdf.text("Wir bestellen zur Lieferung:", RAND, y);
  y += 4;

  const mitPreis = pos.some((x) => x.ek_preis != null);
  autoTable(pdf, {
    theme: "plain",
    startY: y,
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    styles: { font: "helvetica", fontSize: 9, textColor: [0, 0, 0], cellPadding: { top: 1.6, bottom: 1.6, left: 1.3, right: 1.3 } },
    headStyles: { fontStyle: "bold", fillColor: [242, 242, 242] },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [215, 215, 215] },
    head: [["Pos", "Art.-Nr.", "Bezeichnung", "Menge", "Einh.", ...(mitPreis ? ["EK", "Gesamt"] : [])]],
    body: pos.map((x, i) => {
      const a = x.artikel;
      const info = [a.hersteller, a.hersteller_nr, a.ean ? `EAN ${a.ean}` : null].filter(Boolean).join(" · ");
      return [
        String(i + 1),
        pdfText(a.artikelnummer ?? "–"),
        pdfText(info ? `${a.bezeichnung}\n${info}` : a.bezeichnung),
        fmtMenge(Number(x.menge)),
        pdfText(a.einheit),
        ...(mitPreis ? [x.ek_preis == null ? "–" : fmt(Number(x.ek_preis)), x.ek_preis == null ? "–" : fmt(Number(x.menge) * Number(x.ek_preis))] : []),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 26 },
      3: { halign: "right", cellWidth: 16 },
      4: { cellWidth: 12 },
      ...(mitPreis ? { 5: { halign: "right" as const, cellWidth: 19 }, 6: { halign: "right" as const, cellWidth: 21 } } : {}),
    },
    didParseCell: (d) => {
      if (d.section === "head" && [3, 5, 6].includes(d.column.index)) d.cell.styles.halign = "right";
    },
  });
  y = letztesY(pdf) + 6;

  if (mitPreis) {
    y = platzPruefen(pdf, y, 12);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Summe netto (laut unseren Einkaufspreisen)", RAND, y);
    pdf.text(`€ ${fmt(bestellSumme(pos))}`, RAND + breite, y, { align: "right" });
    y += 9;
  }
  y = platzPruefen(pdf, y, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(pdfText("Bitte bestätigen Sie Liefertermin und Preise. Bei Teillieferungen bitte die Bestellnummer auf dem Lieferschein angeben."), RAND, y, { maxWidth: breite });
  y += 10;
  pdf.text(pdfText(`Mit freundlichen Grüßen\n${firma.inhaber || firma.name}`), RAND, y);

  fusszeilen(pdf, firma);
  return { blob: pdf.output("blob"), dateiname: pdfDateiname("Bestellung", b.nummer, b.lieferant) };
}
