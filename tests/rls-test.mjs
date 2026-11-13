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
  const { error: eSatz } = await monteur.from("projekte").update({ stundensatz: 1 }).eq("id", projekt.id);
  ok(!!eSatz, "kann den Stundensatz eines Projekts nicht festlegen" + abgelehnt(eSatz));
  const { error: eNr } = await chef.from("projekte").update({ nummer: "1999-0001" }).eq("id", projekt.id);
  ok(!!eNr, "die Projektnummer bleibt — auch für den Chef" + abgelehnt(eNr));
  const { error: eNull } = await chef.from("projekte").update({ stundensatz: 0 }).eq("id", projekt.id);
  ok(!!eNull, "Stundensatz 0 € gibt es nicht (leer = der des Betriebs)" + abgelehnt(eNull));
  const { error: e3 } = await monteur.rpc("beleg_fertigstellen", { p_id: projekt.id });
  ok(!!e3, "kann keine Belege fertigstellen" + abgelehnt(e3));
  const { error: e4 } = await monteur.storage.from("firmen-logos").upload(`rlstest-${Date.now()}.png`, new Blob(["x"]), { contentType: "image/png" });
  ok(!!e4, "kann kein Logo hochladen" + abgelehnt(e4));
  const { error: eArchiv } = await monteur.storage.from("beleg-archiv").upload(`${projekt.id}.pdf`, new Blob(["x"]), { contentType: "application/pdf" });
  ok(!!eArchiv, "kann nichts ins Rechnungsarchiv legen" + abgelehnt(eArchiv));

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
  const { error: eKollege } = await monteur.from("zeiten").insert({ user_id: chefId, projekt_id: projekt.id, stunden: 1, taetigkeit: "RLS-Test für Kollegen" });
  ok(!!eKollege, "Monteur bucht Kollegen keine Stunden außerhalb des Regieberichts" + abgelehnt(eKollege));
  const { data: zE } = await monteur.from("zeiten")
    .insert({ projekt_id: projekt.id, stunden: 1, taetigkeit: "RLS-Test", erstellt_von: chefId }).select("erstellt_von").single();
  ok(zE?.erstellt_von === monteurId, "wer eingetragen hat, setzt die Datenbank");
  const { error: eUm } = await monteur.from("zeiten").update({ user_id: chefId }).eq("id", zMonteur.id);
  ok(!!eUm, "Monteur schiebt eigene Stunden keinem Kollegen unter" + abgelehnt(eUm));
  const { error: ePause } = await monteur.from("zeiten").update({ pause_minuten: -60 }).eq("id", zMonteur.id);
  ok(!!ePause, "die Pause ist nie negativ" + abgelehnt(ePause));
}

