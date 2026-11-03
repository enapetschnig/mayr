import { supabase } from "@/integrations/supabase/client";
import {
  FUSS_PLATZ, RAND, bildAlsDataUri, briefkopf, datenBlock, empfaengerBlock, fmtDatum, fusszeilen, pdfDateiname, pdfLaden, platzPruefen, titelZeile,
} from "@/lib/pdfBasis";
import { name, type Firma } from "@/lib/types";
import { pdfText } from "@/components/regie/regieLogik";
import { zeitpunkt } from "@/lib/regiePdf";
import { anlageAdresse, anlageText, type Anlage, type PruefungVoll } from "@/components/anlagen/anlagenDaten";
import {
  ERGEBNIS, PRUEF_ART, besichtigungLesen, erderBewerten, messungBewerten, messungenLesen, plusMonate, zsMax, type PruefArt,
} from "@/components/anlagen/pruefLogik";

/**
 * Prüfprotokoll als A4-PDF: Briefkopf, Kunde, Anlage, Besichtigung,
 * Messungen je Stromkreis (Grenzwert-Überschreitungen fett markiert),
 * Ergebnis, Mängel, nächste Prüfung, Unterschrift von Kunde und Prüfer.
 */

const letztesY = (pdf: unknown) => (pdf as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
const z = (n: number | null) => (n == null ? "–" : String(n).replace(".", ","));

export async function pruefPdfErstellen(p: PruefungVoll, firma: Firma): Promise<{ blob: Blob; dateiname: string }> {
  const { pdf, autoTable } = await pdfLaden();
  const bw = pdf.internal.pageSize.getWidth();
  const bh = pdf.internal.pageSize.getHeight();
  const breite = bw - 2 * RAND;
  const entwurf = p.status !== "unterschrieben";
  const a = p.anlagen;
  const k = a?.kunden ?? null;
  const besichtigung = besichtigungLesen(p.besichtigung);
  const messungen = messungenLesen(p.messungen);

  const bildLaden = (async () => {
    if (!p.unterschrift_pfad) return null;
    const { data } = await supabase.storage.from("projekt-dateien").createSignedUrl(p.unterschrift_pfad, 300);
    return data?.signedUrl ? bildAlsDataUri(data.signedUrl) : null;
  })();

  let y = await briefkopf(pdf, firma);
  const yKopf = y + 3;
  const yLinks = empfaengerBlock(pdf, { name: pdfText(k?.name ?? "–"), strasse: pdfText(k?.strasse), plz: k?.plz, ort: pdfText(k?.ort) }, yKopf);
  const yRechts = datenBlock(pdf, [
    ["Prüfprotokoll", p.nummer ?? "–"],
    ["Prüfdatum", fmtDatum(p.datum)],
    ["Anlage", a ? `A${a.nummer}` : "–"],
  ], yKopf);
  y = Math.max(yLinks, yRechts) + 8;
  y = titelZeile(pdf, `${PRUEF_ART[p.art as PruefArt] ?? "Prüfung"} – Prüfprotokoll ${p.nummer ?? ""}`.trim(), firma, y);

  // Anlage
  const angaben: [string, string][] = [
    ["Anlage", a ? `${a.bezeichnung} (${anlageText(a)})` : "–"],
    ...(a && anlageAdresse(a) ? [["Adresse", anlageAdresse(a)] as [string, string]] : []),
    ...(a && (a.hersteller || a.typ || a.baujahr) ? [["Hersteller / Typ", [a.hersteller, a.typ, a.baujahr ? `Baujahr ${a.baujahr}` : null].filter(Boolean).join(" · ")] as [string, string]] : []),
    ...(p.netz ? [["Netzform", p.netz] as [string, string]] : []),
    ...(p.messgeraet ? [["Messgerät", p.messgeraet] as [string, string]] : []),
    ["Grundlage", "ÖVE/ÖNORM E 8101 (Grenzwerte siehe unten)"],
  ];
  pdf.setFontSize(9.5);
  for (const [l, w] of angaben) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    pdf.text(l, RAND, y);
    pdf.setTextColor(0, 0, 0);
    const zeilen = pdf.splitTextToSize(pdfText(w), breite - 36) as string[];
    pdf.text(zeilen, RAND + 36, y);
    y += Math.max(5, zeilen.length * 4.4);
  }
  y += 3;

  if (entwurf) {
    pdf.setDrawColor(150, 150, 150);
    pdf.setFillColor(245, 245, 245);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(RAND, y, breite, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("ENTWURF — nicht unterschrieben", RAND + 4, y + 6);
    y += 15;
  }

  const abschnitt = (titel: string, bedarf = 18) => {
    y = platzPruefen(pdf, y, bedarf);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(0, 0, 0);
    pdf.text(titel, RAND, y);
    y += 5.5;
  };
  const tabelle = {
    theme: "plain" as const,
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    styles: { font: "helvetica", fontSize: 9, textColor: [0, 0, 0] as [number, number, number], cellPadding: { top: 1.5, bottom: 1.5, left: 1.3, right: 1.3 } },
    headStyles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [215, 215, 215] as [number, number, number] },
  };

  // Besichtigung
  if (besichtigung.length) {
    abschnitt("Besichtigung", 24);
    autoTable(pdf, {
      ...tabelle,
      startY: y - 1,
      head: [["Prüfpunkt", "Ergebnis"]],
      body: besichtigung.map((b) => [pdfText(b.punkt), b.ok === true ? "in Ordnung" : b.ok === false ? "MANGEL" : "nicht geprüft"]),
      columnStyles: { 1: { cellWidth: 30 } },
      didParseCell: (d) => { if (d.section === "body" && d.column.index === 1 && d.cell.raw === "MANGEL") d.cell.styles.fontStyle = "bold"; },
    });
    y = letztesY(pdf) + 7;
  }

  // Messungen
  if (messungen.length) {
    abschnitt("Messungen", 24);
    const fehlerZeilen = messungen.map((m) => messungBewerten(m));
    autoTable(pdf, {
      ...tabelle,
      startY: y - 1,
      head: [["Stromkreis", "Schutz", "Leitung", "RISO MOhm", "Zs Ohm", "Zs max", "IdN mA", "Id mA", "tA ms", ""]],
      body: messungen.map((m, i) => [
        pdfText(m.stromkreis || "–"), pdfText(m.schutz || "–"), pdfText(m.querschnitt || "–"),
        z(m.riso), z(m.zs), z(zsMax(m.schutz)), z(m.fi_in), z(m.fi_ia), z(m.fi_ta), fehlerZeilen[i].length ? "!" : "ok",
      ]),
      columnStyles: {
        ...Object.fromEntries([3, 4, 5, 6, 7, 8].map((c) => [c, { halign: "right" as const, cellWidth: 15 }])),
        9: { halign: "center", cellWidth: 9 },
      },
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = d.column.index === 9 ? "center" : "right";
        if (d.section === "body" && fehlerZeilen[d.row.index]?.length) {
          const f = fehlerZeilen[d.row.index].join(" ");
          const feld = ({ 3: "Isolation", 4: "Zs", 7: "FI löst", 8: "Auslösezeit", 9: "" } as Record<number, string>)[d.column.index];
          if (feld !== undefined && (feld === "" || f.includes(feld))) d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = letztesY(pdf) + 3;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 100, 100);
    const legende = pdf.splitTextToSize(pdfText("Grenzwerte: Isolationswiderstand ≥ 1 MΩ · Zs max = 230 V / Ia (Ia = 5 × In bei B, 10 × In bei C, 20 × In bei D) · FI: Auslösestrom 50–100 % von IΔn, Auslösezeit ≤ 300 ms. „!“ = Grenzwert nicht eingehalten."), breite) as string[];
    pdf.text(legende, RAND, y + 2);
    pdf.setTextColor(0, 0, 0);
    y += legende.length * 3.4 + 6;
  }
  if (p.erder_ohm != null) {
    const fiIn = messungen.find((m) => m.fi_in)?.fi_in ?? null;
    const e = erderBewerten(Number(p.erder_ohm), fiIn);
    y = platzPruefen(pdf, y, 8);
    pdf.setFont("helvetica", e ? "bold" : "normal");
    pdf.setFontSize(9.5);
    pdf.text(pdfText(`Erdungswiderstand: ${z(Number(p.erder_ohm))} Ω${e ? ` — ${e}` : ""}`), RAND, y);
    y += 8;
  }

  // Ergebnis
  const erg = p.ergebnis ? ERGEBNIS[p.ergebnis] : null;
  abschnitt("Ergebnis", 26);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(erg ? `${erg.text}: ${erg.lang}` : "Noch kein Ergebnis", RAND, y, { maxWidth: breite });
  y += 6;
  const absatz = (titel: string, text: string | null) => {
    if (!text?.trim()) return;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    y = platzPruefen(pdf, y, 10);
    pdf.text(titel, RAND, y);
    y += 4.6;
    pdf.setFont("helvetica", "normal");
    for (const zeile of pdf.splitTextToSize(pdfText(text.trim()), breite) as string[]) {
      y = platzPruefen(pdf, y, 5);
      pdf.text(zeile, RAND, y);
      y += 4.4;
    }
    y += 2;
  };
  absatz("Mängel", p.maengel);
  absatz("Bemerkung", p.bemerkung);
  if (a?.intervall_monate && !entwurf) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    y = platzPruefen(pdf, y, 8);
    pdf.text(`Nächste Prüfung: spätestens ${fmtDatum(plusMonate(p.datum, a.intervall_monate))}`, RAND, y);
    y += 7;
  }

  // Unterschriften — als Block
  y = platzPruefen(pdf, y, 44);
  y += 3;
  const feldB = 75;
  const feldH = 24;
  const bild = await bildLaden;
  if (bild && !entwurf) {
    const f = Math.min(feldB / bild.w, feldH / bild.h);
    try { pdf.addImage(bild.uri, "PNG", RAND, y + (feldH - bild.h * f), bild.w * f, bild.h * f, undefined, "FAST"); } catch { /* ohne Bild */ }
  }
  y += feldH + 1.5;
  pdf.setDrawColor(90, 90, 90);
  pdf.setLineWidth(0.3);
  pdf.line(RAND, y, RAND + feldB + 5, y);
  pdf.line(bw - RAND - 70, y, bw - RAND, y);
  y += 4;
  pdf.setFontSize(8.5);
  pdf.setTextColor(60, 60, 60);
  pdf.text(entwurf ? "Auftraggeber — noch nicht unterschrieben"
    : pdfText(`${p.unterschrift_name || "Auftraggeber"} · ${zeitpunkt(p.unterschrieben_am)}`), RAND, y, { maxWidth: feldB + 25 });
  pdf.text(pdfText(`Prüfer: ${name(p.ersteller)}`), bw - RAND, y, { align: "right" });
  pdf.text(pdfText(firma.name), bw - RAND, y + 4, { align: "right" });
  pdf.setTextColor(0, 0, 0);

  if (entwurf) {
    const { GState } = await import("jspdf");
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.saveGraphicsState();
      pdf.setGState(new GState({ opacity: 0.07 }));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(90);
      const w = pdf.getTextWidth("ENTWURF");
      const r = (35 * Math.PI) / 180;
      pdf.text("ENTWURF", bw / 2 - (w / 2) * Math.cos(r), bh / 2 + (w / 2) * Math.sin(r), { angle: 35 });
      pdf.restoreGraphicsState();
    }
  }

  fusszeilen(pdf, firma);
  return {
    blob: pdf.output("blob"),
    dateiname: pdfDateiname("Pruefprotokoll", p.nummer, k?.name, entwurf ? "Entwurf" : null),
  };
}

