import { dezimalLesen, tageDazu } from "@/lib/format";
import type { StatusEintrag } from "@/lib/types";

/**
 * Anlagen und Prüfprotokolle — Rechnen ohne Datenbank. Getestet in
 * pruefLogik.test.ts.
 *
 * Grenzwerte (ÖVE/ÖNORM E 8101, TN-System, U0 = 230 V), bewusst einfach:
 * - Isolationswiderstand ≥ 1 MΩ
 * - Schleifenimpedanz Zs ≤ U0 / Ia, Ia = 5 × In (B), 10 × In (C), 20 × In (D)
 *   — ohne Temperaturzuschlag, die Messung zählt so, wie sie ist
 * - FI: Auslösestrom 50–100 % von IΔn, Auslösezeit ≤ 300 ms bei IΔn
 * - Erder (TT): RA × IΔn ≤ 50 V
 * Das Protokoll zeigt die Überschreitung; entscheiden tut der Prüfer.
 */

export const ANLAGEN_ART = {
  elektroanlage: "Elektroanlage",
  verteiler: "Verteiler",
  blitzschutz: "Blitzschutz",
  notlicht: "Notbeleuchtung",
  pv: "PV-Anlage",
  ladestation: "Ladestation",
  geraet: "Gerät",
  sonstige: "Sonstige",
} as const;
export type AnlagenArt = keyof typeof ANLAGEN_ART;

export const PRUEF_ART = {
  wiederkehrend: "Wiederkehrende Prüfung",
  "e-check": "E-Check",
  erst: "Erstprüfung",
  nach_reparatur: "Prüfung nach Reparatur",
} as const;
export type PruefArt = keyof typeof PRUEF_ART;

export const ERGEBNIS: Record<string, StatusEintrag & { lang: string }> = {
  ok: { ton: "gruen", text: "In Ordnung", lang: "Die Anlage ist in ordnungsgemäßem Zustand." },
  maengel: { ton: "gelb", text: "Mängel", lang: "Die Anlage weist Mängel auf, die behoben werden müssen." },
  gefahr: { ton: "rot", text: "Gefahr", lang: "Gefahr im Verzug — die Anlage darf bis zur Behebung nicht betrieben werden." },
};

const ALLGEMEIN = [
  "Verteiler: Abdeckungen vollständig, keine berührbaren aktiven Teile",
  "Stromkreise beschriftet, Schaltplan / Anlagenbuch vorhanden",
  "Schutzorgane passen zu den Leitungsquerschnitten",
  "Fehlerstrom-Schutzschalter vorhanden, Prüftaste löst aus",
  "Schutzleiter und Potentialausgleich angeschlossen",
  "Steckdosen, Schalter und Leuchten unbeschädigt",
  "Keine sichtbaren Schäden an Leitungen",
];

/** Besichtigung: Prüfpunkte je Anlagenart — im Protokoll frei ergänzbar */
export const BESICHTIGUNG: Record<AnlagenArt, string[]> = {
  elektroanlage: ALLGEMEIN,
  verteiler: ALLGEMEIN.slice(0, 5),
  blitzschutz: [
    "Fangeinrichtungen vollständig und fest",
    "Ableitungen unbeschädigt, Abstände eingehalten",
    "Trennstellen zugänglich und beschriftet",
    "Keine Korrosion an Verbindungen",
    "Überspannungsschutz vorhanden und in Ordnung",
  ],
  notlicht: [
    "Alle Leuchten leuchten im Notbetrieb",
    "Nennbetriebsdauer erreicht (Akku-Test)",
    "Rettungszeichen gut sichtbar",
    "Prüfbuch geführt",
  ],
  pv: [
    "Module und Unterkonstruktion unbeschädigt",
    "DC-Leitungen und Stecker unbeschädigt",
    "Wechselrichter ohne Fehlermeldung",
    "Freischaltstelle gekennzeichnet",
    "Überspannungsschutz vorhanden",
  ],
  ladestation: [
    "Gehäuse, Ladekabel und Stecker unbeschädigt",
    "FI Typ B oder DC-Fehlerstromerkennung vorhanden",
    "Ladevorgang funktioniert",
  ],
  geraet: [
    "Gehäuse unbeschädigt",
    "Anschlussleitung und Stecker unbeschädigt",
    "Schutzleiter durchgängig",
    "Funktion in Ordnung",
  ],
  sonstige: ["Sichtprüfung ohne Befund", "Funktion in Ordnung"],
};

