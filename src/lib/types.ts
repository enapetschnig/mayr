import type { Tables } from "@/integrations/supabase/types";

export type Firma = Tables<"firma">;
export type Profil = Tables<"profiles">;
export type Kunde = Tables<"kunden">;
export type Projekt = Tables<"projekte">;
export type Zeit = Tables<"zeiten">;
export type Artikel = Tables<"artikel">;
export type ArtikelCode = Tables<"artikel_codes">;
export type Leistung = Tables<"leistungen">;
export type LeistungMaterial = Tables<"leistung_material">;
export type Lagerort = Tables<"lagerorte">;
export type MaterialBuchung = Tables<"material_buchungen">;
export type ProjektMaterial = Tables<"projekt_material">;
export type ProjektZahlen = Tables<"projekt_zahlen">;
export type Lagerbestand = Tables<"lagerbestand">;
export type Regiebericht = Tables<"regieberichte">;
export type Beleg = Tables<"belege">;
export type Position = Tables<"beleg_positionen">;
export type Eingangsrechnung = Tables<"eingangsrechnungen">;
export type EingangAnteil = Tables<"eingang_anteile">;
export type Datei = Tables<"dateien">;
export type Termin = Tables<"termine">;

export type Rolle = "chef" | "monteur";

// ── Status: EINE Farbtabelle für die ganze App (Design „Werkbank“) ──────
// Gleiche Bedeutung = gleiche Farbe: Entwurf IMMER cyan, verrechnet IMMER
// lila, Grün nur für erledigt/positiv. Gezeichnet mit <StatusPille />.
export type StatusTon = "grau" | "blau" | "gelb" | "gruen" | "rot" | "cyan" | "lila" | "rosa";

/** Fläche + Schrift je Ton — als ganze Klassennamen, damit Tailwind sie findet */
export const TON_KLASSE: Record<StatusTon, string> = {
  grau: "bg-status-grau text-status-grau-fg",
  blau: "bg-status-blau text-status-blau-fg",
  gelb: "bg-status-gelb text-status-gelb-fg",
  gruen: "bg-status-gruen text-status-gruen-fg",
  rot: "bg-status-rot text-status-rot-fg",
  cyan: "bg-status-cyan text-status-cyan-fg",
  lila: "bg-status-lila text-status-lila-fg",
  rosa: "bg-status-rosa text-status-rosa-fg",
};

export type StatusEintrag = { ton: StatusTon; text: string; durchgestrichen?: boolean };

// ── Projekte ────────────────────────────────────────────────────────────
export type ProjektStatus = "angebot" | "aktiv" | "verrechnen" | "abgeschlossen";

export const PROJEKT_STATUS: Record<ProjektStatus, StatusEintrag> = {
  angebot: { ton: "cyan", text: "Angebot" },
  aktiv: { ton: "blau", text: "In Arbeit" },
  verrechnen: { ton: "gelb", text: "Zu verrechnen" },
  abgeschlossen: { ton: "gruen", text: "Abgeschlossen" },
};

// ── Belege und Regieberichte ───────────────────────────────────────────
export const BELEG_STATUS: Record<string, StatusEintrag> = {
  entwurf: { ton: "cyan", text: "Entwurf" },
  offen: { ton: "grau", text: "Offen" },
  ueberfaellig: { ton: "rot", text: "Überfällig" },
  bezahlt: { ton: "gruen", text: "Bezahlt" },
  storniert: { ton: "rosa", text: "Storniert", durchgestrichen: true },
  storno: { ton: "rosa", text: "Stornorechnung" },
  angenommen: { ton: "gruen", text: "Angenommen" },
  abgelehnt: { ton: "rosa", text: "Abgelehnt" },
  verrechnet: { ton: "lila", text: "Verrechnet" },
};

export const REGIE_STATUS: Record<string, StatusEintrag> = {
  entwurf: { ton: "cyan", text: "Entwurf" },
  unterschrieben: { ton: "gruen", text: "Unterschrieben" },
  verrechnet: { ton: "lila", text: "Verrechnet" },
};

// ── Eingangsrechnungen ────────────────────────────────────────────────
export const EINGANG_STATUS: Record<string, StatusEintrag> = {
  zuzuordnen: { ton: "gelb", text: "Zuzuordnen" },
  teilweise: { ton: "gelb", text: "Teilweise zugeordnet" },
  offen: { ton: "grau", text: "Nicht bezahlt" },
  ueberfaellig: { ton: "rot", text: "Überfällig" },
  bezahlt: { ton: "gruen", text: "Bezahlt" },
};

/** Offene Rechnung nach dem Fälligkeitstag zeigt „Überfällig“ */
export function belegStatus(b: Pick<Beleg, "status" | "typ" | "faellig_am">, heute: string): string {
  if (b.typ === "rechnung" && b.status === "offen" && b.faellig_am && b.faellig_am < heute) return "ueberfaellig";
  return b.status;
}

// ── Material ────────────────────────────────────────────────────────────
export type BuchungsArt = "zugang" | "abgang" | "korrektur" | "ausfassung" | "rueckgabe" | "direkt";

export const BUCHUNGS_ART: Record<BuchungsArt, string> = {
  zugang: "Wareneingang",
  abgang: "Abgang",
  korrektur: "Inventur/Korrektur",
  ausfassung: "Ausgefasst",
  rueckgabe: "Zurückgegeben",
  direkt: "Direkt gekauft",
};

export const EINHEITEN = ["Stk", "m", "h", "Psch", "Pkg", "Rolle", "Set", "kg", "l", "m²"];

export const KATEGORIEN_ARTIKEL = [
  "Kabel & Leitungen",
  "Rohre & Kanäle",
  "Dosen & Verbindungstechnik",
  "Schalter & Steckdosen",
  "Verteiler & Schutzgeräte",
  "Licht",
  "Netzwerk & Medien",
  "Sicherheit & Melder",
  "Befestigung & Kleinmaterial",
  "Erdung & Blitzschutz",
];

/** Vor- und Nachname, ersatzweise die E-Mail */
export function name(p: Pick<Profil, "vorname" | "nachname"> & { email?: string | null } | null | undefined): string {
  if (!p) return "–";
  return `${p.vorname} ${p.nachname}`.trim() || p.email || "–";
}

/** "Max Monteur" → "MM" */
export function kuerzel(p: Pick<Profil, "vorname" | "nachname"> | null | undefined): string {
  if (!p) return "?";
  return `${p.vorname.charAt(0)}${p.nachname.charAt(0)}`.toUpperCase() || "?";
}
