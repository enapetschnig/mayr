import type { Entwurf } from "./regieLogik";

/**
 * Sicherung ungespeicherter Eingaben im Gerät. Am Handy reicht eine
 * Wischgeste „zurück“, und der halbe Regiebericht wäre weg — beim nächsten
 * Öffnen bietet der Editor an, ihn wiederherzustellen.
 */

const schluessel = (id: string | null) => `elektro.regie.sicherung.${id ?? "neu"}`;
const HALTBAR_MS = 7 * 24 * 60 * 60 * 1000;

export type Sicherung = { zeit: number; entwurf: Entwurf };

export function sicherungLesen(id: string | null): Sicherung | null {
  try {
    const roh = localStorage.getItem(schluessel(id));
    if (!roh) return null;
    const s = JSON.parse(roh) as Sicherung;
    const e = s?.entwurf;
    const gueltig = typeof s?.zeit === "number" && Date.now() - s.zeit < HALTBAR_MS
      && e && (e.berichtId ?? null) === id && Array.isArray(e.zeilen) && Array.isArray(e.material)
      && Array.isArray(e.entfernt?.zeiten) && Array.isArray(e.entfernt?.material);
    return gueltig ? s : null;
  } catch {
    return null;
  }
}

export function sicherungSchreiben(e: Entwurf) {
  try {
    localStorage.setItem(schluessel(e.berichtId), JSON.stringify({ zeit: Date.now(), entwurf: e }));
  } catch { /* Speicher voll oder gesperrt — dann eben ohne */ }
}

export function sicherungLoeschen(id: string | null) {
  try {
    localStorage.removeItem(schluessel(id));
  } catch { /* egal */ }
}
