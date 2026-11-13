/**
 * Online-Bestätigung eines Angebots — reine Logik (Texte, Adressen, Zustand).
 * Der Kunde öffnet /angebot/<token>; alles Weitere läuft über die RPCs
 * `angebot_oeffentlich`, `angebot_annehmen`, `angebot_rueckfrage`.
 */

export type VerlaufArt = "link" | "geoeffnet" | "angenommen" | "rueckfrage" | "gesperrt";

export const VERLAUF_TEXT: Record<VerlaufArt, string> = {
  link: "Bestätigungslink erzeugt",
  geoeffnet: "Kunde hat den Link geöffnet",
  angenommen: "Online angenommen",
  rueckfrage: "Rückfrage",
  gesperrt: "Link gesperrt",
};

/** Was die öffentliche Seite über das Angebot weiß */
export type OeffentlichZustand = "offen" | "angenommen" | "abgelehnt" | "abgelaufen" | "verrechnet" | "gesperrt" | "unbekannt";

export const ZUSTAND_TEXT: Record<Exclude<OeffentlichZustand, "offen">, { titel: string; text: string }> = {
  angenommen: { titel: "Angebot angenommen", text: "Vielen Dank — wir melden uns zur Terminabstimmung." },
  abgelehnt: { titel: "Angebot nicht mehr gültig", text: "Dieses Angebot ist abgeschlossen. Bei Fragen rufen Sie uns gerne an." },
  abgelaufen: { titel: "Angebot abgelaufen", text: "Die Gültigkeit ist vorbei. Rufen Sie uns an — wir schicken gerne ein aktuelles Angebot." },
  verrechnet: { titel: "Bereits beauftragt", text: "Zu diesem Angebot gibt es schon eine Rechnung." },
  gesperrt: { titel: "Link nicht mehr gültig", text: "Dieser Link wurde ersetzt oder zurückgenommen. Bitte fragen Sie uns nach dem aktuellen Link." },
  unbekannt: { titel: "Link nicht gefunden", text: "Bitte prüfen Sie, ob der Link vollständig kopiert wurde." },
};

/** Ein Token sieht aus wie eines — kurze Abfragen gar nicht erst schicken */
export const tokenGueltig = (t: string | undefined | null): t is string => !!t && /^[A-Za-z0-9_-]{32,64}$/.test(t);

export const linkAdresse = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/angebot/${token}`;

/** Text für Mail und WhatsApp — der Link steht in einer eigenen Zeile (antippbar) */
export function teilenText(d: { firma: string | null | undefined; nummer: string | null; betreff: string | null; link: string; giltBis: string | null }): string {
  return [
    "Guten Tag,",
    "",
    `hier ist unser Angebot ${d.nummer ?? ""}${d.betreff ? ` „${d.betreff}“` : ""}.`.replace(/\s+\./, ".").replace(/\s{2,}/g, " "),
    "Sie können es online ansehen, als PDF laden und direkt bestätigen:",
    d.link,
    ...(d.giltBis ? ["", `Gültig bis ${d.giltBis}.`] : []),
    "",
    "Mit freundlichen Grüßen",
    d.firma ?? "",
  ].join("\n").trim();
}

export function mailAdresse(empfaenger: string | null | undefined, betreff: string, text: string): string {
  return `mailto:${encodeURIComponent((empfaenger ?? "").trim())}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

/** wa.me: mit Nummer direkt an den Kunden (internationale Form ohne +), sonst Auswahl in WhatsApp */
export function whatsappAdresse(text: string, telefon?: string | null): string {
  const nummer = telefonFuerWhatsapp(telefon);
  return `https://wa.me/${nummer ?? ""}?text=${encodeURIComponent(text)}`;
}

/** „0664 123 45 67“ → 436641234567, „+43 …“ → 43…; Unlesbares → null */
export function telefonFuerWhatsapp(telefon: string | null | undefined): string | null {
  if (!telefon) return null;
  let t = telefon.replace(/[^\d+]/g, "");
  if (t.startsWith("+")) t = t.slice(1);
  else if (t.startsWith("00")) t = t.slice(2);
  else if (t.startsWith("0")) t = `43${t.slice(1)}`;
  return /^\d{8,15}$/.test(t) ? t : null;
}

/** Dateiname der Unterschrift: <token>/<zufall>.png — die Policy prüft genau dieses Muster */
export function unterschriftPfad(token: string, zufall: string): string {
  return `${token}/${zufall.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64)}.png`;
}
