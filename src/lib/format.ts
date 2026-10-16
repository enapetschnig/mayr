/** Formatierung für Österreich — Beträge, Daten, Stunden. */

const EURO = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
const ZAHL = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 });

export const euro = (n: number | null | undefined) => EURO.format(Number(n) || 0);
export const zahl = (n: number | null | undefined) => ZAHL.format(Number(n) || 0);

/** "2026-10-16" → "16.10.2026" — ohne Zeitzonen-Verschiebung. */
export function datum(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

/** "2026-10-16" → "Fr, 16.10." */
export function datumKurz(iso: string): string {
  const d = isoZuDatum(iso);
  return d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function isoZuDatum(iso: string): Date {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Date(j, m - 1, t, 12);
}

/** Lokales Datum als ISO-Tag — nicht toISOString(), das rechnet in UTC. */
export function isoTag(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

export function tageDazu(iso: string, tage: number): string {
  const d = isoZuDatum(iso);
  d.setDate(d.getDate() + tage);
  return isoTag(d);
}

/** 7.5 → "7,5 h" */
export const stunden = (n: number | null | undefined) => `${zahl(n)} h`;

/** "07:30:00" → "07:30" */
export const uhrzeit = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

/** Stunden aus Von/Bis und Pause. Über Mitternacht wird nicht gerechnet. */
export function stundenAusVonBis(von: string, bis: string, pauseMin: number): number {
  if (!von || !bis) return 0;
  const [vh, vm] = von.split(":").map(Number);
  const [bh, bm] = bis.split(":").map(Number);
  const min = bh * 60 + bm - (vh * 60 + vm) - (pauseMin || 0);
  return min > 0 ? Math.round((min / 60) * 100) / 100 : 0;
}

/** Eingabe mit Komma oder Punkt → Zahl */
export function zahlLesen(s: string | number | null | undefined): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}
