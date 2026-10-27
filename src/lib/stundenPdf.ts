import { FUSS_PLATZ, RAND, fmtMenge, fusszeilen, pdfLaden, platzPruefen, titelZeile } from "@/lib/pdfBasis";
import { pdfText } from "@/components/regie/regieLogik";
import { uhrzeit } from "@/lib/format";
import type { Firma } from "@/lib/types";

/**
 * Stundennachweis eines Monats (oder Jahres) als PDF — für die
 * Lohnverrechnung: vorne die Summen je Mitarbeiter, dann je Mitarbeiter eine
 * eigene Seite mit allen Tagen und Platz für die Unterschriften.
 */

export type StundenZeile = {
  datum: string;
  von: string | null;
  bis: string | null;
  pause_minuten: number | null;
  stunden: number;
  taetigkeit: string | null;
  projekt: string;
  regiebericht: string;
};

export type StundenPerson = { name: string; zeilen: StundenZeile[] };

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const tag = (iso: string) => {
  const [j, m, t] = iso.split("-");
  return `${WOCHENTAG[new Date(Number(j), Number(m) - 1, Number(t)).getDay()]} ${t}.${m}.`;
};
const h = (n: number) => `${fmtMenge(Math.round(n * 100) / 100)} h`;
const letztesY = (pdf: unknown) => (pdf as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function stundenPdf(firma: Firma, zeitraum: string, personen: StundenPerson[]): Promise<Blob> {
  const { pdf, autoTable } = await pdfLaden();
  const tabelle = {
    theme: "plain" as const,
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    styles: { font: "helvetica", fontSize: 9, textColor: [0, 0, 0] as [number, number, number], cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 } },
    headStyles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [215, 215, 215] as [number, number, number] },
    footStyles: { fontStyle: "bold" as const, lineWidth: { top: 0.3 }, lineColor: [0, 0, 0] as [number, number, number] },
  };
  const kopf = (titel: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    pdf.text(pdfText(firma.name), RAND, 15);
    pdf.setTextColor(0, 0, 0);
    return titelZeile(pdf, pdfText(titel), firma, 24);
  };

  // Übersicht
  let y = kopf(`Stundennachweis ${zeitraum}`);
  const summen = personen.map((p) => ({
    name: p.name,
    tage: new Set(p.zeilen.map((z) => z.datum)).size,
    stunden: p.zeilen.reduce((s, z) => s + z.stunden, 0),
    projekt: p.zeilen.filter((z) => z.projekt).reduce((s, z) => s + z.stunden, 0),
  }));
  autoTable(pdf, {
    ...tabelle,
    startY: y,
    head: [["Mitarbeiter", "Arbeitstage", "auf Projekten", "Stunden"]],
    body: summen.map((s) => [pdfText(s.name), String(s.tage), h(s.projekt), h(s.stunden)]),
    foot: [["Summe", "", h(summen.reduce((x, s) => x + s.projekt, 0)), h(summen.reduce((x, s) => x + s.stunden, 0))]],
    columnStyles: { 1: { halign: "right", cellWidth: 28 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 28 } },
    didParseCell: (d) => { if (d.section !== "body" && d.column.index > 0) d.cell.styles.halign = "right"; },
  });

  // Je Mitarbeiter eine Seite
  for (const p of personen) {
    pdf.addPage();
    y = kopf(`${p.name} — ${zeitraum}`);
    const zeilen = [...p.zeilen].sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? "").localeCompare(b.von ?? ""));
    const summe = zeilen.reduce((s, z) => s + z.stunden, 0);
    autoTable(pdf, {
      ...tabelle,
      startY: y,
      head: [["Tag", "Von – Bis", "Pause", "Stunden", "Projekt / Tätigkeit"]],
      body: zeilen.map((z) => [
        tag(z.datum),
        z.von && z.bis ? `${uhrzeit(z.von)} – ${uhrzeit(z.bis)}` : "",
        z.pause_minuten ? `${z.pause_minuten} Min.` : "",
        h(z.stunden),
        pdfText([z.projekt || "Ohne Projekt", z.regiebericht && `(${z.regiebericht})`].filter(Boolean).join(" ")
          + (z.taetigkeit?.trim() ? `\n${z.taetigkeit.trim()}` : "")),
      ]),
      foot: [["Summe", "", "", h(summe), `${new Set(zeilen.map((z) => z.datum)).size} Arbeitstage`]],
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 26 }, 2: { cellWidth: 18 }, 3: { cellWidth: 20, halign: "right" } },
      didParseCell: (d) => { if (d.section !== "body" && d.column.index === 3) d.cell.styles.halign = "right"; },
    });
    // Unterschriften — nie über den Seitenumbruch
    y = platzPruefen(pdf, letztesY(pdf) + 18, 22);
    const bw = pdf.internal.pageSize.getWidth();
    const breite = (bw - 2 * RAND - 20) / 2;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.line(RAND, y, RAND + breite, y);
    pdf.line(bw - RAND - breite, y, bw - RAND, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Datum, Unterschrift Mitarbeiter", RAND, y + 4);
    pdf.text("Datum, Unterschrift Betrieb", bw - RAND - breite, y + 4);
  }

  fusszeilen(pdf, firma);
  return pdf.output("blob");
}
