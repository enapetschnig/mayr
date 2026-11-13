/**
 * Projekt per Tippen finden — Nummer, Name, Kunde, Ort, Straße. Mehrere
 * Wörter müssen alle vorkommen („huber linz“), Groß/klein und Umlaute egal
 * („mueller“ findet „Müller“). Getestet in projektSuche.test.ts.
 */

type SuchProjekt = {
  nummer: string;
  name: string;
  ort?: string | null;
  strasse?: string | null;
  plz?: string | null;
  kunden?: { name: string } | null;
};

/** Kleinschreibung, ä→ae …, ß→ss, Akzente weg */
export function normal(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const text = (p: SuchProjekt) => normal([p.nummer, p.name, p.kunden?.name, p.plz, p.ort, p.strasse].filter(Boolean).join(" "));

/** Passt das Projekt zur Eingabe? Leere Eingabe passt immer. */
export function projektPasst(p: SuchProjekt, suche: string): boolean {
  const woerter = normal(suche).split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const t = text(p);
  return woerter.every((w) => t.includes(w));
}

/**
 * Treffer in sinnvoller Reihenfolge: zuerst die Nummer („17“ → 2026-0017),
 * dann Name oder Kunde am Wortanfang, dann der Rest — sonst wie geliefert.
 */
export function projekteSuchen<P extends SuchProjekt>(liste: P[], suche: string): P[] {
  const q = normal(suche.trim());
  if (!q) return liste;
  const rang = (p: P) => {
    const nr = normal(p.nummer);
    const zahl = q.replace(/^0+/, "");
    if (nr === q || (/^\d+$/.test(q) && zahl && nr.replace(/^\d{4}-0*/, "") === zahl)) return 0;
    if (nr.includes(q)) return 1;
    const wortAnfang = new RegExp(`(^|[\\s–\\-/,.])${q.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    if (wortAnfang.test(normal(p.name)) || wortAnfang.test(normal(p.kunden?.name ?? ""))) return 2;
    return 3;
  };
  return liste
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => projektPasst(p, suche))
    .sort((a, b) => rang(a.p) - rang(b.p) || a.i - b.i)
    .map(({ p }) => p);
}
