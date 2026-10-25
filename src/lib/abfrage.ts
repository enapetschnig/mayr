const SEITE = 1000;

/**
 * Holt alle Zeilen in Seiten zu 1000 — Supabase liefert pro Abfrage höchstens
 * 1000 Zeilen und schneidet den Rest still ab. Die Abfrage braucht eine
 * eindeutige Sortierung (z. B. nach id), sonst doppeln oder fehlen Zeilen.
 */
export async function alleZeilen<T>(
  abfrage: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await abfrage(von, von + SEITE - 1);
    if (error) throw error;
    alle.push(...(data ?? []));
    if (!data || data.length < SEITE) return alle;
  }
}

export type CsvZelle = string | number | null | undefined | { text: string };

/** Excel soll den Wert als Text lassen — eine EAN würde sonst 4,01235E+12, führende Nullen fielen weg. */
export const alsText = (s: string | null | undefined): CsvZelle => (s ? { text: s } : null);

/** Ein Feld der CSV-Datei (Strichpunkt, Dezimalkomma). */
export function csvFeld(v: CsvZelle): string {
  let s = "";
  if (typeof v === "number") s = String(v).replace(".", ",");
  // Text, der mit = + - @ beginnt, führt Excel als Formel aus („=1+2“ als Hersteller) — mit ' davor bleibt es Text
  else if (typeof v === "string") s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  else if (v) s = `="${v.text.replace(/"/g, '""')}"`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV für Excel in Österreich: Strichpunkt, Dezimalkomma, BOM für die Umlaute. */
export function csvHerunterladen(dateiname: string, zeilen: CsvZelle[][]) {
  const text = "﻿" + zeilen.map((z) => z.map(csvFeld).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
