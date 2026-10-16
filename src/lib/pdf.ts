import type { Beleg, Firma, Position } from "@/lib/types";
import { logoAdresse } from "@/lib/upload";

/**
 * Rechnungs- und Angebots-PDF.
 *
 * Aufbau und Optik aus der Tilger-App übernommen (jsPDF + autoTable:
 * Briefkopf rechts, Empfänger links, Positionstabelle, Summenblock,
 * Bankverbindung mit Zahlungs-QR, Fußzeile auf jeder Seite). Neu ist nur,
 * dass der Briefkopf nicht fest im Code steht, sondern aus der
 * ausstellenden Firma kommt — jede der drei Firmen bekommt ihr eigenes PDF.
 */

function fmt(val: number): string {
  if (!isFinite(val)) return "0,00";
  const [g, k] = Math.abs(val).toFixed(2).split(".");
  return `${val < 0 ? "-" : ""}${g.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${k}`;
}
const eur = (v: number) => `€ ${fmt(v)}`;
function fmtDatum(iso?: string | null): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}
function hexZuRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function bildAlsDataUri(url: string): Promise<{ uri: string; w: number; h: number } | null> {
  try {
    const antwort = await fetch(url, { cache: "no-store" });
    if (!antwort.ok) return null;
    const blob = await antwort.blob();
    const uri = await new Promise<string>((ok, fehler) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = fehler;
      r.readAsDataURL(blob);
    });
    const masse = await new Promise<{ w: number; h: number }>((ok) => {
      const i = new Image();
      i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => ok({ w: 3, h: 1 });
      i.src = uri;
    });
    return { uri, ...masse };
  } catch {
    return null;
  }
}

/** EPC-QR ("GiroCode") — die Banking-App füllt Empfänger, IBAN, Betrag, Referenz aus. */
async function zahlungsQr(firma: Firma, betrag: number, referenz: string): Promise<string | null> {
  if (!firma.iban || betrag <= 0) return null;
  const QR = await import("qrcode");
  const daten = [
    "BCD", "002", "1", "SCT",
    (firma.bic || "").replace(/\s/g, ""),
    (firma.kontoinhaber || firma.name).slice(0, 70),
    firma.iban.replace(/\s/g, ""),
    `EUR${betrag.toFixed(2)}`,
    "", "", referenz.slice(0, 140),
  ].join("\n");
  return QR.toDataURL(daten, { errorCorrectionLevel: "M", margin: 0, width: 300 });
}

export interface BelegPdfDaten {
  beleg: Beleg;
  positionen: Position[];
  firma: Firma;
  /** Bei Rechnungen an Kollegen: die Empfängerfirma (für ihre UID). */
  empfaengerFirma?: Firma | null;
  projektName?: string | null;
}

export function belegSummen(positionen: Pick<Position, "art" | "menge" | "einzelpreis">[], ustSatz: number, ohneUst: boolean) {
  const netto = Math.round(positionen
    .filter((p) => p.art !== "text")
    .reduce((s, p) => s + Math.round(Number(p.menge) * Number(p.einzelpreis) * 100) / 100, 0) * 100) / 100;
  const ust = ohneUst ? 0 : Math.round(netto * ustSatz) / 100;
  return { netto, ust, brutto: Math.round((netto + ust) * 100) / 100 };
}

