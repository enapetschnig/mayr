// Durchklick-Test am Handy (390 px): die Kette eines Auftrags in der echten
// Oberfläche, jede Speicherung in der Datenbank nachgeprüft.
//
//   APP_URL=http://127.0.0.1:8093 MONTEUR_PW=… CHEF_PW=… node tests/durchlauf.mjs
//   DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs   danach IMMER
//
// Monteur Max: Projekt „TEST Durchlauf …“ für einen Demo-Kunden anlegen → 4 h
// buchen → Material aus seinem Bus ausfassen (Code eintippen, wie ohne Kamera)
// → Regiebericht: die 4 h übernehmen statt doppelt buchen, Material,
// Kundenunterschrift. Chef: Rechnung aus dem Projekt übernehmen, speichern,
// fertigstellen, PDF (abgelegtes Original).
// Bilder und PDF landen in tests/bilder/durchlauf-* (nicht im Repo).
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";

const URL = process.env.APP_URL || "http://127.0.0.1:8093";
const MONTEUR_PW = process.env.MONTEUR_PW;
const CHEF_PW = process.env.CHEF_PW;
if (!MONTEUR_PW || !CHEF_PW) {
  console.error("MONTEUR_PW und CHEF_PW fehlen (Passwörter der Demo-Konten max und chef).");
  process.exit(1);
}
const BILDER = "tests/bilder";
fs.mkdirSync(BILDER, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)));
const NAME = `TEST Durchlauf ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`;
const KUNDE = "Familie Huber";
const EAN_ABOX_025 = "4013902662678";
const EAN_ABOX_040 = "4013902661954";

let fehlgeschlagen = 0;
const ok = (bedingung, text) => {
  if (!bedingung) fehlgeschlagen++;
  console.log((bedingung ? "✓ " : "✗ FEHLER ") + text);
};

// Nachprüfen in der Datenbank als Chef (sieht alles, RLS wie in der App)
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });
{
  const { error } = await db.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: CHEF_PW });
  if (error) throw new Error(`Chef-Anmeldung für die Prüfung: ${error.message}`);
}
const { data: maxProfil } = await db.from("profiles").select("id").eq("email", "max@elektro.handwerkapp.at").single();

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const fehler = [];

async function sitzung(benutzer, passwort) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("mayr.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(`[${benutzer}] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") fehler.push(`[${benutzer}] console: ${m.text()}`); });
  await page.goto(`${URL}/auth`);
  await page.locator("#benutzer").fill(benutzer);
  await page.locator("#password").fill(passwort);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15000 });
  return page;
}
const bild = (page, name) => page.screenshot({ path: `${BILDER}/durchlauf-${name}.png`, fullPage: true });

/** Code im Scanner eintippen (wie ohne Kamera-Erlaubnis) und den Scanner schließen */
async function codeEintippen(page, code) {
  const feld = page.getByPlaceholder("Code eintippen");
  await feld.fill(code);
  await feld.press("Enter");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Schließen" }).click();
}

