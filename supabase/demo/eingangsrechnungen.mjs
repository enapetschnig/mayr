// Erzeugt für jede Demo-Eingangsrechnung ohne Datei ein echtes PDF (Lieferant,
// Empfänger, Positionen, Summen, Zahlung) und lädt es in den Bucket
// „eingangsrechnungen“ — so lässt sich „Beleg ansehen“ und die KI-Lesung
// vorzeigen. Erkennbar Demo: Fußzeile und Adressen „(Demo)“.
// Positionen aus eingang_positionen; ohne Positionen eine Zeile aus der Notiz.
//
//   DEMO_CHEF_PASSWORT=… node supabase/demo/eingangsrechnungen.mjs
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)),
);
const passwort = process.env.DEMO_CHEF_PASSWORT;
if (!passwort) {
  console.error("DEMO_CHEF_PASSWORT fehlt (Passwort des Demo-Chefs).");
  process.exit(1);
}
const sb = createClient(env.VITE_SUPABASE_URL.trim(), env.VITE_SUPABASE_KEY.trim(), { auth: { persistSession: false } });
const { error: anmeldung } = await sb.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: passwort });
if (anmeldung) {
  console.error(`Anmeldung fehlgeschlagen: ${anmeldung.message}`);
  process.exit(1);
}

