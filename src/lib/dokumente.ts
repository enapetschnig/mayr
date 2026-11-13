import { datum, tageDazu } from "@/lib/format";

/**
 * Dokumente: Mitarbeiter-Ablage (Lohnzettel, Meldungen, Krankenscheine …)
 * und Firmendokumente in Ordnern. Reine Logik, getestet in dokumente.test.ts.
 */

export type PersonalArt = "lohnzettel" | "anmeldung" | "abmeldung" | "krankenschein" | "vertrag" | "zeugnis" | "fuehrerschein" | "sonstiges";

/** selbst = darf der Mitarbeiter selbst hochladen (wie die Policy personal_dokumente_anlegen) */
export const PERSONAL_ART: Record<PersonalArt, { text: string; mehrzahl: string; selbst: boolean; mitMonat: boolean }> = {
  lohnzettel: { text: "Lohnzettel", mehrzahl: "Lohnzettel", selbst: false, mitMonat: true },
  anmeldung: { text: "Anmeldung (ÖGK)", mehrzahl: "Anmeldungen", selbst: false, mitMonat: false },
  abmeldung: { text: "Abmeldung (ÖGK)", mehrzahl: "Abmeldungen", selbst: false, mitMonat: false },
  krankenschein: { text: "Krankenschein", mehrzahl: "Krankenscheine", selbst: true, mitMonat: false },
  vertrag: { text: "Dienstvertrag", mehrzahl: "Verträge", selbst: false, mitMonat: false },
  zeugnis: { text: "Zeugnis / Zertifikat", mehrzahl: "Zeugnisse & Zertifikate", selbst: true, mitMonat: false },
  fuehrerschein: { text: "Führerschein", mehrzahl: "Führerschein", selbst: true, mitMonat: false },
  sonstiges: { text: "Sonstiges", mehrzahl: "Sonstiges", selbst: true, mitMonat: false },
};
export const PERSONAL_ARTEN = Object.keys(PERSONAL_ART) as PersonalArt[];

/** Vorschläge für neue Ordner der Firmendokumente */
export const ORDNER_VORSCHLAG = ["Vorlagen", "Zertifikate", "Versicherungen", "Prüfberichte", "Verträge", "Sicherheit", "Allgemein"];

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** "2026-10-01" → "Oktober 2026" */
export function monatText(iso: string | null | undefined): string {
  if (!iso) return "";
  const [j, m] = iso.split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONATE[m - 1]} ${j}` : iso;
}

/** Der Vormonat als „2026-10-01“ — Lohnzettel kommen für den abgelaufenen Monat */
export function vormonat(heute: string): string {
  const [j, m] = heute.split("-").map(Number);
  return m === 1 ? `${j - 1}-12-01` : `${j}-${String(m - 1).padStart(2, "0")}-01`;
}

/** Anzeigename eines Mitarbeiter-Dokuments: „Lohnzettel Oktober 2026“, sonst Titel oder Art */
export function personalTitel(d: { art: string; titel: string | null; monat: string | null }): string {
  const art = PERSONAL_ART[d.art as PersonalArt]?.text ?? d.art;
  if (d.titel?.trim()) return d.titel.trim();
  return d.monat ? `${art} ${monatText(d.monat)}` : art;
}

/** Gültigkeit: abgelaufen, läuft in 30 Tagen ab, oder in Ordnung */
export function ablauf(gueltigBis: string | null, heute: string): { stufe: "ok" | "bald" | "abgelaufen"; text: string } | null {
  if (!gueltigBis) return null;
  if (gueltigBis < heute) return { stufe: "abgelaufen", text: `abgelaufen ${datum(gueltigBis)}` };
  if (gueltigBis <= tageDazu(heute, 30)) return { stufe: "bald", text: `läuft ab ${datum(gueltigBis)}` };
  return { stufe: "ok", text: `gültig bis ${datum(gueltigBis)}` };
}

/** Suche über Titel, Dateiname, Ordner, Beschreibung — Groß/klein und Umlaute egal */
export function passt(suche: string, ...felder: (string | null | undefined)[]): boolean {
  const norm = (s: string) => s.toLocaleLowerCase("de").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const woerter = norm(suche).split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = norm(felder.filter(Boolean).join(" "));
  return woerter.every((w) => text.includes(w));
}

/** Nach Ordner gruppiert, Ordner und Titel alphabetisch */
export function nachOrdner<T extends { ordner: string; titel: string }>(liste: T[]): { ordner: string; dokumente: T[] }[] {
  const m = new Map<string, T[]>();
  liste.forEach((d) => m.set(d.ordner, [...(m.get(d.ordner) ?? []), d]));
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "de"))
    .map(([ordner, dokumente]) => ({ ordner, dokumente: dokumente.sort((a, b) => a.titel.localeCompare(b.titel, "de")) }));
}

/** 1536000 → „1,5 MB“ */
export function groesseText(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("de-AT", { maximumFractionDigits: 1 })} MB`;
}
