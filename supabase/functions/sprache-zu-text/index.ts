// Sprachnachricht eines Änderungswunsches abschreiben und am Wunsch nachtragen.
// Der Melder wartet nicht darauf: der Dialog schickt ab und ruft diese Funktion ohne await.
//   POST { wunschId, audioPfad }  (angemeldet; nur der eigene Wunsch oder als Chef)
// Feld `abschrift`: offen → laeuft → fertig | fehler (mit `abschrift_fehler`).
//
// „Bildschirm aufnehmen & erklären“ (wie Lengauer Stockner): Hat der Wunsch einen
// `aufnahme_ablauf`, kommt die Abschrift mit Zeitmarken (whisper-1), Gesagtes und
// Gezeigtes werden eine Zeitleiste, und Claude macht daraus die einzelnen Wünsche.
// Die reine Abschrift bleibt bei OpenAI — die Anthropic-API nimmt kein Audio an.
// Secrets: OPENAI_API_KEY, ANTHROPIC_API_KEY (fehlt er, bleibt die Zeitleiste stehen).
import Anthropic from "npm:@anthropic-ai/sdk@1.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

const MODELL = Deno.env.get("STT_MODELL") ?? "gpt-4o-transcribe";
/** Nur whisper-1 liefert Zeitmarken je Satz */
const ZEIT_MODELL = Deno.env.get("STT_ZEIT_MODELL") ?? "whisper-1";

/** Ohne Hinweis macht die Abschrift aus Fachwörtern gern zwei Wörter. */
const FACHWOERTER = [
  "Elektroinstallation", "Unterverteiler", "Zählerplatz", "FI-Schalter", "Leitungsschutzschalter", "Sicherungsautomat",
  "Schukosteckdose", "Unterputz", "Aufputz", "Hohlwanddose", "NYM-Kabel", "Leerverrohrung", "Potentialausgleich",
  "Erdung", "Blitzschutz", "E-Check", "Prüfprotokoll", "Isolationsmessung", "Schleifenimpedanz", "PV-Anlage",
  "Wechselrichter", "Speicher", "Wallbox", "KNX", "Netzwerkdose", "Regiebericht", "Lieferschein", "Eingangsrechnung",
  "Angebot", "Rechnung", "Plantafel", "Monteur", "Aufschlag", "Leistungskatalog", "Datanorm", "Steiger",
].join(", ");

const endung = (mime: string) => {
  const m = mime.split(";")[0].trim().toLowerCase();
  return m.includes("mp4") || m.includes("m4a") ? "mp4" : m.includes("ogg") ? "ogg" : m.includes("mpeg") ? "mp3" : m.includes("wav") ? "wav" : "webm";
};

type Satz = { t: number; text: string };
type Schritt = { t: number; art: "seite" | "klick"; text: string };

