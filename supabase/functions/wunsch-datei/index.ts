// Signierte URL für eine Wunsch-Datei (Bildschirmfoto, Sprachnachricht) — nur fürs ePower-Cockpit.
// Das Cockpit hat keine Schlüssel dieser App; es fragt hier mit dem gemeinsamen Geheimnis
// (Secret COCKPIT_SECRET), mit dem die App auch ihre Wünsche schickt.
//   POST { pfad: "<uid>/123-bild.jpg" }  →  { url: "<signierte URL, 1 h>" }
// Deploy ohne JWT-Prüfung (supabase/config.toml), die Funktion prüft selbst.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const KOPF = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cockpit-secret",
};
const antwort = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...KOPF, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: KOPF });
  const erwartet = Deno.env.get("COCKPIT_SECRET");
  if (!erwartet || req.headers.get("x-cockpit-secret") !== erwartet) return antwort({ error: "Nicht erlaubt." }, 401);
  try {
    const { pfad } = await req.json();
    // Nur echte Pfade der Ablage (uid/dateiname)
    if (typeof pfad !== "string" || !/^[0-9a-f-]{36}\/[\w.-]+$/i.test(pfad)) throw new Error("Ungültiger Pfad.");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb.storage.from("aenderungswuensche").createSignedUrl(pfad, 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Signieren fehlgeschlagen.");
    return antwort({ url: data.signedUrl });
  } catch (e) {
    return antwort({ error: String((e as Error).message || e) }, 400);
  }
});
