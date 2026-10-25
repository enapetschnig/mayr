import type { BelegTyp, EditorPosition, Kopf } from "./editor";

/**
 * Ungespeicherte Änderungen im Gerät sichern — gegen das, was der
 * Verlassen-Schutz nicht abfangen kann: Zurück-Geste am Handy, abgestürzter
 * Browser, leerer Akku. Beim nächsten Öffnen bietet der Editor sie an.
 *
 * Neue Belege haben noch keine Adresse: eine Sicherung je Art. Beim Abmelden
 * fliegt alles weg (Kundendaten auf einem geteilten Gerät).
 */
export type Sicherung = {
  zeit: string;
  /** gespeicherter Stand, auf dem die Änderungen beruhen (schnappschuss) */
  basis: string;
  kopf: Kopf;
  positionen: EditorPosition[];
};

const VORSILBE = "mayr.belegsicherung.";

export const sicherungsSchluessel = (id: string, neu: boolean, typ: BelegTyp) => VORSILBE + (neu ? `neu.${typ}` : id);

export function sicherungLesen(schluessel: string): Sicherung | null {
  try {
    const roh = localStorage.getItem(schluessel);
    if (!roh) return null;
    const s = JSON.parse(roh) as Sicherung;
    return s?.kopf && Array.isArray(s.positionen) && typeof s.zeit === "string" ? s : null;
  } catch {
    return null;
  }
}

export function sicherungSchreiben(schluessel: string, s: Sicherung) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(s));
  } catch {
    /* Speicher voll oder gesperrt (privates Fenster) — dann eben ohne */
  }
}

export function sicherungLoeschen(schluessel: string) {
  try {
    localStorage.removeItem(schluessel);
  } catch {
    /* egal */
  }
}

/** Alle Sicherungen weg — beim Abmelden */
export function alleSicherungenLoeschen() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(VORSILBE)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* egal */
  }
}