try {
  const max = await sitzung("max", MONTEUR_PW);

  // ── 1. Projekt anlegen ────────────────────────────────────────────────
  console.log(`\n— Monteur Max: ${NAME} —`);
  await max.goto(`${URL}/projekte?neu=1`);
  // Kunde zuerst — die Wahl füllt den Projektnamen vor, der danach ersetzt wird
  await max.getByRole("button", { name: /Kunde wählen oder neu anlegen/ }).click();
  await max.getByPlaceholder(/^Name, Ort/).fill(KUNDE.split(" ").pop());
  await max.getByRole("button", { name: new RegExp(KUNDE) }).click();
  await max.locator("#p-name").fill(NAME);
  await max.getByRole("button", { name: "Projekt anlegen" }).click();
  await max.waitForURL(/\/projekte\/[0-9a-f-]{36}/, { timeout: 15000 });
  const projektId = max.url().match(/projekte\/([0-9a-f-]{36})/)[1];
  const { data: pr } = await db.from("projekte").select("nummer, status, kunden(name)").eq("id", projektId).single();
  ok(/^\d{4}-\d{4}$/.test(pr?.nummer ?? "") && pr.kunden?.name === KUNDE, `Projekt ${pr?.nummer} für ${pr?.kunden?.name ?? "—"} angelegt`);

  // ── 2. Stunden über „Stunden buchen“ auf der Startseite ───────────────
  await max.goto(`${URL}/`);
  await max.getByRole("button", { name: /Stunden.*buchen/ }).first().click();
  await max.locator("#z-projekt").click();
  await max.getByRole("option", { name: new RegExp(NAME) }).click();
  await max.getByRole("button", { name: "4 h", exact: true }).click();
  await max.locator("#z-taetigkeit").fill("TEST Durchlauf: Leitungen eingezogen");
  await max.getByRole("button", { name: /4 h buchen/ }).click();
  await max.waitForTimeout(1500);
  const { data: zeiten } = await db.from("zeiten").select("id, stunden, user_id").eq("projekt_id", projektId);
  ok(zeiten?.length === 1 && Number(zeiten[0].stunden) === 4 && zeiten[0].user_id === maxProfil.id, "4 h für Max auf dem Projekt");

  // ── 3. Material aus dem Bus ausfassen ─────────────────────────────────
  await max.goto(`${URL}/scan?modus=ausfassung&projekt=${projektId}`);
  await max.getByRole("button", { name: /Bus 1/ }).click();
  await max.getByRole("button", { name: "Scannen", exact: true }).click();
  await codeEintippen(max, EAN_ABOX_025);
  await bild(max, "3-scan-liste");
  await max.getByRole("button", { name: /ausfassen$/ }).click();
  await max.waitForTimeout(1500);
  const { data: mb } = await db.from("material_buchungen").select("art, menge, lagerort_id, lagerorte(name)").eq("projekt_id", projektId);
  ok(mb?.length === 1 && mb[0].art === "ausfassung" && Number(mb[0].menge) === 1 && /Bus 1/.test(mb[0].lagerorte?.name ?? ""),
    `1 Abzweigkasten aus ${mb?.[0]?.lagerorte?.name ?? "?"} ausgefasst`);

  // ── 4. Regiebericht: Stunden übernehmen, Material, Unterschrift ───────
  await max.goto(`${URL}/regie/neu?projekt=${projektId}`);
  await max.getByPlaceholder(/Was wurde gemacht/).fill("TEST Durchlauf: Steckdose getauscht, FI geprüft.");
  await max.waitForTimeout(800);
  await bild(max, "4-regie-neu");
  // „Heute schon gebucht: Max 4 h — Übernehmen“ statt die Stunden doppelt zu erfassen
  await max.getByRole("button", { name: /Max Monteur.*Übernehmen$/ }).click();
  await max.getByRole("button", { name: "Scannen", exact: true }).click();
  await codeEintippen(max, EAN_ABOX_040);
  await bild(max, "4-regie-ausgefuellt");
  await max.getByRole("button", { name: /Unterschreiben lassen/ }).click();
  await max.locator("#ku-name").fill("TEST Kunde");
  await bild(max, "4-regie-pruefen");
  await max.getByRole("button", { name: /Weiter zur Unterschrift/ }).click();
  const feld = await max.getByLabel("Unterschriftsfeld").boundingBox();
  await max.mouse.move(feld.x + feld.width * 0.15, feld.y + feld.height * 0.6);
  await max.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await max.mouse.move(feld.x + feld.width * (0.15 + i * 0.03), feld.y + feld.height * (0.6 - 0.25 * Math.sin(i / 2)));
  }
  await max.mouse.up();
  await max.getByRole("button", { name: /Unterschrift bestätigen/ }).click();
  await max.getByText("Unterschrieben", { exact: true }).first().waitFor({ timeout: 20000 });
  await max.waitForTimeout(1000);
  await bild(max, "4-regie-unterschrieben");

  const { data: rb } = await db.from("regieberichte").select("id, nummer, status, unterschrift_name, unterschrift_pfad, unterschrieben_am")
    .eq("projekt_id", projektId).single();
  ok(rb?.status === "unterschrieben" && rb.unterschrift_name === "TEST Kunde" && !!rb.unterschrieben_am,
    `Regiebericht ${rb?.nummer} vom Kunden unterschrieben`);
  const { data: alleZeiten } = await db.from("zeiten").select("id, stunden, regiebericht_id").eq("projekt_id", projektId);
  ok(alleZeiten?.length === 1 && alleZeiten[0].regiebericht_id === rb?.id && Number(alleZeiten[0].stunden) === 4,
    "die 4 h stecken jetzt im Bericht — nicht doppelt gebucht");
  const { data: rm } = await db.from("material_buchungen").select("menge, art").eq("regiebericht_id", rb?.id);
  ok(rm?.length === 1 && Number(rm[0].menge) === 1, `Material im Bericht: ${rm?.length ?? 0} Position(en)`);
  const { data: bildDatei } = await db.storage.from("projekt-dateien").list(`${projektId}/unterschriften`);
  ok(bildDatei?.some((d) => rb && d.name === `${rb.id}.png`), "Unterschriftsbild im Speicher");
  const { error: aendern } = await db.from("regieberichte").update({ arbeiten: "nachträglich" }).eq("id", rb?.id);
  ok(!!aendern, "unterschriebener Bericht ist festgeschrieben");

  // ── 5. Chef: Rechnung aus dem Projekt ─────────────────────────────────
  console.log("\n— Chef: Rechnung aus dem Projekt —");
  const chef = await sitzung("chef", CHEF_PW);
  // wie „Rechnung schreiben“ im Ordner Belege des Projekts: Import geht gleich auf
  await chef.goto(`${URL}/belege/neu?typ=rechnung&projekt=${projektId}&import=1`);
  const uebernehmen = chef.getByRole("button", { name: /Positionen? übernehmen/ });
  await uebernehmen.waitFor({ timeout: 15000 });
  await bild(chef, "5-import");
  const importText = await chef.getByRole("dialog").innerText();
  ok(/Unterschriebene Regieberichte/.test(importText) && /Material ohne Regiebericht/.test(importText) && !/Stunden ohne Regiebericht/.test(importText),
    "Import bietet den Bericht und das ausgefasste Material an — die 4 h nur einmal (im Bericht)");
  await uebernehmen.click();
  await chef.getByRole("button", { name: "Speichern", exact: true }).click();
  await chef.waitForURL(/\/belege\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const belegId = chef.url().match(/belege\/([0-9a-f-]{36})/)[1];
  await chef.waitForTimeout(800);
  await bild(chef, "5-entwurf");

  const { data: entwurf } = await db.from("belege").select("status, nummer, empf_name").eq("id", belegId).single();
  ok(entwurf?.status === "entwurf" && !entwurf.nummer && entwurf.empf_name === KUNDE, `Entwurf an ${entwurf?.empf_name ?? "—"} gespeichert, noch ohne Nummer`);
  const { data: pos } = await db.from("beleg_positionen").select("art, bezeichnung, menge, einheit, einzelpreis, gesamt").eq("beleg_id", belegId).order("pos");
  const stundenPos = (pos ?? []).filter((p) => p.einheit === "h");
  ok(stundenPos.reduce((s, p) => s + Number(p.menge), 0) === 4, `Rechnung: ${stundenPos.map((p) => `${p.menge} h ${p.bezeichnung}`).join(", ") || "keine Stunden"}`);
  const materialPos = (pos ?? []).filter((p) => /Abzweigkasten/.test(p.bezeichnung));
  ok(materialPos.length === 2 && materialPos.every((p) => Number(p.einzelpreis) > 0),
    `Rechnung: ${materialPos.map((p) => `${p.menge} ${p.einheit} ${p.bezeichnung.split(" ").slice(0, 3).join(" ")} à ${p.einzelpreis}`).join(", ") || "kein Material"}`);

  // Verrechnet wird an der Quelle — schon beim Speichern des Entwurfs
  const quellen = async () => {
    const [{ data: z }, { data: m }, { data: r }] = await Promise.all([
      db.from("zeiten").select("id, rechnung_id").eq("projekt_id", projektId),
      db.from("material_buchungen").select("id, rechnung_id").or(`projekt_id.eq.${projektId},regiebericht_id.eq.${rb.id}`),
      db.from("regieberichte").select("id, rechnung_id").eq("projekt_id", projektId),
    ]);
    return { z: z ?? [], m: m ?? [], r: r ?? [] };
  };
  const q = await quellen();
  const alle = [...q.z, ...q.m, ...q.r];
  ok(q.z.length === 1 && q.m.length === 2 && q.r.length === 1 && alle.every((x) => x.rechnung_id === belegId),
    `Stunde, ${q.m.length} Materialbuchungen und Bericht an der Quelle verrechnet (${alle.filter((x) => x.rechnung_id === belegId).length}/${alle.length})`);

  await chef.getByRole("button", { name: /Fertigstellen — Nummer vergeben/ }).click();
  await chef.getByText("Rechnung fertigstellen?").waitFor({ timeout: 5000 });
  await bild(chef, "5-fertigstellen");
  await chef.getByRole("button", { name: "Fertigstellen", exact: true }).last().click();
  await chef.getByText(/ist fertig\./).first().waitFor({ timeout: 15000 });
  await chef.waitForTimeout(800);
  await bild(chef, "5-rechnung");

  const { data: re } = await db.from("belege").select("nummer, status, empf_name, leistung_von, leistung_bis").eq("id", belegId).single();
  ok(/^RE-\d{4}-\d{3,}$/.test(re?.nummer ?? "") && re.status === "offen", `Rechnung ${re?.nummer} fertig, Status ${re?.status}`);
  ok(!!re?.leistung_von && !!re?.leistung_bis, `Leistungszeitraum ${re?.leistung_von} – ${re?.leistung_bis}`);
  const { error: reAendern } = await db.from("belege").update({ betreff: "nachträglich" }).eq("id", belegId);
  ok(!!reAendern, "fertige Rechnung ist festgeschrieben");
  const { error: zeitAendern } = await db.from("zeiten").update({ stunden: 5 }).eq("id", q.z[0].id);
  ok(!!zeitAendern, "verrechnete Stunde ist festgeschrieben");

  // Beim Fertigstellen legt die App das PDF ab (im Hintergrund, kurz warten)
  let archiv = null;
  for (let i = 0; i < 30 && !archiv; i++) {
    const { data } = await db.storage.from("beleg-archiv").download(`${belegId}.pdf`);
    if (data) archiv = Buffer.from(await data.arrayBuffer());
    else await new Promise((r) => setTimeout(r, 500));
  }
  ok(!!archiv, "PDF beim Fertigstellen abgelegt (beleg-archiv)");
  const { error: ueber } = await db.storage.from("beleg-archiv").upload(`${belegId}.pdf`, new Blob(["x"]), { contentType: "application/pdf", upsert: true });
  ok(!!ueber, "abgelegtes PDF lässt sich nicht überschreiben");
  const { data: weg } = await db.storage.from("beleg-archiv").remove([`${belegId}.pdf`]);
  ok(!weg?.length, "und nicht löschen, solange es die Rechnung gibt");

  // PDF: am Handy ohne Teilen-Funktion wird es heruntergeladen
  const [download] = await Promise.all([
    chef.waitForEvent("download", { timeout: 15000 }),
    chef.getByRole("button", { name: "PDF", exact: true }).first().click(),
  ]);
  const pdfPfad = `${BILDER}/durchlauf-rechnung.pdf`;
  await download.saveAs(pdfPfad);
  const pdfText = execFileSync("pdftotext", ["-layout", pdfPfad, "-"], { encoding: "utf8" });
  ok(pdfText.includes(re?.nummer) && pdfText.includes(KUNDE) && pdfText.includes(pr.nummer),
    `PDF ${download.suggestedFilename()}: Nummer, Kunde und Projekt ${pr.nummer} drin`);
  ok(!!archiv && archiv.equals(fs.readFileSync(pdfPfad)), "der PDF-Knopf liefert genau das abgelegte Original");
} catch (e) {
  fehlgeschlagen++;
  console.log(`✗ FEHLER Abbruch: ${e.message.split("\n")[0]}`);
} finally {
  if (fehler.length) console.log("\nFehler im Browser:\n" + [...new Set(fehler)].join("\n"));
  await browser.close();
}
console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt aufräumen: DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs");
process.exit(fehlgeschlagen ? 1 : 0);
