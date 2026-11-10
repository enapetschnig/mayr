// Spielt die Sonepar-Datanorm in den Demo-Artikelstamm — mit dem Leser und den
// Import-Regeln der App (wie „Artikel → Importieren“). Nur die Marken, die ein
// Elektrobetrieb täglich braucht; alle 594.000 Artikel wären zu groß für die
// Demo-Datenbank. EK = Liste − Demo-Rabatt (echte Konditionen nie ins Repo).
//
// Die Artikel tragen quelle = 'datanorm' und überstehen das Zurücksetzen der
// Demo (01-stamm.sql löscht nur die übrigen). Die 158 Demo-Artikel aus
// artikel-sonepar.json bleiben, wie sie sind.
//
//   DEMO_CHEF_PASSWORT=… node_modules/.bin/vite-node scripts/datanorm-einspielen.ts <Ordner mit DATANORM.001 …>
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { datanormDateienLesen, dateiText, metallkurseLesen } from "../src/lib/datanorm";
import { datanormZuImport } from "../src/components/stamm/importLesen";
import { artikelZeilen, pakete, hochladen } from "../src/lib/artikelImport";

/** Hersteller-Kürzel wie in der Datei (13 Zeichen) — leer = Kabel und Kleinteile ohne Marke */
const MARKEN = new Set([
  "JUNG", "GIRA", "BERKER", "MERTEN", "NIKO", "ELSO", "BTICINO", "BUSCH-JAEGER", "LEGRAND",
  "HAGER", "DOEPKE", "HENSEL", "SPELSBERG", "KAISER", "KAISER MARTIN", "OBO BETTERMAN", "DEHN",
  "STEINEL", "ESYLUX", "THEBEN", "LEDVANCE", "PHILIPS LIGHT", "PHILIPS", "OSRAM",
  "INTERCABLE", "DÄTWYLER", "DRAKA", "SCHNABL", "FONATSCH", "KATHREIN",
  "MENNEKES PV", "ABL-SURSUM", "ABL E-MOBILIT", "FRONIUS", "WIELAND", "SONEPAR", "SONEPAR HW", "",
]);
/** Die Datei kürzt auf 13 Zeichen in Großbuchstaben — so liest es sich wie in den Demo-Artikeln */
const SCHREIBWEISE: Record<string, string> = {
  JUNG: "Jung", GIRA: "Gira", BERKER: "Berker", MERTEN: "Merten", NIKO: "Niko", ELSO: "Elso", BTICINO: "BTicino",
  "BUSCH-JAEGER": "Busch-Jaeger", LEGRAND: "Legrand", HAGER: "Hager", DOEPKE: "Doepke", HENSEL: "Hensel",
  SPELSBERG: "Spelsberg", KAISER: "Kaiser", "KAISER MARTIN": "Kaiser", "OBO BETTERMAN": "OBO Bettermann", DEHN: "Dehn",
  STEINEL: "Steinel", ESYLUX: "Esylux", THEBEN: "Theben", LEDVANCE: "Ledvance", "PHILIPS LIGHT": "Philips",
  PHILIPS: "Philips", OSRAM: "Osram", INTERCABLE: "Intercable", "DÄTWYLER": "Dätwyler", DRAKA: "Draka",
  SCHNABL: "Schnabl", FONATSCH: "Fonatsch", KATHREIN: "Kathrein", "MENNEKES PV": "Mennekes",
  "ABL-SURSUM": "ABL", "ABL E-MOBILIT": "ABL", FRONIUS: "Fronius", WIELAND: "Wieland", SONEPAR: "Sonepar", "SONEPAR HW": "Sonepar",
};
/** Demo-Rabatt in % je Hauptwarengruppe gibt es nicht — ein pauschaler reicht für die Demo */
const DEMO_RABATT = 32;

const REPO = path.resolve(import.meta.dirname, "..");
const ordner = process.argv[2];
const passwort = process.env.DEMO_CHEF_PASSWORT;
if (!ordner || !passwort) {
  console.error("Aufruf: DEMO_CHEF_PASSWORT=… vite-node scripts/datanorm-einspielen.ts <Ordner>");
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s)),
);

const namen = fs.readdirSync(ordner).filter((n) => /^(DATANORM\.|DATPREIS\.)/i.test(n));
const dateien = namen.map((name) => ({ name, daten: new Uint8Array(fs.readFileSync(path.join(ordner, name))) }));
const e = await datanormDateienLesen(dateien, { zeichensatz: "cp850" });
const metallDatei = fs.readdirSync(ordner).find((n) => /metall/i.test(n));
const metallkurse = metallDatei ? metallkurseLesen(dateiText(fs.readFileSync(path.join(ordner, metallDatei)))) : null;

const demo = new Set(JSON.parse(fs.readFileSync(path.join(REPO, "supabase/demo/artikel-sonepar.json"), "utf8"))
  .map((a: { sonepar_nr: string }) => a.sonepar_nr));
const auswahl = e.artikel.filter((a) => MARKEN.has(a.hersteller) && !demo.has(a.artikelnummer));
const { zeilen } = artikelZeilen(auswahl.map((a) => ({ ...datanormZuImport(a), hersteller: SCHREIBWEISE[a.hersteller] ?? null })), {
  lieferant: "Sonepar",
  quelle: "datanorm",
  rabatt: { gruppen: {}, pauschal: DEMO_RABATT, nettoVorziehen: false, metallkurse: metallkurse ?? undefined },
});
console.log(`${e.artikel.length} Artikel gelesen, ${zeilen.length} ausgewählt`);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });
const { error: anmeldung } = await supabase.auth.signInWithPassword({ email: "chef@elektro.handwerkapp.at", password: passwort });
if (anmeldung) {
  console.error(`Anmeldung als Demo-Chef fehlgeschlagen: ${anmeldung.message}`);
  process.exit(1);
}
const erg = await hochladen(pakete(zeilen, 1000), async (paket) => {
  const { error } = await supabase.from("artikel").upsert(paket, { onConflict: "lieferant,artikelnummer" });
  if (error) throw new Error(error.message);
  return { neu: paket.length, aktualisiert: 0 };
}, { parallel: 4 });
console.log(`gespeichert: ${erg.neu}, Fehler: ${erg.fehler}${erg.meldungen.length ? " — " + erg.meldungen.slice(0, 3).join("; ") : ""}`);
