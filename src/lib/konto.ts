/**
 * Anmelden mit Benutzernamen statt E-Mail: „max“ → max@<loginDomain>.
 * Supabase verlangt eine gültige E-Mail-Adresse — Umlaute und Leerzeichen
 * gehen dort nicht. Deshalb wird aus „Jürgen Maier“ der Benutzername
 * „juergen.maier“; Anmelden und Registrieren rechnen gleich.
 */
export function benutzername(eingabe: string): string {
  return eingabe
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, ".");
}

/** Echte E-Mail-Adressen bleiben, wie sie sind (nur klein, ohne Leerzeichen) */
export function zuEmail(eingabe: string, domain: string): string {
  const e = eingabe.trim().toLowerCase();
  return e.includes("@") ? e : `${benutzername(e)}@${domain}`;
}

/** Fehlertext für einen Benutzernamen, der so nicht geht — sonst null */
export function benutzerFehler(eingabe: string): string | null {
  const e = eingabe.trim();
  if (!e) return "Bitte einen Benutzernamen eingeben.";
  if (e.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : "Diese E-Mail-Adresse stimmt nicht.";
  const b = benutzername(e);
  if (b.length < 2) return "Der Benutzername braucht mindestens 2 Zeichen.";
  if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(b) || b.includes("..")) {
    return "Im Benutzernamen gehen nur Buchstaben, Ziffern, Punkt und Bindestrich.";
  }
  return null;
}

/** Meldungen von Supabase Auth auf Deutsch — Unbekanntes bleibt, wie es ist */
export function authFehler(meldung: string): string {
  const m = meldung.toLowerCase();
  if (m.includes("invalid login credentials")) return "Benutzername oder Passwort falsch.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Diesen Benutzer gibt es schon.";
  if (m.includes("should be different from the old password")) return "Das neue Passwort muss sich vom alten unterscheiden.";
  if (m.includes("password should be at least")) return "Das Passwort braucht mindestens 6 Zeichen.";
  if (m.includes("unable to validate email") || m.includes("invalid format")) return "Benutzername oder E-Mail-Adresse ungültig.";
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("for security purposes")) {
    return "Zu viele Versuche — bitte kurz warten und dann noch einmal.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) return "Keine Verbindung — bitte Netz prüfen und noch einmal versuchen.";
  return meldung;
}

/** Vorläufiges Passwort zum Ansagen: gut zu sprechen, keine verwechselbaren Zeichen */
export function vorlaeufigesPasswort(zufall: () => number = Math.random): string {
  const woerter = ["Strom", "Kabel", "Leitung", "Schalter", "Dose", "Zaehler", "Sicherung", "Lampe"];
  const wort = woerter[Math.floor(zufall() * woerter.length)];
  return `${wort}-${String(1000 + Math.floor(zufall() * 9000))}`;
}
