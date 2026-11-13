import { FUSS_PLATZ, RAND, eur, fmt, fmtMenge, fusszeilen, pdfLaden, platzPruefen, titelZeile } from "@/lib/pdfBasis";
import { pdfText } from "@/components/regie/regieLogik";
import { uhrzeit } from "@/lib/format";
import { ABWESENHEIT_ART, STUNDEN_ART, type AbwesenheitArt, type Firma, type StundenArt } from "@/lib/types";
import { produktivProzent, type LohnSumme } from "@/lib/zeitkonto";

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
  art: string | null;
  projekt: string;
  regiebericht: string;
};

export type StundenPerson = {
  name: string;
  zeilen: StundenZeile[];
  /** Abwesend je Tag, steht in der Tagesliste zwischen den Stunden */
  abwesend: { datum: string; art: string; stunden: number }[];
  summe: LohnSumme;
};

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
  const abwesendTage = (s: LohnSumme) => Object.values(s.abwesend).reduce((x, a) => x + a.tage, 0);
  const summeAlle = (f: (s: LohnSumme) => number) => personen.reduce((x, p) => x + f(p.summe), 0);
  // Unproduktiv = intern (Büro, Lager …) mit Anteil an den gebuchten Stunden
  const unprod = (s: LohnSumme) => (s.unproduktiv > 0 ? `${h(s.unproduktiv)} (${100 - (produktivProzent(s) ?? 100)} %)` : "–");
  autoTable(pdf, {
    ...tabelle,
    startY: y,
    head: [["Mitarbeiter", "Soll", "Ist", "Differenz", "Unproduktiv", "Abwesend", "Taggeld", "km"]],
    body: personen.map((p) => [pdfText(p.name), h(p.summe.soll), h(p.summe.ist), h(p.summe.differenz), unprod(p.summe), `${abwesendTage(p.summe)} T.`, fmt(p.summe.taggeld), fmtMenge(p.summe.km)]),
    foot: [["Summe", h(summeAlle((s) => s.soll)), h(summeAlle((s) => s.ist)), h(summeAlle((s) => s.differenz)), h(summeAlle((s) => s.unproduktiv)), `${summeAlle(abwesendTage)} T.`, fmt(summeAlle((s) => s.taggeld)), fmtMenge(summeAlle((s) => s.km))]],
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    didParseCell: (d) => { if (d.section !== "body" && d.column.index > 0) d.cell.styles.halign = "right"; },
  });

  // Je Mitarbeiter eine Seite
  for (const p of personen) {
    pdf.addPage();
    y = kopf(`${p.name} — ${zeitraum}`);
    const zeilen = [
      ...p.zeilen.map((z) => ({ ...z, abw: false })),
      ...p.abwesend.map((a) => ({
        datum: a.datum, von: null, bis: null, pause_minuten: null, stunden: a.stunden, taetigkeit: null, art: null,
        projekt: ABWESENHEIT_ART[a.art as AbwesenheitArt]?.text ?? a.art, regiebericht: "", abw: true,
      })),
    ].sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? "").localeCompare(b.von ?? ""));
    const s = p.summe;
    autoTable(pdf, {
      ...tabelle,
      startY: y,
      head: [["Tag", "Von – Bis", "Pause", "Stunden", "Projekt / Tätigkeit"]],
      body: zeilen.map((z) => [
        tag(z.datum),
        z.von && z.bis ? `${uhrzeit(z.von)} – ${uhrzeit(z.bis)}` : "",
        z.pause_minuten ? `${z.pause_minuten} Min.` : "",
        h(z.stunden),
        pdfText([z.abw ? z.projekt : z.projekt || "Ohne Projekt", z.regiebericht && `(${z.regiebericht})`, z.art && z.art !== "arbeit" ? `· ${STUNDEN_ART[z.art as StundenArt]?.text ?? z.art}` : ""].filter(Boolean).join(" ")
          + (z.taetigkeit?.trim() ? `\n${z.taetigkeit.trim()}` : "")),
      ]),
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 26 }, 2: { cellWidth: 18 }, 3: { cellWidth: 20, halign: "right" } },
    });
    // Summen für die Lohnverrechnung
    const posten: [string, string][] = [
      ["Soll", h(s.soll)], ["Ist (mit Abwesenheit)", h(s.ist)], ["Differenz", h(s.differenz)],
      ...([["Arbeit", s.arbeit], ["Fahrzeit", s.fahrt], ["Überstunden 50 %", s.ue50], ["Überstunden 100 %", s.ue100], ["Garantie", s.garantie]] as [string, number][])
        .filter(([, n]) => n > 0).map(([t, n]): [string, string] => [t, h(n)]),
      ...(s.unproduktiv > 0 ? [
        ["Produktiv (auf Projekten)", `${h(s.produktiv)} (${produktivProzent(s)} %)`] as [string, string],
        [`Unproduktiv: ${Object.entries(s.jeIntern).map(([a, n]) => `${a} ${h(n)}`).join(", ")}`, h(s.unproduktiv)] as [string, string],
      ] : []),
      ...Object.entries(s.abwesend).map(([a, w]): [string, string] => [ABWESENHEIT_ART[a as AbwesenheitArt]?.text ?? a, `${w.tage} T. / ${h(w.stunden)}`]),
      ...(s.taggeld > 0 ? [[`Taggeld (${s.taggeldTage} Tage, Vorschlag)`, eur(s.taggeld)] as [string, string]] : []),
      ...(s.km > 0 ? [[`Kilometer (${fmtMenge(s.km)} km)`, eur(s.kmGeld)] as [string, string]] : []),
    ];
    autoTable(pdf, {
      ...tabelle,
      startY: letztesY(pdf) + 5,
      body: posten,
      tableWidth: 95,
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (d) => { if (d.row.index < 3) d.cell.styles.fontStyle = "bold"; },
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
