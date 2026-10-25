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

/** CSV für Excel in Österreich: Strichpunkt, Dezimalkomma, BOM für die Umlaute. */
export function csvHerunterladen(dateiname: string, zeilen: (string | number | null | undefined)[][]) {
  const feld = (v: string | number | null | undefined) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : (v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + zeilen.map((z) => z.map(feld).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
