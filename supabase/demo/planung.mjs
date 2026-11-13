// Erzeugt die Demo-Planung „Dachbelegung“ (2 Seiten: Modulbelegung,
// Stringplan) für jede Planungs-Datei mit Pfad „…/demo-dachbelegung.pdf“ und
// lädt sie in den Bucket „projekt-dateien“. Deutlich als DEMO gekennzeichnet.
// Die Zeile in `dateien` legt supabase/demo/04-projekte.sql an.
//
//   DEMO_CHEF_PASSWORT=… node supabase/demo/planung.mjs
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
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

const { data: dateien, error } = await sb.from("dateien").select("id, pfad, projekt_id, projekte(nummer, name, strasse, plz, ort)")
  .like("pfad", "%/demo-dachbelegung.pdf");
if (error) { console.error(error.message); process.exit(1); }

function stempel(doc) {
  doc.setTextColor(200, 40, 40);
  doc.setFontSize(64);
  doc.setFont("helvetica", "bold");
  doc.text("DEMO", 148, 120, { align: "center", angle: 20 });
  doc.setTextColor(0, 0, 0);
}

function kopf(doc, p, titel) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titel, 15, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${p.nummer} · ${p.name} · ${[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}`, 15, 22);
  doc.text("DEMO-PLAN — erfunden, nicht zur Ausführung", 282, 16, { align: "right" });
}

function pdf(p) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  // Seite 1: Dachbelegung, 2 Reihen × 15 Module auf dem Süddach
  kopf(doc, p, "Dachbelegung Süd — 30 Module à 410 Wp = 12,3 kWp");
  doc.setDrawColor(120);
  doc.setLineWidth(0.6);
  doc.lines([[240, 0], [-30, -90], [-180, 0], [-30, 90]], 25, 185, [1, 1], "S", true); // Dachfläche (Trapez)
  doc.setFontSize(8);
  doc.text("First", 145, 92, { align: "center" });
  doc.text("Traufe", 145, 191, { align: "center" });
  const breite = 11.2, hoehe = 18;
  for (let reihe = 0; reihe < 2; reihe++) {
    for (let i = 0; i < 15; i++) {
      const x = 62 + i * (breite + 0.8);
      const y = 115 + reihe * (hoehe + 6);
      doc.setFillColor(reihe === 0 ? 205 : 225, reihe === 0 ? 220 : 205, 240);
      doc.rect(x, y, breite, hoehe, "FD");
      doc.text(`${reihe === 0 ? "A" : "B"}${i + 1}`, x + breite / 2, y + hoehe / 2 + 1, { align: "center" });
    }
  }
  doc.setFontSize(9);
  doc.text("String A: Module A1–A15 (oben) · String B: Module B1–B15 (unten) · Randabstand mind. 30 cm · Haken alle 1,2 m", 15, 200);
  stempel(doc);

  // Seite 2: Stringplan
  doc.addPage("a4", "landscape");
  kopf(doc, p, "Stringplan");
  doc.setFontSize(11);
  const zeilen = [
    ["String", "Module", "Uoc (-10 °C)", "Impp", "MPPT", "Leitung"],
    ["A", "15 × 410 Wp", "ca. 560 V", "ca. 13 A", "MPPT 1", "Solarkabel 6 mm²"],
    ["B", "15 × 410 Wp", "ca. 560 V", "ca. 13 A", "MPPT 2", "Solarkabel 6 mm²"],
  ];
  zeilen.forEach((z, r) => {
    doc.setFont("helvetica", r === 0 ? "bold" : "normal");
    z.forEach((t, c) => doc.text(t, 20 + c * 44, 45 + r * 10));
  });
  doc.setFont("helvetica", "normal");
  doc.text("Wechselrichter: Hybrid 10 kW, 3-phasig · Speicher 10 kWh DC-gekoppelt · Einspeisebegrenzung 70 %", 20, 90);
  doc.text("Überspannungsschutz DC Typ 2 je String im Generatoranschlusskasten · Potentialausgleich 6 mm² Cu", 20, 98);
  doc.setFontSize(8);
  doc.text("Werte gerundet, Demo — vor Ausführung mit den Datenblättern rechnen.", 20, 110);
  stempel(doc);
  return Buffer.from(doc.output("arraybuffer"));
}

for (const d of dateien ?? []) {
  const inhalt = pdf(d.projekte);
  // Überschreiben verbietet der Speicher — erst weg, dann neu
  await sb.storage.from("projekt-dateien").remove([d.pfad]);
  const { error: e } = await sb.storage.from("projekt-dateien").upload(d.pfad, inhalt, { contentType: "application/pdf" });
  if (e) { console.error(`${d.pfad}: ${e.message}`); continue; }
  await sb.from("dateien").update({ groesse: inhalt.length }).eq("id", d.id);
  console.log(`✓ ${d.projekte.nummer} Dachbelegung (${Math.round(inhalt.length / 1024)} KB)`);
}
