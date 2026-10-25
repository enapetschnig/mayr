/**
 * Bankdaten und UID prüfen, bevor sie auf jede Rechnung gedruckt werden —
 * ein Zahlendreher in der IBAN landet sonst im Bezahl-QR-Code.
 */

/** Länge der IBAN je Land (Nachbarn und häufige Kunden); andere nur mit Prüfziffer */
const IBAN_LAENGE: Record<string, number> = {
  AT: 20, DE: 22, CH: 21, LI: 21, IT: 27, SI: 19, HU: 28, CZ: 24, SK: 24, HR: 21, NL: 18, BE: 16, FR: 27, LU: 20,
};

/** IBAN ohne Leerzeichen, in Großbuchstaben — oder null, wenn Aufbau oder Prüfziffer nicht stimmen */
export function ibanPruefen(eingabe: string): string | null {
  const s = eingabe.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return null;
  const laenge = IBAN_LAENGE[s.slice(0, 2)];
  if (laenge && s.length !== laenge) return null;
  // Prüfziffer nach ISO 13616: Ländercode und Prüfziffer ans Ende, Buchstaben als
  // Zahlen (A = 10 …), Rest modulo 97 muss 1 sein — stückweise, die Zahl ist zu lang
  let rest = 0;
  for (const zeichen of s.slice(4) + s.slice(0, 4)) {
    const wert = zeichen >= "A" ? String(zeichen.charCodeAt(0) - 55) : zeichen;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1 ? s : null;
}

/** „AT611904300234573201“ → „AT61 1904 3002 3457 3201“ */
export const ibanLesbar = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

/** BIC: 8 oder 11 Zeichen (Bank, Land, Ort, Filiale) — ohne Leerzeichen, groß; sonst null */
export function bicPruefen(eingabe: string): string | null {
  const s = eingabe.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s) ? s : null;
}

/** UID-Nummer: Ländercode und Nummer (ATU12345678, DE123456789) — ohne Leerzeichen, groß; sonst null */
export function uidPruefen(eingabe: string): string | null {
  const s = eingabe.replace(/\s+/g, "").toUpperCase();
  if (s.startsWith("AT")) return /^ATU\d{8}$/.test(s) ? s : null;
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(s) ? s : null;
}
