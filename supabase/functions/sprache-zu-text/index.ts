// Sprachnachricht eines Änderungswunsches abschreiben und am Wunsch nachtragen.
// Der Melder wartet nicht darauf: der Dialog schickt ab und ruft diese Funktion ohne await.
//   POST { wunschId, audioPfad }  (angemeldet; nur der eigene Wunsch oder als Chef)
// Feld `abschrift`: offen → laeuft → fertig | fehler (mit `abschrift_fehler`).
// Secret: OPENAI_API_KEY (gpt-4o-transcribe).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

const MODELL = Deno.env.get("STT_MODELL") ?? "gpt-4o-transcribe";

/** Ohne Hinweis macht die Abschrift aus Fachwörtern gern zwei Wörter. */
const FACHWOERTER = [
  "Elektroinstallation", "Unterverteiler", "Zählerplatz", "FI-Schalter", "Leitungsschutzschalter", "Sicherungsautomat",
  "Schukosteckdose", "Unterputz", "Aufputz", "Hohlwanddose", "NYM-Kabel", "Leerverrohrung", "Potentialausgleich",
  "Erdung", "Blitzschutz", "E-Check", "Prüfprotokoll", "Isolationsmessung", "Schleifenimpedanz", "PV-Anlage",
  "Wechselrichter", "Speicher", "Wallbox", "KNX", "Netzwerkdose", "Regiebericht", "Lieferschein", "Eingangsrechnung",
  "Angebot", "Rechnung", "Plantafel", "Monteur", "Aufschlag", "Leistungskatalog", "Datanorm",
].join(", ");

const endung = (mime: string) => {
  const m = mime.split(";")[0].trim().toLowerCase();
  return m.includes("mp4") || m.includes("m4a") ? "mp4" : m.includes("ogg") ? "ogg" : m.includes("mpeg") ? "mp3" : m.includes("wav") ? "wav" : "webm";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: KOPF });
  const url = Deno.env.get("SUPABASE_URL")!;
  const dienst = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let wunschId: string | undefined;
  const setzen = (felder: Record<string, unknown>) =>
    wunschId ? dienst.from("aenderungswuensche").update(felder).eq("id", wunschId) : Promise.resolve();

  try {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("Die Spracherkennung ist nicht eingerichtet.");
    // Mit den Rechten des Anrufers lesen: RLS lässt nur den eigenen Wunsch (Chef: alle) durch
    const nutzer = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const body = await req.json();
    const id = typeof body?.wunschId === "string" ? body.wunschId : "";
    const { data: w } = await nutzer.from("aenderungswuensche").select("id, text, audio_pfad").eq("id", id).maybeSingle();
    if (!w?.audio_pfad) throw new Error("Kein Zugriff auf diesen Wunsch.");
    wunschId = w.id;
    await setzen({ abschrift: "laeuft", abschrift_fehler: null });

    const { data: datei, error } = await dienst.storage.from("aenderungswuensche").download(w.audio_pfad);
    if (error || !datei) throw new Error(`Aufnahme nicht lesbar: ${error?.message ?? ""}`);
    const mime = datei.type || "audio/webm";

    const form = new FormData();
    form.append("model", MODELL);
    form.append("file", datei, `aufnahme.${endung(mime)}`);
    form.append("language", "de");
    form.append("prompt",
      "Sprachnotiz aus einem österreichischen Elektroinstallationsbetrieb: ein Änderungswunsch an der Firmen-App. "
      + "Hochdeutsch mit österreichischem Einschlag — in sauberem Hochdeutsch abschreiben, Füllwörter weglassen. "
      + `Fachbegriffe: ${FACHWOERTER}`);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) throw new Error(`Abschrift fehlgeschlagen (${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const text = String((await r.json()).text ?? "").trim();
    if (!text) {
      await setzen({ abschrift: "fehler", abschrift_fehler: "Da war nichts zu verstehen." });
      return antwort({ ok: false, error: "Da war nichts zu verstehen." });
    }
    // Getippten Text behalten, die Abschrift kommt darunter
    const vorher = String(w.text ?? "").trim();
    await setzen({ text: vorher ? `${vorher}\n${text}` : text, abschrift: "fertig", abschrift_fehler: null });
    return antwort({ ok: true, text });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("sprache-zu-text:", meldung);
    // Der Wunsch bleibt — nur die Abschrift ist offen
    await setzen({ abschrift: "fehler", abschrift_fehler: meldung }).catch(() => {});
    return antwort({ ok: false, error: meldung });
  }
});
