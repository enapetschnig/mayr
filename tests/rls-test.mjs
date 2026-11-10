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

console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt tests/rls-aufraeumen.sql ausführen.");
process.exit(fehlgeschlagen ? 1 : 0);
