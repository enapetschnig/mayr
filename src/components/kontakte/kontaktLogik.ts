import { zahl } from "@/lib/format";
import { BESTELL_STATUS, type BestellStatus } from "@/components/bestellung/bestellLogik";
import { FREIGABE_STATUS, type StatusEintrag, type StatusTon } from "@/lib/types";

/**
 * Reine Logik für Kontakte, PV-Anlagendaten und die Karte — ohne Supabase,
 * getestet in kontaktLogik.test.ts.
 */

// ── Art des Kontakts ─────────────────────────────────────────────────────
export type KontaktArt = "kunde" | "lieferant" | "partner";
export const KONTAKT_ART: Record<KontaktArt, StatusEintrag & { mehrzahl: string; neu: string }> = {
  kunde: { ton: "blau", text: "Kunde", mehrzahl: "Kunden", neu: "Neuer Kunde" },
  lieferant: { ton: "lila", text: "Lieferant", mehrzahl: "Lieferanten", neu: "Neuer Lieferant" },
  partner: { ton: "gelb", text: "Partner", mehrzahl: "Partner", neu: "Neuer Partner" },
};
export const kontaktArt = (art: string | null | undefined): KontaktArt =>
  art === "lieferant" || art === "partner" ? art : "kunde";

/** Wie die Datenbank (`lieferant_schluessel`): klein, ohne doppelte Leerzeichen */
export const lieferantSchluessel = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * „Sonepar Österreich GmbH, SONEPAR“ → weitere Schreibweisen als Liste:
 * Komma, Strichpunkt oder Zeilenumbruch trennen; doppelte und der Name
 * selbst fallen weg.
 */
export function namenLesen(text: string, name = ""): string[] {
  const gesehen = new Set([lieferantSchluessel(name)]);
  const liste: string[] = [];
  for (const teil of text.split(/[,;\n]/)) {
    const n = teil.replace(/\s+/g, " ").trim();
    const s = lieferantSchluessel(n);
    if (!s || gesehen.has(s)) continue;
    gesehen.add(s);
    liste.push(n);
  }
  return liste;
}

/** Gehört ein Lieferanten-Text (Beleg) zu diesem Kontakt? */
export const istLieferant = (k: { name: string; namen?: string[] | null }, text: string | null | undefined) => {
  const s = lieferantSchluessel(text);
  return !!s && [k.name, ...(k.namen ?? [])].some((n) => lieferantSchluessel(n) === s);
};

// ── Adresse und Koordinaten ──────────────────────────────────────────────
type MitAdresse = { strasse?: string | null; plz?: string | null; ort?: string | null };

