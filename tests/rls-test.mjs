// Prüft die Regeln, die in der Datenbank stecken (RLS und Trigger), mit drei
// Testkonten: Chef, Monteur und einem, der noch nicht freigeschaltet ist.
//
//   node tests/rls-test.mjs anlegen   Testkonten registrieren, dann die
//                                     ausgegebenen SQL-Zeilen ausführen
//   node tests/rls-test.mjs           alle Prüfungen
//
// Danach tests/rls-aufraeumen.sql ausführen: Testdaten, Testkonten und
// Nummernkreise (der Test vergibt echte Projekt-, Rechnungs- und Regienummern).
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s)));
// Passwort der Testkonten: zufällig und nur auf diesem Rechner. Das Repo ist
// öffentlich — mit einem bekannten Passwort könnte jemand die Testkonten vorab
// anlegen und würde beim Freischalten zum Chef.
const PW_DATEI = "tests/.rlstest-passwort";
if (!fs.existsSync(PW_DATEI)) fs.writeFileSync(PW_DATEI, crypto.randomBytes(18).toString("base64url"), { mode: 0o600 });
const PW = fs.readFileSync(PW_DATEI, "utf8").trim();
const mail = (k) => `rlstest-${k}@mayr-test.at`;
const neuerClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, { auth: { persistSession: false } });

let fehlgeschlagen = 0;
const ok = (bedingung, text) => {
  if (!bedingung) fehlgeschlagen++;
  console.log((bedingung ? "✓ " : "✗ FEHLER ") + text);
};
/** Erwarteter Fehler: zeigt die Meldung der Datenbank, oder warnt, wenn keiner kam */
const abgelehnt = (error) => (error ? ` — ${error.message}` : " — KEIN FEHLER!");

async function konto(k) {
  const c = neuerClient();
  const { error } = await c.auth.signInWithPassword({ email: mail(k), password: PW });
  if (error) {
    const r = await c.auth.signUp({ email: mail(k), password: PW, options: { data: { vorname: "Test", nachname: k } } });
    if (r.error) throw r.error;
  }
  return c;
}

if (process.argv[2] === "anlegen") {
  for (const k of ["chef", "monteur", "neu"]) await konto(k);
  console.log("Angelegt. Jetzt freischalten (SQL als postgres):");
  console.log(`update public.profiles set aktiv = true, rolle = 'chef' where email = '${mail("chef")}';`);
  console.log(`update public.profiles set aktiv = true where email = '${mail("monteur")}';`);
  process.exit(0);
}

const chef = await konto("chef");
const monteur = await konto("monteur");
const neu = await konto("neu");
const idVon = async (c) => (await c.auth.getUser()).data.user.id;
const [chefId, monteurId, neuId] = await Promise.all([idVon(chef), idVon(monteur), idVon(neu)]);

{
  const { data } = await chef.from("profiles").select("id, rolle, aktiv").in("id", [chefId, monteurId, neuId]);
  const p = Object.fromEntries((data ?? []).map((x) => [x.id, x]));
  if (p[chefId]?.rolle !== "chef" || !p[chefId]?.aktiv || !p[monteurId]?.aktiv || p[neuId]?.aktiv) {
    console.log("Testkonten nicht vorbereitet — erst `node tests/rls-test.mjs anlegen` und die SQL-Zeilen ausführen.");
    process.exit(1);
  }
}

console.log("\n— Ohne Anmeldung —");
{
  const anonym = neuerClient();
  const { data } = await anonym.from("projekte").select("id");
  ok(!data?.length, "sieht keine Projekte");
  const { data: z } = await anonym.from("zeiten").select("id");
  ok(!z?.length, "sieht keine Stunden");
}

console.log("\n— Nicht freigeschaltet —");
{
  const { data: pr } = await neu.from("projekte").select("id");
  ok(pr?.length === 0, "sieht keine Projekte");
  const { data: fi } = await neu.from("firma").select("id");
  ok(fi?.length === 0, "sieht den Betrieb nicht");
  const { data: ku } = await neu.from("kunden").select("id");
  ok(ku?.length === 0, "sieht keine Kunden");
  const { data: pz } = await neu.from("projekt_zahlen").select("projekt_id");
  ok(pz?.length === 0, "sieht keine Projektzahlen (View mit den Rechten des Abfragenden)");
  const { data: lb } = await neu.from("lagerbestand").select("artikel_id");
  ok(lb?.length === 0, "sieht keinen Lagerbestand");
  const { error: e1 } = await neu.from("zeiten").insert({ stunden: 2 });
  ok(!!e1, "kann keine Stunden buchen" + abgelehnt(e1));
  const { error: e2 } = await neu.from("profiles").update({ aktiv: true }).eq("id", neuId);
  ok(!!e2, "kann sich nicht selbst freischalten" + abgelehnt(e2));
  const { error: e3 } = await neu.storage.from("projekt-dateien").upload(`rlstest/${Date.now()}.txt`, new Blob(["x"]), { contentType: "text/plain" });
  ok(!!e3, "kann keine Dateien hochladen" + abgelehnt(e3));
}

