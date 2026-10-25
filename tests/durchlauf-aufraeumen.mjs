// Räumt alles weg, was tests/durchlauf.mjs anlegt — auch die Test-Unterschrift.
//
//   DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs
//
// 1. Dateien der Projekte „TEST Durchlauf …“ über die Storage-API löschen
//    (als Demo-Chef). Unterschriften sind gegen Löschen geschützt (Policy
//    unterschriften_bleiben aus Migration 20261025122000) — die Policy ist dafür
//    ein paar Sekunden aus und wird in jedem Fall wieder angelegt.
// 2. tests/durchlauf-aufraeumen.sql: Datenbank und Nummernkreise.
// 3. Das abgelegte PDF der Testrechnung (beleg-archiv) — löschbar erst, wenn
//    die Rechnung weg ist.
import { execFileSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const sql = (...args) => execFileSync("scripts/sql.sh", args, { stdio: ["ignore", "ignore", "inherit"] });
const POLICY = `create policy unterschriften_bleiben on storage.objects as restrictive for delete to authenticated
  using (not (bucket_id = 'projekt-dateien' and name like '%/unterschriften/%'))`;

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)));
if (!process.env.DEMO_CHEF_PASSWORT) {
  console.error("DEMO_CHEF_PASSWORT fehlt (Passwort des Demo-Chefs).");
  process.exit(1);
}
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });
const { error: anmeldung } = await db.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: process.env.DEMO_CHEF_PASSWORT });
if (anmeldung) throw new Error(`Anmeldung als Demo-Chef: ${anmeldung.message}`);

async function allePfade(ordner) {
  const { data, error } = await db.storage.from("projekt-dateien").list(ordner, { limit: 1000 });
  if (error) throw new Error(`${ordner}: ${error.message}`);
  const pfade = [];
  for (const e of data) {
    if (e.id === null) pfade.push(...(await allePfade(`${ordner}/${e.name}`)));
    else pfade.push(`${ordner}/${e.name}`);
  }
  return pfade;
}

const { data: projekte, error } = await db.from("projekte").select("id, nummer, name").like("name", "TEST Durchlauf%");
if (error) throw error;
const pfade = (await Promise.all(projekte.map((p) => allePfade(p.id)))).flat();
const { data: belege, error: eB } = await db.from("belege").select("id").in("projekt_id", projekte.map((p) => p.id));
if (eB) throw eB;

if (pfade.length) {
  sql("drop policy if exists unterschriften_bleiben on storage.objects");
  try {
    const { data, error: e } = await db.storage.from("projekt-dateien").remove(pfade);
    if (e) throw e;
    console.log(`✓ ${data.length} von ${pfade.length} Dateien gelöscht`);
  } finally {
    sql(POLICY);
    console.log("✓ Schutz der Unterschriften wieder an");
  }
}
sql("-f", "tests/durchlauf-aufraeumen.sql");
console.log(`✓ ${projekte.length} Testprojekt(e) samt Buchungen weg: ${projekte.map((p) => `${p.nummer} ${p.name}`).join(", ") || "–"}`);
if (belege.length) {
  const { data: weg, error: eA } = await db.storage.from("beleg-archiv").remove(belege.map((b) => `${b.id}.pdf`));
  if (eA) throw eA;
  console.log(`✓ ${weg.length} abgelegte(s) PDF(s) gelöscht`);
}
