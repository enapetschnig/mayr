import type { Json } from "@/integrations/supabase/types";

/**
 * WhatsApp an den Kunden ohne API: die App baut den Text aus einer Vorlage
 * und öffnet `https://wa.me/<nummer>?text=…` — senden tut WhatsApp selbst.
 * Getestet in whatsapp.test.ts.
 */

export type Vorlage = { name: string; text: string };

/** Platzhalter, die eine Vorlage kennt — mit Beschreibung für die Einstellungen */
export const PLATZHALTER: Record<string, string> = {
  kunde: "Name des Kunden",
  projekt: "Projektname",
  adresse: "Baustelle",
  datum: "Datum des nächsten Einsatzes",
  uhrzeit: "Uhrzeit des nächsten Einsatzes",
  team: "Team bzw. Monteure des Einsatzes",
  foerderstatus: "Förderstatus",
  foerderstelle: "Förderstelle",
  absender: "wer schickt",
  firma: "Name des Betriebs",
  telefon: "Telefon des Betriebs",
};

export const VORLAGEN_VORGABE: Vorlage[] = [
  {
    name: "Termin",
    text: "Grüß Gott {kunde},\nwir kommen am {datum} um {uhrzeit} zu Ihnen ({adresse}). Vor Ort: {team}.\nBei Fragen erreichen Sie uns unter {telefon}.\nFreundliche Grüße\n{absender}, {firma}",
  },
  {
    name: "Montage fertig",
    text: "Grüß Gott {kunde},\ndie Montage „{projekt}“ ist abgeschlossen. Danke für die gute Zusammenarbeit! Die Unterlagen und die Rechnung bekommen Sie in den nächsten Tagen.\nFreundliche Grüße\n{absender}, {firma}",
  },
  {
    name: "Förderung",
    text: "Grüß Gott {kunde},\nkurzer Stand zu Ihrer Förderung ({foerderstelle}): {foerderstatus}.\nWir melden uns, sobald es Neues gibt.\nFreundliche Grüße\n{absender}, {firma}",
  },
];

/** Vorlagen des Betriebs aus `firma.whatsapp_vorlagen`; leer oder unlesbar = Vorgaben */
export function vorlagenLesen(j: Json | null | undefined): Vorlage[] {
  if (!Array.isArray(j)) return VORLAGEN_VORGABE;
  const liste = j.flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const name = typeof x.name === "string" ? x.name.trim() : "";
    const text = typeof x.text === "string" ? x.text : "";
    return name && text.trim() ? [{ name, text }] : [];
  });
  return liste.length ? liste : VORLAGEN_VORGABE;
}

/** {kunde} usw. ersetzen; unbekannte oder leere Platzhalter werden „–“ */
export function vorlageFuellen(text: string, werte: Partial<Record<string, string | null | undefined>>): string {
  return text.replace(/\{(\w+)\}/g, (ganz, schluessel: string) => {
    if (!(schluessel in PLATZHALTER)) return ganz;
    const w = werte[schluessel];
    return w && w.trim() ? w.trim() : "–";
  });
}

/**
 * Telefonnummer für wa.me: nur Ziffern mit Ländervorwahl, ohne + und 00.
 * Österreichisch gedacht: „0664 123 45 67“ → 436641234567,
 * „+43 (0)664 …“ → 43664…, „0049 …“ → 49…. Unbrauchbar → null.
 */
export function waNummer(roh: string | null | undefined): string | null {
  if (!roh) return null;
  let t = roh.trim().replace(/\(0\)/g, "");
  const plus = t.startsWith("+");
  t = t.replace(/\D/g, "");
  if (!t) return null;
  if (!plus) {
    if (t.startsWith("00")) t = t.slice(2);
    else if (t.startsWith("0")) t = "43" + t.slice(1);
    else if (!t.startsWith("43")) t = "43" + t;
  }
  return t.length >= 9 && t.length <= 15 ? t : null;
}

/** Lesbar für die Anzeige: 436641234567 → „+43 664 1234567“ */
export function nummerText(nr: string): string {
  return nr.startsWith("43") ? `+43 ${nr.slice(2, 5)} ${nr.slice(5)}` : `+${nr}`;
}

export function waLink(nummer: string, text: string): string {
  return `https://wa.me/${nummer}?text=${encodeURIComponent(text)}`;
}