/**
 * QR-Aufkleber für die Anlage (70 × 40 mm, für Etikettendrucker oder auf
 * A4 ausschneiden): QR mit der Adresse der Anlage in der App, daneben
 * Betrieb, Nummer, Bezeichnung und Kunde.
 */
export async function anlagenEtikett(a: Anlage & { kunden?: { name: string } | null }, firma: Firma, adresse: string): Promise<{ blob: Blob; dateiname: string }> {
  const [{ default: JsPDF }, QR] = await Promise.all([import("jspdf"), import("qrcode")]);
  const pdf = new JsPDF("l", "mm", [70, 40]);
  const qr = await QR.toDataURL(adresse, { errorCorrectionLevel: "M", margin: 0, width: 400 });
  pdf.addImage(qr, "PNG", 3, 5, 30, 30);
  const x = 36;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text(pdfText(firma.name), x, 7, { maxWidth: 31 });
  pdf.setFontSize(11);
  pdf.text(`A${a.nummer}`, x, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  const zeilen = [
    ...(pdf.splitTextToSize(pdfText(a.bezeichnung), 31) as string[]).slice(0, 2),
    ...(a.kunden?.name ? (pdf.splitTextToSize(pdfText(a.kunden.name), 31) as string[]).slice(0, 1) : []),
  ];
  pdf.text(zeilen, x, 18.5);
  pdf.setFontSize(5.5);
  pdf.setTextColor(90, 90, 90);
  pdf.text(["Scannen: Anlage und", "Prüfprotokolle öffnen"], x, 31.5);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.2);
  pdf.rect(0.5, 0.5, 69, 39);
  return { blob: pdf.output("blob"), dateiname: pdfDateiname("Aufkleber", `A${a.nummer}`, a.bezeichnung) };
}