const euro = (n) => `€ ${Number(n).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const zahl = (n) => Number(n).toLocaleString("de-AT", { maximumFractionDigits: 3 });
const datum = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const plusTage = (iso, n) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Eine Zeile, wenn die Rechnung keine Positionen hat — aus Notiz und Art */
const ERSATZ = {
  werkzeug: "Werkzeug lt. Bestellung",
  material: "Elektromaterial lt. Lieferschein",
  fremdleistung: "Leistung lt. Auftrag",
  fahrzeug: "Diesel",
};

/** Kopf je Lieferant: Adresse, UID, Bank — alles Demo */
function lieferantKopf(name, nr) {
  const n = name.replace(/\s*\(Demo\)\s*$/, "");
  const ort = ["4020 Linz", "4600 Wels", "4400 Steyr", "5020 Salzburg", "4810 Gmunden"][nr % 5];
  return { name: n, zeile: `Industriestraße ${10 + nr * 7} · ${ort} · Demo-Adresse`, uid: `ATU${String(10000000 + nr * 1234567).slice(0, 8)}` };
}

const { data: firma } = await sb.from("firma").select("name, strasse, plz, ort, uid").eq("id", 1).maybeSingle();
const { data: liste, error } = await sb.from("eingangsrechnungen")
  .select("id, lieferant, nummer, datum, faellig_am, netto, ust_satz, ust, brutto, kategorie, reverse_charge, notiz, iban, skonto_prozent, skonto_bis, lieferschein_nummern, datei_pfad, eingang_positionen(pos, artikelnummer, bezeichnung, menge, einheit, einzelpreis, gesamt, lieferschein_nr)")
  .is("datei_pfad", null).order("datum");
if (error) { console.error(error.message); process.exit(1); }

let nr = 0;
for (const r of liste) {
  nr += 1;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const kopf = lieferantKopf(r.lieferant ?? "Lieferant", nr);
  const tank = r.kategorie === "fahrzeug";

  // Briefkopf
  doc.setFillColor(30, 64, 120);
  doc.rect(0, 0, 210, 6, "F");
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20);
  doc.text(kopf.name, 20, 24);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
  doc.text(`${kopf.zeile} · UID ${kopf.uid}`, 20, 30);

  // Empfänger
  doc.setFontSize(8).text(`${kopf.name} · ${kopf.zeile}`, 20, 48);
  doc.setFontSize(11).setTextColor(20);
  [firma?.name ?? "SETEC GmbH", firma?.strasse ?? "", `${firma?.plz ?? ""} ${firma?.ort ?? ""}`.trim(), firma?.uid ? `UID ${firma.uid}` : ""]
    .filter(Boolean).forEach((z, i) => doc.text(z, 20, 55 + i * 5.5));

  // Rechnungsdaten rechts
  const rechts = [
    ["Rechnungsnummer", r.nummer ?? (tank ? `BON ${r.datum.slice(2, 10).replaceAll("-", "")}` : "—")],
    ["Rechnungsdatum", datum(r.datum)],
    ["Leistungsdatum", datum(r.datum)],
    ["Kundennummer", `K-${4711 + nr}`],
    ...(r.lieferschein_nummern?.length ? [["Lieferschein", r.lieferschein_nummern.join(", ")]] : []),
  ];
  doc.setFontSize(9);
  rechts.forEach(([k, v], i) => {
    doc.setTextColor(100).text(k, 125, 55 + i * 5.5);
    doc.setTextColor(20).text(String(v), 190, 55 + i * 5.5, { align: "right" });
  });

  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20);
  doc.text(tank ? "Rechnung / Tankbeleg" : "Rechnung", 20, 92);

  // Positionen
  const pos = (r.eingang_positionen ?? []).sort((a, b) => a.pos - b.pos);
  const zeilen = pos.length
    ? pos.map((p, i) => [String(i + 1), p.artikelnummer ?? "", p.bezeichnung, `${zahl(p.menge ?? 1)} ${p.einheit ?? ""}`.trim(),
      euro(p.einzelpreis ?? Number(p.gesamt) / Number(p.menge || 1)), euro(p.gesamt)])
    : tank
      ? [["1", "", "Diesel", `${zahl(Math.round((Number(r.netto) / 1.42) * 100) / 100)} l`, euro(1.42), euro(r.netto)]]
      : [["1", "", r.notiz && !r.notiz.startsWith("Noch nicht") ? r.notiz : ERSATZ[r.kategorie] ?? "Lieferung lt. Vereinbarung", "1 Psch", euro(r.netto), euro(r.netto)]];
  autoTable(doc, {
    startY: 104,
    head: [["Pos", "Art.-Nr.", "Bezeichnung", "Menge", "Einzelpreis", "Gesamt netto"]],
    body: zeilen,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, textColor: 20 },
    headStyles: { fontStyle: "bold", fillColor: [238, 241, 246] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 26 }, 3: { cellWidth: 22, halign: "right" }, 4: { cellWidth: 26, halign: "right" }, 5: { cellWidth: 28, halign: "right" } },
    margin: { left: 20, right: 20 },
    didDrawCell: (d) => { if (d.section === "body") { doc.setDrawColor(225); doc.line(20, d.cell.y + d.cell.height, 190, d.cell.y + d.cell.height); } },
  });

  // Summen
  let y = doc.lastAutoTable.finalY + 8;
  const summe = (k, v, fett = false) => {
    doc.setFont("helvetica", fett ? "bold" : "normal").setFontSize(fett ? 11 : 10).setTextColor(20);
    doc.text(k, 125, y);
    doc.text(v, 190, y, { align: "right" });
    y += 6;
  };
  summe("Summe netto", euro(r.netto));
  summe(r.reverse_charge ? "USt — Übergang der Steuerschuld" : `USt ${zahl(r.ust_satz ?? 20)} %`, euro(r.ust ?? Number(r.brutto) - Number(r.netto)));
  doc.setDrawColor(20).line(125, y - 3.5, 190, y - 3.5);
  y += 1;
  summe("Rechnungsbetrag", euro(r.brutto), true);

  // Zahlung
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(40);
  const faellig = r.faellig_am ?? plusTage(r.datum, 30);
  const zahlung = tank
    ? ["Bezahlt mit Tankkarte. Vielen Dank!"]
    : [
      r.skonto_prozent && r.skonto_bis
        ? `Zahlbar bis ${datum(r.skonto_bis)} mit ${zahl(r.skonto_prozent)} % Skonto (${euro(Number(r.brutto) * (1 - r.skonto_prozent / 100))}), bis ${datum(faellig)} netto.`
        : `Zahlbar ohne Abzug bis ${datum(faellig)}.`,
      `Bankverbindung: Demo-Bank · IBAN ${(r.iban ?? "AT61 1904 3002 3457 3201").replace(/(.{4})/g, "$1 ").trim()} · BIC DEMOATWW`,
      `Bitte bei Zahlung angeben: ${r.nummer ?? "Rechnungsnummer"}`,
    ];
  if (r.reverse_charge) zahlung.push("Übergang der Steuerschuld auf den Leistungsempfänger gem. § 19 Abs. 1a UStG.");
  zahlung.forEach((z) => { doc.text(doc.splitTextToSize(z, 170), 20, y); y += 5.5; });

  // Fuß
  doc.setFontSize(7.5).setTextColor(130);
  doc.text(`${kopf.name} · ${kopf.zeile} · UID ${kopf.uid} · FN 000000x · DEMO-BELEG — keine echte Rechnung`, 105, 287, { align: "center" });

  const pdf = Buffer.from(doc.output("arraybuffer"));
  const pfad = `${r.id}/demo-${(r.nummer ?? "beleg").replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
  // Überschreiben erlaubt der Speicher nicht — eine alte Demo-Datei erst weg
  await sb.storage.from("eingangsrechnungen").remove([pfad]);
  const { error: hoch } = await sb.storage.from("eingangsrechnungen").upload(pfad, pdf, { contentType: "application/pdf" });
  if (hoch) { console.error(`${r.nummer}: ${hoch.message}`); process.exitCode = 1; continue; }
  const { error: upd } = await sb.from("eingangsrechnungen")
    .update({ datei_pfad: pfad, datei_name: `${r.nummer ?? "Tankbeleg"}.pdf`, datei_mime: "application/pdf" }).eq("id", r.id);
  if (upd) { console.error(`${r.nummer}: ${upd.message}`); process.exitCode = 1; continue; }
  console.log(`✓ ${r.lieferant} ${r.nummer ?? ""}: PDF (${Math.round(pdf.length / 1024)} KB)`);
}
if (!liste.length) console.log("Alle Eingangsrechnungen haben schon eine Datei.");