console.log("\n— Monteur —");
const { data: projekt, error: eP } = await monteur.from("projekte").insert({ name: "RLS-Test Baustelle" }).select("id, nummer").single();
ok(!eP && /^\d{4}-\d{4}$/.test(projekt?.nummer ?? ""), `legt ein Projekt an, Nummer vom Trigger: ${projekt?.nummer ?? eP?.message}`);
if (!projekt) process.exit(1);
{
  const { data: be } = await monteur.from("belege").select("id");
  ok(be?.length === 0, "sieht keine Angebote und Rechnungen");
  const { error: e1 } = await monteur.from("belege").insert({ typ: "rechnung", empf_name: "RLS-Test" });
  ok(!!e1, "kann keine Rechnung anlegen" + abgelehnt(e1));
  const { error: e2 } = await monteur.from("profiles").update({ rolle: "chef" }).eq("id", monteurId);
  ok(!!e2, "kann sich nicht zum Chef machen" + abgelehnt(e2));
  // Mit dem eigenen Wert „ändern“ — wäre die Regel kaputt, ändert sich trotzdem nichts an der Demo
  const { data: firma } = await monteur.from("firma").select("stundensatz").eq("id", 1).single();
  const { data: f } = await monteur.from("firma").update({ stundensatz: firma.stundensatz }).eq("id", 1).select();
  ok(!f?.length, "kann den Betrieb nicht ändern");
  const { data: artikel } = await monteur.from("artikel").select("id, ek_preis").limit(1).single();
  const { data: a } = await monteur.from("artikel").update({ ek_preis: artikel.ek_preis }).eq("id", artikel.id).select();
  ok(!a?.length, "kann keine Artikelpreise ändern");
  const { data: d } = await monteur.from("projekte").delete().eq("id", projekt.id).select();
  ok(!d?.length, "kann kein Projekt löschen");
  const { error: e3 } = await monteur.rpc("beleg_fertigstellen", { p_id: projekt.id });
  ok(!!e3, "kann keine Belege fertigstellen" + abgelehnt(e3));
  const { error: e4 } = await monteur.storage.from("firmen-logos").upload(`rlstest-${Date.now()}.png`, new Blob(["x"]), { contentType: "image/png" });
  ok(!!e4, "kann kein Logo hochladen" + abgelehnt(e4));

  const pfad = `${projekt.id}/rlstest-${Date.now()}.txt`;
  const { error: e5 } = await monteur.storage.from("projekt-dateien").upload(pfad, new Blob(["hallo"]), { contentType: "text/plain" });
  ok(!e5, "lädt eine Projektdatei hoch" + (e5 ? abgelehnt(e5) : ""));
  const { data: url } = await neu.storage.from("projekt-dateien").createSignedUrl(pfad, 60);
  ok(!url?.signedUrl, "nicht Freigeschaltete können sie nicht öffnen");
  await monteur.storage.from("projekt-dateien").remove([pfad]);
}

console.log("\n— Stunden —");
const { data: zMonteur, error: eZ } = await monteur.from("zeiten").insert({ projekt_id: projekt.id, stunden: 4, taetigkeit: "RLS-Test" }).select("id").single();
ok(!eZ, "Monteur bucht Stunden" + (eZ ? abgelehnt(eZ) : ""));
const { data: zChef } = await chef.from("zeiten").insert({ projekt_id: projekt.id, stunden: 2, taetigkeit: "RLS-Test Chef" }).select("id").single();
{
  const { data: fremd } = await monteur.from("zeiten").update({ stunden: 9 }).eq("id", zChef.id).select();
  ok(!fremd?.length, "Monteur kann fremde Stunden nicht ändern");
  const { data: korr } = await chef.from("zeiten").update({ stunden: 5 }).eq("id", zMonteur.id).select();
  ok(korr?.length === 1, "Chef kann Stunden des Monteurs korrigieren");
}