export type Besichtigung = { punkt: string; ok: boolean | null };

/** Eine Messzeile, wie sie in der Datenbank steht (Zahlen oder null) */
export type Messung = {
  stromkreis: string;
  schutz: string;
  querschnitt: string;
  riso: number | null;
  zs: number | null;
  fi_in: number | null;
  fi_ia: number | null;
  fi_ta: number | null;
};

export const MESS_FELDER = ["riso", "zs", "fi_in", "fi_ia", "fi_ta"] as const;
export type MessFeld = (typeof MESS_FELDER)[number];

/** Leitungsschutzschalter „B16“, „C 10“, „LS B13“ → Charakteristik und Nennstrom */
export function schutzLesen(text: string): { char: "B" | "C" | "D"; in: number } | null {
  const m = /([BCD])\s*(\d+(?:[.,]\d+)?)\s*A?\b/i.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  return n > 0 ? { char: m[1].toUpperCase() as "B" | "C" | "D", in: n } : null;
}

const FAKTOR = { B: 5, C: 10, D: 20 };

/** Höchste zulässige Schleifenimpedanz in Ω, auf 2 Stellen abgerundet */
export function zsMax(schutz: string, u0 = 230): number | null {
  const s = schutzLesen(schutz);
  if (!s) return null;
  return Math.floor((u0 / (FAKTOR[s.char] * s.in)) * 100 + 1e-9) / 100;
}

const zahlText = (n: number) => String(n).replace(".", ",");

/** Was an einer Messzeile nicht passt — leer = in Ordnung (oder nicht gemessen) */
export function messungBewerten(m: Messung): string[] {
  const f: string[] = [];
  if (m.riso != null && m.riso < 1) f.push(`Isolation ${zahlText(m.riso)} MΩ < 1 MΩ`);
  const max = zsMax(m.schutz);
  if (m.zs != null && max != null && m.zs > max) f.push(`Zs ${zahlText(m.zs)} Ω > ${zahlText(max)} Ω`);
  if (m.fi_in != null && m.fi_in > 0) {
    if (m.fi_ia != null && (m.fi_ia > m.fi_in || m.fi_ia < m.fi_in / 2)) f.push(`FI löst bei ${zahlText(m.fi_ia)} mA aus (soll ${zahlText(m.fi_in / 2)}–${zahlText(m.fi_in)} mA)`);
  }
  if (m.fi_ta != null && m.fi_ta > 300) f.push(`FI-Auslösezeit ${zahlText(m.fi_ta)} ms > 300 ms`);
  return f;
}

/** Erder im TT-System: RA × IΔn ≤ 50 V */
export function erderBewerten(ohm: number | null, fiIn: number | null): string | null {
  if (ohm == null || !fiIn) return null;
  const max = Math.floor(50 / (fiIn / 1000));
  return ohm > max ? `Erder ${zahlText(ohm)} Ω > ${zahlText(max)} Ω (50 V / ${zahlText(fiIn)} mA)` : null;
}

/** Vorschlag fürs Ergebnis: ein Mangel in der Besichtigung oder ein Grenzwert drüber → Mängel */
export function ergebnisVorschlag(b: Besichtigung[], m: Messung[], erder?: string | null): "ok" | "maengel" {
  return b.some((x) => x.ok === false) || m.some((x) => messungBewerten(x).length > 0) || !!erder ? "maengel" : "ok";
}