export const adresseText = (k: MitAdresse) =>
  [k.strasse?.trim(), [k.plz?.trim(), k.ort?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * Was wir Nominatim fragen — und womit wir uns merken, wofür die
 * Koordinaten gelten. Ohne Ort oder PLZ fragen wir nicht (nur eine Straße
 * fände irgendeine in Europa).
 */
export function geoAnfrage(k: MitAdresse): string | null {
  if (!k.ort?.trim() && !k.plz?.trim()) return null;
  return `${adresseText(k)}, Österreich`;
}

/** Noch nicht gesucht oder Adresse seither geändert */
export const brauchtGeo = (k: MitAdresse & { geo_adresse?: string | null }) => {
  const a = geoAnfrage(k);
  return !!a && k.geo_adresse !== a;
};

export const nominatimUrl = (anfrage: string) =>
  `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=at,de,it,si,hu,sk,cz,ch&accept-language=de&q=${encodeURIComponent(anfrage)}`;

/** Antwort von Nominatim → Punkt oder null (nicht gefunden, Unsinn) */
export function nominatimLesen(antwort: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(antwort) || !antwort.length) return null;
  const t = antwort[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(t.lat), lng = Number(t.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// ── PV-Anlage ────────────────────────────────────────────────────────────
export type Ueberwachung = "fronius" | "solax" | "huawei" | "sma" | "sonstige";
export const UEBERWACHUNG: Record<Ueberwachung, { text: string; portal: string | null }> = {
  fronius: { text: "Fronius Solar.web", portal: "https://www.solarweb.com" },
  solax: { text: "SolaX Cloud", portal: "https://www.solaxcloud.com" },
  huawei: { text: "Huawei FusionSolar", portal: "https://eu5.fusionsolar.huawei.com" },
  sma: { text: "SMA Sunny Portal", portal: "https://ennexos.sunnyportal.com" },
  sonstige: { text: "Sonstige", portal: null },
};

/**
 * Link aus einer Eingabe: „solarweb.com/…“ bekommt https://, nur http(s)
 * ist erlaubt (kein javascript:, kein file:). Leer oder unbrauchbar = null.
 */
export function linkSauber(eingabe: string | null | undefined): string | null {
  const t = (eingabe ?? "").trim();
  if (!t) return null;
  const mit = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(mit);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type PvDaten = {
  art?: string | null;
  pv_kwp?: number | null; module_anzahl?: number | null; module_typ?: string | null; wechselrichter?: string | null;
  speicher_kwh?: number | null; speicher_typ?: string | null;
  einspeisung_prozent?: number | null; einspeisung_kw?: number | null;
  wallbox?: string | null; ueberschuss?: boolean | null; ueberschuss_wie?: string | null;
};

export const hatPv = (a: PvDaten) => a.art === "pv" || Number(a.pv_kwp) > 0;
export const hatSpeicher = (a: PvDaten) => Number(a.speicher_kwh) > 0 || !!a.speicher_typ?.trim();
export const hatWallbox = (a: PvDaten) => !!a.wallbox?.trim() || a.art === "ladestation";

/** „70 %“, „4 kW“, „70 % · max. 4 kW“ — leer = keine Angabe */
export function einspeisungText(a: PvDaten): string | null {
  const t = [
    a.einspeisung_prozent != null ? `${zahl(Number(a.einspeisung_prozent))} %` : null,
    a.einspeisung_kw != null ? `${a.einspeisung_prozent != null ? "max. " : ""}${zahl(Number(a.einspeisung_kw))} kW` : null,
  ].filter(Boolean);
  return t.length ? t.join(" · ") : null;
}

/** Die Eckdaten als kurze Stücke für eine Zeile: „9,8 kWp“, „Speicher 10 kWh“, „Wallbox“ … */
export function pvKurz(a: PvDaten): string[] {
  const e = einspeisungText(a);
  return [
    Number(a.pv_kwp) > 0 ? `${zahl(Number(a.pv_kwp))} kWp` : null,
    Number(a.speicher_kwh) > 0 ? `Speicher ${zahl(Number(a.speicher_kwh))} kWh` : a.speicher_typ?.trim() ? "Speicher" : null,
    a.wallbox?.trim() ? "Wallbox" : null,
    e ? `Einspeisung ${e}` : null,
    a.ueberschuss ? "Überschussregelung" : null,
  ].filter((x): x is string => !!x);
}

/** Merkmale eines Kontakts über alle seine Anlagen — für Filter und Karte */
export function merkmale(anlagen: PvDaten[]) {
  return {
    pv: anlagen.some(hatPv),
    speicher: anlagen.some(hatSpeicher),
    wallbox: anlagen.some(hatWallbox),
    kwp: anlagen.reduce((s, a) => s + (Number(a.pv_kwp) || 0), 0),
  };
}

// ── Karte ────────────────────────────────────────────────────────────────
export type KartenFilter = "pv" | "speicher" | "wallbox" | "laufend";

/**
 * Farbe des Punktes: Lieferant/Partner nach Art; Kunde mit laufendem
 * Projekt blau, mit PV grün, sonst grau.
 */
export function punktTon(art: KontaktArt, m: { pv: boolean }, laufend: boolean): StatusTon {
  if (art !== "kunde") return KONTAKT_ART[art].ton;
  if (laufend) return "blau";
  if (m.pv) return "gruen";
  return "grau";
}

export const PUNKT_LEGENDE: { ton: StatusTon; text: string }[] = [
  { ton: "blau", text: "Projekt läuft" },
  { ton: "gruen", text: "Kunde mit PV" },
  { ton: "grau", text: "Kunde" },
  { ton: "lila", text: "Lieferant" },
  { ton: "gelb", text: "Partner" },
];

// ── Belege eines Lieferanten ─────────────────────────────────────────────
export type LieferantBeleg = {
  quelle: string; id: string; nummer: string | null; datum: string; betrag: number | null; status: string;
  projekt_id: string | null; projekt: string | null;
};

/** Summen über die Belege: Rechnungen gesamt und noch nicht bezahlt, Bestellungen */
export function belegSummen(belege: LieferantBeleg[]) {
  const r = belege.filter((b) => b.quelle === "rechnung");
  const offen = r.filter((b) => b.status !== "bezahlt" && b.status !== "abgelehnt");
  const be = belege.filter((b) => b.quelle === "bestellung" && b.status !== "storniert");
  const summe = (l: LieferantBeleg[]) => Math.round(l.reduce((s, b) => s + (Number(b.betrag) || 0), 0) * 100) / 100;
  return {
    rechnungen: r.length, rechnungenSumme: summe(r),
    offen: offen.length, offenSumme: summe(offen),
    bestellungen: be.length, bestellungenSumme: summe(be),
    lieferscheine: belege.filter((b) => b.quelle === "lieferschein").length,
  };
}

/** Status je Belegart als Pille */
export function belegPille(b: Pick<LieferantBeleg, "quelle" | "status">): StatusEintrag {
  if (b.quelle === "rechnung") {
    // kontakt_belege: bezahlt / offen / freigegeben / abgelehnt — wie der Ablauf der Eingangsrechnung
    const ablauf = b.status === "bezahlt" ? "ueberwiesen" : b.status === "offen" ? "pruefen" : b.status;
    return FREIGABE_STATUS[ablauf] ?? FREIGABE_STATUS.pruefen;
  }
  if (b.quelle === "lieferschein") {
    return b.status === "zugeordnet" ? { ton: "gruen", text: "Rechnung zugeordnet" } : { ton: "gelb", text: "Ohne Rechnung" };
  }
  return BESTELL_STATUS[b.status as BestellStatus] ?? { ton: "grau", text: b.status };
}