export async function belegPdf({ beleg, positionen, firma, empfaengerFirma, projektName }: BelegPdfDaten): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const istAngebot = beleg.typ === "angebot";
  const typText = istAngebot ? "Angebot" : "Rechnung";
  const rc = beleg.reverse_charge;
  const klein = firma.kleinunternehmer;
  const akzent = hexZuRgb(firma.farbe || "#0E5A44");

  const pdf = new jsPDF("p", "mm", "a4");
  const bw = pdf.internal.pageSize.getWidth();
  const bh = pdf.internal.pageSize.getHeight();
  const ml = 15, mr = 15;
  const breite = bw - ml - mr;
  let y = 15;

  // ── Briefkopf ──
  const logoUrl = logoAdresse(firma.logo_pfad);
  const logo = logoUrl ? await bildAlsDataUri(logoUrl) : null;
  if (logo) {
    const maxW = 50, maxH = 20;
    const f = Math.min(maxW / logo.w, maxH / logo.h);
    try { pdf.addImage(logo.uri, ml, y, logo.w * f, logo.h * f); } catch { /* Logo kaputt → ohne */ }
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...akzent);
    pdf.text(firma.name, ml, y + 8);
  }

  const kopf = [
    firma.inhaber && firma.inhaber !== firma.name ? firma.inhaber : null,
    firma.strasse,
    [firma.plz, firma.ort].filter(Boolean).join(" ") || null,
    firma.telefon ? `Tel: ${firma.telefon}` : null,
    firma.email,
    firma.website,
  ].filter(Boolean) as string[];
  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(firma.name, bw - mr, y + 2, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  kopf.forEach((z, i) => pdf.text(z, bw - mr, y + 7 + i * 5, { align: "right" }));
  let kopfEnde = y + 7 + kopf.length * 5;
  if (firma.uid) {
    pdf.setFontSize(8);
    pdf.text(`UID: ${firma.uid}`, bw - mr, kopfEnde, { align: "right" });
    kopfEnde += 5;
  }

  y = Math.max(y + 29, kopfEnde);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(ml, y, bw - mr, y);
  y += 4;

  // Absenderzeile über dem Fensterkuvert
  pdf.setFontSize(7);
  pdf.setTextColor(110, 110, 110);
  pdf.text([firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "), ml, y + 2);
  y += 7;

  // ── Empfänger ──
  pdf.setTextColor(0, 0, 0);
  const startEmpf = y;
  if (beleg.kunde_zusatz) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(beleg.kunde_zusatz, ml, y); y += 5; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(beleg.kunde_name || "–", ml, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  if (beleg.kunde_strasse) { pdf.text(beleg.kunde_strasse, ml, y); y += 5; }
  if (beleg.kunde_plz || beleg.kunde_ort) { pdf.text(`${beleg.kunde_plz || ""} ${beleg.kunde_ort || ""}`.trim(), ml, y); y += 5; }
  const empfUid = beleg.kunde_uid || empfaengerFirma?.uid;
  if (empfUid) { pdf.setFontSize(8); pdf.text(`UID: ${empfUid}`, ml, y); y += 5; }

  // ── Metadaten rechts ──
  const mx = bw - mr - 62;
  let my = startEmpf;
  pdf.setFontSize(9);
  const meta: [string, string][] = [
    [`${typText} Nr.`, beleg.nummer || "Entwurf"],
    [istAngebot ? "Datum" : "Rechnungsdatum", fmtDatum(beleg.datum)],
  ];
  if (!istAngebot) {
    if (beleg.leistung_von && beleg.leistung_bis && beleg.leistung_von !== beleg.leistung_bis) {
      meta.push(["Leistungszeitraum", `${fmtDatum(beleg.leistung_von)}\n– ${fmtDatum(beleg.leistung_bis)}`]);
    } else if (beleg.leistung_von || beleg.leistung_bis) {
      meta.push(["Leistungsdatum", fmtDatum(beleg.leistung_von || beleg.leistung_bis)]);
    }
    if (beleg.faellig_am) meta.push(["Fällig am", fmtDatum(beleg.faellig_am)]);
  } else if (beleg.gueltig_bis) {
    meta.push(["Gültig bis", fmtDatum(beleg.gueltig_bis)]);
  }
  if (projektName) meta.push(["Projekt", projektName.length > 28 ? projektName.slice(0, 27) + "…" : projektName]);
  meta.forEach(([l, w]) => {
    pdf.setFont("helvetica", "normal");
    pdf.text(l, mx, my);
    pdf.setFont("helvetica", "bold");
    pdf.text(w, mx + 30, my);
    my += 5 + (w.match(/\n/g) || []).length * 4;
  });

  y = Math.max(y, my) + 6;

  // ── Titel ──
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(beleg.nummer ? `${typText} Nr. ${beleg.nummer}` : `${typText} — Entwurf`, ml, y);
  y += 2;
  pdf.setDrawColor(...akzent);
  pdf.setLineWidth(0.8);
  pdf.line(ml, y, bw - mr, y);
  y += 6;

  if (beleg.betreff) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const zeilen = pdf.splitTextToSize(beleg.betreff, breite);
    pdf.text(zeilen, ml, y);
    y += zeilen.length * 4.5 + 3;
  }

  // ── Positionen ──
  const langtexte: Record<number, { kurz: string; lang: string }> = {};
  let nr = 0;
  const koerper = positionen.map((p, i) => {
    if (p.art === "text") {
      return [{ content: [p.bezeichnung, p.beschreibung].filter(Boolean).join("\n"), colSpan: 6, styles: { fontStyle: "italic" as const, textColor: [80, 80, 80] as [number, number, number] } }];
    }
    nr += 1;
    let zelle = p.bezeichnung;
    if (p.beschreibung) { langtexte[i] = { kurz: p.bezeichnung, lang: p.beschreibung }; zelle = `${p.bezeichnung}\n${p.beschreibung}`; }
    return [String(nr).padStart(2, "0"), fmt(Number(p.menge)), p.einheit, zelle, eur(Number(p.einzelpreis)), eur(Math.round(Number(p.menge) * Number(p.einzelpreis) * 100) / 100)];
  });

  autoTable(pdf, {
    startY: y,
    head: [["Pos.", "Menge", "Einheit", "Beschreibung", "Preis (netto)", "Gesamt (netto)"]],
    body: koerper as never,
    theme: "plain",
    rowPageBreak: "avoid",
    margin: { left: ml, right: mr, bottom: 32 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, lineWidth: { bottom: 0.5 }, lineColor: [0, 0, 0] },
    bodyStyles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, textColor: [0, 0, 0], lineWidth: { bottom: 0.2 }, lineColor: [180, 180, 180] },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "center", cellWidth: 16 },
      3: { halign: "left" },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 28, fontStyle: "bold" },
    },
    didDrawCell: (d) => {
      // Langtext kleiner und grau — wie in der Tilger-Vorlage
      if (d.section !== "body" || d.column.index !== 3) return;
      const info = langtexte[d.row.index];
      if (!info) return;
      const w = d.cell.width - 4;
      const zh = 9 * 0.3528 * 1.15;
      const kh = pdf.splitTextToSize(info.kurz, w).length * zh;
      const deckY = d.cell.y + 3 + kh + 0.5;
      pdf.setFillColor(255, 255, 255);
      pdf.rect(d.cell.x, deckY, d.cell.width, d.cell.y + d.cell.height - deckY - 0.3, "F");
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(110, 110, 110);
      pdf.text(pdf.splitTextToSize(info.lang, w), d.cell.x + 2, d.cell.y + 3 + kh + 2);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
    },
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Summen ──
  const ohneUst = rc || klein;
  const summen: [string, number, boolean][] = ohneUst
    ? [[rc ? "Rechnungsbetrag netto" : "Rechnungsbetrag", Number(beleg.netto), true]]
    : [
      ["Nettobetrag", Number(beleg.netto), false],
      [`USt. ${fmt(Number(beleg.ust_satz)).replace(",00", "")} %`, Number(beleg.ust), false],
      ["Gesamtbetrag", Number(beleg.brutto), true],
    ];
  const schluss = summen.length * 7 + 20 + (rc || klein ? 14 : 0) + (beleg.notizen ? 14 : 0) + (istAngebot ? 10 : 45);
  if (bh - 24 - y < schluss) { pdf.addPage(); y = 20; }

  y += 2;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.8);
  pdf.line(ml, y, bw - mr, y);
  y += 1;
  summen.forEach(([l, w, fett]) => {
    if (fett && summen.length > 1) { pdf.setLineWidth(0.8); pdf.line(bw - mr - 90, y + 1, bw - mr, y + 1); }
    pdf.setFont("helvetica", fett ? "bold" : "normal");
    pdf.setFontSize(fett ? 10.5 : 9);
    pdf.text(l, bw - mr - 32, y + 5, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(eur(w), bw - mr - 2, y + 5, { align: "right" });
    y += 7;
  });
  y += 3;

  if (rc) {
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)", ml, y);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Übergang der Steuerschuld auf den Leistungsempfänger gemäß § 19 Abs. 1a UStG (Bauleistungen).", ml, y);
    y += 7;
  } else if (klein) {
    y += 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("Umsatzsteuerbefreit — Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.", ml, y);
    y += 7;
  }

  if (beleg.notizen) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const z = pdf.splitTextToSize(beleg.notizen, breite);
    pdf.text(z, ml, y);
    y += z.length * 4.2 + 4;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  if (istAngebot) {
    pdf.text("Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen jederzeit gerne zur Verfügung.", ml, y, { maxWidth: breite });
    y += 8;
  } else {
    const tage = firma.zahlungsziel_tage;
    pdf.text(
      beleg.faellig_am
        ? `Wir bitten um Überweisung des Rechnungsbetrages bis ${fmtDatum(beleg.faellig_am)}${tage ? ` (${tage} Tage)` : ""}.`
        : "Wir bitten um Überweisung des Rechnungsbetrages.",
      ml, y, { maxWidth: breite });
    y += 5;
    if (beleg.nummer) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.text(`Bitte als Zahlungsreferenz die Rechnungsnummer ${beleg.nummer} angeben.`, ml, y);
      y += 6;
    }
    if (firma.iban) {
      pdf.setFontSize(9);
      pdf.text(`Bankverbindung: ${firma.kontoinhaber || firma.name}${firma.bank_name ? ` · ${firma.bank_name}` : ""}`, ml, y);
      pdf.text(`IBAN: ${firma.iban}${firma.bic ? ` · BIC: ${firma.bic}` : ""}`, ml, y + 4.5);
      const betrag = ohneUst ? Number(beleg.netto) : Number(beleg.brutto);
      const qr = await zahlungsQr(firma, betrag, beleg.nummer || "");
      if (qr) {
        try {
          pdf.addImage(qr, "PNG", bw - mr - 22, y - 6, 22, 22);
          pdf.setFontSize(5.5);
          pdf.text("Zahlen mit Code", bw - mr - 11, y + 19, { align: "center" });
        } catch { /* ohne QR */ }
      }
      y += 24;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Vielen Dank für Ihren Auftrag!", bw / 2, y, { align: "center" });
  }

  // ── Fußzeile auf jeder Seite ──
  const seiten = pdf.getNumberOfPages();
  const fuss1 = firma.fusszeile?.trim() || [firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" "), firma.telefon, firma.email].filter(Boolean).join(" · ");
  const fuss2 = [firma.iban ? `IBAN: ${firma.iban}` : null, firma.bic ? `BIC: ${firma.bic}` : null, firma.uid ? `UID: ${firma.uid}` : null, firma.firmenbuch].filter(Boolean).join(" · ");
  for (let i = 1; i <= seiten; i++) {
    pdf.setPage(i);
    const fy = bh - 22;
    pdf.setDrawColor(...akzent);
    pdf.setLineWidth(0.3);
    pdf.line(ml, fy, bw - mr, fy);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(0, 0, 0);
    pdf.text(fuss1, bw / 2, fy + 4, { align: "center", maxWidth: breite });
    if (fuss2) pdf.text(fuss2, bw / 2, fy + 8, { align: "center" });
    pdf.text(`Seite ${i} von ${seiten}`, bw - mr, fy + 12, { align: "right" });
  }

  return pdf.output("blob");
}

export function belegDateiname(beleg: Beleg): string {
  const typ = beleg.typ === "angebot" ? "Angebot" : "Rechnung";
  const name = (beleg.kunde_name || "").replace(/[^a-zA-Z0-9äöüÄÖÜß -]/g, "").trim().slice(0, 40);
  return `${typ} ${beleg.nummer || "Entwurf"}${name ? ` ${name}` : ""}.pdf`;
}

/** Am Handy über das Teilen-Menü (WhatsApp, Mail …), sonst Download. */
export async function pdfTeilenOderLaden(blob: Blob, dateiname: string) {
  const datei = new File([blob], dateiname, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [datei] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [datei], title: dateiname });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
