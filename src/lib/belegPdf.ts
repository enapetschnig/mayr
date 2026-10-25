import type { CellHookData, RowInput } from "jspdf-autotable";
import { ohneBetrag, positionsNummern, zwischensummen } from "@/components/belege/editor";
import {
  FUSS_PLATZ, RAND, briefkopf, datenBlock, empfaengerBlock, eur, fmt, fmtDatum, fmtMenge, fusszeilen,
  pdfDateiname, pdfLaden, platzPruefen, titelZeile, zahlungsQr,
} from "@/lib/pdfBasis";
import { belegSummen, runden2 } from "@/lib/preise";
import type { Beleg, Firma } from "@/lib/types";

/**
 * Angebot und Rechnung als A4-PDF: Briefkopf aus `firma`, Empfänger,
 * Datenblock, Positionen mit Räumen (Titel fett, Zwischensumme), Langtext
 * klein unter der Bezeichnung, Summen, Reverse-Charge-/Kleinunternehmer-
 * Hinweis, Zahlungsziel mit Bezahl-QR, Fußzeile. Entwürfe tragen „ENTWURF“.
 */

export type PdfPosition = {
  art: string;
  bezeichnung: string;
  langtext?: string | null;
  menge: number;
  einheit: string;
  einzelpreis: number;
};

export type BelegPdfDaten = {
  beleg: Pick<
    Beleg,
    | "typ" | "nummer" | "status" | "datum" | "leistung_von" | "leistung_bis" | "gueltig_bis" | "faellig_am"
    | "betreff" | "einleitung" | "schlusstext" | "ust_satz" | "reverse_charge"
    | "empf_name" | "empf_zusatz" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_uid"
  >;
  positionen: PdfPosition[];
  firma: Firma;
  projekt?: { nummer: string; name: string; strasse?: string | null; plz?: string | null; ort?: string | null } | null;
};

const GRAU: [number, number, number] = [110, 110, 110];

