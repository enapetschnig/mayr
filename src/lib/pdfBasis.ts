import type { jsPDF } from "jspdf";
import type { Firma } from "@/lib/types";
import { logoAdresse } from "@/lib/upload";

/**
 * Gemeinsame Bausteine für alle PDFs (Angebot, Rechnung, Regiebericht):
 * Briefkopf aus der Tabelle `firma`, Empfängerblock, Datenblock rechts,
 * Fußzeile auf jeder Seite, Zahlungs-QR, Teilen am Handy.
 *
 * Optik aus der Tilger-App: Logo links, Absender rechts, A4 hoch, 15 mm Rand.
 * jsPDF wird erst beim ersten PDF geladen (`pdfLaden`), nicht beim App-Start.
 */

export const RAND = 15;
/** Platz unten für die Fußzeile — Tabellen müssen davor umbrechen */
export const FUSS_PLATZ = 32;

export async function pdfLaden() {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { pdf: new JsPDF("p", "mm", "a4"), autoTable };
}

export function fmt(val: number): string {
  if (!isFinite(val)) return "0,00";
  const [g, k] = Math.abs(val).toFixed(2).split(".");
  return `${val < 0 ? "-" : ""}${g.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${k}`;
}
/** Menge ohne unnötige Nachkommastellen: 2 → "2", 2,5 → "2,5" */
export function fmtMenge(val: number): string {
  return Number(val).toLocaleString("de-AT", { maximumFractionDigits: 3 });
}
export const eur = (v: number) => `€ ${fmt(v)}`;
export function fmtDatum(iso?: string | null): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}
export function hexZuRgb(hex: string): [number, number, number] {
  const h = (hex || "#1D4ED8").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function bildAlsDataUri(url: string): Promise<{ uri: string; w: number; h: number } | null> {
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

/** Briefkopf: Logo (oder Name) links, Absender rechts, Trennlinie, Absenderzeile fürs Fensterkuvert. Gibt das neue y zurück. */
export async function briefkopf(pdf: jsPDF, firma: Firma, y = 15): Promise<number> {
  const bw = pdf.internal.pageSize.getWidth();
  const akzent = hexZuRgb(firma.farbe);

  const logoUrl = logoAdresse(firma.logo_pfad);
  const logo = logoUrl ? await bildAlsDataUri(logoUrl) : null;
  if (logo) {
    const f = Math.min(50 / logo.w, 20 / logo.h);
    try { pdf.addImage(logo.uri, RAND, y, logo.w * f, logo.h * f); } catch { /* Logo kaputt → ohne */ }
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...akzent);
    pdf.text(firma.name, RAND, y + 8);
    if (firma.zusatz) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90, 90, 90);
      pdf.text(firma.zusatz, RAND, y + 13);
    }
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
  pdf.text(firma.name, bw - RAND, y + 2, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  kopf.forEach((z, i) => pdf.text(z, bw - RAND, y + 7 + i * 5, { align: "right" }));
  let kopfEnde = y + 7 + kopf.length * 5;
  if (firma.uid) {
    pdf.setFontSize(8);
    pdf.text(`UID: ${firma.uid}`, bw - RAND, kopfEnde, { align: "right" });
    kopfEnde += 5;
  }

  y = Math.max(y + 29, kopfEnde);
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(RAND, y, bw - RAND, y);
  y += 4;

  pdf.setFontSize(7);
  pdf.setTextColor(110, 110, 110);
  pdf.text([firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "), RAND, y + 2);
  pdf.setTextColor(0, 0, 0);
  return y + 7;
}

export type Empfaenger = {
  zusatz?: string | null;
  name?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  uid?: string | null;
};

/** Empfänger links unter dem Briefkopf. Gibt das neue y zurück. */
export function empfaengerBlock(pdf: jsPDF, e: Empfaenger, y: number): number {
  pdf.setTextColor(0, 0, 0);
  if (e.zusatz) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(e.zusatz, RAND, y); y += 5; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(e.name || "–", RAND, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  if (e.strasse) { pdf.text(e.strasse, RAND, y); y += 5; }
  if (e.plz || e.ort) { pdf.text(`${e.plz || ""} ${e.ort || ""}`.trim(), RAND, y); y += 5; }
  if (e.uid) { pdf.setFontSize(8); pdf.text(`UID: ${e.uid}`, RAND, y); y += 5; }
  return y;
}

/** Beschriftete Werte rechts neben dem Empfänger (Nummer, Datum …). Gibt das neue y zurück. */
export function datenBlock(pdf: jsPDF, eintraege: [string, string][], y: number): number {
  const bw = pdf.internal.pageSize.getWidth();
  const x = bw - RAND - 62;
  pdf.setFontSize(9);
  eintraege.forEach(([l, w]) => {
    pdf.setFont("helvetica", "normal");
    pdf.text(l, x, y);
    pdf.setFont("helvetica", "bold");
    pdf.text(w, x + 30, y);
    y += 5 + (w.match(/\n/g) || []).length * 4;
  });
  return y;
}

/** Große Überschrift mit Linie in der Firmenfarbe. Gibt das neue y zurück. */
export function titelZeile(pdf: jsPDF, text: string, firma: Firma, y: number): number {
  const bw = pdf.internal.pageSize.getWidth();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.text(text, RAND, y);
  y += 2;
  pdf.setDrawColor(...hexZuRgb(firma.farbe));
  pdf.setLineWidth(0.8);
  pdf.line(RAND, y, bw - RAND, y);
  return y + 6;
}

/** Fußzeile auf jeder Seite: Firmendaten, Bank, UID, Seitenzahl. Als Letztes aufrufen. */
export function fusszeilen(pdf: jsPDF, firma: Firma) {
  const bw = pdf.internal.pageSize.getWidth();
  const bh = pdf.internal.pageSize.getHeight();
  const seiten = pdf.getNumberOfPages();
  const fuss1 = firma.fusszeile?.trim() || [firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" "), firma.telefon, firma.email].filter(Boolean).join(" · ");
  const fuss2 = [firma.bank_name, firma.iban ? `IBAN: ${firma.iban}` : null, firma.bic ? `BIC: ${firma.bic}` : null, firma.uid ? `UID: ${firma.uid}` : null, firma.firmenbuch].filter(Boolean).join(" · ");
  for (let i = 1; i <= seiten; i++) {
    pdf.setPage(i);
    const fy = bh - 22;
    pdf.setDrawColor(...hexZuRgb(firma.farbe));
    pdf.setLineWidth(0.3);
    pdf.line(RAND, fy, bw - RAND, fy);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(0, 0, 0);
    pdf.text(fuss1, bw / 2, fy + 4, { align: "center", maxWidth: bw - 2 * RAND });
    if (fuss2) pdf.text(fuss2, bw / 2, fy + 8, { align: "center", maxWidth: bw - 2 * RAND });
    pdf.text(`Seite ${i} von ${seiten}`, bw - RAND, fy + 12, { align: "right" });
  }
}

/** Neue Seite, wenn bis zur Fußzeile weniger als `bedarf` mm frei sind. Gibt das (ggf. neue) y zurück. */
export function platzPruefen(pdf: jsPDF, y: number, bedarf: number): number {
  const bh = pdf.internal.pageSize.getHeight();
  if (bh - FUSS_PLATZ + 8 - y < bedarf) { pdf.addPage(); return 20; }
  return y;
}

/** EPC-QR ("GiroCode") — die Banking-App füllt Empfänger, IBAN, Betrag, Referenz aus. */
export async function zahlungsQr(firma: Firma, betrag: number, referenz: string): Promise<string | null> {
  if (!firma.iban || betrag <= 0) return null;
  const QR = await import("qrcode");
  const daten = [
    "BCD", "002", "1", "SCT",
    (firma.bic || "").replace(/\s/g, ""),
    firma.name.slice(0, 70),
    firma.iban.replace(/\s/g, ""),
    `EUR${betrag.toFixed(2)}`,
    "", "", referenz.slice(0, 140),
  ].join("\n");
  return QR.toDataURL(daten, { errorCorrectionLevel: "M", margin: 0, width: 300 });
}

/** Dateiname ohne Sonderzeichen: "Rechnung RE-2026-001 Huber.pdf" */
export function pdfDateiname(...teile: (string | null | undefined)[]): string {
  const roh = teile.filter(Boolean).join(" ").replace(/[^a-zA-Z0-9äöüÄÖÜß .-]/g, "").replace(/\s+/g, " ").trim();
  return `${roh.slice(0, 80) || "Dokument"}.pdf`;
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
