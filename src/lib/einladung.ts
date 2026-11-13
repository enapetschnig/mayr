/**
 * Einladungslinks: /einladung/<token>. Der Chef erzeugt sie unter
 * Einstellungen → Mitarbeiter, der Eingeladene installiert damit die App und
 * legt darin sein Passwort fest (Seite pages/Einladung.tsx).
 *
 * Merker „offene Einladung“: Android und PC teilen den Speicher zwischen
 * Browser und installierter App. Startet die frisch installierte App auf „/“
 * (start_url), führt der Merker sie zurück zur Einladung — sonst stünde der
 * Mitarbeiter vor einer Anmeldung ohne Konto. Am iPhone übernimmt das die
 * Startadresse der Home-App (Manifest auf der Einladungsseite entfernt).
 */

export type EinladungInfo = {
  status: "gueltig" | "eingeloest" | "abgelaufen" | "zurueckgezogen" | "unbekannt";
  art?: "neu" | "zugang";
  vorname?: string;
  nachname?: string;
  firma?: string | null;
  /** Neu: freier Vorschlag für den Benutzernamen; Zugang: der bestehende Benutzername */
  benutzer?: string | null;
};

export function einladungsAdresse(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/einladung/${token}`;
}

/** Der Text, der per WhatsApp oder Mail rausgeht — kurz, mit dem Link am Ende */
export function einladungsText(o: { vorname: string; firma: string; link: string; zugang?: boolean }): string {
  const gruss = o.vorname ? `Hallo ${o.vorname}` : "Hallo";
  return o.zugang
    ? `${gruss}, hier ist dein Zugang zur ${o.firma}-App. Link am Handy öffnen, App installieren und anmelden:\n${o.link}`
    : `${gruss}, du bist zur ${o.firma}-App eingeladen. Link am Handy öffnen, App installieren und Passwort festlegen — fertig:\n${o.link}`;
}

/** WhatsApp öffnet sich mit dem Text, den Empfänger wählt man dort selbst. Nichts wird von hier gesendet. */
export function whatsAppAdresse(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function mailAdresse(betreff: string, text: string): string {
  return `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** Token aus einer Adresse /einladung/<token> — nur gültige Zeichen */
export function tokenAusPfad(pfad: string): string | null {
  const m = pfad.match(/^\/einladung\/([A-Za-z0-9_-]{16,64})\/?$/);
  return m ? m[1] : null;
}

const MERKER = "einladung.offen";

export function offeneEinladungMerken(token: string): void {
  try { localStorage.setItem(MERKER, token); } catch { /* egal */ }
}

export function offeneEinladung(): string | null {
  try {
    const t = localStorage.getItem(MERKER);
    return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
  } catch { return null; }
}

export function offeneEinladungVergessen(): void {
  try { localStorage.removeItem(MERKER); } catch { /* egal */ }
}
