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
  const { error: e4 } = await chef.from("belege").update({ status: "bezahlt", bezahlt_am: new Date().toISOString().slice(0, 10) }).eq("id", re.id);
  ok(!e4, "als bezahlt markieren geht" + (e4 ? abgelehnt(e4) : ""));
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

console.log(fehlgeschlagen ? `\n✗ ${fehlgeschlagen} Prüfung(en) fehlgeschlagen` : "\n✓ Alle Prüfungen bestanden");
console.log("Jetzt tests/rls-aufraeumen.sql ausführen.");
process.exit(fehlgeschlagen ? 1 : 0);