console.log("\n— Rechnung —");
const { data: re, error: eR } = await chef.from("belege").insert({ typ: "rechnung", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
ok(!eR, "Chef legt einen Rechnungsentwurf an" + (eR ? abgelehnt(eR) : ""));
{
  const { error: ePos } = await chef.from("beleg_positionen").insert({
    beleg_id: re.id, pos: 1, art: "arbeit", bezeichnung: "Arbeitszeit", menge: 5, einheit: "h", einzelpreis: 72,
    quelle: { zeiten: [zMonteur.id], material: [], regie: [] },
  });
  await chef.from("zeiten").update({ rechnung_id: re.id }).eq("id", zMonteur.id);
  ok(!ePos, "übernimmt die Stunde als Position" + (ePos ? abgelehnt(ePos) : ""));
  const { error: e1 } = await monteur.from("zeiten").update({ stunden: 1 }).eq("id", zMonteur.id);
  ok(!!e1, "verrechnete Stunde ist für den Monteur fest" + abgelehnt(e1));

  const { data: nr, error: eF } = await chef.rpc("beleg_fertigstellen", { p_id: re.id });
  ok(!eF && /^RE-\d{4}-\d{3}$/.test(nr ?? ""), `Fertigstellen vergibt die Nummer: ${nr ?? eF?.message}`);
  const { data: b } = await chef.from("belege").select("netto, brutto, status").eq("id", re.id).single();
  ok(Number(b.netto) === 360 && Number(b.brutto) === 432 && b.status === "offen", `rechnet aus den Positionen: ${b.netto} netto, ${b.brutto} brutto`);
  const { error: e2 } = await chef.from("beleg_positionen").update({ einzelpreis: 1 }).eq("beleg_id", re.id);
  ok(!!e2, "Positionen der fertigen Rechnung sind fest" + abgelehnt(e2));
  const { error: e3 } = await chef.from("belege").update({ netto: 1 }).eq("id", re.id);
  ok(!!e3, "Beträge der fertigen Rechnung sind fest" + abgelehnt(e3));
  const { error: eText } = await chef.from("belege").update({ betreff: "nachträglich" }).eq("id", re.id);
  ok(!!eText, "Texte der fertigen Rechnung sind fest" + abgelehnt(eText));
  const { error: eFaellig } = await chef.from("belege").update({ faellig_am: "2099-12-31" }).eq("id", re.id);
  ok(!!eFaellig, "Fälligkeit der fertigen Rechnung ist fest" + abgelehnt(eFaellig));
  const { data: weg } = await chef.from("belege").delete().eq("id", re.id).select();
  ok(!weg?.length, "fertige Rechnung kann nicht gelöscht werden");
  const { error: e4 } = await chef.from("belege").update({ status: "bezahlt", bezahlt_am: new Date().toISOString().slice(0, 10) }).eq("id", re.id);
  ok(!e4, "als bezahlt markieren geht" + (e4 ? abgelehnt(e4) : ""));
  const { error: e5 } = await chef.rpc("beleg_stornieren", { p_id: re.id });
  const { data: frei } = await chef.from("zeiten").select("rechnung_id").eq("id", zMonteur.id).single();
  ok(!e5 && frei?.rechnung_id === null, "Storno gibt die Stunde wieder frei" + (e5 ? abgelehnt(e5) : ""));
  const { error: e6 } = await chef.from("belege").update({ status: "offen" }).eq("id", re.id);
  ok(!!e6, "stornierte Rechnung bleibt storniert" + abgelehnt(e6));
}

console.log("\n— Regiebericht —");
const { data: rb, error: eRb } = await monteur.from("regieberichte").insert({ projekt_id: projekt.id, arbeiten: "RLS-Test Arbeiten" }).select("id, nummer").single();
ok(!eRb && /^RB-\d{4}-\d{3}$/.test(rb?.nummer ?? ""), `Monteur schreibt einen Regiebericht: ${rb?.nummer ?? eRb?.message}`);
if (rb) {
  const { data: zRegie } = await monteur.from("zeiten").insert({ projekt_id: projekt.id, stunden: 3, regiebericht_id: rb.id, taetigkeit: "RLS-Test Regie" }).select("id").single();
  const { error: e0 } = await monteur.from("regieberichte")
    .update({ status: "unterschrieben", unterschrift_name: "RLS-Test Kunde" }).eq("id", rb.id);
  ok(!!e0, "ohne Unterschriftsbild wird nicht unterschrieben" + abgelehnt(e0));
  // Nur der Pfad, kein Bild hochladen: der Trigger prüft den Speicher nicht,
  // und eine hochgeladene Unterschrift ließe sich nicht mehr löschen
  const { data: rbU, error: eU } = await monteur.from("regieberichte")
    .update({
      status: "unterschrieben", unterschrift_name: "RLS-Test Kunde",
      unterschrift_pfad: `${projekt.id}/unterschriften/${rb.id}.png`, unterschrieben_am: "2000-01-01T00:00:00Z",
    })
    .eq("id", rb.id).select("unterschrieben_am").single();
  ok(!eU, "Kunde unterschreibt" + (eU ? abgelehnt(eU) : ""));
  ok(new Date(rbU?.unterschrieben_am ?? 0).getFullYear() > 2000, "den Zeitpunkt der Unterschrift setzt der Server, nicht die Handyuhr");
  const { error: e1 } = await monteur.from("regieberichte").update({ arbeiten: "nachträglich geändert" }).eq("id", rb.id);
  ok(!!e1, "unterschriebener Bericht ist fest" + abgelehnt(e1));
  const { error: e2 } = await monteur.from("zeiten").update({ stunden: 1 }).eq("id", zRegie.id);
  ok(!!e2, "Stunden darin sind fest" + abgelehnt(e2));
  const { error: e3 } = await monteur.from("zeiten").insert({ projekt_id: projekt.id, stunden: 1, regiebericht_id: rb.id });
  ok(!!e3, "es kommen keine Stunden mehr dazu" + abgelehnt(e3));
  const { error: e4 } = await chef.from("regieberichte").delete().eq("id", rb.id);
  ok(!!e4, "auch der Chef kann ihn nicht löschen" + abgelehnt(e4));
}

console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt tests/rls-aufraeumen.sql ausführen.");
process.exit(fehlgeschlagen ? 1 : 0);
