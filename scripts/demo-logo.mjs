// Legt das Firmenlogo (public/logo-quer-dunkel.png) in den Speicher und trägt
// es beim Betrieb ein — dann steht es auf jedem PDF. Das Zurücksetzen löscht
// die Logos mit; scripts/demo-zuruecksetzen.sh ruft dieses Skript am Ende auf.
//
//   DEMO_CHEF_PASSWORT=… node scripts/demo-logo.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)),
);
const passwort = process.env.DEMO_CHEF_PASSWORT;
if (!passwort) {
  console.error("DEMO_CHEF_PASSWORT fehlt (Passwort des Demo-Chefs).");
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });
const { error: anmeldung } = await supabase.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: passwort });
if (anmeldung) {
  console.error(`Anmeldung als Demo-Chef fehlgeschlagen: ${anmeldung.message}`);
  process.exit(1);
}

const pfad = "betrieb/logo-setec.png";
const bild = fs.readFileSync(path.join(REPO, "public/logo-quer-dunkel.png"));
const { error } = await supabase.storage.from("firmen-logos").upload(pfad, bild, { contentType: "image/png", upsert: true });
if (error) {
  console.error(`Logo nicht hochgeladen: ${error.message}`);
  process.exit(1);
}
const { error: e2 } = await supabase.from("firma").update({ logo_pfad: pfad }).eq("id", 1);
if (e2) {
  console.error(`Logo nicht eingetragen: ${e2.message}`);
  process.exit(1);
}
console.log(`✓ Logo ${pfad}`);