export async function belegPdfErstellen({ beleg, positionen, firma, projekt }: BelegPdfDaten): Promise<{ blob: Blob; dateiname: string }> {
  const { pdf, autoTable } = await pdfLaden();
  const bw = pdf.internal.pageSize.getWidth();
  const bh = pdf.internal.pageSize.getHeight();
  const breite = bw - 2 * RAND;
  const istAngebot = beleg.typ === "angebot";
  const typText = istAngebot ? "Angebot" : "Rechnung";
  const entwurf = beleg.status === "entwurf" || !beleg.nummer;
  const rc = !!beleg.reverse_charge && !firma.kleinunternehmer;
  const klein = !!firma.kleinunternehmer;
  const s = belegSummen(positionen, Number(beleg.ust_satz ?? 20), rc || klein);

  // ── Kopf ──
  let y = await briefkopf(pdf, firma);
  const yStart = y + 2;
  const yLinks = empfaengerBlock(pdf, {
    zusatz: beleg.empf_zusatz,
    name: beleg.empf_name,
    strasse: beleg.empf_strasse,
    plz: beleg.empf_plz,
    ort: beleg.empf_ort,
    uid: beleg.empf_uid,
  }, yStart);

  const daten: [string, string][] = [
    [`${typText} Nr.`, beleg.nummer || "Entwurf"],
    [istAngebot ? "Datum" : "Rechnungsdatum", fmtDatum(beleg.datum)],
  ];
  if (istAngebot) {
    if (beleg.gueltig_bis) daten.push(["Gültig bis", fmtDatum(beleg.gueltig_bis)]);
  } else {
    const von = beleg.leistung_von || beleg.leistung_bis;
    const bis = beleg.leistung_bis || beleg.leistung_von;
    if (von && bis && von !== bis) daten.push(["Leistungszeitraum", `${fmtDatum(von)} –\n${fmtDatum(bis)}`]);
    else if (von) daten.push(["Leistungsdatum", fmtDatum(von)]);
    if (beleg.faellig_am) daten.push(["Fällig am", fmtDatum(beleg.faellig_am)]);
  }
  if (projekt?.nummer) daten.push(["Projekt", projekt.nummer]);
  const yRechts = datenBlock(pdf, daten, yStart);

  y = Math.max(yLinks, yRechts) + 6;
  y = titelZeile(pdf, entwurf ? `${typText} – Entwurf` : `${typText} ${beleg.nummer}`, firma, y);

  if (beleg.betreff?.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    const z = pdf.splitTextToSize(beleg.betreff.trim(), breite);
    pdf.text(z, RAND, y);
    y += z.length * 4.8 + 1;
  }
  if (projekt?.name) {
    const ort = [projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...GRAU);
    const z = pdf.splitTextToSize(`Bauvorhaben: ${projekt.name}${ort ? ` · ${ort}` : ""}`, breite);
    pdf.text(z, RAND, y);
    pdf.setTextColor(0, 0, 0);
    y += z.length * 4 + 1;
  }
  if (beleg.einleitung?.trim()) {
    y += 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const z = pdf.splitTextToSize(beleg.einleitung.trim(), breite);
    pdf.text(z, RAND, y);
    y += z.length * 4.3;
  }
  y += 3;

  // ── Positionen ──
  const nummern = positionsNummern(positionen.map((p) => p.art));
  const gesamt = positionen.map((p) => (ohneBetrag(p) ? 0 : runden2(Number(p.menge) * Number(p.einzelpreis))));
  const zs = zwischensummen(positionen.map((p, i) => ({ art: p.art, gesamt: gesamt[i] })));
  const titelAnzahl = positionen.filter((p) => p.art === "titel").length;
  const zeilen: Zeile[] = [];
  let offen: { i: number; name: string; anzahl: number } | null = null;

  const zwischensumme = () => {
    if (!offen || titelAnzahl < 2 || offen.anzahl === 0) return;
    zeilen.push({
      zeile: [
        { content: "" },
        { content: `Summe ${offen.name}`, colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        { content: fmt(zs[offen.i] ?? 0), styles: { halign: "right", fontStyle: "bold" } },
      ],
    });
  };
  const langtextVon = (p: PdfPosition) => {
    const lang = p.langtext?.trim();
    return lang ? { kurz: p.bezeichnung, lang } : undefined;
  };
  const mitLangtext = (p: PdfPosition) => {
    const lang = p.langtext?.trim();
    return lang ? `${p.bezeichnung}\n${lang}` : p.bezeichnung;
  };

  positionen.forEach((p, i) => {
    if (p.art === "titel") {
      zwischensumme();
      offen = { i, name: p.bezeichnung, anzahl: 0 };
      zeilen.push({
        titel: true,
        lang: langtextVon(p),
        zeile: [
          { content: nummern[i], styles: { fontStyle: "bold" } },
          { content: mitLangtext(p), colSpan: 5, styles: { fontStyle: "bold", fontSize: 10 } },
        ],
      });
      return;
    }
    if (p.art === "text") {
      zeilen.push({
        zeile: [
          { content: "" },
          { content: [p.bezeichnung, p.langtext?.trim()].filter(Boolean).join("\n"), colSpan: 5, styles: { fontStyle: "italic", textColor: [80, 80, 80] as [number, number, number] } },
        ],
      });
      return;
    }
    if (offen) offen.anzahl += 1;
    zeilen.push({
      lang: langtextVon(p),
      zeile: [nummern[i], mitLangtext(p), fmtMenge(Number(p.menge)), p.einheit, fmt(Number(p.einzelpreis)), fmt(gesamt[i])],
    });
  });
  zwischensumme();

  // Ein Raum-Titel soll nicht allein unten auf einer Seite stehen: Probelauf
  // auf einem leeren Dokument, verwaiste Titel bekommen davor einen
  // unsichtbaren Abstand bis zum Seitenende (wiederholt, weil sich danach
  // alles verschiebt)
  const startY = y;
  const abstaende = new Map<number, number>();
  for (let runde = 0; runde < 10; runde++) {
    const probe = (await pdfLaden()).pdf;
    const lage = new Map<number, { seite: number; y: number }>();
    positionenTabelle(probe, autoTable, zeilen, abstaende, startY, (i, seite, zy) => { if (!lage.has(i)) lage.set(i, { seite, y: zy }); });
    let neu = false;
    zeilen.forEach((z, i) => {
      const a = lage.get(i);
      const b = lage.get(i + 1);
      if (!z.titel || abstaende.has(i) || !a || !b || b.seite <= a.seite) return;
      abstaende.set(i, Math.max(0.5, bh - FUSS_PLATZ - a.y - 0.5));
      neu = true;
    });
    if (!neu) break;
  }
  positionenTabelle(pdf, autoTable, zeilen, abstaende, startY);
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Summen ──
  const summen: [string, number, boolean][] = rc || klein
    ? [[rc ? "Gesamtbetrag netto" : "Gesamtbetrag", s.netto, true]]
    : [
      ["Nettobetrag", s.netto, false],
      [`USt ${fmt(Number(beleg.ust_satz ?? 20)).replace(",00", "")} %`, s.ust, false],
      ["Gesamtbetrag", s.brutto, true],
    ];
  y = platzPruefen(pdf, y, summen.length * 7 + 12);
  y += 2;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.line(bw - RAND - 90, y, bw - RAND, y);
  summen.forEach(([text, betrag, fett]) => {
    if (fett && summen.length > 1) {
      pdf.setLineWidth(0.6);
      pdf.line(bw - RAND - 90, y + 1, bw - RAND, y + 1);
    }
    pdf.setFont("helvetica", fett ? "bold" : "normal");
    pdf.setFontSize(fett ? 10.5 : 9);
    pdf.text(text, bw - RAND - 32, y + 5, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(eur(betrag), bw - RAND - 1, y + 5, { align: "right" });
    y += 7;
  });
  y += 6;

  // ── Steuerhinweis ──
  const hinweis = (fettZeile: string | null, zeilen: string[]) => {
    y = platzPruefen(pdf, y, 6 + zeilen.length * 4);
    if (fettZeile) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text(fettZeile, RAND, y);
      y += 4;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    zeilen.forEach((z) => { pdf.text(z, RAND, y, { maxWidth: breite }); y += 4; });
    y += 3;
  };
  if (rc) {
    hinweis("Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)", [
      "Die Steuerschuld geht auf den Leistungsempfänger über (§ 19 Abs. 1a UStG).",
      beleg.empf_uid ? `UID des Leistungsempfängers: ${beleg.empf_uid}` : "UID des Leistungsempfängers: –",
    ]);
  } else if (klein) {
    hinweis(null, ["Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG."]);
  }

  // ── Schlusstext, Gültigkeit, Zahlung ──
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const absatz = (text: string, abstand = 3) => {
    const z = pdf.splitTextToSize(text, breite);
    y = platzPruefen(pdf, y, z.length * 4.3 + abstand);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(z, RAND, y);
    y += z.length * 4.3 + abstand;
  };

  if (istAngebot) {
    absatz(beleg.gueltig_bis
      ? `Dieses Angebot ist gültig bis ${fmtDatum(beleg.gueltig_bis)}.`
      : `Dieses Angebot ist ${firma.angebot_gueltig_tage} Tage ab Angebotsdatum gültig.`);
  } else if (beleg.status !== "storniert") {
    absatz(beleg.faellig_am
      ? `Zahlbar bis ${fmtDatum(beleg.faellig_am)} ohne Abzug.${beleg.nummer ? ` Bitte geben Sie als Zahlungsreferenz ${beleg.nummer} an.` : ""}`
      : `Zahlbar innerhalb von ${firma.zahlungsziel_tage} Tagen ohne Abzug.`);
  }
  if (beleg.schlusstext?.trim()) absatz(beleg.schlusstext.trim());

  // Bankverbindung + Bezahl-QR nur auf einer offenen Rechnung
  if (!istAngebot && firma.iban && (beleg.status === "offen" || beleg.status === "entwurf")) {
    const betrag = rc || klein ? s.netto : s.brutto;
    const qr = beleg.status === "offen" ? await zahlungsQr(firma, betrag, beleg.nummer || "") : null;
    // so viel braucht der Block unter y wirklich: QR samt Beschriftung bis
    // y + 25,5, ohne QR zwei Zeilen — mehr schiebt ihn grundlos auf eine neue Seite
    y = platzPruefen(pdf, y, qr ? 26 : 8);
    y += 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Bankverbindung: ${firma.name}${firma.bank_name ? ` · ${firma.bank_name}` : ""}`, RAND, y);
    pdf.text(`IBAN: ${firma.iban}${firma.bic ? ` · BIC: ${firma.bic}` : ""}`, RAND, y + 4.5);
    if (qr) {
      try {
        pdf.addImage(qr, "PNG", bw - RAND - 24, y - 4, 24, 24);
        pdf.setFontSize(6);
        pdf.setTextColor(...GRAU);
        pdf.text("Mit der Banking-App scannen", bw - RAND - 12, y + 23, { align: "center" });
        pdf.setTextColor(0, 0, 0);
      } catch { /* ohne QR */ }
      y += 26;
    } else {
      y += 10;
    }
  }

  fusszeilen(pdf, firma);

  // Entwurf / Storniert quer über jede Seite
  const stempel = entwurf ? "ENTWURF" : beleg.status === "storniert" ? "STORNIERT" : null;
  if (stempel) {
    const seiten = pdf.getNumberOfPages();
    for (let i = 1; i <= seiten; i++) {
      pdf.setPage(i);
      try {
        pdf.saveGraphicsState();
        const G = (pdf as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
        pdf.setGState(new G({ opacity: 0.09 }));
        pdf.setTextColor(0, 0, 0);
      } catch {
        pdf.setTextColor(225, 225, 225);
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(90);
      // gedreht um die Seitenmitte: Startpunkt so legen, dass die Mitte des Worts dort liegt
      const winkel = 35;
      const w = pdf.getTextWidth(stempel);
      const rad = (winkel * Math.PI) / 180;
      pdf.text(stempel, bw / 2 - (w / 2) * Math.cos(rad), bh / 2 + (w / 2) * Math.sin(rad), { angle: winkel });
      try { pdf.restoreGraphicsState(); } catch { /* egal */ }
      pdf.setTextColor(0, 0, 0);
    }
  }

  const dateiname = pdfDateiname(typText, beleg.nummer || "Entwurf", beleg.empf_name);
  // Titel fürs Dokument — sonst zeigt die PDF-Ansicht des Browsers eine Blob-Nummer
  pdf.setProperties({ title: dateiname.replace(/\.pdf$/, ""), author: firma.name, creator: firma.name });
  return { blob: pdf.output("blob"), dateiname };
}

type Zeile = { zeile: RowInput; titel?: boolean; lang?: { kurz: string; lang: string } };
type Geladen = Awaited<ReturnType<typeof pdfLaden>>;

/**
 * Positionstabelle zeichnen. `abstaende`: vor Zeile i ein unsichtbarer
 * Abstand dieser Höhe (schiebt einen verwaisten Titel auf die nächste Seite).
 * `lageMerken` meldet je Zeile Seite und Höhe — für den Probelauf.
 */
function positionenTabelle(
  pdf: Geladen["pdf"],
  autoTable: Geladen["autoTable"],
  zeilen: Zeile[],
  abstaende: Map<number, number>,
  startY: number,
  lageMerken?: (i: number, seite: number, y: number) => void,
) {
  const body: RowInput[] = [];
  const herkunft: number[] = [];
  zeilen.forEach((z, i) => {
    const abstand = abstaende.get(i);
    if (abstand) {
      body.push([{ content: "", colSpan: 6, styles: { minCellHeight: abstand, cellPadding: 0, lineWidth: 0, fontSize: 1 } }]);
      herkunft.push(-1);
    }
    body.push(z.zeile);
    herkunft.push(i);
  });

  autoTable(pdf, {
    startY,
    head: [["Pos.", "Bezeichnung", "Menge", "Einh.", "EP €", "Gesamt €"]],
    body,
    theme: "plain",
    rowPageBreak: "avoid",
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    headStyles: {
      fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8,
      cellPadding: { top: 2.6, bottom: 2.6, left: 1.8, right: 1.8 }, lineWidth: { bottom: 0.4 }, lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fontSize: 9, textColor: [0, 0, 0], cellPadding: { top: 2.4, bottom: 2.4, left: 1.8, right: 1.8 },
      lineWidth: { bottom: 0.15 }, lineColor: [190, 190, 190], valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 13 },
      2: { halign: "right", cellWidth: 17 },
      3: { cellWidth: 13 },
      4: { halign: "right", cellWidth: 21 },
      5: { halign: "right", cellWidth: 24, fontStyle: "bold" },
    },
    didParseCell: (d: CellHookData) => {
      if (d.section === "head" && d.column.index >= 4) d.cell.styles.halign = "right";
      if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "right";
    },
    didDrawCell: (d: CellHookData) => {
      if (d.section !== "body") return;
      const i = herkunft[d.row.index] ?? -1;
      if (i < 0) return;
      if (d.column.index === 0) lageMerken?.(i, d.pageNumber, d.cell.y);
      // Langtext kleiner und grau unter der Bezeichnung (Optik wie Tilger-Vorlage)
      const info = zeilen[i].lang;
      if (d.column.index !== 1 || !info) return;
      const w = d.cell.width - 3.6;
      const fett = d.cell.styles.fontStyle === "bold";
      const zeile = Number(d.cell.styles.fontSize) * 0.3528 * 1.15;
      pdf.setFont("helvetica", fett ? "bold" : "normal");
      pdf.setFontSize(Number(d.cell.styles.fontSize));
      const kurzHoehe = pdf.splitTextToSize(info.kurz, w).length * zeile;
      // Abdecken ab knapp über der zweiten Zeile — sonst schauen deren Oberlängen hervor
      const deckY = d.cell.y + 2.4 + kurzHoehe - 0.25;
      pdf.setFillColor(255, 255, 255);
      pdf.rect(d.cell.x + 0.2, deckY, d.cell.width - 0.4, d.cell.y + d.cell.height - deckY - 0.4, "F");
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...GRAU);
      pdf.text(pdf.splitTextToSize(info.lang, w), d.cell.x + 1.8, deckY + 2.6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
    },
  });
}