console.log("\n— Rechnung —");
const { data: an } = await chef.from("belege").insert({ typ: "angebot", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
const { data: re, error: eR } = await chef.from("belege")
  .insert({ typ: "rechnung", projekt_id: projekt.id, angebot_id: an?.id ?? null, empf_name: "RLS-Test Kunde" }).select("id").single();
ok(!eR, "Chef legt einen Rechnungsentwurf an" + (eR ? abgelehnt(eR) : ""));
{
  const { error: eArchiv } = await chef.storage.from("beleg-archiv").upload(`${re.id}.pdf`, new Blob(["x"]), { contentType: "application/pdf" });
  ok(!!eArchiv, "Entwürfe kommen nicht ins Rechnungsarchiv" + abgelehnt(eArchiv));
}
{
  const { error: ePos } = await chef.from("beleg_positionen").insert({
    beleg_id: re.id, pos: 1, art: "arbeit", bezeichnung: "Arbeitszeit", menge: 5, einheit: "h", einzelpreis: 72,
    quelle: { zeiten: [zMonteur.id], material: [], regie: [] },
  });
  const { error: eVerr } = await monteur.from("zeiten").update({ rechnung_id: re.id }).eq("id", zMonteur.id);
  ok(!!eVerr, "Monteur verrechnet keine Stunden" + abgelehnt(eVerr));
  await chef.from("zeiten").update({ rechnung_id: re.id }).eq("id", zMonteur.id);
  ok(!ePos, "übernimmt die Stunde als Position" + (ePos ? abgelehnt(ePos) : ""));
  const { error: e1 } = await monteur.from("zeiten").update({ stunden: 1 }).eq("id", zMonteur.id);
  ok(!!e1, "verrechnete Stunde ist für den Monteur fest" + abgelehnt(e1));
  const { error: eLos } = await monteur.from("zeiten").update({ rechnung_id: null }).eq("id", zMonteur.id);
  ok(!!eLos, "Monteur hebt die Verrechnung nicht auf (sonst doppelt verrechenbar)" + abgelehnt(eLos));

  const { data: nr, error: eF } = await chef.rpc("beleg_fertigstellen", { p_id: re.id });
  ok(!eF && /^RE-\d{4}-\d{3}$/.test(nr ?? ""), `Fertigstellen vergibt die Nummer: ${nr ?? eF?.message}`);
  const { data: anWeg } = await chef.from("belege").delete().eq("id", an?.id).select();
  ok(!!an && !anWeg?.length, "das Angebot einer fertigen Rechnung bleibt als Nachweis");
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
  // Offene Posten: Teilzahlung lässt offen, der Rest macht bezahlt, Löschen macht wieder offen
  const heuteIso = new Date().toISOString().slice(0, 10);
  const { error: eZm } = await monteur.from("zahlungen").insert({ beleg_id: re.id, betrag: 1, datum: heuteIso });
  ok(!!eZm, "Monteur kann keine Zahlung erfassen" + abgelehnt(eZm));
  const { data: zLesen } = await monteur.from("zahlungen").select("id").eq("beleg_id", re.id);
  ok(!zLesen?.length, "Monteur sieht keine Zahlungen");
  const { error: eZ1 } = await chef.from("zahlungen").insert({ beleg_id: re.id, betrag: 100, datum: heuteIso });
  const { data: nach1 } = await chef.from("belege").select("status").eq("id", re.id).single();
  ok(!eZ1 && nach1?.status === "offen", "Teilzahlung: Rechnung bleibt offen" + (eZ1 ? abgelehnt(eZ1) : ""));
  const { data: z2, error: eZ2 } = await chef.from("zahlungen").insert({ beleg_id: re.id, betrag: 332, datum: heuteIso }).select("id").single();
  const { data: nach2 } = await chef.from("belege").select("status, bezahlt_am").eq("id", re.id).single();
  ok(!eZ2 && nach2?.status === "bezahlt" && nach2.bezahlt_am === heuteIso, "Rest bezahlt: Rechnung ist bezahlt" + (eZ2 ? abgelehnt(eZ2) : ""));
  await chef.from("zahlungen").delete().eq("id", z2?.id ?? "");
  const { data: nach3 } = await chef.from("belege").select("status, bezahlt_am").eq("id", re.id).single();
  ok(nach3?.status === "offen" && nach3.bezahlt_am === null, "Zahlung gelöscht: Rechnung wieder offen");
  const { error: eMa } = await chef.from("mahnungen").insert({ beleg_id: re.id, stufe: 1, frist_bis: heuteIso, offen: 332 });
  const { error: eMa2 } = await chef.from("mahnungen").insert({ beleg_id: re.id, stufe: 1, frist_bis: heuteIso, offen: 332 });
  ok(!eMa && !!eMa2, "je Rechnung und Stufe nur eine Mahnung" + (eMa ? abgelehnt(eMa) : ""));
  const { data: mLesen } = await monteur.from("mahnungen").select("id").eq("beleg_id", re.id);
  ok(!mLesen?.length, "Monteur sieht keine Mahnungen");
  await chef.from("zahlungen").insert({ beleg_id: re.id, betrag: 332, datum: heuteIso });
  const { error: eMs } = await monteur.rpc("beleg_stornieren", { p_id: re.id });
  ok(!!eMs, "Monteur kann nicht stornieren" + abgelehnt(eMs));
  const { data: stornoId, error: e5 } = await chef.rpc("beleg_stornieren", { p_id: re.id });
  const { data: frei } = await chef.from("zeiten").select("rechnung_id").eq("id", zMonteur.id).single();
  ok(!e5 && frei?.rechnung_id === null, "Storno gibt die Stunde wieder frei" + (e5 ? abgelehnt(e5) : ""));
  const { error: e6 } = await chef.from("belege").update({ status: "offen" }).eq("id", re.id);
  ok(!!e6, "stornierte Rechnung bleibt storniert" + abgelehnt(e6));

  // Stornorechnung: eigene Nummer, Verweis, alles negativ, sofort fest
  const { data: st } = await chef.from("belege").select("status, nummer, storno_von, netto, brutto").eq("id", stornoId ?? re.id).single();
  ok(st?.status === "storno" && st.storno_von === re.id && /^RE-\d{4}-\d{3}$/.test(st.nummer ?? "") && st.nummer !== nr,
    `Stornieren legt eine Stornorechnung mit eigener Nummer an: ${st?.nummer} zu ${nr}`);
  ok(Number(st?.netto) === -360 && Number(st?.brutto) === -432, `sie hebt den Betrag auf: ${st?.netto} netto, ${st?.brutto} brutto`);
  const { data: stPos } = await chef.from("beleg_positionen").select("menge, gesamt").eq("beleg_id", stornoId ?? re.id);
  ok(stPos?.length === 1 && Number(stPos[0].menge) === -5 && Number(stPos[0].gesamt) === -360, "ihre Positionen haben negative Mengen");
  const { error: e7 } = await chef.from("beleg_positionen").update({ einzelpreis: 1 }).eq("beleg_id", stornoId ?? re.id);
  ok(!!e7, "Positionen der Stornorechnung sind fest" + abgelehnt(e7));
  const { error: e8 } = await chef.from("belege").update({ status: "bezahlt" }).eq("id", stornoId ?? re.id);
  ok(!!e8, "Stornorechnung bleibt Stornorechnung" + abgelehnt(e8));
  const { data: weg2 } = await chef.from("belege").delete().eq("id", stornoId ?? re.id).select();
  ok(!weg2?.length, "Stornorechnung kann nicht gelöscht werden");
  const { error: e9 } = await chef.rpc("beleg_stornieren", { p_id: re.id });
  ok(!!e9, "zweimal stornieren geht nicht" + abgelehnt(e9));
  const { error: e10 } = await chef.rpc("beleg_stornieren", { p_id: stornoId ?? re.id });
  ok(!!e10, "eine Stornorechnung lässt sich nicht stornieren" + abgelehnt(e10));

  // Korrektur: die neue Rechnung verweist auf die stornierte — nur eine je Rechnung
  const neueKorrektur = () => chef.from("belege").insert({ typ: "rechnung", projekt_id: projekt.id, korrektur_von: re.id, empf_name: "RLS-Test Kunde" });
  const { error: eK1 } = await neueKorrektur();
  const { error: eK2 } = await neueKorrektur();
  ok(!eK1 && !!eK2, "je stornierter Rechnung nur eine Korrektur" + abgelehnt(eK1 ?? eK2));

  const { data: an2 } = await chef.from("belege").insert({ typ: "angebot", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
  const { data: an2Weg } = await chef.from("belege").delete().eq("id", an2?.id).select();
  ok(an2Weg?.length === 1, "ein Angebot ohne fertige Rechnung lässt sich löschen");
}

console.log("\n— Eingangsrechnungen —");
{
  const { data: er, error: eEr } = await chef.from("eingangsrechnungen")
    .insert({ lieferant: "RLS-Test Lieferant", netto: 100, ust: 20, brutto: 120 }).select("id").single();
  ok(!eEr, "Chef erfasst eine Eingangsrechnung" + (eEr ? abgelehnt(eEr) : ""));
  const { data: mSieht } = await monteur.from("eingangsrechnungen").select("id");
  ok(mSieht?.length === 0, "Monteur sieht keine Eingangsrechnungen (Einkaufspreise)");
  const { error: mNeu } = await monteur.from("eingangsrechnungen").insert({ lieferant: "RLS-Test Monteur", netto: 1 });
  ok(!!mNeu, "Monteur erfasst keine Eingangsrechnung" + abgelehnt(mNeu));
  const { error: mDatei } = await monteur.storage.from("eingangsrechnungen").upload(`${er.id}/x.pdf`, new Blob(["x"]), { contentType: "application/pdf" });
  ok(!!mDatei, "Monteur lädt keine Belege in den Eingangsspeicher" + abgelehnt(mDatei));

  const { data: ant, error: eAnt } = await chef.from("eingang_anteile")
    .insert({ eingangsrechnung_id: er.id, projekt_id: projekt.id, betrag: 100, text: "RLS-Test Anteil" }).select("id").single();
  ok(!eAnt, "Chef ordnet sie dem Projekt zu" + (eAnt ? abgelehnt(eAnt) : ""));
  const { data: mAnt } = await monteur.from("eingang_anteile").select("id");
  ok(mAnt?.length === 0, "Monteur sieht die Zuordnung nicht");

  // Weiterverrechnen: Position mit quelle.eingang, Anteil an die Rechnung binden
  const { data: re2 } = await chef.from("belege").insert({ typ: "rechnung", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
  const position = () => chef.from("beleg_positionen").insert({
    beleg_id: re2.id, pos: 1, art: "pauschale", bezeichnung: "RLS-Test Fremdleistung", menge: 1, einheit: "Psch", einzelpreis: 135, ek_preis: 100,
    quelle: { eingang: [ant.id] },
  }).select("id").single();
  const { data: pos } = await position();
  await chef.from("eingang_anteile").update({ rechnung_id: re2.id }).eq("id", ant.id);
  const { error: eFest } = await chef.from("eingang_anteile").update({ betrag: 50 }).eq("id", ant.id);
  ok(!!eFest, "verrechneter Anteil ist fest" + abgelehnt(eFest));
  const { data: erWeg } = await chef.from("eingangsrechnungen").delete().eq("id", er.id).select();
  ok(!erWeg?.length, "Eingangsrechnung mit verrechnetem Anteil bleibt");
  await chef.from("beleg_positionen").delete().eq("id", pos.id);
  const { data: f1 } = await chef.from("eingang_anteile").select("rechnung_id").eq("id", ant.id).single();
  ok(f1?.rechnung_id === null, "Position gelöscht → Anteil wieder frei");

  await position();
  await chef.from("eingang_anteile").update({ rechnung_id: re2.id }).eq("id", ant.id);
  await chef.rpc("beleg_fertigstellen", { p_id: re2.id });
  const { error: eSt } = await chef.rpc("beleg_stornieren", { p_id: re2.id });
  const { data: f2 } = await chef.from("eingang_anteile").select("rechnung_id").eq("id", ant.id).single();
  ok(!eSt && f2?.rechnung_id === null, "Storno gibt den Anteil wieder frei" + (eSt ? abgelehnt(eSt) : ""));
  const { data: erWeg2, error: eWeg2 } = await chef.from("eingangsrechnungen").delete().eq("id", er.id).select();
  ok(erWeg2?.length === 1, "freie Eingangsrechnung lässt sich löschen" + (eWeg2 ? abgelehnt(eWeg2) : ""));
}

console.log("\n— Teil- und Schlussrechnung —");
{
  const neueRechnung = (felder) => chef.from("belege").insert({ typ: "rechnung", projekt_id: projekt.id, empf_name: "RLS-Test Kunde", ...felder }).select("id").single();
  const pos = (belegId, art, preis, quelle = null) => chef.from("beleg_positionen").insert({
    beleg_id: belegId, pos: art === "abzug" ? 2 : 1, art, bezeichnung: `RLS-Test ${art}`, menge: 1, einheit: "Psch", einzelpreis: preis, quelle,
  }).select("id").single();
  const { data: an3 } = await chef.from("belege").insert({ typ: "angebot", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
  const { data: tr } = await neueRechnung({ angebot_id: an3.id, teil_nr: 1 });
  await pos(tr.id, "pauschale", 100);
  const { data: sr } = await neueRechnung({ angebot_id: an3.id });
  const { error: eEntw } = await chef.from("belege").update({ abgezogen_in: sr.id }).eq("id", tr.id);
  ok(!!eEntw, "eine Teilrechnung im Entwurf lässt sich nicht abziehen" + abgelehnt(eEntw));
  await chef.rpc("beleg_fertigstellen", { p_id: tr.id });
  const { error: eSelbst } = await chef.from("belege").update({ abgezogen_in: tr.id }).eq("id", tr.id);
  ok(!!eSelbst, "eine Rechnung zieht sich nicht selbst ab" + abgelehnt(eSelbst));

  await pos(sr.id, "pauschale", 500);
  const { data: abz } = await pos(sr.id, "abzug", -100, { teil: [tr.id] });
  const { error: eAbz } = await chef.from("belege").update({ abgezogen_in: sr.id }).eq("id", tr.id);
  ok(!eAbz, "Schlussrechnung zieht die fertige Teilrechnung ab" + (eAbz ? abgelehnt(eAbz) : ""));
  const { data: sr2 } = await neueRechnung({ angebot_id: an3.id });
  const { error: eDoppelt } = await chef.from("belege").update({ abgezogen_in: sr2.id }).eq("id", tr.id);
  ok(!!eDoppelt, "keine Teilrechnung wird zweimal abgezogen" + abgelehnt(eDoppelt));
  await chef.from("belege").delete().eq("id", sr2.id);
  const { error: eMAbz } = await monteur.from("belege").update({ abgezogen_in: null }).eq("id", tr.id);
  const { data: tMon } = await chef.from("belege").select("abgezogen_in").eq("id", tr.id).single();
  ok(tMon?.abgezogen_in === sr.id, "Monteur hebt den Abzug nicht auf" + (eMAbz ? ` — ${eMAbz.message}` : ""));

  await chef.from("beleg_positionen").delete().eq("id", abz.id);
  const { data: t1 } = await chef.from("belege").select("abgezogen_in").eq("id", tr.id).single();
  ok(t1?.abgezogen_in === null, "Abzugsposition gelöscht → Teilrechnung wieder frei");

  await pos(sr.id, "abzug", -100, { teil: [tr.id] });
  await chef.from("belege").update({ abgezogen_in: sr.id }).eq("id", tr.id);
  await chef.rpc("beleg_fertigstellen", { p_id: sr.id });
  const { data: srB } = await chef.from("belege").select("netto, brutto").eq("id", sr.id).single();
  ok(Number(srB?.netto) === 400 && Number(srB?.brutto) === 480, `Schlussrechnung rechnet den Rest: ${srB?.netto} netto, ${srB?.brutto} brutto`);
  const { error: eSrSt } = await chef.rpc("beleg_stornieren", { p_id: sr.id });
  const { data: t2 } = await chef.from("belege").select("abgezogen_in").eq("id", tr.id).single();
  ok(!eSrSt && t2?.abgezogen_in === null, "Schlussrechnung storniert → Teilrechnung wieder frei" + (eSrSt ? abgelehnt(eSrSt) : ""));
}

console.log("\n— Anlagen und Prüfprotokolle —");
{
  const heuteIso = new Date().toISOString().slice(0, 10);
  const { data: anl, error: eAnl } = await monteur.from("anlagen")
    .insert({ bezeichnung: "RLS-Test Verteiler", art: "verteiler", intervall_monate: 12 }).select("id").single();
  ok(!eAnl, "Monteur legt eine Anlage an" + (eAnl ? abgelehnt(eAnl) : ""));
  const { data: anlWeg } = await monteur.from("anlagen").delete().eq("id", anl.id).select();
  ok(!anlWeg?.length, "Monteur löscht keine Anlage");
  const { data: pr, error: ePr } = await monteur.from("pruefungen").insert({ anlage_id: anl.id, datum: heuteIso }).select("id, nummer").single();
  ok(!ePr && /^PR-\d{4}-\d{3}$/.test(pr?.nummer ?? ""), `Monteur beginnt ein Prüfprotokoll: ${pr?.nummer ?? ePr?.message}`);
  const sign = (felder) => monteur.from("pruefungen").update({ status: "unterschrieben", ...felder }).eq("id", pr.id).select("id").single();
  const { error: eOhneBild } = await sign({ unterschrift_name: "RLS Kunde", ergebnis: "ok" });
  ok(!!eOhneBild, "ohne Unterschriftsbild wird nicht unterschrieben" + abgelehnt(eOhneBild));
  const { error: eOhneErg } = await sign({ unterschrift_name: "RLS Kunde", unterschrift_pfad: "anlagen/unterschriften/rls.png" });
  ok(!!eOhneErg, "ohne Ergebnis wird nicht unterschrieben" + abgelehnt(eOhneErg));
  const { error: eOhneMaengel } = await sign({ unterschrift_name: "RLS Kunde", unterschrift_pfad: "anlagen/unterschriften/rls.png", ergebnis: "maengel" });
  ok(!!eOhneMaengel, "Mängel ohne Beschreibung gehen nicht" + abgelehnt(eOhneMaengel));
  const { error: eSign } = await sign({ unterschrift_name: "RLS Kunde", unterschrift_pfad: "anlagen/unterschriften/rls.png", ergebnis: "ok" });
  ok(!eSign, "Kunde unterschreibt das Protokoll" + (eSign ? abgelehnt(eSign) : ""));
  const { data: anlNach } = await monteur.from("anlagen").select("letzte_pruefung, naechste_pruefung").eq("id", anl.id).single();
  const naechste = new Date(`${heuteIso}T12:00:00Z`); naechste.setUTCFullYear(naechste.getUTCFullYear() + 1);
  ok(anlNach?.letzte_pruefung === heuteIso && anlNach?.naechste_pruefung === naechste.toISOString().slice(0, 10),
    `die nächste Prüfung springt ein Jahr weiter: ${anlNach?.naechste_pruefung}`);
  const { error: eFest } = await chef.from("pruefungen").update({ maengel: "nachträglich" }).eq("id", pr.id);
  ok(!!eFest, "unterschriebenes Protokoll ist fest" + abgelehnt(eFest));
  const { error: eWeg } = await chef.from("pruefungen").delete().eq("id", pr.id);
  const { data: noch } = await chef.from("pruefungen").select("id").eq("id", pr.id);
  ok(noch?.length === 1, "unterschriebenes Protokoll lässt sich nicht löschen" + (eWeg ? ` — ${eWeg.message}` : ""));
  const { error: eAnlWeg } = await chef.from("anlagen").delete().eq("id", anl.id);
  ok(!!eAnlWeg, "Anlage mit Protokoll bleibt" + abgelehnt(eAnlWeg));

  const { data: re3 } = await chef.from("belege").insert({ typ: "rechnung", projekt_id: projekt.id, empf_name: "RLS-Test Kunde" }).select("id").single();
  const { error: eMVerr } = await monteur.from("pruefungen").update({ rechnung_id: re3.id }).eq("id", pr.id);
  ok(!!eMVerr, "Monteur verrechnet kein Prüfprotokoll" + abgelehnt(eMVerr));
  const { data: prPos } = await chef.from("beleg_positionen").insert({
    beleg_id: re3.id, pos: 1, art: "pauschale", bezeichnung: "RLS-Test Prüfung", menge: 1, einheit: "Psch", einzelpreis: 150, quelle: { pruefung: [pr.id] },
  }).select("id").single();
  const { error: eVerr } = await chef.from("pruefungen").update({ rechnung_id: re3.id }).eq("id", pr.id);
  ok(!eVerr, "Chef verrechnet das unterschriebene Protokoll" + (eVerr ? abgelehnt(eVerr) : ""));
  await chef.from("beleg_positionen").delete().eq("id", prPos.id);
  const { data: frei1 } = await chef.from("pruefungen").select("rechnung_id").eq("id", pr.id).single();
  ok(frei1?.rechnung_id === null, "Position gelöscht → Protokoll wieder frei");
  await chef.from("beleg_positionen").insert({
    beleg_id: re3.id, pos: 1, art: "pauschale", bezeichnung: "RLS-Test Prüfung", menge: 1, einheit: "Psch", einzelpreis: 150, quelle: { pruefung: [pr.id] },
  });
  await chef.from("pruefungen").update({ rechnung_id: re3.id }).eq("id", pr.id);
  await chef.rpc("beleg_fertigstellen", { p_id: re3.id });
  const { error: eSt3 } = await chef.rpc("beleg_stornieren", { p_id: re3.id });
  const { data: frei2 } = await chef.from("pruefungen").select("rechnung_id").eq("id", pr.id).single();
  ok(!eSt3 && frei2?.rechnung_id === null, "Storno gibt das Protokoll wieder frei" + (eSt3 ? abgelehnt(eSt3) : ""));
  const { data: neuSieht } = await neu.from("anlagen").select("id");
  ok(!neuSieht?.length, "nicht Freigeschaltete sehen keine Anlagen");
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

console.log("\n— Material —");
{
  const { data: lager } = await chef.from("lagerorte").select("id").limit(1).single();
  const { data: artikel } = await chef.from("artikel").select("id").limit(1).single();
  const lagerbuchung = (art, menge) =>
    monteur.from("material_buchungen").insert({ art, artikel_id: artikel.id, lagerort_id: lager.id, menge, notiz: "RLS-Test" });
  const { error: e1 } = await lagerbuchung("zugang", 1);
  ok(!!e1, "Monteur bucht keinen Wareneingang" + abgelehnt(e1));
  const { error: e2 } = await lagerbuchung("korrektur", 100);
  ok(!!e2, "und keine Inventur" + abgelehnt(e2));
  const { data: mb, error: e3 } = await monteur.from("material_buchungen")
    .insert({ art: "direkt", bezeichnung: "RLS-Test Kabel", einheit: "m", menge: 5, projekt_id: projekt.id }).select("id").single();
  ok(!e3, "bucht Material direkt aufs Projekt" + (e3 ? abgelehnt(e3) : ""));
  const { error: e4 } = await monteur.from("material_buchungen").update({ user_id: chefId }).eq("id", mb?.id);
  ok(!!mb && !!e4, "und schiebt die Buchung keinem Kollegen unter" + abgelehnt(e4));
}

console.log("\n— Bestellungen —");
{
  const { data: lager } = await chef.from("lagerorte").select("id").eq("art", "lager").limit(1).single();
  const { data: zwei } = await chef.from("artikel").select("id").eq("aktiv", true).order("id").limit(2);
  const [art1, art2] = zwei;
  const { error: eM } = await monteur.from("bestellungen").insert({ lieferant: "RLS-Test Großhandel", lagerort_id: lager.id });
  ok(!!eM, "Monteur legt keine Bestellung an" + abgelehnt(eM));
  const { error: eZiel } = await chef.from("bestellungen").insert({ lieferant: "RLS-Test Großhandel", lagerort_id: lager.id, projekt_id: projekt.id });
  ok(!!eZiel, "Lager und Baustelle zugleich geht nicht" + abgelehnt(eZiel));
  const { data: be, error: eBe } = await chef.from("bestellungen")
    .insert({ lieferant: "RLS-Test Großhandel", lagerort_id: lager.id }).select("id, nummer").single();
  ok(!eBe && /^BE-\d{4}-\d{3}$/.test(be?.nummer ?? ""), `Chef legt eine Bestellung an: ${be?.nummer ?? eBe?.message}`);
  const { error: eLeer } = await chef.from("bestellungen").update({ status: "bestellt" }).eq("id", be.id);
  ok(!!eLeer, "ohne Positionen wird nicht bestellt" + abgelehnt(eLeer));
  const { data: pos } = await chef.from("bestell_positionen")
    .insert({ bestellung_id: be.id, pos: 1, artikel_id: art1.id, menge: 10, ek_preis: 2, geliefert: 99 }).select("id, geliefert").single();
  ok(Number(pos?.geliefert) === 0, "die gelieferte Menge startet bei 0, egal was geschickt wird");
  const { error: eGel } = await chef.from("bestell_positionen").update({ geliefert: 10 }).eq("id", pos.id);
  ok(!!eGel, "gelieferte Menge lässt sich nicht von Hand setzen" + abgelehnt(eGel));
  const { data: best, error: eBest } = await chef.from("bestellungen").update({ status: "bestellt" }).eq("id", be.id).select("bestellt_am").single();
  ok(!eBest && !!best?.bestellt_am, "Chef bestellt, der Zeitpunkt wird gesetzt" + (eBest ? abgelehnt(eBest) : ""));
  const { error: eFix } = await chef.from("bestell_positionen").update({ menge: 20 }).eq("id", pos.id);
  ok(!!eFix, "nach dem Bestellen stehen die Positionen fest" + abgelehnt(eFix));
  const eingang = (c, menge, artikelId = art1.id) => c.from("material_buchungen")
    .insert({ art: "zugang", artikel_id: artikelId, lagerort_id: lager.id, menge, notiz: "RLS-Test Lieferung", bestellposition_id: pos.id }).select("id").single();
  const { error: eMon } = await eingang(monteur, 1);
  ok(!!eMon, "Monteur bucht keinen Wareneingang gegen die Bestellung" + abgelehnt(eMon));
  const { error: eFalsch } = await eingang(chef, 1, art2.id);
  ok(!!eFalsch, "falscher Artikel passt nicht zur Position" + abgelehnt(eFalsch));
  const { data: l1, error: eL1 } = await eingang(chef, 4);
  const stand = async () => {
    const { data } = await chef.from("bestellungen").select("status, bestell_positionen(geliefert)").eq("id", be.id).single();
    return { status: data?.status, geliefert: Number(data?.bestell_positionen?.[0]?.geliefert) };
  };
  let s = await stand();
  ok(!eL1 && s.status === "teilgeliefert" && s.geliefert === 4, `Teillieferung: ${s.status}, geliefert ${s.geliefert}` + (eL1 ? abgelehnt(eL1) : ""));
  const { error: eSt } = await chef.from("bestellungen").update({ status: "storniert" }).eq("id", be.id);
  ok(!!eSt, "schon teilweise geliefert → nicht stornierbar" + abgelehnt(eSt));
  await eingang(chef, 6);
  s = await stand();
  ok(s.status === "geliefert" && s.geliefert === 10, `Rest geliefert: ${s.status}, geliefert ${s.geliefert}`);
  await chef.from("material_buchungen").delete().eq("id", l1.id);
  s = await stand();
  ok(s.status === "teilgeliefert" && s.geliefert === 6, `Buchung gelöscht → wieder teilgeliefert, geliefert ${s.geliefert}`);
  const { error: eDel } = await chef.from("bestellungen").delete().eq("id", be.id);
  const { data: nochDa } = await chef.from("bestellungen").select("id").eq("id", be.id);
  ok(nochDa?.length === 1, "eine bestellte Bestellung lässt sich nicht löschen" + (eDel ? ` — ${eDel.message}` : ""));
  const { error: eErl } = await chef.from("bestellungen").update({ status: "erledigt" }).eq("id", be.id);
  ok(!eErl, "„Rest kommt nicht mehr“ schließt ab" + (eErl ? abgelehnt(eErl) : ""));
  const { data: sieht } = await monteur.from("bestellungen").select("id");
  ok(!sieht?.length, "Monteur sieht keine Bestellungen (Einkaufspreise)");
}

console.log("\n— Konten —");
{
  const { error: e1 } = await monteur.rpc("passwort_setzen", { p_user: neuId, p_passwort: "Monteur-1234" });
  ok(!!e1, "Monteur kann keine Passwörter vergeben" + abgelehnt(e1));
  const { error: e2 } = await monteur.from("profiles").update({ passwort_neu: true }).eq("id", monteurId);
  ok(!!e2, "Monteur kann kein vorläufiges Passwort vortäuschen" + abgelehnt(e2));
  const { error: e3 } = await monteur.from("profiles").update({ gesperrt: true }).eq("id", monteurId);
  ok(!!e3, "sperren kann nur der Chef" + abgelehnt(e3));

  // Vergessenes Passwort: Chef vergibt ein vorläufiges, danach wieder das Testpasswort
  const vorlaeufig = `Test-${crypto.randomInt(1000, 10000)}`;
  const { error: e4 } = await chef.rpc("passwort_setzen", { p_user: neuId, p_passwort: vorlaeufig });
  ok(!e4, "Chef vergibt ein vorläufiges Passwort" + (e4 ? abgelehnt(e4) : ""));
  const probe = neuerClient();
  const { error: e5 } = await probe.auth.signInWithPassword({ email: mail("neu"), password: vorlaeufig });
  ok(!e5, "damit klappt die Anmeldung" + (e5 ? abgelehnt(e5) : ""));
  const { data: pn } = await probe.from("profiles").select("passwort_neu").eq("id", neuId).single();
  ok(pn?.passwort_neu === true, "und die App verlangt gleich ein eigenes");
  const { error: e6 } = await probe.auth.updateUser({ password: PW });
  const { error: e7 } = await probe.from("profiles").update({ passwort_neu: false }).eq("id", neuId);
  ok(!e6 && !e7, "eigenes Passwort festlegen geht ohne Chef" + (e6 || e7 ? abgelehnt(e6 ?? e7) : ""));

  // Sperren am Monteur — und gleich wieder freischalten, damit der nächste Lauf passt
  const { data: gs, error: e8 } = await chef.from("profiles").update({ gesperrt: true }).eq("id", monteurId).select("aktiv, gesperrt").single();
  ok(!e8 && gs?.gesperrt === true && gs?.aktiv === false, "Sperren nimmt die Freischaltung weg" + (e8 ? abgelehnt(e8) : ""));
  const { data: pr } = await monteur.from("projekte").select("id");
  ok(pr?.length === 0, "Gesperrte sehen nichts mehr");
  const { data: fr } = await chef.from("profiles").update({ aktiv: true }).eq("id", monteurId).select("aktiv, gesperrt").single();
  ok(fr?.aktiv === true && fr?.gesperrt === false, "Freischalten hebt die Sperre auf");
}

console.log("\n— Abwesenheiten, Konto, Einsätze —");
{
  const { data: antrag, error: e1 } = await monteur.from("abwesenheiten").insert({ art: "urlaub", von: "2030-07-01", bis: "2030-07-05", status: "genehmigt" }).select("*").single();
  ok(!e1 && antrag?.status === "beantragt", "Monteur beantragt Urlaub — bleibt „beantragt“, auch wenn er genehmigt schickt" + (e1 ? abgelehnt(e1) : ""));
  const { error: e2 } = await monteur.from("abwesenheiten").update({ status: "genehmigt" }).eq("id", antrag.id);
  ok(!!e2, "Selbst genehmigen geht nicht" + abgelehnt(e2));
  const { data: krank } = await monteur.from("abwesenheiten").insert({ art: "krank", von: "2030-08-01", bis: "2030-08-02" }).select("*").single();
  ok(krank?.status === "genehmigt", "Krankmeldung gilt sofort");
  const { error: e3 } = await monteur.from("abwesenheiten").insert({ art: "urlaub", user_id: chefId, von: "2030-07-01", bis: "2030-07-01" });
  ok(!!e3, "Abwesenheit für andere eintragen geht nur als Chef" + abgelehnt(e3));

  const { data: chefEintrag, error: e4 } = await chef.from("abwesenheiten").insert({ art: "krank", user_id: chefId, von: "2030-09-02", bis: "2030-09-02" }).select("*").single();
  ok(!e4 && chefEintrag?.status === "genehmigt", "Eintrag vom Chef gilt sofort" + (e4 ? abgelehnt(e4) : ""));
  const { data: fremd } = await monteur.from("abwesenheiten").select("id").eq("id", chefEintrag.id);
  ok(!fremd?.length, "Monteur liest fremde Abwesenheiten nicht direkt");
  const { data: sicht } = await monteur.from("abwesenheit_kalender").select("art").eq("id", chefEintrag.id).single();
  ok(sicht?.art === "abwesend", "Im Kalender sieht er nur „abwesend“, keinen Grund");
  const { data: sichtEigen } = await monteur.from("abwesenheit_kalender").select("art").eq("id", krank.id).single();
  ok(sichtEigen?.art === "krank", "Den eigenen Grund sieht er");
  const { data: nichtDa } = await neu.from("abwesenheit_kalender").select("id");
  ok(!nichtDa?.length, "Nicht Freigeschaltete sehen im Kalender keine Abwesenheiten");

  const { data: gen, error: e5 } = await chef.from("abwesenheiten").update({ status: "genehmigt" }).eq("id", antrag.id).select("*").single();
  ok(!e5 && gen?.entschieden_von === chefId && !!gen?.entschieden_am, "Chef genehmigt, Entscheidung wird festgehalten" + (e5 ? abgelehnt(e5) : ""));
  const { data: wegM } = await monteur.from("abwesenheiten").delete().eq("id", antrag.id).select("id");
  ok(!wegM?.length, "Genehmigten Urlaub löscht nur der Chef");

  const { error: e6 } = await monteur.from("konto_buchungen").insert({ user_id: monteurId, art: "ueberstunden", menge: 100, text: "RLS-Test" });
  ok(!!e6, "Konto buchen kann nur der Chef" + abgelehnt(e6));
  const { data: ko, error: e7 } = await chef.from("konto_buchungen").insert({ user_id: chefId, art: "ueberstunden", menge: 1, text: "RLS-Test" }).select("id").single();
  ok(!e7, "Chef bucht aufs Konto" + (e7 ? abgelehnt(e7) : ""));
  const { data: koM } = await monteur.from("konto_buchungen").select("id").eq("id", ko.id);
  ok(!koM?.length, "Fremdes Konto bleibt verborgen");
  for (const [feld, wert] of [["wochenstunden", 1], ["urlaub_tage", 60], ["lohnart", "Meister"], ["konto_ab", "2030-01-01"]]) {
    const { error } = await monteur.from("profiles").update({ [feld]: wert }).eq("id", monteurId);
    ok(!!error, `Monteur ändert ${feld} nicht selbst` + abgelehnt(error));
  }

  const { data: pr2 } = await chef.from("projekte").insert({ name: "RLS-Test Status" }).select("id").single();
  const { error: e8 } = await monteur.from("projekte").update({ status: "abgeschlossen" }).eq("id", pr2.id);
  ok(!!e8, "Monteur schließt kein Projekt ab" + abgelehnt(e8));
  const { error: e9 } = await monteur.from("projekte").update({ status: "verrechnen" }).eq("id", pr2.id);
  ok(!e9, "Auf „Zu verrechnen“ stellen darf er" + (e9 ? abgelehnt(e9) : ""));

  const { data: te } = await chef.from("termine").insert({ titel: "RLS-Test Einsatz", datum: "2030-07-01", projekt_id: pr2.id, mitarbeiter: [monteurId], von: "07:00" }).select("*").single();
  ok(te?.status === "geplant" && !te?.geaendert_am, "Neuer Einsatz ist geplant");
  const { data: t1 } = await monteur.from("termine").update({ status: "begonnen" }).eq("id", te.id).select("*").single();
  ok(!!t1?.begonnen_am && !t1?.geaendert_am, "Beginnen hält die Zeit fest, gilt nicht als Terminänderung");
  const { data: t2 } = await monteur.from("termine").update({ status: "erledigt" }).eq("id", te.id).select("*").single();
  ok(!!t2?.erledigt_am && t2?.erledigt_von === monteurId, "Erledigt hält Zeit und Person fest");
  const { data: t3 } = await chef.from("termine").update({ datum: "2030-07-02" }).eq("id", te.id).select("*").single();
  ok(!!t3?.geaendert_am && t3?.geaendert_von === chefId, "Termin verschieben wird gemerkt");
  const { data: t4 } = await chef.from("termine").update({ status: "geplant" }).eq("id", te.id).select("*").single();
  ok(!t4?.erledigt_am && !t4?.begonnen_am, "Zurücksetzen räumt die Zeiten weg");

  const { data: zg, error: e10 } = await monteur.from("zeiten").insert({ projekt_id: pr2.id, stunden: 3, art: "garantie", km: 12 }).select("id").single();
  ok(!e10 && !!zg, "Garantiestunden buchen" + (e10 ? abgelehnt(e10) : ""));
  const { data: za } = await chef.from("projekt_zahlen").select("stunden, stunden_offen").eq("projekt_id", pr2.id).single();
  ok(Number(za?.stunden) === 3 && Number(za?.stunden_offen) === 0, "Garantiestunden zählen, aber nicht als offen");

  // Gebucht wird nur auf Projekte „In Arbeit“ — Garantie ausgenommen
  const { data: prStatus } = await chef.from("projekte").select("status").eq("id", pr2.id).single();
  await chef.from("projekte").update({ status: "verrechnen" }).eq("id", pr2.id);
  const { error: e11 } = await monteur.from("zeiten").insert({ projekt_id: pr2.id, stunden: 1 }).select("id").single();
  ok(!!e11 && /In Arbeit/.test(e11.message), "Stunden auf „Zu verrechnen“ abgelehnt");
  const { error: e12 } = await monteur.from("zeiten").insert({ projekt_id: pr2.id, stunden: 1, art: "garantie" }).select("id").single();
  ok(!e12, "Garantie auf „Zu verrechnen“ geht" + (e12 ? abgelehnt(e12) : ""));
  const { error: e13 } = await monteur.from("regieberichte").insert({ projekt_id: pr2.id }).select("id").single();
  ok(!!e13, "Regiebericht auf „Zu verrechnen“ abgelehnt");
  await chef.from("projekte").update({ status: prStatus?.status ?? "aktiv" }).eq("id", pr2.id);
}

console.log("\n— Buchhaltung —");
{
  const { data: er, error: e1 } = await chef.from("eingangsrechnungen").insert({ lieferant: "RLS-Test Lieferant", nummer: "RLS-1", netto: 100, ust_satz: 20, ust: 20, brutto: 120 }).select("id").single();
  ok(!e1, "Chef erfasst Eingangsrechnung" + (e1 ? abgelehnt(e1) : ""));
  const { error: e2 } = await monteur.rpc("kreditor_konten_holen", { p_namen: ["RLS-Test Lieferant"] });
  ok(!!e2, "Kreditoren holt nur der Chef" + abgelehnt(e2));
  const { data: k1, error: e3 } = await chef.rpc("kreditor_konten_holen", { p_namen: ["RLS-Test Lieferant", " rls-test lieferant "] });
  ok(!e3 && k1?.length === 1 && k1[0].konto >= 30001, "Kreditor bekommt eine Nummer, Schreibweise egal" + (e3 ? abgelehnt(e3) : ""));
  const { data: k2 } = await chef.rpc("kreditor_konten_holen", { p_namen: ["RLS-Test Lieferant"] });
  ok(k2?.[0]?.konto === k1?.[0]?.konto, "Die Nummer bleibt dieselbe");
  const { data: mk } = await monteur.from("kreditor_konten").select("konto");
  ok(!mk?.length, "Monteur sieht keine Kreditorenkonten");

  const ueber = { p_von: "2030-01-01", p_bis: "2030-01-31", p_format: "bmd", p_belege: [] };
  const { error: e4 } = await monteur.rpc("fibu_uebergeben", { ...ueber, p_eingaenge: [er.id] });
  ok(!!e4, "Übergeben kann nur der Chef" + abgelehnt(e4));
  const { error: e5 } = await chef.rpc("fibu_uebergeben", { ...ueber, p_eingaenge: [] });
  ok(!!e5, "Leere Übergabe gibt es nicht" + abgelehnt(e5));
  const { data: ue, error: e6 } = await chef.rpc("fibu_uebergeben", { ...ueber, p_eingaenge: [er.id] });
  ok(!e6 && !!ue, "Chef übergibt" + (e6 ? abgelehnt(e6) : ""));
  const { error: e7 } = await chef.rpc("fibu_uebergeben", { ...ueber, p_eingaenge: [er.id] });
  ok(!!e7, "Derselbe Beleg geht nicht zweimal" + abgelehnt(e7));
  const { data: mu } = await monteur.from("fibu_uebergaben").select("id");
  ok(!mu?.length, "Monteur sieht keine Übergaben");

  const { error: e8 } = await chef.from("eingangsrechnungen").update({ netto: 50, brutto: 60, ust: 10 }).eq("id", er.id);
  ok(!!e8, "Übergebene Eingangsrechnung: Betrag bleibt" + abgelehnt(e8));
  const { error: e9 } = await chef.from("eingangsrechnungen").delete().eq("id", er.id);
  ok(!!e9, "Übergebene Eingangsrechnung: löschen geht nicht" + abgelehnt(e9));
  const { error: e10 } = await chef.from("eingangsrechnungen").update({ bezahlt_am: "2030-02-01" }).eq("id", er.id);
  ok(!e10, "Bezahlt setzen geht weiter" + (e10 ? abgelehnt(e10) : ""));
  const { error: e11 } = await chef.from("fibu_uebergaben").delete().eq("id", ue);
  ok(!e11, "Übergabe zurücknehmen" + (e11 ? abgelehnt(e11) : ""));
  const { error: e12 } = await chef.from("eingangsrechnungen").delete().eq("id", er.id);
  ok(!e12, "Danach lässt sie sich wieder löschen" + (e12 ? abgelehnt(e12) : ""));
  await chef.from("kreditor_konten").delete().eq("schluessel", "rls-test lieferant");
}

// Fuhrpark und Teams: alle sehen, der Chef pflegt; Monteure melden Schäden und tanken
{
  const { error: e1 } = await monteur.from("fahrzeuge").insert({ name: "RLS-Test Bus Monteur" });
  ok(!!e1, "Monteur legt kein Fahrzeug an" + abgelehnt(e1));
  const { data: fz, error: e2 } = await chef.from("fahrzeuge").insert({ name: "RLS-Test Steiger", art: "steiger", pruefung_bis: "2030-01-01" }).select("id").single();
  ok(!e2, "Chef legt einen Steiger an" + (e2 ? abgelehnt(e2) : ""));
  const { data: fzM } = await monteur.from("fahrzeuge").select("id").eq("id", fz.id);
  ok(fzM?.length === 1, "Monteur sieht den Fuhrpark");
  const { data: fzN } = await neu.from("fahrzeuge").select("id").eq("id", fz.id);
  ok(!fzN?.length, "Nicht freigeschaltet sieht keinen Fuhrpark");
  const { data: fzU } = await monteur.from("fahrzeuge").update({ km_stand: 1 }).eq("id", fz.id).select("id");
  ok(!fzU?.length, "Monteur ändert kein Fahrzeug");
  const { error: e3 } = await monteur.from("fahrzeug_eintraege").insert({ fahrzeug_id: fz.id, art: "schaden", text: "RLS-Test Kratzer", erledigt: false, erstellt_von: monteurId });
  ok(!e3, "Monteur meldet einen Schaden" + (e3 ? abgelehnt(e3) : ""));
  const { error: e4 } = await monteur.from("fahrzeug_eintraege").insert({ fahrzeug_id: fz.id, art: "service", text: "RLS-Test Service", erstellt_von: monteurId });
  ok(!!e4, "Service trägt nur der Chef ein" + abgelehnt(e4));
  const { data: eU } = await monteur.from("fahrzeug_eintraege").update({ erledigt: true }).eq("fahrzeug_id", fz.id).select("id");
  ok(!eU?.length, "Schaden erledigen kann nur der Chef");

  const { error: e5 } = await monteur.from("teams").insert({ name: "RLS-Test Team Monteur" });
  ok(!!e5, "Monteur legt kein Team an" + abgelehnt(e5));
  const { data: tm, error: e6 } = await chef.from("teams").insert({ name: "RLS-Test Team", mitglieder: [monteurId], fahrzeug_id: fz.id }).select("id").single();
  ok(!e6, "Chef stellt ein Team mit Bus zusammen" + (e6 ? abgelehnt(e6) : ""));
  const { data: tmM } = await monteur.from("teams").select("id").eq("id", tm.id);
  ok(tmM?.length === 1, "Monteur sieht die Teams");

  // Einsatz mit Team und Steiger: der Monteur sieht ihn
  const { data: te, error: e7 } = await chef.from("termine").insert({ titel: "RLS-Test Einsatz Steiger", datum: "2030-01-02", team_id: tm.id, mitarbeiter: [monteurId], fahrzeuge: [fz.id], projekt_id: projekt.id }).select("id").single();
  ok(!e7, "Chef teilt Team und Steiger ein" + (e7 ? abgelehnt(e7) : ""));
  const { data: teM } = await monteur.from("termine").select("id, fahrzeuge").eq("id", te?.id ?? "");
  ok(teM?.[0]?.fahrzeuge?.includes(fz.id), "Monteur sieht den Einsatz samt Steiger");
  await chef.from("termine").delete().eq("id", te?.id ?? "");
  await chef.from("teams").delete().eq("id", tm.id);
  const { error: e8 } = await chef.from("fahrzeuge").delete().eq("id", fz.id);
  ok(!e8, "Chef löscht das Fahrzeug samt Einträgen" + (e8 ? abgelehnt(e8) : ""));
}

// Eingangsrechnungen: prüfen → freigeben → überwiesen; Positionen nur der Chef
{
  const { data: er, error: e1 } = await chef.from("eingangsrechnungen")
    .insert({ lieferant: "RLS-Test Großhandel", nummer: "RLS-2", netto: 200, ust_satz: 20, ust: 40, brutto: 240, iban: "AT611904300234573201" }).select("id, freigabe").single();
  ok(!e1 && er.freigabe === "offen", "Neue Eingangsrechnung ist zu prüfen" + (e1 ? abgelehnt(e1) : ""));
  const { error: e2 } = await monteur.from("eingangsrechnungen").update({ freigabe: "freigegeben" }).eq("id", er.id);
  const { data: nachM } = await chef.from("eingangsrechnungen").select("freigabe").eq("id", er.id).single();
  ok(nachM.freigabe === "offen", "Monteur gibt keine Rechnung frei" + (e2 ? ` — ${e2.message}` : ""));
  const { error: e3 } = await monteur.from("eingang_positionen").insert({ eingangsrechnung_id: er.id, bezeichnung: "RLS-Test Kabel", gesamt: 10 });
  ok(!!e3, "Monteur schreibt keine Rechnungspositionen" + abgelehnt(e3));
  const { error: e4 } = await chef.from("eingang_positionen").insert([
    { eingangsrechnung_id: er.id, pos: 1, bezeichnung: "RLS-Test NYM-J 3x1,5", menge: 100, einheit: "m", einzelpreis: 1, gesamt: 100, projekt_id: projekt.id, lieferschein_nr: "RLS-LS-1", artikelnummer: null },
    { eingangsrechnung_id: er.id, pos: 2, bezeichnung: "RLS-Test Dose", menge: 50, einheit: "Stk", einzelpreis: 2, gesamt: 100, projekt_id: null, lieferschein_nr: null, artikelnummer: null },
  ]);
  ok(!e4, "Chef ordnet Positionen einzeln Projekten zu" + (e4 ? abgelehnt(e4) : ""));
  const { data: fr, error: e5 } = await chef.from("eingangsrechnungen").update({ freigabe: "freigegeben" }).eq("id", er.id).select("freigabe, freigegeben_von, freigegeben_am").single();
  ok(!e5 && fr.freigegeben_von === chefId && !!fr.freigegeben_am, "Freigabe merkt sich wer und wann" + (e5 ? abgelehnt(e5) : ""));
  const { data: ge } = await chef.from("eingangsrechnungen").update({ brutto: 250, ust: 50, netto: 200 }).eq("id", er.id).select("freigabe").single();
  ok(ge?.freigabe === "offen", "Betrag nach der Freigabe geändert → wieder zu prüfen");
  const { data: ab, error: e6 } = await chef.from("eingangsrechnungen").update({ freigabe: "abgelehnt", abgelehnt_grund: "RLS-Test falsch" }).eq("id", er.id).select("freigabe").single();
  ok(!e6 && ab.freigabe === "abgelehnt", "Chef lehnt ab" + (e6 ? abgelehnt(e6) : ""));
  const { error: e7 } = await chef.from("eingangsrechnungen").update({ bezahlt_am: "2030-01-05" }).eq("id", er.id);
  ok(!!e7, "Abgelehnte Rechnung wird nicht überwiesen" + abgelehnt(e7));
  const { data: wi, error: e8 } = await chef.from("eingangsrechnungen").update({ freigabe: "offen" }).eq("id", er.id).select("abgelehnt_grund").single();
  ok(!e8 && wi.abgelehnt_grund === null, "Zurück auf prüfen löscht den Grund" + (e8 ? abgelehnt(e8) : ""));
  const { data: bz, error: e9 } = await chef.from("eingangsrechnungen").update({ bezahlt_am: "2030-01-05" }).eq("id", er.id).select("freigabe").single();
  ok(!e9 && bz.freigabe === "freigegeben", "Schon bezahlt (Karte, bar) gilt als geprüft" + (e9 ? abgelehnt(e9) : ""));

  // Lieferscheine: Monteur fotografiert, sieht nur die eigenen; zugeordnet bleibt er
  const { error: e10 } = await monteur.from("lieferscheine").insert({ datei_pfad: `${chefId}/rls.jpg`, lieferant: "RLS-Test Großhandel", erstellt_von: chefId });
  ok(!!e10, "Lieferschein nur auf den eigenen Namen" + abgelehnt(e10));
  const { data: ls, error: e11 } = await monteur.from("lieferscheine").insert({ datei_pfad: `${monteurId}/rls.jpg`, lieferant: "RLS-Test Großhandel", nummer: "RLS-LS-1", projekt_id: projekt.id, erstellt_von: monteurId }).select("id").single();
  ok(!e11, "Monteur legt einen Lieferschein an" + (e11 ? abgelehnt(e11) : ""));
  const { data: lsC } = await chef.from("lieferscheine").select("id").eq("id", ls.id);
  ok(lsC?.length === 1, "Chef sieht den Lieferschein");
  const { data: lsN } = await neu.from("lieferscheine").select("id").eq("id", ls.id);
  ok(!lsN?.length, "Nicht freigeschaltet sieht ihn nicht");
  const { error: e12 } = await chef.from("lieferscheine").update({ eingangsrechnung_id: er.id }).eq("id", ls.id);
  ok(!e12, "Chef ordnet ihn der Rechnung zu" + (e12 ? abgelehnt(e12) : ""));
  const { data: lsD } = await monteur.from("lieferscheine").delete().eq("id", ls.id).select("id");
  ok(!lsD?.length, "Zugeordnet löscht der Monteur ihn nicht mehr");
  const { error: e13 } = await monteur.storage.from("lieferscheine").upload(`${chefId}/rls-test.txt`, new Blob(["x"]), { contentType: "text/plain" });
  ok(!!e13, "Foto nur in den eigenen Ordner" + abgelehnt(e13));

  await chef.from("lieferscheine").delete().eq("id", ls.id);
  await chef.from("eingangsrechnungen").delete().eq("id", er.id);
  const { data: rest } = await chef.from("eingang_positionen").select("id").eq("eingangsrechnung_id", er.id);
  ok(!rest?.length, "Positionen gehen mit der Rechnung");
}

// Rabatte beim Großhandel: nur der Chef
{
  const { error: e1 } = await monteur.from("rabatte").insert({ lieferant: "RLS-Test", rabatt: 30 });
  ok(!!e1, "Monteur trägt keine Rabatte ein" + abgelehnt(e1));
  const { data: r, error: e2 } = await chef.from("rabatte").insert({ lieferant: "RLS-Test", rabatt: 30 }).select("id").single();
  ok(!e2, "Chef trägt einen Rabatt ein" + (e2 ? abgelehnt(e2) : ""));
  const { data: rM } = await monteur.from("rabatte").select("id");
  ok(!rM?.length, "Monteur sieht keine Einkaufskonditionen");
  const { error: e3 } = await monteur.rpc("rabatte_anwenden", { p_lieferant: "RLS-Test", p_max: 10 });
  ok(!!e3, "Rabatte anwenden nur der Chef" + abgelehnt(e3));
  const { data: n, error: e4 } = await chef.rpc("rabatte_anwenden", { p_lieferant: "RLS-Test", p_max: 10 });
  ok(!e4 && n === 0, "Chef wendet an (ohne Artikel: 0)" + (e4 ? abgelehnt(e4) : ""));
  await chef.from("rabatte").delete().eq("id", r.id);
}

// Buchhaltung: Kategorien und Altrechnungen aus dem alten Programm (nur der Chef)
console.log("\n— Kategorien und Altrechnungen —");
{
  const { error: e1 } = await monteur.from("rechnung_kategorien").insert({ richtung: "ausgang", name: "RLS-Test Monteur" });
  ok(!!e1, "Monteur legt keine Kategorie an" + abgelehnt(e1));
  const { data: ka, error: e2 } = await chef.from("rechnung_kategorien").insert({ richtung: "ausgang", name: "RLS-Test Ausgang", konto: 4125 }).select("id").single();
  ok(!e2, "Chef legt eine Ausgangs-Kategorie an" + (e2 ? abgelehnt(e2) : ""));
  const { error: e3 } = await chef.from("rechnung_kategorien").insert({ richtung: "eingang", name: "RLS-Test Eingang ohne Art" });
  ok(!!e3, "Eingangs-Kategorie braucht die Art für die Buchhaltung" + abgelehnt(e3));
  const { data: ke } = await chef.from("rechnung_kategorien").insert({ richtung: "eingang", name: "RLS-Test Eingang", art: "werkzeug" }).select("id").single();
  const { error: e4 } = await chef.from("rechnung_kategorien").insert({ richtung: "ausgang", name: "rls-test ausgang " });
  ok(!!e4, "Name je Richtung nur einmal" + abgelehnt(e4));
  const { data: kM } = await monteur.from("rechnung_kategorien").select("id");
  ok(!kM?.length, "Monteur sieht keine Kategorien");
  // fertige Rechnung: Kategorie ist frei (steht auf keinem PDF), eine Eingangs-Kategorie passt nicht
  const { error: e5 } = await chef.from("belege").update({ kategorie_id: ka.id }).eq("id", re.id);
  ok(!e5, "Kategorie an einer fertigen Rechnung änderbar" + (e5 ? abgelehnt(e5) : ""));
  const { error: e6 } = await chef.from("belege").update({ kategorie_id: ke.id }).eq("id", re.id);
  ok(!!e6, "Eingangs-Kategorie nicht an einer Ausgangsrechnung" + abgelehnt(e6));

  const alt = { typ: "rechnung", status: "offen", altbestand: true, nummer: `RLS-ALT-${Date.now()}`, datum: "2025-12-01", faellig_am: "2025-12-15", empf_name: "RLS-Test Kunde", netto: 100, ust: 20, brutto: 120, ust_satz: 20 };
  const { error: e7 } = await monteur.from("belege").insert(alt);
  ok(!!e7, "Monteur erfasst keine Altrechnung" + abgelehnt(e7));
  const { error: e8 } = await chef.from("belege").insert({ ...alt, nummer: `${alt.nummer}-x`, brutto: 130 });
  ok(!!e8, "Altrechnung: Netto + USt muss Brutto ergeben" + abgelehnt(e8));
  const { error: e9 } = await chef.from("belege").insert({ ...alt, nummer: `${alt.nummer}-y`, status: "bezahlt" });
  ok(!!e9, "Altrechnung wird offen angelegt, bezahlt nur über eine Zahlung" + abgelehnt(e9));
  const { error: e10 } = await chef.from("belege").insert({ ...alt, nummer: " " });
  ok(!!e10, "Altrechnung braucht ihre alte Nummer" + abgelehnt(e10));
  const { data: ar, error: e11 } = await chef.from("belege").insert({ ...alt, kategorie_id: ka.id }).select("id, fertig_am").single();
  ok(!e11 && !!ar?.fertig_am, "Chef erfasst eine Altrechnung (ohne Nummernkreis)" + (e11 ? abgelehnt(e11) : ""));
  const { error: e12 } = await chef.from("belege").update({ netto: 200, ust: 40, brutto: 240 }).eq("id", ar.id);
  ok(!e12, "Altrechnung ist nicht festgeschrieben (Tippfehler korrigieren)" + (e12 ? abgelehnt(e12) : ""));
  const { error: e13 } = await chef.from("belege").update({ altbestand: false }).eq("id", ar.id);
  ok(!!e13, "Altrechnung bleibt Altrechnung" + abgelehnt(e13));
  const { error: e14 } = await chef.rpc("beleg_stornieren", { p_id: ar.id });
  ok(!!e14, "Altrechnung wird nicht storniert" + abgelehnt(e14));
  await chef.from("zahlungen").insert({ beleg_id: ar.id, betrag: 140, datum: "2026-01-10" });
  const { error: e15 } = await chef.from("zahlungen").insert({ beleg_id: ar.id, betrag: 100, datum: "2026-01-20", art: "ausbuchung", notiz: "RLS-Test uneinbringlich" });
  const { data: a1 } = await chef.from("belege").select("status, bezahlt_am").eq("id", ar.id).single();
  ok(!e15 && a1?.status === "bezahlt" && a1.bezahlt_am === "2026-01-20", `Teilzahlung + Ausbuchen → erledigt (${a1?.status})`);
  const { error: e16 } = await chef.from("belege").update({ netto: 250, ust: 50, brutto: 300 }).eq("id", ar.id);
  const { data: a2 } = await chef.from("belege").select("status, bezahlt_am").eq("id", ar.id).single();
  ok(!e16 && a2?.status === "offen" && !a2.bezahlt_am, `höherer Betrag → wieder offen (${a2?.status})`);
  const { error: e17 } = await chef.from("belege").update({ netto: 100, ust: 20, brutto: 120 }).eq("id", ar.id);
  ok(!!e17, "Betrag nicht unter das schon Bezahlte" + abgelehnt(e17));
  const { error: e18 } = await chef.rpc("fibu_uebergeben", { p_von: "2025-12-01", p_bis: "2025-12-31", p_format: "bmd", p_belege: [ar.id], p_eingaenge: [] });
  ok(!!e18, "Altrechnung geht nicht an die Kanzlei" + abgelehnt(e18));
  const { data: arWeg } = await chef.from("belege").delete().eq("id", ar.id).select("id");
  ok(arWeg?.length === 1, "Altrechnung lässt sich löschen (samt Zahlungen)");
  const { data: zRest } = await chef.from("zahlungen").select("id").eq("beleg_id", ar.id);
  ok(!zRest?.length, "ihre Zahlungen gehen mit");

  await chef.from("rechnung_kategorien").delete().in("id", [ka.id, ke.id]);
  const { data: reKat } = await chef.from("belege").select("kategorie_id").eq("id", re.id).single();
  ok(reKat && reKat.kategorie_id === null, "gelöschte Kategorie verschwindet aus der Rechnung, die Rechnung bleibt");
}

// ── SETEC-Pakete: B Terminplaner, C Kontakte, D Förderung/Lohnkosten,
//    E Angebot online, F Artikel/Lager, G Personal ─────────────────────────────
const anonym = neuerClient();

console.log("\n— B Terminplaner-Gruppe —");
{
  const { error: e1 } = await monteur.from("profiles").update({ gruppe: "Geschäftsführung" }).eq("id", monteurId);
  ok(!!e1, "Monteur setzt seine Gruppe nicht selbst" + abgelehnt(e1));
  const { error: e2 } = await chef.from("profiles").update({ gruppe: "Lager" }).eq("id", monteurId);
  ok(!e2, "Chef setzt die Gruppe" + (e2 ? abgelehnt(e2) : ""));
  const { error: e3 } = await chef.from("profiles").update({ gruppe: "x".repeat(41) }).eq("id", monteurId);
  ok(!!e3, "Gruppe höchstens 40 Zeichen" + abgelehnt(e3));
  await chef.from("profiles").update({ gruppe: null }).eq("id", monteurId);
}

console.log("\n— C Kontakte und Lieferanten —");
{
  const { data: kt, error: e1 } = await chef.from("kunden").insert({ name: "RLS-Test Großhandel C", art: "lieferant", namen: ["RLS-Test GH  C"] }).select("id").single();
  ok(!e1, "Chef legt einen Lieferanten an" + (e1 ? abgelehnt(e1) : ""));
  const { error: e2 } = await chef.from("kunden").insert({ name: "RLS-Test Falsch", art: "bank" });
  ok(!!e2, "nur Kunde, Lieferant oder Partner" + abgelehnt(e2));
  const { data: er } = await chef.from("eingangsrechnungen").insert({ lieferant: "rls-test gh c", nummer: "RLS-C1", netto: 10, ust_satz: 20, ust: 2, brutto: 12 }).select("id").single();
  const { data: ls } = await monteur.from("lieferscheine").insert({ datei_pfad: `${monteurId}/rls-c.jpg`, lieferant: "RLS-Test Großhandel C", nummer: "RLS-LS-C", erstellt_von: monteurId }).select("id").single();
  const { data: bc, error: e3 } = await chef.rpc("kontakt_belege", { p_kontakt: kt.id });
  ok(!e3 && bc?.some((b) => b.quelle === "rechnung") && bc?.some((b) => b.quelle === "lieferschein"),
    "Chef sieht Rechnung (andere Schreibweise) und Lieferschein beim Lieferanten" + (e3 ? abgelehnt(e3) : ""));
  const { data: bm } = await monteur.rpc("kontakt_belege", { p_kontakt: kt.id });
  ok(!bm?.some((b) => b.quelle === "rechnung") && bm?.some((b) => b.quelle === "lieferschein"), "Monteur sieht dort nur seinen Lieferschein, keine Rechnung");
  const { data: bn } = await neu.rpc("kontakt_belege", { p_kontakt: kt.id });
  ok(!bn?.length, "Nicht freigeschaltet sieht keine Belege");
  const { data: kd } = await monteur.from("kunden").delete().eq("id", kt.id).select("id");
  ok(!kd?.length, "Monteur löscht keinen Kontakt");
  await chef.from("lieferscheine").delete().eq("id", ls?.id ?? "");
  await chef.from("eingangsrechnungen").delete().eq("id", er?.id ?? "");
  await chef.from("kunden").delete().eq("id", kt.id);
}

console.log("\n— D Förderung, Projekt-Verlauf, Lohnkosten —");
{
  const { data: s, error: e1 } = await chef.from("mitarbeiter_saetze").insert({ user_id: monteurId, gueltig_ab: "2030-01-01", lohnkosten: 35, verrechnungssatz: 72 }).select("id").single();
  ok(!e1, "Chef trägt Lohnkosten und Verrechnungssatz ein" + (e1 ? abgelehnt(e1) : ""));
  const { data: sM } = await monteur.from("mitarbeiter_saetze").select("id");
  ok(!sM?.length, "Monteur sieht keine Lohnkosten (auch nicht die eigenen)");
  const { error: e2 } = await monteur.from("mitarbeiter_saetze").insert({ user_id: monteurId, gueltig_ab: "2030-02-01", lohnkosten: 1 });
  ok(!!e2, "Monteur trägt keine Lohnkosten ein" + abgelehnt(e2));
  const { data: sN } = await neu.from("mitarbeiter_saetze").select("id");
  ok(!sN?.length, "Nicht freigeschaltet sieht keine Lohnkosten");

  const { error: e3 } = await monteur.from("projekt_verlauf").insert({ projekt_id: projekt.id, art: "whatsapp", text: "RLS-Test Termin morgen", an: "+43 664 0000000", user_id: monteurId });
  ok(!e3, "Monteur vermerkt eine WhatsApp an den Kunden" + (e3 ? abgelehnt(e3) : ""));
  const { error: e4 } = await monteur.from("projekt_verlauf").insert({ projekt_id: projekt.id, art: "foerderung", text: "RLS-Test gefälscht", user_id: monteurId });
  ok(!!e4, "Förderschritte schreibt nur der Server" + abgelehnt(e4));
  const { error: e5 } = await monteur.from("projekt_verlauf").insert({ projekt_id: projekt.id, art: "notiz", text: "RLS-Test im Namen des Chefs", user_id: chefId });
  ok(!!e5, "Verlauf nur im eigenen Namen" + abgelehnt(e5));
  const { data: vD } = await monteur.from("projekt_verlauf").delete().eq("projekt_id", projekt.id).select("id");
  ok(!vD?.length, "Monteur löscht keinen Verlauf");
  const { data: vN } = await neu.from("projekt_verlauf").select("id");
  ok(!vN?.length, "Nicht freigeschaltet sieht keinen Verlauf");
  const { error: e6 } = await chef.from("projekte").update({ foerder_status: "eingereicht", foerder_stelle: "RLS-Test Land", foerder_betrag: 1500 }).eq("id", projekt.id);
  const { data: vF } = await chef.from("projekt_verlauf").select("text").eq("projekt_id", projekt.id).eq("art", "foerderung");
  ok(!e6 && vF?.length === 1 && /eingereicht/.test(vF[0].text), `Förderstatus landet im Verlauf: ${vF?.[0]?.text ?? e6?.message}`);
  const { error: e7 } = await chef.from("projekte").update({ foerder_status: "irgendwas" }).eq("id", projekt.id);
  ok(!!e7, "nur bekannte Förderschritte" + abgelehnt(e7));
  const { error: e8 } = await monteur.rpc("foerderung_verlauf");
  ok(!!e8, "Trigger-Funktion ist nicht per RPC aufrufbar" + abgelehnt(e8));
  await chef.from("mitarbeiter_saetze").delete().eq("id", s?.id ?? "");
}

console.log("\n— E Angebot online bestätigen —");
{
  const { data: an, error: eA } = await chef.from("belege").insert({ typ: "angebot", projekt_id: projekt.id, empf_name: "RLS-Test Kunde E" }).select("id").single();
  await chef.from("beleg_positionen").insert({ beleg_id: an.id, pos: 1, art: "arbeit", bezeichnung: "RLS-Test Montage", menge: 2, einheit: "h", einzelpreis: 100, ek_preis: 61.17, minuten: 37 });
  ok(!eA, "Chef legt ein Angebot an" + (eA ? abgelehnt(eA) : ""));
  const { error: e0 } = await chef.rpc("angebot_link_erstellen", { p_beleg: an.id });
  ok(!!e0, "Link nur für fertige Angebote" + abgelehnt(e0));
  await chef.rpc("beleg_fertigstellen", { p_id: an.id });
  const { error: e1 } = await monteur.rpc("angebot_link_erstellen", { p_beleg: an.id });
  ok(!!e1, "Monteur erzeugt keinen Bestätigungslink" + abgelehnt(e1));
  const { error: e1a } = await anonym.rpc("angebot_link_erstellen", { p_beleg: an.id });
  ok(!!e1a, "ohne Anmeldung auch nicht" + abgelehnt(e1a));
  const { data: token, error: e2 } = await chef.rpc("angebot_link_erstellen", { p_beleg: an.id });
  ok(!e2 && /^[A-Za-z0-9_-]{32}$/.test(token ?? ""), "Chef erzeugt einen Link mit 192-Bit-Token" + (e2 ? abgelehnt(e2) : ""));

  for (const t of ["angebot_links", "angebot_verlauf", "angebot_vorlagen"]) {
    const { data: a } = await anonym.from(t).select("*").limit(5);
    const { data: m } = await monteur.from(t).select("*").limit(5);
    ok(!a?.length && !m?.length, `${t}: weder ohne Anmeldung noch für den Monteur lesbar`);
  }
  const { error: e3 } = await anonym.rpc("angebot_link_zu", { p_token: token });
  ok(!!e3, "interne Hilfsfunktion angebot_link_zu nicht aufrufbar" + abgelehnt(e3));
  const { error: e4 } = await anonym.rpc("angebot_datenblaetter", { p_beleg: an.id });
  ok(!!e4, "angebot_datenblaetter nicht direkt aufrufbar" + abgelehnt(e4));

  const { data: geraten } = await anonym.rpc("angebot_oeffentlich", { p_token: crypto.randomBytes(24).toString("base64url") });
  ok(geraten?.zustand === "unbekannt" && !geraten.beleg && !geraten.positionen, "geratenes Token: nur „unbekannt“ und der Briefkopf");
  const { data: kurz } = await anonym.rpc("angebot_oeffentlich", { p_token: "%" });
  ok(kurz?.zustand === "unbekannt" && !kurz.beleg, "Platzhalter/kurze Tokens finden nichts");

  const { data: oe, error: e5 } = await anonym.rpc("angebot_oeffentlich", { p_token: token });
  const json = JSON.stringify(oe ?? {});
  ok(!e5 && oe?.zustand === "offen" && oe.positionen?.length === 1, "Kunde sieht das Angebot über den Link" + (e5 ? abgelehnt(e5) : ""));
  ok(!/ek_preis|minuten|aufschlag|quelle|61\.17|stundensatz/.test(json), "im öffentlichen JSON keine EK, Minuten, Aufschläge, Stundensätze");
  ok(JSON.stringify(Object.keys(oe?.positionen?.[0] ?? {}).sort()) === JSON.stringify(["art", "bezeichnung", "einheit", "einzelpreis", "langtext", "menge"]),
    "Positionen nur mit Art, Text, Menge, Einheit, Preis");
  const { data: vg } = await chef.from("angebot_verlauf").select("art").eq("beleg_id", an.id);
  ok(vg?.some((v) => v.art === "geoeffnet"), "Chef sieht: Kunde hat geöffnet");

  // Unterschrift hochladen: nur PNG, klein, nur unter dem eigenen Token, höchstens 5
  const png = (n = 200) => new Blob([new Uint8Array(n)], { type: "image/png" });
  const hoch = (pfad, blob = png(), typ = "image/png") => anonym.storage.from("angebot-bestaetigung").upload(pfad, blob, { contentType: typ });
  const { error: u1 } = await hoch(`${crypto.randomBytes(24).toString("base64url")}/${crypto.randomUUID()}.png`);
  ok(!!u1, "Upload unter geratenem Token abgelehnt" + abgelehnt(u1));
  const { error: u2 } = await hoch(`${token}/${crypto.randomUUID()}.png`, new Blob(["<script>"], { type: "text/html" }), "text/html");
  ok(!!u2, "nur PNG" + abgelehnt(u2));
  const { error: u3 } = await hoch(`${token}/${crypto.randomUUID()}.png`, png(600 * 1024));
  ok(!!u3, "höchstens 512 KB" + abgelehnt(u3));
  const { error: u4 } = await hoch(`${token}/sub/${crypto.randomUUID()}.png`);
  ok(!!u4, "keine Unterordner" + abgelehnt(u4));
  const unterschrift = `${token}/${crypto.randomUUID()}.png`;
  const { error: u5 } = await hoch(unterschrift);
  ok(!u5, "Kunde lädt seine Unterschrift hoch" + (u5 ? abgelehnt(u5) : ""));
  const { data: url } = await anonym.storage.from("angebot-bestaetigung").createSignedUrl(unterschrift, 60);
  ok(!url?.signedUrl, "hochgeladene Unterschriften kann niemand ohne Anmeldung lesen");
  const { error: u6 } = await anonym.storage.from("angebot-bestaetigung").upload(unterschrift, png(), { contentType: "image/png", upsert: true });
  ok(!!u6, "eine Unterschrift lässt sich nicht überschreiben" + abgelehnt(u6));
  let weitere = 0;
  for (let i = 0; i < 6; i++) if (!(await hoch(`${token}/${crypto.randomUUID()}.png`)).error) weitere++;
  ok(weitere === 4, `höchstens 5 Dateien je Link (noch ${weitere} angenommen)`);

  // Rückfragen: gedeckelt
  const { error: r1 } = await anonym.rpc("angebot_rueckfrage", { p_token: token, p_name: "RLS-Test Kunde", p_text: "Geht es auch in Schwarz?" });
  ok(!r1, "Kunde stellt eine Rückfrage" + (r1 ? abgelehnt(r1) : ""));
  const { error: r2 } = await anonym.rpc("angebot_rueckfrage", { p_token: token, p_name: "X", p_text: "?" });
  ok(!!r2, "leere Rückfrage abgelehnt" + abgelehnt(r2));
  let rueckfragen = 1;
  for (let i = 0; i < 25; i++) if (!(await anonym.rpc("angebot_rueckfrage", { p_token: token, p_name: "RLS-Test Spam", p_text: `Spam ${i}` })).error) rueckfragen++;
  ok(rueckfragen === 20, `Rückfragen je Link gedeckelt (${rueckfragen} angenommen)`);
  const { error: r3 } = await anonym.rpc("angebot_rueckfrage", { p_token: crypto.randomBytes(24).toString("base64url"), p_name: "RLS-Test", p_text: "Hallo Welt" });
  ok(!!r3, "Rückfrage mit geratenem Token abgelehnt" + abgelehnt(r3));

  // Annehmen
  const annehmen = (p) => anonym.rpc("angebot_annehmen", { p_token: token, p_name: "RLS-Test Kunde", p_stand: oe.stand, p_unterschrift: unterschrift, p_akzeptiert: true, ...p });
  const { error: a1 } = await annehmen({ p_stand: "2000-01-01T00:00:00Z" });
  ok(!!a1, "Annehmen eines älteren Stands abgelehnt" + abgelehnt(a1));
  const { error: a2 } = await annehmen({ p_unterschrift: `${crypto.randomBytes(24).toString("base64url")}/x.png` });
  ok(!!a2, "Unterschrift muss unter diesem Link liegen" + abgelehnt(a2));
  const { error: a3 } = await annehmen({ p_akzeptiert: false });
  ok(!!a3, "ohne Haken kein Annehmen" + abgelehnt(a3));
  // Chef ändert das Angebot nach dem Öffnen → der alte Stand gilt nicht mehr
  await chef.from("belege").update({ schlusstext: "RLS-Test geändert" }).eq("id", an.id);
  const { error: a4 } = await annehmen({});
  ok(!!a4, "nach einer Änderung muss der Kunde neu laden" + abgelehnt(a4));
  const { data: oe2 } = await anonym.rpc("angebot_oeffentlich", { p_token: token });
  const { error: a5 } = await annehmen({ p_stand: oe2?.stand });
  const { data: st } = await chef.from("belege").select("status").eq("id", an.id).single();
  ok(!a5 && st?.status === "angenommen", "Kunde nimmt an → Angebot angenommen" + (a5 ? abgelehnt(a5) : ""));
  const { error: a6 } = await annehmen({ p_stand: oe2?.stand });
  ok(!!a6, "zweites Annehmen abgelehnt" + abgelehnt(a6));
  const { error: r4 } = await anonym.rpc("angebot_rueckfrage", { p_token: token, p_name: "RLS-Test Kunde", p_text: "Noch eine Frage" });
  ok(!!r4, "nach der Annahme keine Rückfragen mehr" + abgelehnt(r4));
  const { error: u7 } = await hoch(`${token}/${crypto.randomUUID()}.png`);
  ok(!!u7, "nach der Annahme keine Uploads mehr" + abgelehnt(u7));
  const { data: urlC } = await chef.storage.from("angebot-bestaetigung").createSignedUrl(unterschrift, 60);
  ok(!!urlC?.signedUrl, "Chef öffnet die Unterschrift");
  const { data: urlM } = await monteur.storage.from("angebot-bestaetigung").createSignedUrl(unterschrift, 60);
  ok(!urlM?.signedUrl, "Monteur nicht");
  await chef.storage.from("angebot-bestaetigung").remove([unterschrift]);
  const { data: noch } = await chef.storage.from("angebot-bestaetigung").list(token);
  ok(noch?.some((o) => unterschrift.endsWith(o.name)), "Unterschrift bleibt, solange der Verlauf darauf zeigt");
  await chef.rpc("angebot_link_sperren", { p_beleg: an.id });
  const { data: gs } = await anonym.rpc("angebot_oeffentlich", { p_token: token });
  ok(gs?.zustand === "gesperrt" && !gs.beleg, "gesperrter Link zeigt nur noch „nicht mehr gültig“");

  // Material laut Angebot: Monteur bekommt Mengen ohne Preise
  const { data: am, error: e6 } = await monteur.rpc("angebot_material", { p_projekt: projekt.id });
  ok(!e6 && !!am && !/einzelpreis|ek_preis|brutto|netto/.test(JSON.stringify(am)), "Monteur: Material laut Angebot ohne Preise" + (e6 ? abgelehnt(e6) : ""));
  const { data: amN } = await neu.rpc("angebot_material", { p_projekt: projekt.id });
  ok(amN === null, "Nicht freigeschaltet: nichts");

  // Vorlagen
  const { error: v1 } = await monteur.from("angebot_vorlagen").insert({ name: "RLS-Test Vorlage M" });
  ok(!!v1, "Monteur legt keine Angebotsvorlage an" + abgelehnt(v1));
  const { error: v2 } = await chef.from("angebot_vorlagen").insert({ name: "RLS-Test Vorlage", positionen: [{ art: "arbeit", bezeichnung: "x", ek_preis: 1 }] });
  ok(!v2, "Chef speichert eine Vorlage" + (v2 ? abgelehnt(v2) : ""));
  const { error: v3 } = await chef.from("angebot_vorlagen").insert({ name: " rls-test vorlage" });
  ok(!!v3, "Vorlagenname nur einmal" + abgelehnt(v3));
  await chef.from("angebot_vorlagen").delete().like("name", "RLS-Test%");

  // Aufräumen: Angebot (samt Link und Verlauf), dann die Dateien
  const { data: anWeg } = await chef.from("belege").delete().eq("id", an.id).select("id");
  ok(anWeg?.length === 1, "angenommenes, nicht verrechnetes Angebot lässt sich löschen");
  const { data: liste } = await chef.storage.from("angebot-bestaetigung").list(token);
  await chef.storage.from("angebot-bestaetigung").remove((liste ?? []).map((o) => `${token}/${o.name}`));
  const { data: rest } = await chef.storage.from("angebot-bestaetigung").list(token);
  ok(!rest?.length, "danach sind auch die Unterschriften weg");
}

console.log("\n— F Artikel und Lager —");
{
  const { data: art, error: e1 } = await chef.from("artikel").insert({ bezeichnung: "RLS-Test Artikel", lieferant: "RLS-Test", artikelnummer: `RLS-${Date.now()}`, ek_preis: 10, einheit: "Stk" }).select("id").single();
  ok(!e1, "Chef legt einen Artikel an" + (e1 ? abgelehnt(e1) : ""));
  const { error: e2 } = await monteur.rpc("artikel_aufschlag_setzen", { p_aufschlag: 99, p_lieferant: "RLS-Test" });
  ok(!!e2, "Monteur ändert keine Aufschläge" + abgelehnt(e2));
  const { data: n1, error: e3 } = await chef.rpc("artikel_aufschlag_setzen", { p_aufschlag: 25, p_lieferant: "RLS-Test" });
  ok(!e3 && n1 === 1, `Chef setzt Aufschlag je Lieferant (${n1 ?? e3?.message})`);
  const { error: e4 } = await chef.rpc("artikel_aufschlag_setzen", { p_aufschlag: 25 });
  ok(!!e4, "ohne Kategorie/Hersteller/Lieferant nicht alle auf einmal" + abgelehnt(e4));

  const { error: e5 } = await chef.from("artikel_lieferanten").insert({ artikel_id: art.id, lieferant: "RLS-Test Zweit", ek_preis: 9 });
  ok(!e5, "Chef trägt einen zweiten Lieferanten ein" + (e5 ? abgelehnt(e5) : ""));
  const { data: alM } = await monteur.from("artikel_lieferanten").select("id").eq("artikel_id", art.id);
  ok(!alM?.length, "Monteur sieht keine Lieferantenpreise");
  const { error: e6 } = await monteur.from("artikel_lieferanten").insert({ artikel_id: art.id, lieferant: "RLS-Test M" });
  ok(!!e6, "und trägt keine ein" + abgelehnt(e6));

  const { error: e7 } = await chef.from("artikel_dateien").insert({ artikel_id: art.id, art: "datenblatt", pfad: `fremd/${art.id}/x.pdf` });
  ok(!!e7, "Artikel-Dateien nur unter artikel/<id>/" + abgelehnt(e7));
  const { error: e8 } = await chef.from("artikel_dateien").insert({ artikel_id: art.id, art: "datenblatt", pfad: `artikel/${art.id}/rlstest.pdf`, name: "RLS-Test.pdf" });
  ok(!e8, "Chef hängt ein Datenblatt an" + (e8 ? abgelehnt(e8) : ""));
  const { data: adM } = await monteur.from("artikel_dateien").select("id").eq("artikel_id", art.id);
  ok(adM?.length === 1, "Monteur sieht das Datenblatt");
  const { error: e9 } = await monteur.from("artikel_dateien").insert({ artikel_id: art.id, art: "bild", pfad: `artikel/${art.id}/m.jpg` });
  ok(!!e9, "Monteur hängt nichts an" + abgelehnt(e9));
  const { data: adN } = await neu.from("artikel_dateien").select("id");
  ok(!adN?.length, "Nicht freigeschaltet sieht keine Artikel-Dateien");

  const { data: bus } = await chef.from("lagerorte").insert({ name: "RLS-Test Bus", art: "fahrzeug", user_id: monteurId }).select("id").single();
  const { data: haupt } = await chef.from("lagerorte").insert({ name: "RLS-Test Lager", art: "lager" }).select("id").single();
  const { error: e10 } = await monteur.from("artikel_lagerplaetze").insert({ artikel_id: art.id, lagerort_id: bus.id, platz: "Kiste links" });
  ok(!e10, "Monteur setzt den Platz in seinem Bus" + (e10 ? abgelehnt(e10) : ""));
  const { error: e11 } = await monteur.from("artikel_lagerplaetze").insert({ artikel_id: art.id, lagerort_id: haupt.id, platz: "Regal 1" });
  ok(!!e11, "aber nicht im Hauptlager" + abgelehnt(e11));
  const { error: e12 } = await chef.from("artikel_lagerplaetze").insert({ artikel_id: art.id, lagerort_id: haupt.id, platz: "Regal 3, Fach B" });
  ok(!e12, "Chef setzt den Platz im Hauptlager" + (e12 ? abgelehnt(e12) : ""));
  const { data: lpU } = await monteur.from("artikel_lagerplaetze").update({ platz: "weg" }).eq("lagerort_id", haupt.id).select("platz");
  ok(!lpU?.length, "Monteur ändert den Platz im Hauptlager nicht");
  const { data: lpN } = await neu.from("artikel_lagerplaetze").select("platz");
  ok(!lpN?.length, "Nicht freigeschaltet sieht keine Lagerplätze");

  // Wareneingang aus dem Lieferschein: genau einmal, nur der Chef
  const { data: ls } = await monteur.from("lieferscheine").insert({ datei_pfad: `${monteurId}/rls-f.jpg`, lieferant: "RLS-Test", nummer: "RLS-LS-F", erstellt_von: monteurId }).select("id").single();
  const zeilen = [{ art: "zugang", artikel_id: art.id, menge: 2, lagerort_id: haupt.id, ek_preis: 10 }];
  const { error: e13 } = await monteur.rpc("lieferschein_einbuchen", { p_lieferschein: ls.id, p_zeilen: zeilen });
  ok(!!e13, "Monteur bucht keinen Lieferschein ein" + abgelehnt(e13));
  const { error: e14 } = await monteur.from("lieferscheine").update({ eingebucht_am: new Date().toISOString() }).eq("id", ls.id);
  ok(!!e14, "und stempelt ihn nicht als eingebucht" + abgelehnt(e14));
  const { error: e15 } = await chef.rpc("lieferschein_einbuchen", { p_lieferschein: ls.id, p_zeilen: [{ ...zeilen[0], art: "abgang" }] });
  ok(!!e15, "Einbuchen nur als Zugang oder direkt" + abgelehnt(e15));
  const { data: n2, error: e16 } = await chef.rpc("lieferschein_einbuchen", { p_lieferschein: ls.id, p_zeilen: zeilen });
  ok(!e16 && n2 === 1, "Chef bucht den Lieferschein ein" + (e16 ? abgelehnt(e16) : ""));
  const { error: e17 } = await chef.rpc("lieferschein_einbuchen", { p_lieferschein: ls.id, p_zeilen: zeilen });
  ok(!!e17, "ein zweites Mal nicht" + abgelehnt(e17));
  const { error: e18 } = await monteur.from("lieferscheine").update({ nummer: "RLS-LS-anders" }).eq("id", ls.id);
  ok(!!e18, "eingebucht: Monteur ändert ihn nicht mehr" + abgelehnt(e18));
  const { error: e19 } = await monteur.from("lieferscheine").delete().eq("id", ls.id);
  const { data: lsDa } = await chef.from("lieferscheine").select("id").eq("id", ls.id);
  ok(lsDa?.length === 1, "eingebucht: Monteur löscht ihn nicht" + (e19 ? ` — ${e19.message}` : ""));
  const { error: e20 } = await chef.from("artikel").delete().eq("id", art.id);
  ok(e20?.code === "23503", "Artikel mit Lagerbewegungen lässt sich nicht löschen (App: „wird noch verwendet“)" + abgelehnt(e20));
  const { error: e21 } = await chef.from("lagerorte").delete().eq("id", haupt.id);
  ok(e21?.code === "23503", "Lagerort mit Bewegungen auch nicht" + abgelehnt(e21));
  // Rest (Buchungen, Lieferschein, Artikel, Lagerorte) räumt rls-aufraeumen.sql weg
}

console.log("\n— G Personal: interne Stunden, Teamleitung, Aufgaben, Dokumente —");
{
  const { error: e1 } = await monteur.from("zeiten").insert({ projekt_id: projekt.id, intern: "Büro", stunden: 1, taetigkeit: "RLS-Test" });
  ok(!!e1, "interne Stunde nicht zugleich auf einem Projekt" + abgelehnt(e1));
  const { error: e2 } = await monteur.from("zeiten").insert({ intern: "Lager/Werkstatt", stunden: 1, taetigkeit: "RLS-Test intern" });
  ok(!e2, "Monteur bucht eine interne Stunde" + (e2 ? abgelehnt(e2) : ""));
  const { data: tm } = await chef.from("teams").insert({ name: "RLS-Test Team G", leiter_id: monteurId, mitglieder: [monteurId, chefId] }).select("id").single();
  const { error: e3 } = await monteur.from("zeiten").insert({ user_id: chefId, projekt_id: projekt.id, stunden: 1, taetigkeit: "RLS-Test Teamleitung" });
  ok(!e3, "Teamleitung bucht für ihr Team" + (e3 ? abgelehnt(e3) : ""));
  await chef.from("teams").update({ aktiv: false }).eq("id", tm.id);
  const { error: e4 } = await monteur.from("zeiten").insert({ user_id: chefId, projekt_id: projekt.id, stunden: 1, taetigkeit: "RLS-Test Team aus" });
  ok(!!e4, "inaktives Team: nicht mehr" + abgelehnt(e4));
  await chef.from("teams").delete().eq("id", tm.id);

  // Aufgaben
  const { data: a1, error: e5 } = await chef.from("aufgaben").insert({ titel: "RLS-Test Aufgabe Monteur", zustaendig: [monteurId] }).select("id").single();
  const { data: a2 } = await chef.from("aufgaben").insert({ titel: "RLS-Test Aufgabe Chef", zustaendig: [chefId] }).select("id").single();
  ok(!e5, "Chef legt eine Aufgabe an" + (e5 ? abgelehnt(e5) : ""));
  const { data: sicht } = await monteur.from("aufgaben").select("id").in("id", [a1.id, a2.id]);
  ok(sicht?.length === 1 && sicht[0].id === a1.id, "Monteur sieht nur die ihm zugewiesene");
  const { data: sN } = await neu.from("aufgaben").select("id");
  ok(!sN?.length, "Nicht freigeschaltet sieht keine Aufgaben");
  const { error: e6 } = await monteur.from("aufgaben").update({ titel: "RLS-Test umbenannt" }).eq("id", a1.id);
  ok(!!e6, "Zuständiger ändert den Titel nicht" + abgelehnt(e6));
  const { data: erl, error: e7 } = await monteur.from("aufgaben").update({ status: "erledigt", erledigt_von: chefId }).eq("id", a1.id).select("erledigt_von, erledigt_am").single();
  ok(!e7 && erl?.erledigt_von === monteurId && !!erl.erledigt_am, "Zuständiger erledigt — Stempel vom Server, nicht fälschbar" + (e7 ? abgelehnt(e7) : ""));
  const { data: fremdU } = await monteur.from("aufgaben").update({ status: "erledigt" }).eq("id", a2.id).select("id");
  ok(!fremdU?.length, "fremde Aufgabe nicht änderbar");
  const { data: fremdD } = await monteur.from("aufgaben").delete().eq("id", a1.id).select("id");
  ok(!fremdD?.length, "Zuständiger löscht die Aufgabe des Chefs nicht");
  const { error: e8 } = await monteur.from("aufgabe_verlauf").insert({ aufgabe_id: a1.id, art: "kommentar", text: "RLS-Test erledigt", user_id: monteurId });
  ok(!e8, "Monteur kommentiert" + (e8 ? abgelehnt(e8) : ""));
  const { error: e9 } = await monteur.from("aufgabe_verlauf").insert({ aufgabe_id: a1.id, art: "status", text: "erledigt", user_id: monteurId });
  ok(!!e9, "Statuszeilen schreibt nur der Server" + abgelehnt(e9));
  const { error: e10 } = await monteur.from("aufgabe_verlauf").insert({ aufgabe_id: a2.id, art: "kommentar", text: "RLS-Test", user_id: monteurId });
  ok(!!e10, "keine Kommentare an fremden Aufgaben" + abgelehnt(e10));
  const { data: vl } = await monteur.from("aufgabe_verlauf").select("art").eq("aufgabe_id", a2.id);
  ok(!vl?.length, "Verlauf fremder Aufgaben unsichtbar");
  const fotoOk = `${a1.id}/rlstest-${Date.now()}.jpg`;
  const { error: e11 } = await monteur.storage.from("aufgaben").upload(fotoOk, new Blob(["x"]), { contentType: "image/jpeg" });
  ok(!e11, "Monteur lädt ein Foto zu seiner Aufgabe hoch" + (e11 ? abgelehnt(e11) : ""));
  const { error: e12 } = await monteur.storage.from("aufgaben").upload(`${a2.id}/rlstest.jpg`, new Blob(["x"]), { contentType: "image/jpeg" });
  ok(!!e12, "nicht zu fremden Aufgaben" + abgelehnt(e12));
  const { data: fN } = await neu.storage.from("aufgaben").createSignedUrl(fotoOk, 60);
  ok(!fN?.signedUrl, "Nicht freigeschaltet öffnet das Foto nicht");
  await chef.storage.from("aufgaben").remove([fotoOk]);

  // Mitarbeiter-Dokumente
  const lohn = `${monteurId}/rlstest-lohnzettel-${Date.now()}.pdf`;
  await chef.storage.from("personal").upload(lohn, new Blob(["%PDF"]), { contentType: "application/pdf" });
  const { data: pd, error: e13 } = await chef.from("personal_dokumente").insert({ user_id: monteurId, art: "lohnzettel", monat: "2030-01-01", pfad: lohn, name: "RLS-Test Lohnzettel.pdf" }).select("id, gelesen_am").single();
  ok(!e13 && pd.gelesen_am === null, "Chef legt einen Lohnzettel ab (ungelesen)" + (e13 ? abgelehnt(e13) : ""));
  const { data: pdM } = await monteur.from("personal_dokumente").select("id").eq("id", pd.id);
  ok(pdM?.length === 1, "Monteur sieht seinen Lohnzettel");
  const { data: urlM } = await monteur.storage.from("personal").createSignedUrl(lohn, 60);
  ok(!!urlM?.signedUrl, "und öffnet ihn");
  await monteur.rpc("personal_dokument_gelesen", { p_id: pd.id });
  const { data: pdG } = await chef.from("personal_dokumente").select("gelesen_am").eq("id", pd.id).single();
  ok(!!pdG?.gelesen_am, "Chef sieht: gelesen");
  const { data: pdD } = await monteur.from("personal_dokumente").delete().eq("id", pd.id).select("id");
  ok(!pdD?.length, "Monteur löscht den Lohnzettel nicht");
  await monteur.storage.from("personal").remove([lohn]);
  const { data: urlNoch } = await chef.storage.from("personal").createSignedUrl(lohn, 60);
  ok(!!urlNoch?.signedUrl, "und auch nicht die Datei");
  const { error: e15 } = await monteur.from("personal_dokumente").insert({ user_id: monteurId, art: "lohnzettel", pfad: `${monteurId}/rls-m.pdf`, name: "x.pdf" });
  ok(!!e15, "Lohnzettel legt nur das Büro ab" + abgelehnt(e15));
  const krank = `${monteurId}/rlstest-krank-${Date.now()}.jpg`;
  const { error: e16 } = await monteur.storage.from("personal").upload(krank, new Blob(["x"]), { contentType: "image/jpeg" });
  const { data: kr, error: e17 } = await monteur.from("personal_dokumente").insert({ user_id: monteurId, art: "krankenschein", pfad: krank, name: "RLS-Test Krankenschein.jpg" }).select("gelesen_am, hochgeladen_von").single();
  ok(!e16 && !e17 && !!kr.gelesen_am && kr.hochgeladen_von === monteurId, "Monteur lädt seinen Krankenschein hoch" + (e16 || e17 ? abgelehnt(e16 ?? e17) : ""));
  const { error: e18 } = await monteur.from("personal_dokumente").insert({ user_id: chefId, art: "krankenschein", pfad: `${chefId}/rls.jpg`, name: "x.jpg" });
  ok(!!e18, "nicht für einen Kollegen" + abgelehnt(e18));
  const { error: e19 } = await monteur.storage.from("personal").upload(`${chefId}/rlstest.jpg`, new Blob(["x"]), { contentType: "image/jpeg" });
  ok(!!e19, "keine Dateien in fremde Ordner" + abgelehnt(e19));
  const fremd = `${chefId}/rlstest-chef-${Date.now()}.pdf`;
  await chef.storage.from("personal").upload(fremd, new Blob(["%PDF"]), { contentType: "application/pdf" });
  const { data: urlF } = await monteur.storage.from("personal").createSignedUrl(fremd, 60);
  ok(!urlF?.signedUrl, "fremde Personal-Dateien nicht lesbar");
  const { data: pdF } = await monteur.from("personal_dokumente").select("id").neq("user_id", monteurId);
  ok(!pdF?.length, "fremde Mitarbeiter-Dokumente unsichtbar");
  const { data: pdN } = await neu.from("personal_dokumente").select("id");
  ok(!pdN?.length, "Nicht freigeschaltet sieht keine");
  const { error: e20 } = await neu.storage.from("personal").upload(`${neuId}/rlstest.jpg`, new Blob(["x"]), { contentType: "image/jpeg" });
  ok(!!e20, "und lädt auch nichts hoch" + abgelehnt(e20));
  await chef.storage.from("personal").remove([lohn, krank, fremd]);

  // Firmendokumente
  const fdAlle = `rlstest/${Date.now()}-alle.pdf`;
  const fdChef = `rlstest/${Date.now()}-chef.pdf`;
  await chef.storage.from("firmen-dokumente").upload(fdAlle, new Blob(["%PDF"]), { contentType: "application/pdf" });
  await chef.storage.from("firmen-dokumente").upload(fdChef, new Blob(["%PDF"]), { contentType: "application/pdf" });
  const { error: e21 } = await chef.from("firmen_dokumente").insert([
    { ordner: "RLS-Test", titel: "RLS-Test Zertifikat", nur_chef: false, pfad: fdAlle, name: "z.pdf", beschreibung: null, gueltig_bis: null },
    { ordner: "RLS-Test", titel: "RLS-Test Polizze", nur_chef: true, pfad: fdChef, name: "p.pdf", beschreibung: null, gueltig_bis: null },
  ]);
  ok(!e21, "Chef legt Firmendokumente ab" + (e21 ? abgelehnt(e21) : ""));
  const { data: fdM } = await monteur.from("firmen_dokumente").select("titel").eq("ordner", "RLS-Test");
  ok(fdM?.length === 1 && fdM[0].titel === "RLS-Test Zertifikat", "Monteur sieht nur, was nicht „nur Chef“ ist");
  const { data: u1 } = await monteur.storage.from("firmen-dokumente").createSignedUrl(fdAlle, 60);
  const { data: u2 } = await monteur.storage.from("firmen-dokumente").createSignedUrl(fdChef, 60);
  ok(!!u1?.signedUrl && !u2?.signedUrl, "Datei „nur Chef“ auch im Speicher gesperrt");
  const { data: fdN } = await neu.from("firmen_dokumente").select("id");
  ok(!fdN?.length, "Nicht freigeschaltet sieht keine Firmendokumente");
  const { error: e22 } = await monteur.from("firmen_dokumente").insert({ titel: "RLS-Test M", pfad: "rlstest/m.pdf", name: "m.pdf" });
  ok(!!e22, "Monteur legt keine Firmendokumente ab" + abgelehnt(e22));
  const { data: fdU } = await monteur.from("firmen_dokumente").update({ nur_chef: false }).eq("pfad", fdChef).select("id");
  ok(!fdU?.length, "und gibt keine frei");
  const { error: e23 } = await monteur.storage.from("firmen-dokumente").upload(`rlstest/m-${Date.now()}.pdf`, new Blob(["x"]), { contentType: "application/pdf" });
  ok(!!e23, "und lädt keine Datei hoch" + abgelehnt(e23));
  await chef.from("firmen_dokumente").delete().eq("ordner", "RLS-Test");
  await chef.storage.from("firmen-dokumente").remove([fdAlle, fdChef]);
}

console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt tests/rls-aufraeumen.sql ausführen.");
process.exit(fehlgeschlagen ? 1 : 0);
