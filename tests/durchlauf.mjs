// Durchklick-Test am Handy-Format: der ganze Weg vom Projekt bis zur bezahlten Rechnung.
// Aufruf: node tests/durchlauf.mjs <schritt>   (Screenshots nach tests/bilder/)
import { chromium } from "@playwright/test";
import fs from "fs";

const URL = process.env.APP_URL || "http://localhost:8093";
const PW = "Test-Passwort-2026!";
const BILDER = "tests/bilder";
fs.mkdirSync(BILDER, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const fehler = [];

async function sitzung(wer) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: "de-AT" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(`[${wer}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(`[${wer}] console: ${m.text()}`); });
  await page.goto(`${URL}/auth`);
  await page.getByLabel("E-Mail").fill(`rlstest-${wer}@mayr-test.at`);
  await page.getByLabel("Passwort").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.getByText("Schnell festhalten").waitFor();
  return page;
}
const bild = (page, name) => page.screenshot({ path: `${BILDER}/${name}.png`, fullPage: true });
const toast = async (page, text) => page.getByText(text).first().waitFor({ timeout: 10000 });

// ── 1. MAM legt ein gemeinsames Projekt an und bucht darauf ──
const mam = await sitzung("mam");
await bild(mam, "01-start-mam");

await mam.getByRole("button", { name: "+ Projekt" }).click();
await mam.getByLabel("Projektname").fill("EFH Huber Kremsmünster");
await mam.getByRole("button", { name: /Mit allen teilen/ }).click();
await mam.getByRole("button", { name: /Kunde, Adresse/ }).click();
await mam.getByLabel("Kundenname").fill("Familie Huber");
await mam.getByLabel("Kunde Straße").fill("Kirchenplatz 3");
await mam.getByLabel("Kunde PLZ").fill("4550");
await mam.getByLabel("Kunde Ort").fill("Kremsmünster");
await mam.getByRole("button", { name: "= Adresse des Kunden" }).click();
await bild(mam, "02-projekt-anlegen");
await mam.getByRole("button", { name: "Projekt anlegen" }).click();
await mam.waitForURL(/\/projekte\/[0-9a-f-]{36}/);
const projektUrl = mam.url();
await mam.getByText("Ich bin GU").waitFor();
await bild(mam, "03-projekt-detail");

// Stunden
await mam.getByRole("button", { name: "+ Stunden" }).click();
await mam.getByRole("button", { name: "7 h", exact: true }).click();
await mam.getByLabel(/Was wurde gemacht/).fill("Verteiler gesetzt, Zuleitung");
await bild(mam, "04-stunden");
await mam.getByRole("button", { name: /7 h speichern/ }).click();
await toast(mam, "7 h gebucht");

// Material: zwei Positionen am Stück
await mam.getByRole("button", { name: "+ Material" }).click();
await mam.locator("#m-bez").fill("NYM-J 3x1,5");
await mam.getByLabel("Menge").fill("100");
await mam.getByLabel(/EK je Einheit/).fill("0,85");
await mam.getByRole("button", { name: "Speichern & nächstes" }).click();
await toast(mam, "NYM-J 3x1,5 gebucht");
await mam.locator("#m-bez").fill("Unterputzdose");
await mam.getByLabel("Menge").fill("20");
await mam.getByLabel(/EK je Einheit/).fill("0,40");
await bild(mam, "05-material");
await mam.getByRole("button", { name: "Speichern", exact: true }).click();
await toast(mam, "Material gebucht");

// Foto
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await mam.getByRole("button", { name: "+ Foto" }).click();
await mam.locator('input[type=file][accept="image/*"]').setInputFiles({ name: "verteiler.png", mimeType: "image/png", buffer: png });
await mam.getByLabel(/Notiz/).fill("Verteiler EG");
await bild(mam, "06-foto");
await mam.getByRole("button", { name: /1 Datei ablegen/ }).click();
await toast(mam, "1 Datei abgelegt");
await mam.getByRole("tab", { name: "Fotos & Dateien" }).click();
await mam.locator("img[alt='Verteiler EG']").waitFor();

// Termin — soll sich automatisch auf "Für alle" stellen
await mam.getByRole("button", { name: "+ Termin" }).click();
await mam.getByLabel("Titel").fill("Abnahme Elektro");
await mam.getByText("Gemeinsames Projekt — Termin ist für alle sichtbar.").waitFor();
await bild(mam, "07-termin");
await mam.getByRole("button", { name: "Speichern", exact: true }).click();
await toast(mam, "Termin gespeichert");

// ── 2. Nord (SU) bucht und schreibt die Rechnung an MAM ──
const nord = await sitzung("nord");
await nord.goto(projektUrl);
await nord.getByText("Ich bin SU").waitFor();
await bild(nord, "08-projekt-als-su");
await nord.getByRole("button", { name: "+ Stunden" }).click();
await nord.getByRole("button", { name: "Von – Bis" }).click();
await nord.getByLabel("Von").fill("07:00");
await nord.getByLabel("Bis", { exact: true }).fill("15:30");
await nord.getByLabel("Pause (Min.)").fill("30");
await nord.getByRole("button", { name: /8 h speichern/ }).click();
await toast(nord, "8 h gebucht");
await nord.getByRole("button", { name: "+ Material" }).click();
await nord.locator("#m-bez").fill("FI-Schalter 40A");
await nord.getByLabel("Menge").fill("2");
await nord.getByLabel(/EK je Einheit/).fill("38");
await nord.getByRole("button", { name: "Speichern", exact: true }).click();
await toast(nord, "Material gebucht");

await nord.getByRole("button", { name: /Rechnung an GU/ }).click();
await nord.waitForURL(/rechnungen\/neu/);
await nord.getByRole("button", { name: /Stunden & Material aus Projekt/ }).click();
await nord.getByLabel("Aufschlag %").fill("20");
await bild(nord, "09-import");
await nord.getByRole("button", { name: /Übernehmen/ }).click();
await bild(nord, "10-su-rechnung");
await nord.getByRole("button", { name: "Fertigstellen" }).click();
await nord.getByRole("alertdialog").getByRole("button", { name: "Fertigstellen" }).click();
await toast(nord, /NORD-\d{4}-\d{3} ist fertig/);
await nord.getByText("Offen").first().waitFor();
const [dl] = await Promise.all([nord.waitForEvent("download"), nord.getByRole("button", { name: "PDF" }).click()]);
await dl.saveAs(`${BILDER}/su-rechnung.pdf`);
await bild(nord, "11-su-rechnung-fertig");

// ── 3. MAM (GU) sieht den Eingang und rechnet mit dem Kunden ab ──
await mam.goto(`${URL}/rechnungen?ansicht=eingang`);
await mam.getByText(/NORD-\d{4}/).first().waitFor();
await bild(mam, "12-eingang-von-kollegen");
await mam.goto(projektUrl);
await mam.getByRole("tab", { name: "Rechnungen" }).click();
await mam.getByRole("button", { name: "Rechnung an Kunden" }).click();
await mam.waitForURL(/rechnungen\/neu/);
await mam.getByRole("button", { name: /Stunden & Material aus Projekt/ }).click();
await mam.getByRole("button", { name: /Übernehmen/ }).click();
await mam.getByRole("button", { name: /Von Kollegen übernehmen/ }).click();
await mam.getByLabel("Aufschlag %").fill("10");
await mam.getByRole("button", { name: /Übernehmen/ }).click();
await bild(mam, "13-kundenrechnung");
await mam.getByRole("button", { name: "Fertigstellen" }).click();
await mam.getByRole("alertdialog").getByRole("button", { name: "Fertigstellen" }).click();
await toast(mam, /MAM-\d{4}-\d{3} ist fertig/);
const [dl2] = await Promise.all([mam.waitForEvent("download"), mam.getByRole("button", { name: "PDF" }).click()]);
await dl2.saveAs(`${BILDER}/kunden-rechnung.pdf`);
await mam.getByRole("button", { name: "Bezahlt" }).click();
await toast(mam, "Bezahlt");
await bild(mam, "14-kundenrechnung-bezahlt");

// ── 4. Übersichten ──
await mam.goto(`${URL}/kalender`);
await mam.getByText("Abnahme Elektro").first().waitFor().catch(() => {});
await bild(mam, "15-kalender");
await mam.goto(`${URL}/auswertung`);
await bild(mam, "16-auswertung");
await mam.goto(`${URL}/`);
await bild(mam, "17-start-danach");

// ── 5. Süd sieht das Projekt, aber keine Rechnung und keine privaten Buchungen ──
const sued = await sitzung("sued");
await sued.goto(`${URL}/rechnungen`);
await bild(sued, "18-sued-rechnungen");
const suedSiehtRechnung = await sued.getByText(/NORD-|MAM-/).count();
await sued.goto(projektUrl);
await sued.getByRole("tab", { name: "Stunden" }).click();
await bild(sued, "19-sued-stunden");
const suedSiehtStunden = await sued.getByText("Verteiler gesetzt").count();

console.log(JSON.stringify({ projektUrl, suedSiehtRechnung, suedSiehtStunden, fehler: [...new Set(fehler.map((f) => f.slice(0, 300)))] }, null, 2));
await browser.close();