/** Mängeltext aus Besichtigung und Messungen — als Vorlage für das Feld „Mängel“ */
export function maengelText(b: Besichtigung[], m: Messung[], erder?: string | null): string {
  const zeilen = [
    ...b.filter((x) => x.ok === false).map((x) => `- ${x.punkt}`),
    ...m.flatMap((x) => messungBewerten(x).map((f) => `- ${x.stromkreis || "Stromkreis"}: ${f}`)),
    ...(erder ? [`- ${erder}`] : []),
  ];
  return zeilen.join("\n");
}

/** Nächste Prüfung: Datum + Monate (Monatsende wie in Postgres: 31.01. + 1 → 28./29.02.) */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

/** Wie dringend: überfällig (rot), in den nächsten 30 Tagen (gelb), später (grün) */
export function faelligkeit(naechste: string | null, heute: string): { stufe: "ueberfaellig" | "bald" | "spaeter" | "keine"; eintrag: StatusEintrag } {
  if (!naechste) return { stufe: "keine", eintrag: { ton: "grau", text: "Kein Termin" } };
  if (naechste < heute) return { stufe: "ueberfaellig", eintrag: { ton: "rot", text: "Überfällig" } };
  if (naechste <= tageDazu(heute, 30)) return { stufe: "bald", eintrag: { ton: "gelb", text: "Bald fällig" } };
  return { stufe: "spaeter", eintrag: { ton: "gruen", text: "Geprüft" } };
}

// ── Eingabe am Handy: Zahlen als Text, Komma oder Punkt ───────────────

export type MessZeile = { key: string; stromkreis: string; schutz: string; querschnitt: string } & Record<MessFeld, string>;

export const zahlZuText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function messungAusZeile(z: MessZeile): Messung {
  const n = (s: string) => dezimalLesen(s);
  return {
    stromkreis: z.stromkreis.trim(), schutz: z.schutz.trim(), querschnitt: z.querschnitt.trim(),
    riso: n(z.riso), zs: n(z.zs), fi_in: n(z.fi_in), fi_ia: n(z.fi_ia), fi_ta: n(z.fi_ta),
  };
}

export function zeileAusMessung(m: Partial<Messung>, key: string): MessZeile {
  return {
    key, stromkreis: m.stromkreis ?? "", schutz: m.schutz ?? "", querschnitt: m.querschnitt ?? "",
    riso: zahlZuText(m.riso), zs: zahlZuText(m.zs), fi_in: zahlZuText(m.fi_in), fi_ia: zahlZuText(m.fi_ia), fi_ta: zahlZuText(m.fi_ta),
  };
}

/** Leere Zeilen (nichts eingetragen) werden nicht gespeichert */
export const zeileLeer = (z: MessZeile) =>
  !z.stromkreis.trim() && !z.schutz.trim() && !z.querschnitt.trim() && MESS_FELDER.every((f) => !z[f].trim());

/** JSON aus der Datenbank sicher lesen */
export function besichtigungLesen(j: unknown): Besichtigung[] {
  if (!Array.isArray(j)) return [];
  return j.flatMap((x) => (x && typeof x === "object" && typeof (x as Besichtigung).punkt === "string"
    ? [{ punkt: (x as Besichtigung).punkt, ok: typeof (x as Besichtigung).ok === "boolean" ? (x as Besichtigung).ok : null }]
    : []));
}

export function messungenLesen(j: unknown): Messung[] {
  if (!Array.isArray(j)) return [];
  const zahl = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return j.flatMap((x) => (x && typeof x === "object" ? [(() => {
    const o = x as Record<string, unknown>;
    return {
      stromkreis: text(o.stromkreis), schutz: text(o.schutz), querschnitt: text(o.querschnitt),
      riso: zahl(o.riso), zs: zahl(o.zs), fi_in: zahl(o.fi_in), fi_ia: zahl(o.fi_ia), fi_ta: zahl(o.fi_ta),
    };
  })()] : []));
}

/** QR-Aufkleber: Adresse …/anlagen/<id> — Anlage-ID daraus, sonst null */
export function anlageIdAusCode(code: string): string | null {
  const m = /\/anlagen\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(code ?? "");
  return m ? m[1].toLowerCase() : null;
}
