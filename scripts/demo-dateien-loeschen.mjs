// Löscht alle Dateien der Demo im Speicher (Fotos, Dokumente, Logos) über die
// Storage-API — angemeldet als Demo-Chef, also mit denselben Regeln wie die App.
// SQL darf storage.objects nicht anfassen; deshalb dieses Skript vor dem
// Zurücksetzen der Datenbank (scripts/demo-zuruecksetzen.sh ruft es auf).
//
// Unterschriften der Regieberichte bleiben: die Datenbank lässt sie nicht
// löschen (Policy unterschriften_bleiben). Nach dem Zurücksetzen gehört keine
// davon mehr zu einem Bericht — ein paar KB, sie stören nicht.
//
// Abgelegte Rechnungs-PDFs (beleg-archiv) lassen sich erst löschen, wenn die
// Rechnung weg ist — deshalb eigener Aufruf mit --archiv NACH dem Löschen der
// Belege (das Zurücksetzen macht das nach 01-stamm.sql).
//
//   DEMO_CHEF_PASSWORT=… node scripts/demo-dateien-loeschen.mjs [--archiv]
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

/** Alle Dateipfade eines Ordners samt Unterordnern (list() liefert Ordner mit id = null). */
async function allePfade(bucket, ordner = "") {
  const pfade = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(ordner, { limit: 1000, offset: von });
    if (error) throw new Error(`${bucket}/${ordner}: ${error.message}`);
    for (const e of data) {
      const voll = ordner ? `${ordner}/${e.name}` : e.name;
      if (e.id === null) pfade.push(...(await allePfade(bucket, voll)));
      else pfade.push(voll);
    }
    if (data.length < 1000) return pfade;
  }
}

let fehler = 0;
const BUCKETS = process.argv.includes("--archiv") ? ["beleg-archiv"] : ["projekt-dateien", "firmen-logos", "eingangsrechnungen"];
for (const bucket of BUCKETS) {
  const alle = await allePfade(bucket);
  const pfade = alle.filter((p) => !p.includes("/unterschriften/"));
  let weg = 0;
  for (let i = 0; i < pfade.length; i += 100) {
    const teil = pfade.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(teil);
    if (error) {
      console.error(`${bucket}: ${error.message}`);
      fehler++;
      continue;
    }
    weg += data.length;
  }
  const bleiben = alle.length - pfade.length;
  console.log(`${bucket}: ${weg} von ${pfade.length} Dateien gelöscht${bleiben ? ` (${bleiben} Unterschriften bleiben)` : ""}`);
  if (weg < pfade.length) fehler++;
}
process.exit(fehler ? 1 : 0);
