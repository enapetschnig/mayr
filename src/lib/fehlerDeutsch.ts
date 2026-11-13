/**
 * Fehlermeldungen von Browser und Datenbank auf Deutsch. Viele Stellen zeigen
 * `toast.error(e.message)` — im Funkloch stünde dort sonst „Failed to fetch“
 * (Chrome), „Load failed“ (Safari) oder „NetworkError …“ (Firefox).
 * `toastFehlerDeutsch()` hängt das einmal beim Start vor jedes toast.error.
 */
const REGELN: [RegExp, string][] = [
  [/(TypeError:\s*)?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed|fetch failed)/i,
    "Keine Verbindung — bitte Netz prüfen und noch einmal versuchen."],
  [/JWT expired|invalid JWT|refresh_token_not_found|Invalid Refresh Token[^.]*/i, "Anmeldung abgelaufen — bitte neu anmelden."],
  [/new row violates row-level security policy[^.]*|permission denied for [a-z_ ]+/i, "Dafür fehlt die Berechtigung."],
  [/duplicate key value violates unique constraint "?[a-z0-9_]*"?/i, "Das gibt es schon."],
  [/canceling statement due to statement timeout/i, "Der Server braucht gerade zu lange — bitte noch einmal versuchen."],
];

export function fehlerDeutsch(text: string): string {
  for (const [muster, deutsch] of REGELN) {
    if (muster.test(text)) return text.replace(muster, deutsch);
  }
  return text;
}

/** Fehler bleiben länger stehen als Erfolgsmeldungen (1,5 s sind zum Lesen zu kurz). */
export const FEHLER_DAUER_MS = 6000;