/** Bekannte Erfindungen von whisper-1 bei Stille */
const STILLE = /untertitel|amara\.org|vielen dank (fürs|für's|für das) zu(schauen|sehen|hören)|bis zum nächsten mal|swr \d{4}|copyright/i;

async function abschreiben(key: string, datei: Blob, mime: string, mitZeiten: boolean): Promise<{ text: string; saetze: Satz[] }> {
  const form = new FormData();
  form.append("model", mitZeiten ? ZEIT_MODELL : MODELL);
  if (mitZeiten) {
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
  }
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
  const json = await r.json();
  if (!mitZeiten || !Array.isArray(json.segments)) return { text: String(json.text ?? "").trim(), saetze: [] };
  const saetze: Satz[] = json.segments
    .filter((g: { no_speech_prob?: number; avg_logprob?: number }) => !((g.no_speech_prob ?? 0) > 0.6 && (g.avg_logprob ?? 0) < -0.5))
    .map((g: { start?: number; text?: string }) => ({ t: Number(g.start) || 0, text: String(g.text ?? "").trim() }))
    .filter((g: Satz) => g.text && !STILLE.test(g.text));
  return { text: saetze.map((g) => g.text).join(" "), saetze };
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Gesagtes und Gezeigtes in eine Zeitleiste */
function zeitleiste(saetze: Satz[], schritte: Schritt[]): string {
  return [
    ...schritte.map((s) => ({ t: Number(s.t) || 0, z: s.art === "seite" ? `Seite ${String(s.text).slice(0, 200)}` : `tippt ${String(s.text).slice(0, 100)}` })),
    ...saetze.map((s) => ({ t: s.t, z: `sagt: „${s.text}“` })),
  ].sort((a, b) => a.t - b.t).map((x) => `[${mmss(x.t)}] ${x.z}`).join("\n");
}

/** Claude macht aus der Zeitleiste die einzelnen Wünsche. Scheitert das, bleibt die Zeitleiste. */
async function wuenscheAusVorfuehrung(leiste: string): Promise<string> {
  const schluessel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!schluessel) return "";
  try {
    const client = new Anthropic({ apiKey: schluessel });
    const r = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      system:
        "Jemand aus einem Elektrobetrieb hat in der Firmen-App vorgeführt, was geändert werden soll, und dabei geredet. "
        + "Du bekommst die Zeitleiste (Seite = wo er oder sie war, tippt = was angetippt wurde, sagt = Abschrift). "
        + "Schreib daraus die einzelnen Änderungswünsche als nummerierte Liste, je Wunsch EIN klarer Satz in den Worten "
        + "der Person, in Klammern die Seite bzw. das Element, um das es geht. Nichts dazuerfinden, nichts zusammenfassen, "
        + "was nicht gesagt wurde. Fragen als Frage aufnehmen. Nur die Liste ausgeben, ohne Einleitung, ohne Markdown. "
        + "Ist kein Wunsch zu erkennen, nur „–“.",
      messages: [{ role: "user", content: leiste.slice(0, 30_000) }],
    } as never) as { stop_reason: string; content: { type: string; text?: string }[] };
    if (r.stop_reason === "refusal") return "";
    const liste = r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    return liste && liste !== "–" ? liste : "";
  } catch (e) {
    console.error("sprache-zu-text: Wünsche nicht ausgewertet:", e instanceof Error ? e.message : e);
    return "";
  }
}

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
    const { data: w } = await nutzer.from("aenderungswuensche").select("id, text, audio_pfad, aufnahme_ablauf").eq("id", id).maybeSingle();
    if (!w?.audio_pfad) throw new Error("Kein Zugriff auf diesen Wunsch.");
    wunschId = w.id;
    await setzen({ abschrift: "laeuft", abschrift_fehler: null });

    const { data: datei, error } = await dienst.storage.from("aenderungswuensche").download(w.audio_pfad);
    if (error || !datei) throw new Error(`Aufnahme nicht lesbar: ${error?.message ?? ""}`);
    const mime = datei.type || "audio/webm";

    const ablauf = w.aufnahme_ablauf && typeof w.aufnahme_ablauf === "object" && !Array.isArray(w.aufnahme_ablauf)
      ? w.aufnahme_ablauf as { sekunden?: number; schritte?: Schritt[] } : null;
    let text: string;
    if (ablauf) {
      // Mit Zeitmarken; klappt das nicht, wenigstens die normale Abschrift
      let saetze: Satz[];
      try {
        const r = await abschreiben(key, datei, mime, true);
        text = r.text;
        saetze = r.saetze.length ? r.saetze : (r.text ? [{ t: 0, text: r.text }] : []);
      } catch (e) {
        console.error("sprache-zu-text: Zeitmarken:", e instanceof Error ? e.message : e);
        text = (await abschreiben(key, datei, mime, false)).text;
        saetze = text ? [{ t: 0, text }] : [];
      }
      // Auch ohne verständliche Sprache kommt der Ablauf an
      const leiste = zeitleiste(saetze, Array.isArray(ablauf.schritte) ? ablauf.schritte.slice(0, 500) : []);
      const liste = text ? await wuenscheAusVorfuehrung(leiste) : "";
      const dauer = mmss(Number(ablauf.sekunden) || 0);
      text = [
        liste ? `Gezeigt und erklärt (Bildschirmaufnahme ${dauer}):\n${liste}`
          : `Bildschirmaufnahme ${dauer}${text ? "" : " (gesprochen war nichts zu verstehen)"}`,
        `Ablauf${text ? " mit Abschrift" : ""}:\n${leiste || "–"}`,
      ].join("\n\n");
    } else {
      text = (await abschreiben(key, datei, mime, false)).text;
      if (!text) {
        await setzen({ abschrift: "fehler", abschrift_fehler: "Da war nichts zu verstehen." });
        return antwort({ ok: false, error: "Da war nichts zu verstehen." });
      }
    }
    // Getippten Text behalten, die Abschrift kommt darunter
    const vorher = String(w.text ?? "").trim();
    await setzen({ text: vorher ? `${vorher}${ablauf ? "\n\n" : "\n"}${text}` : text, abschrift: "fertig", abschrift_fehler: null });
    return antwort({ ok: true, text });
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    console.error("sprache-zu-text:", meldung);
    // Der Wunsch bleibt — nur die Abschrift ist offen
    await setzen({ abschrift: "fehler", abschrift_fehler: meldung }).catch(() => {});
    return antwort({ ok: false, error: meldung });
  }
});
