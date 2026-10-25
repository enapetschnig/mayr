import { supabase } from "@/integrations/supabase/client";
import {
  FUSS_PLATZ, RAND, bildAlsDataUri, briefkopf, datenBlock, empfaengerBlock, fmtDatum, fmtMenge, fusszeilen,
  pdfDateiname, pdfLaden, pdfTeilenOderLaden, platzPruefen, titelZeile,
} from "@/lib/pdfBasis";
import { name, type Artikel, type Firma, type Kunde, type Lagerort, type MaterialBuchung, type Profil, type Projekt, type Regiebericht, type Zeit } from "@/lib/types";
import { materialZusammenfassen, pdfText, zeitSpanne } from "@/components/regie/regieLogik";

/**
 * Regiebericht: laden (eine Quelle für Editor, Ansicht und PDF) und als PDF
 * drucken — Briefkopf aus `firma`, Kunde, Arbeiten, Arbeitszeit der Partie,
 * Material OHNE Preise (den Bericht unterschreibt der Kunde auf der
 * Baustelle, die Preise stehen auf der Rechnung) und die Unterschrift.
 */

export type RegieZeit = Zeit & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };
export type RegieMaterial = MaterialBuchung & {
  artikel: Pick<Artikel, "bezeichnung" | "einheit" | "ek_preis" | "hersteller" | "hersteller_nr"> | null;
  lagerorte: Pick<Lagerort, "name"> | null;
};
export type RegieKunde = Pick<Kunde, "id" | "name" | "ansprechpartner" | "strasse" | "plz" | "ort" | "telefon" | "email">;
export type RegieVoll = Regiebericht & {
  projekte: (Pick<Projekt, "id" | "nummer" | "name" | "strasse" | "plz" | "ort" | "status"> & { kunden: RegieKunde | null }) | null;
  ersteller: Pick<Profil, "vorname" | "nachname"> | null;
  zeiten: RegieZeit[];
  material: RegieMaterial[];
  /** nur für den Chef lesbar (belege per RLS gesperrt) */
  rechnung: { id: string; nummer: string | null } | null;
};

const nachName = (a: RegieZeit, b: RegieZeit) =>
  a.created_at.localeCompare(b.created_at) || name(a.profiles).localeCompare(name(b.profiles), "de");

export async function regieberichtLaden(id: string): Promise<RegieVoll | null> {
  const [b, z, m] = await Promise.all([
    supabase.from("regieberichte")
      .select("*, ersteller:profiles(vorname, nachname), projekte(id, nummer, name, strasse, plz, ort, status, kunden(id, name, ansprechpartner, strasse, plz, ort, telefon, email))")
      .eq("id", id).maybeSingle(),
    supabase.from("zeiten").select("*, profiles(vorname, nachname, farbe)").eq("regiebericht_id", id),
    supabase.from("material_buchungen")
      .select("*, artikel(bezeichnung, einheit, ek_preis, hersteller, hersteller_nr), lagerorte(name)")
      .eq("regiebericht_id", id).order("created_at"),
  ]);
  if (b.error) throw b.error;
  if (z.error) throw z.error;
  if (m.error) throw m.error;
  if (!b.data) return null;
  const bericht = b.data as unknown as Omit<RegieVoll, "zeiten" | "material" | "rechnung">;
  let rechnung: RegieVoll["rechnung"] = null;
  if (bericht.rechnung_id) {
    const { data } = await supabase.from("belege").select("id, nummer").eq("id", bericht.rechnung_id).maybeSingle();
    rechnung = data ?? null;
  }
  return {
    ...bericht,
    zeiten: ((z.data ?? []) as unknown as RegieZeit[]).sort(nachName),
    material: (m.data ?? []) as unknown as RegieMaterial[],
    rechnung,
  };
}

/** Bezeichnung und Einheit einer Materialbuchung (Artikel oder freie Position) */
export function materialText(m: RegieMaterial): { bezeichnung: string; einheit: string } {
  return { bezeichnung: m.artikel?.bezeichnung ?? m.bezeichnung ?? "–", einheit: m.artikel?.einheit ?? m.einheit ?? "Stk" };
}

/** "21.10.2026 um 13:40 Uhr" in der Zeitzone des Geräts */
export function zeitpunkt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" })} um ${d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

