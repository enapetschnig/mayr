// Erzeugt die PDFs zu den Demo-Dokumenten aus 04-personal.sql (Lohnzettel,
// Anmeldung, Krankenschein, Zertifikat, Firmendokumente) und lädt sie in die
// Buckets „personal“ und „firmen-dokumente“. Jedes PDF trägt groß
// „DEMO-BELEG — keine echten Daten“. Wiederholbar (alte Datei wird ersetzt).
//
//   DEMO_CHEF_PASSWORT=… node supabase/demo/personal-dokumente.mjs
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
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monat = (iso) => (iso ? `${MONATE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "");

const { data: firma } = await sb.from("firma").select("name, strasse, plz, ort").eq("id", 1).maybeSingle();
const { data: leute } = await sb.from("profiles").select("id, vorname, nachname, wochenstunden");
const person = (id) => leute.find((p) => p.id === id) ?? { vorname: "?", nachname: "", wochenstunden: 38.5 };

function grundgeruest(titel) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(firma?.name ?? "Betrieb", 20, 20);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text([firma?.strasse, [firma?.plz, firma?.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · "), 20, 25);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(titel, 20, 42);
  // Wasserzeichen
  pdf.setTextColor(200, 40, 40);
  pdf.setFontSize(10);
  pdf.text("DEMO-BELEG — keine echten Daten", 20, 285);
  pdf.setTextColor(0, 0, 0);
  return pdf;
}

function lohnzettel(d) {
  const p = person(d.user_id);
  const std = Number(p.wochenstunden ?? 38.5);
  // erfundene, runde Demo-Werte — kein Kollektivvertrag
  const brutto = Math.round((std / 38.5) * (p.vorname === "Lisa" || p.vorname === "Jonas" ? 1180 : 3150) * 100) / 100;
  const sv = Math.round(brutto * 0.1812 * 100) / 100;
  const lst = Math.round(Math.max(0, (brutto - sv - 1100) * 0.2) * 100) / 100;
  const pdf = grundgeruest(`Lohnzettel ${monat(d.monat)}`);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`${p.vorname} ${p.nachname}`, 20, 52);
  pdf.text(`Wochenstunden: ${std.toLocaleString("de-AT")}`, 20, 57);
  autoTable(pdf, {
    startY: 66,
    head: [["Bezeichnung", "Betrag"]],
    body: [
      ["Grundlohn / Gehalt", euro(brutto)],
      ["Sozialversicherung Dienstnehmer", `− ${euro(sv)}`],
      ["Lohnsteuer", `− ${euro(lst)}`],
      ["Auszahlung", euro(brutto - sv - lst)],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (c) => { if (c.row.index === 3) c.cell.styles.fontStyle = "bold"; },
  });
  return pdf;
}

function einfach(titel, zeilen) {
  const pdf = grundgeruest(titel);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(zeilen, 20, 54, { maxWidth: 170, lineHeightFactor: 1.5 });
  return pdf;
}

async function hochladen(bucket, pfad, pdf) {
  const blob = new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
  await sb.storage.from(bucket).remove([pfad]);
  const { error } = await sb.storage.from(bucket).upload(pfad, blob, { contentType: "application/pdf" });
  if (error) throw new Error(`${pfad}: ${error.message}`);
  return blob.size;
}

let n = 0;
const { data: personal, error: e1 } = await sb.from("personal_dokumente").select("*").like("pfad", "%/demo-%");
if (e1) { console.error(e1.message); process.exit(1); }
for (const d of personal) {
  const p = person(d.user_id);
  const pdf = d.art === "lohnzettel" ? lohnzettel(d)
    : d.art === "anmeldung" ? einfach("Anmeldung zur Sozialversicherung", [`Dienstnehmer: ${p.vorname} ${p.nachname}`, "Beschäftigung: Lehrling Elektrotechnik", "Meldung an die ÖGK (Muster)"])
    : d.art === "krankenschein" ? einfach("Arbeitsunfähigkeitsmeldung", [`${p.vorname} ${p.nachname}`, d.titel ?? "", "Bestätigung der Ärztin (Muster)"])
    : einfach(d.titel ?? "Dokument", [`${p.vorname} ${p.nachname}`, "Zeugnis / Zertifikat (Muster)"]);
  const groesse = await hochladen("personal", d.pfad, pdf);
  await sb.from("personal_dokumente").update({ groesse }).eq("id", d.id);
  n++;
}
const { data: firmendoks, error: e2 } = await sb.from("firmen_dokumente").select("*").like("pfad", "firma/demo-%");
if (e2) { console.error(e2.message); process.exit(1); }
for (const d of firmendoks) {
  const pdf = einfach(d.titel, [d.ordner, d.beschreibung ?? "", d.gueltig_bis ? `Gültig bis ${d.gueltig_bis.split("-").reverse().join(".")}` : ""].filter(Boolean));
  const groesse = await hochladen("firmen-dokumente", d.pfad, pdf);
  await sb.from("firmen_dokumente").update({ groesse }).eq("id", d.id);
  n++;
}
console.log(`${n} Demo-Dokumente erzeugt und hochgeladen.`);
