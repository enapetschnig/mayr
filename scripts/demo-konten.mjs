// Legt die zusätzlichen Demo-Mitarbeiter an (Konten in Supabase Auth), falls
// es sie noch nicht gibt. Name, Farbe, Lohnart und „aktiv“ setzt danach
// supabase/demo/01-stamm.sql — beim Zurücksetzen jedes Mal neu.
//
// Braucht den Service-Schlüssel des Projekts (nie ins Repo):
//   SUPABASE_SERVICE_KEY=… node scripts/demo-konten.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const DEMO_KONTEN = [
  { email: "tom@elektro.handwerkapp.at", vorname: "Tom", nachname: "Berger" },
  { email: "eva@elektro.handwerkapp.at", vorname: "Eva", nachname: "Huber" },
  { email: "stefan@elektro.handwerkapp.at", vorname: "Stefan", nachname: "Gruber" },
  { email: "sarah@elektro.handwerkapp.at", vorname: "Sarah", nachname: "Pichler" },
  { email: "jonas@elektro.handwerkapp.at", vorname: "Jonas", nachname: "Wimmer" },
  // Büro (Gruppe „Büro“ im Terminplaner, gesetzt in supabase/demo/04-kalender.sql)
  { email: "julia@elektro.handwerkapp.at", vorname: "Julia", nachname: "Steiner" },
];
const PASSWORT = "demo123";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)),
);
const schluessel = process.env.SUPABASE_SERVICE_KEY;
if (!schluessel) {
  console.error("SUPABASE_SERVICE_KEY fehlt (Service-Schlüssel des Projekts).");
  process.exit(1);
}
const admin = createClient(env.VITE_SUPABASE_URL, schluessel, { auth: { persistSession: false } });

const { data: vorhanden, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error(error.message);
  process.exit(1);
}
for (const k of DEMO_KONTEN) {
  if (vorhanden.users.some((u) => u.email === k.email)) {
    console.log(`= ${k.email}`);
    continue;
  }
  const { error: e } = await admin.auth.admin.createUser({
    email: k.email, password: PASSWORT, email_confirm: true, user_metadata: { vorname: k.vorname, nachname: k.nachname },
  });
  console.log(e ? `✗ ${k.email}: ${e.message}` : `+ ${k.email}`);
}