const letztesY = (pdf: unknown) => (pdf as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function regiePdfErstellen(r: RegieVoll, firma: Firma): Promise<Blob> {
  const { pdf, autoTable } = await pdfLaden();
  const bw = pdf.internal.pageSize.getWidth();
  const bh = pdf.internal.pageSize.getHeight();
  const breite = bw - 2 * RAND;
  const entwurf = r.status !== "unterschrieben";
  const p = r.projekte;
  const k = p?.kunden ?? null;

  // Unterschrift parallel zum Briefkopf holen
  const bildLaden = (async () => {
    if (!r.unterschrift_pfad) return null;
    const { data } = await supabase.storage.from("projekt-dateien").createSignedUrl(r.unterschrift_pfad, 300);
    return data?.signedUrl ? bildAlsDataUri(data.signedUrl) : null;
  })();

  let y = await briefkopf(pdf, firma);
  const yKopf = y + 3;
  const yLinks = empfaengerBlock(pdf, {
    name: pdfText(k?.name ?? p?.name ?? "–"),
    strasse: pdfText(k?.strasse),
    plz: k?.plz,
    ort: pdfText(k?.ort),
  }, yKopf);
  const yRechts = datenBlock(pdf, [
    ["Regiebericht", r.nummer ?? "–"],
    ["Datum", fmtDatum(r.datum)],
    ["Projekt", p?.nummer ?? "–"],
  ], yKopf);
  y = Math.max(yLinks, yRechts) + 8;
  y = titelZeile(pdf, `Regiebericht ${r.nummer ?? ""}`.trim(), firma, y);

  // Projekt und Baustelle
  const baustelle = [p?.strasse, [p?.plz, p?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const angaben: [string, string][] = [
    ["Projekt", `${p?.nummer ?? ""} ${p?.name ?? ""}`.trim() || "–"],
    ...(baustelle ? [["Baustelle", baustelle] as [string, string]] : []),
    ...(k?.ansprechpartner ? [["Ansprechpartner", k.ansprechpartner] as [string, string]] : []),
  ];
  pdf.setFontSize(9.5);
  for (const [l, w] of angaben) {
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    pdf.text(l, RAND, y);
    pdf.setTextColor(0, 0, 0);
    const zeilen = pdf.splitTextToSize(pdfText(w), breite - 32) as string[];
    pdf.text(zeilen, RAND + 32, y);
    y += Math.max(5, zeilen.length * 4.4);
  }
  y += 2;

  if (entwurf) {
    pdf.setDrawColor(150, 150, 150);
    pdf.setFillColor(245, 245, 245);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(RAND, y, breite, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text("ENTWURF — nicht unterschrieben", RAND + 4, y + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(90, 90, 90);
    pdf.text("Vorschau zur Kontrolle, noch kein gültiger Regiebericht", bw - RAND - 4, y + 6, { align: "right" });
    pdf.setTextColor(0, 0, 0);
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

  // Durchgeführte Arbeiten
  abschnitt("Durchgeführte Arbeiten");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  for (const zeile of pdf.splitTextToSize(pdfText(r.arbeiten).trim() || "–", breite) as string[]) {
    y = platzPruefen(pdf, y, 6);
    pdf.text(zeile, RAND, y);
    y += 4.8;
  }
  y += 5;

  const tabelle = {
    theme: "plain" as const,
    margin: { left: RAND, right: RAND, top: 20, bottom: FUSS_PLATZ },
    styles: { font: "helvetica", fontSize: 9.5, textColor: [0, 0, 0] as [number, number, number], cellPadding: { top: 1.7, bottom: 1.7, left: 1.5, right: 1.5 } },
    headStyles: { fontStyle: "bold" as const, fillColor: [242, 242, 242] as [number, number, number] },
    bodyStyles: { lineWidth: { bottom: 0.1 }, lineColor: [215, 215, 215] as [number, number, number] },
  };

  // Arbeitszeit der Partie
  abschnitt("Arbeitszeit", 24);
  if (r.zeiten.length === 0) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text("Keine Arbeitszeit erfasst.", RAND, y);
    y += 9;
  } else {
    const summe = r.zeiten.reduce((s, z) => s + Number(z.stunden), 0);
    // Spalten nur, wenn sie etwas zeigen: Von–Bis und Pause gibt es nur bei Uhrzeit-Buchungen
    const mitSpanne = r.zeiten.some((z) => z.von && z.bis);
    const mitPause = r.zeiten.some((z) => z.von && z.bis && z.pause_minuten > 0);
    const spalten = [
      { kopf: "Mitarbeiter", breite: undefined as number | undefined, wert: (z: RegieZeit) => pdfText(name(z.profiles)) },
      ...(mitSpanne ? [{ kopf: "Von – Bis", breite: 34, wert: (z: RegieZeit) => (z.von && z.bis ? zeitSpanne(z.von, z.bis).replace("–", " – ") : "–") }] : []),
      ...(mitPause ? [{ kopf: "Pause", breite: 22, wert: (z: RegieZeit) => (z.von && z.bis && z.pause_minuten ? `${z.pause_minuten} Min.` : "") }] : []),
      { kopf: "Stunden", breite: 24, wert: (z: RegieZeit) => `${fmtMenge(Number(z.stunden))} h` },
    ];
    const letzte = spalten.length - 1;
    autoTable(pdf, {
      ...tabelle,
      startY: y - 1,
      head: [spalten.map((s) => s.kopf)],
      body: r.zeiten.map((z) => spalten.map((s) => s.wert(z))),
      foot: [spalten.map((_, i) => (i === 0 ? "Summe" : i === letzte ? `${fmtMenge(summe)} h` : ""))],
      footStyles: { fontStyle: "bold", lineWidth: { top: 0.3 }, lineColor: [0, 0, 0] },
      columnStyles: Object.fromEntries(spalten.map((s, i) => [i, {
        ...(s.breite ? { cellWidth: s.breite } : {}),
        ...(i === letzte ? { halign: "right" as const } : {}),
      }])),
      didParseCell: (d) => { if (d.section !== "body" && d.column.index === letzte) d.cell.styles.halign = "right"; },
    });
    y = letztesY(pdf) + 7;
  }

  // Material — nur Mengen
  const material = materialZusammenfassen(r.material.map((m) => ({ artikelId: m.artikel_id, ...materialText(m), menge: Number(m.menge) })));
  if (material.length > 0) {
    abschnitt("Material", 24);
    autoTable(pdf, {
      ...tabelle,
      startY: y - 1,
      head: [["Menge", "Einheit", "Bezeichnung"]],
      body: material.map((m) => [fmtMenge(m.menge), pdfText(m.einheit), pdfText(m.bezeichnung)]),
      columnStyles: { 0: { cellWidth: 20, halign: "right" }, 1: { cellWidth: 18 } },
      didParseCell: (d) => { if (d.section === "head" && d.column.index === 0) d.cell.styles.halign = "right"; },
    });
    y = letztesY(pdf) + 7;
  }

  // Bestätigung des Kunden — als Block zusammen, nie über den Seitenumbruch
  y = platzPruefen(pdf, y, 46);
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text("Bestätigung des Auftraggebers", RAND, y);
  y += 4.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 90, 90);
  pdf.text("Die angeführten Arbeiten, Arbeitszeiten und Materialien werden bestätigt.", RAND, y);
  pdf.setTextColor(0, 0, 0);
  y += 3;

  const feldB = 75;
  const feldH = 25;
  const bild = await bildLaden;
  if (bild && !entwurf) {
    const f = Math.min(feldB / bild.w, feldH / bild.h);
    // "FAST": die Unterschrift hat einen Alphakanal — ohne Kompression bläht jsPDF sie auf ~250 KB auf
    try { pdf.addImage(bild.uri, "PNG", RAND, y + (feldH - bild.h * f), bild.w * f, bild.h * f, undefined, "FAST"); } catch { /* ohne Bild weiter */ }
  }
  y += feldH + 1.5;
  pdf.setDrawColor(90, 90, 90);
  pdf.setLineWidth(0.3);
  pdf.line(RAND, y, RAND + feldB + 5, y);
  pdf.line(bw - RAND - 60, y, bw - RAND, y);
  y += 4;
  pdf.setFontSize(8.5);
  pdf.setTextColor(60, 60, 60);
  pdf.text(
    entwurf
      ? "Noch nicht unterschrieben"
      : pdfText(`${r.unterschrift_name || "Auftraggeber"} · unterschrieben am ${zeitpunkt(r.unterschrieben_am)}`),
    RAND, y, { maxWidth: feldB + 25 },
  );
  pdf.text(pdfText(`Aufgenommen von ${name(r.ersteller)}`), bw - RAND, y, { align: "right" });
  pdf.text(pdfText(firma.name), bw - RAND, y + 4, { align: "right" });
  pdf.setTextColor(0, 0, 0);

  if (entwurf) {
    const { GState } = await import("jspdf");
    const winkel = 35;
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.saveGraphicsState();
      pdf.setGState(new GState({ opacity: 0.07 }));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(90);
      pdf.setTextColor(0, 0, 0);
      const w = pdf.getTextWidth("ENTWURF");
      const a = (winkel * Math.PI) / 180;
      pdf.text("ENTWURF", bw / 2 - (w / 2) * Math.cos(a), bh / 2 + (w / 2) * Math.sin(a), { angle: winkel });
      pdf.restoreGraphicsState();
    }
  }

  fusszeilen(pdf, firma);
  return pdf.output("blob");
}

export function regiePdfDateiname(r: RegieVoll): string {
  return pdfDateiname("Regiebericht", r.nummer, r.projekte?.kunden?.name ?? r.projekte?.name, r.status === "unterschrieben" ? null : "Entwurf");
}

/** Am Handy über das Teilen-Menü, am PC herunterladen */
export async function regiePdfTeilen(r: RegieVoll, firma: Firma) {
  const blob = await regiePdfErstellen(r, firma);
  await pdfTeilenOderLaden(blob, regiePdfDateiname(r));
}

/**
 * Im Browser ansehen. Das Fenster muss VOR dem Erzeugen geöffnet werden
 * (`window.open` direkt im Klick), sonst blockt der Popup-Blocker.
 */
export async function regiePdfAnsehen(r: RegieVoll, firma: Firma, fenster: Window | null) {
  const blob = await regiePdfErstellen(r, firma);
  if (!fenster || fenster.closed) {
    await pdfTeilenOderLaden(blob, regiePdfDateiname(r));
    return;
  }
  const url = URL.createObjectURL(blob);
  fenster.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
