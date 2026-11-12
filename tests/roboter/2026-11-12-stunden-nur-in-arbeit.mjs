// Probefahrt 12.11.2026: Stunden-Dialog bietet keine Projekte im Status „Angebot“ an.
// Anlass: Fehlerprotokoll „Auf dieses Projekt kann nicht mehr gebucht werden — es ist nicht
// „In Arbeit“ (Angebot)“ — der Dialog hatte das zuletzt bebuchte Projekt vorbelegt, auch wenn
// es inzwischen (wieder) ein Angebot war, und die Schnellwahl zeigte es an.
//
// Läuft gegen die Testumgebung (testumgebung.mjs start), NIE gegen die echte Datenbank:
//   APP_URL=http://127.0.0.1:55910 API_URL=http://127.0.0.1:55900 SERVICE_ROLE_KEY=… \
//   node tests/roboter/2026-11-12-stunden-nur-in-arbeit.mjs
// Legt selbst an: Monteur zz-monteur@test.local, Projekte „ZZ Laufend“ und „ZZ Nur Angebot“
// (zuletzt gebucht auf das Angebot). Räumt danach wieder auf.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { APP_URL, API_URL, SERVICE_ROLE_KEY } = process.env;
if (!APP_URL || !API_URL || !SERVICE_ROLE_KEY) throw new Error("APP_URL, API_URL und SERVICE_ROLE_KEY setzen (Testumgebung).");
if (/supabase\.co/.test(API_URL)) throw new Error("Nur gegen die Testumgebung.");

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "zz-monteur@test.local", PW = "test1234!";
let fehlschlaege = 0;
const ok = (b, text) => { console.log(`${b ? "✓" : "✗"} ${text}`); if (!b) fehlschlaege++; };

// Vorbereiten
const alt = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === EMAIL);
if (alt) await admin.auth.admin.deleteUser(alt.id);
const { data: neu, error: eU } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true });
if (eU) throw eU;
const uid = neu.user.id;
await admin.from("projekte").delete().in("name", ["ZZ Laufend", "ZZ Nur Angebot"]);
await admin.from("profiles").update({ aktiv: true, rolle: "monteur", vorname: "ZZ", nachname: "Monteur" }).eq("id", uid);
const { data: prj, error: eP } = await admin.from("projekte")
  .insert([{ name: "ZZ Laufend", status: "aktiv" }, { name: "ZZ Nur Angebot", status: "aktiv" }]).select("id, name");
if (eP) throw eP;
const laufend = prj.find((p) => p.name === "ZZ Laufend"), angebot = prj.find((p) => p.name === "ZZ Nur Angebot");
const gestern = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
await admin.from("zeiten").insert({ user_id: uid, projekt_id: laufend.id, datum: gestern, stunden: 1, created_at: new Date(Date.now() - 60e3).toISOString() });
await admin.from("zeiten").insert({ user_id: uid, projekt_id: angebot.id, datum: gestern, stunden: 1 });
await admin.from("projekte").update({ status: "angebot" }).eq("id", angebot.id);

const fehler = [];
let browser;
try {
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-AT", timezoneId: "Europe/Vienna" });
  await ctx.addInitScript(() => localStorage.setItem("mayr.installhinweis", "x"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fehler.push(e.message));
  await page.goto(`${APP_URL}/auth`);
  await page.locator("#benutzer").fill(EMAIL);
  await page.locator("#password").fill(PW);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });

  // Stunden ohne Vorgabe: vorbelegt ist das laufende Projekt, nicht das Angebot
  await page.getByRole("button", { name: /Stunden.*buchen/ }).first().click();
  await page.locator("#z-projekt").waitFor();
  await page.waitForTimeout(1500);
  const vorbelegt = await page.locator("#z-projekt").innerText();
  ok(/ZZ Laufend/.test(vorbelegt) && !/Angebot/.test(vorbelegt), `vorbelegt: ${vorbelegt.replace(/\s+/g, " ").trim()}`);
  const dialog = page.getByRole("dialog");
  ok(await dialog.getByRole("button", { name: "ZZ Nur Angebot" }).count() === 0, "Schnellwahl zeigt das Angebot nicht");
  ok(await dialog.getByRole("button", { name: "ZZ Laufend" }).count() === 1, "Schnellwahl zeigt das laufende Projekt");
  await page.locator("#z-projekt").click();
  ok(await page.getByRole("option", { name: /ZZ Nur Angebot/ }).count() === 0, "Auswahl bietet das Angebot nicht an");
  await page.getByRole("option", { name: /ZZ Laufend/ }).click();
  await page.getByRole("button", { name: "4 h", exact: true }).click();
  await page.getByRole("button", { name: /4 h buchen/ }).click();
  await page.waitForTimeout(1500);
  const { data: z } = await admin.from("zeiten").select("stunden").eq("user_id", uid).eq("projekt_id", laufend.id);
  ok(z?.some((r) => Number(r.stunden) === 4), "4 h auf das laufende Projekt gebucht");
  ok(fehler.length === 0, `keine Seitenfehler${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} finally {
  await browser?.close();
  await admin.from("zeiten").delete().eq("user_id", uid);
  await admin.from("projekte").delete().in("id", prj.map((p) => p.id));
  await admin.auth.admin.deleteUser(uid);
}
console.log(fehlschlaege ? `\n${fehlschlaege} Prüfung(en) fehlgeschlagen` : "\nAlles gut");
process.exit(fehlschlaege ? 1 : 0);
