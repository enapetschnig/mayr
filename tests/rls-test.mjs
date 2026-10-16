import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(Boolean).map(l=>l.split(/=(.*)/s)));
const URL=env.VITE_SUPABASE_URL, KEY=env.VITE_SUPABASE_KEY;
const FIRMEN={mam:"11111111-1111-4111-8111-111111111111",nord:"22222222-2222-4222-8222-222222222222",sued:"33333333-3333-4333-8333-333333333333"};
const PW="Test-Passwort-2026!";
const ok=(c,m)=>console.log((c?"✓ ":"✗ FEHLER ")+m);
async function client(k){
  const c=createClient(URL,KEY,{auth:{persistSession:false}});
  const email=`rlstest-${k}@mayr-test.at`;
  let {error}=await c.auth.signInWithPassword({email,password:PW});
  if(error){ const r=await c.auth.signUp({email,password:PW,options:{data:{vorname:"Test",nachname:k,firma_id:FIRMEN[k]}}}); if(r.error) throw r.error; }
  return c;
}
const step=process.argv[2];
if(step==="anlegen"){ for(const k of Object.keys(FIRMEN)) await client(k); console.log("angelegt"); process.exit(0); }
const mam=await client("mam"), nord=await client("nord"), sued=await client("sued");
// MAM: privates + gemeinsames Projekt
const {data:pPriv,error:e1}=await mam.from("projekte").insert({name:"RLS privat",sichtbarkeit:"privat"}).select().single(); ok(!e1,"MAM legt privates Projekt an "+(e1?.message||""));
const {data:pGem,error:e2}=await mam.from("projekte").insert({name:"RLS gemeinsam",sichtbarkeit:"gemeinsam"}).select().single(); ok(!e2,"MAM legt gemeinsames Projekt an "+(e2?.message||""));
const {data:rollen}=await mam.from("projekt_rollen").select().eq("projekt_id",pGem.id); ok(rollen?.length===1&&rollen[0].rolle==="GU","GU automatisch = MAM");
const {data:nSieht}=await nord.from("projekte").select("id,name"); ok(nSieht.some(p=>p.id===pGem.id)&&!nSieht.some(p=>p.id===pPriv.id),"Nord sieht gemeinsames, nicht privates Projekt");
const {error:e3}=await nord.from("projekt_rollen").insert({projekt_id:pGem.id,firma_id:FIRMEN.nord,rolle:"SU"}); ok(!e3,"Nord trägt sich als SU ein "+(e3?.message||""));
const {error:e3b}=await nord.from("projekte").update({sichtbarkeit:"privat"}).eq("id",pGem.id); ok(!!e3b,"Nord kann Freigabe NICHT ändern ("+(e3b?.message||"kein Fehler!")+")");
const {error:e3c}=await nord.from("zeiten").insert({projekt_id:pPriv.id,stunden:3}); ok(!!e3c,"Nord kann NICHT auf fremdes privates Projekt buchen");
// Buchungen
await nord.from("zeiten").insert([{projekt_id:pGem.id,stunden:7,taetigkeit:"privat N",sichtbarkeit:"privat"},{projekt_id:pGem.id,stunden:2,taetigkeit:"gemeinsam N",sichtbarkeit:"gemeinsam"}]);
await nord.from("material").insert([{projekt_id:pGem.id,bezeichnung:"Kabel privat",menge:10,ek_preis:1.5,sichtbarkeit:"privat"},{projekt_id:pGem.id,bezeichnung:"Dose gemeinsam",menge:5,ek_preis:2,sichtbarkeit:"gemeinsam"}]);
const {data:mz}=await mam.from("zeiten").select("taetigkeit").eq("projekt_id",pGem.id); ok(mz.length===1&&mz[0].taetigkeit==="gemeinsam N","MAM sieht nur gemeinsame Stunden von Nord");
const {data:mm}=await mam.from("material").select("bezeichnung").eq("projekt_id",pGem.id); ok(mm.length===1,"MAM sieht nur gemeinsames Material von Nord");
const {data:sz}=await sued.from("zeiten").select("id").eq("projekt_id",pGem.id); ok(sz.length===1,"Süd sieht nur die gemeinsame Stunde");
// Rechnung Nord → MAM
const {data:r,error:e4}=await nord.from("rechnungen").insert({typ:"rechnung",empfaenger_art:"firma",empfaenger_firma_id:FIRMEN.mam,projekt_id:pGem.id,kunde_name:"MAM Mechatronik",reverse_charge:true,netto:100,brutto:100}).select().single(); ok(!e4,"Nord legt Rechnung an MAM an "+(e4?.message||""));
let {data:mr}=await mam.from("rechnungen").select("id").eq("id",r.id); ok(mr.length===0,"MAM sieht den Entwurf von Nord NICHT");
await nord.from("rechnung_positionen").insert({rechnung_id:r.id,bezeichnung:"Elektroinstallation",menge:7,einheit:"h",einzelpreis:60});
const {data:nr,error:e5}=await nord.rpc("beleg_fertigstellen",{p_id:r.id}); ok(!e5&&/^NORD-\d{4}-001$/.test(nr),"Fertigstellen vergibt Nummer: "+(nr||e5?.message));
({data:mr}=await mam.from("rechnungen").select("id,nummer").eq("id",r.id)); ok(mr.length===1,"MAM sieht fertige Rechnung von Nord als Eingang");
const {data:mpos}=await mam.from("rechnung_positionen").select("gesamt").eq("rechnung_id",r.id); ok(mpos.length===1&&Number(mpos[0].gesamt)===420,"MAM sieht Positionen (420 €)");
const {data:sr}=await sued.from("rechnungen").select("id"); ok(sr.length===0,"Süd sieht keine fremde Rechnung");
const {error:e6}=await nord.from("rechnung_positionen").update({einzelpreis:1}).eq("rechnung_id",r.id); ok(!!e6,"Fertige Rechnung ist festgeschrieben");
const {data:mu}=await mam.from("rechnungen").update({status:"bezahlt"}).eq("id",r.id).select(); ok(!mu?.length,"MAM kann Nords Rechnung nicht ändern");
// Dateien Storage
const pfad=`${pGem.id}/test-${Date.now()}.txt`;
const {error:e7}=await nord.storage.from("projekt-dateien").upload(pfad,new Blob(["hallo"]),{contentType:"text/plain"}); ok(!e7,"Nord lädt Datei hoch "+(e7?.message||""));
await nord.from("dateien").insert({projekt_id:pGem.id,pfad,name:"test.txt",art:"dokument"});
const {data:url,error:e8}=await sued.storage.from("projekt-dateien").createSignedUrl(pfad,60); ok(!e8&&url?.signedUrl,"Süd kann gemeinsame Datei öffnen "+(e8?.message||""));
const {error:e9}=await sued.storage.from("projekt-dateien").upload(`${pPriv.id}/x.txt`,new Blob(["x"])); ok(!!e9,"Süd kann NICHT in fremdes privates Projekt hochladen");
// Termine
await mam.from("termine").insert([{titel:"Privat MAM",datum:"2026-10-20",sichtbarkeit:"privat"},{titel:"Für alle",datum:"2026-10-21",sichtbarkeit:"gemeinsam"}]);
const {data:st}=await sued.from("termine").select("titel"); ok(st.every(t=>t.titel==="Für alle")&&st.length>=1,"Süd sieht nur gemeinsamen Termin");
// Aufräumen
await nord.storage.from("projekt-dateien").remove([pfad]);
await nord.from("dateien").delete().eq("pfad",pfad);
for (const c of [mam,nord,sued]) { await c.from("termine").delete().neq("id","00000000-0000-0000-0000-000000000000"); }
await nord.from("rechnungen").delete().eq("id",r.id); // fertig → bleibt (Schutz), wird per SQL entfernt
await mam.from("projekte").delete().in("id",[pPriv.id,pGem.id]);
console.log("fertig");
