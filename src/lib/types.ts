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
export type Abwesenheit = Tables<"abwesenheiten">;
export type KontoBuchung = Tables<"konto_buchungen">;
export type Zahlung = Tables<"zahlungen">;
export type Mahnung = Tables<"mahnungen">;
export type Fahrzeug = Tables<"fahrzeuge">;
export type FahrzeugEintrag = Tables<"fahrzeug_eintraege">;
export type Team = Tables<"teams">;
export type EingangPosition = Tables<"eingang_positionen">;
export type Lieferschein = Tables<"lieferscheine">;
export type Aufgabe = Tables<"aufgaben">;
export type AufgabeVerlauf = Tables<"aufgabe_verlauf">;
export type PersonalDokument = Tables<"personal_dokumente">;
export type FirmenDokument = Tables<"firmen_dokumente">;

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

// ── Stunden, Abwesenheit, Einsatz ───────────────────────────────────────
export type StundenArt = "arbeit" | "fahrt" | "ue50" | "ue100" | "garantie";
export const STUNDEN_ART: Record<StundenArt, StatusEintrag> = {
  arbeit: { ton: "grau", text: "Arbeit" },
  fahrt: { ton: "cyan", text: "Fahrzeit" },
  ue50: { ton: "gelb", text: "Überstunden 50 %" },
  ue100: { ton: "gelb", text: "Überstunden 100 %" },
  garantie: { ton: "rosa", text: "Garantie (nicht verrechnen)" },
};

export type AbwesenheitArt = "urlaub" | "krank" | "arzt" | "berufsschule" | "zeitausgleich" | "sonstiges";
/** kurz = im Wochenraster. „abwesend“ sehen die Kollegen — der Grund geht sie nichts an. */
export const ABWESENHEIT_ART: Record<AbwesenheitArt | "abwesend", { text: string; kurz: string }> = {
  urlaub: { text: "Urlaub", kurz: "U" },
  krank: { text: "Krankenstand", kurz: "K" },
  arzt: { text: "Arzt", kurz: "A" },
  berufsschule: { text: "Berufsschule", kurz: "BS" },
  zeitausgleich: { text: "Zeitausgleich", kurz: "ZA" },
  sonstiges: { text: "Sonstiges", kurz: "S" },
  abwesend: { text: "Abwesend", kurz: "–" },
};

export const ABWESENHEIT_STATUS: Record<string, StatusEintrag> = {
  beantragt: { ton: "gelb", text: "Beantragt" },
  genehmigt: { ton: "gruen", text: "Genehmigt" },
  abgelehnt: { ton: "rosa", text: "Abgelehnt", durchgestrichen: true },
};

/** Aufgaben: überfällig ist offen/in Arbeit mit Termin vor heute (lib/aufgaben.ts) */
export const AUFGABE_STATUS: Record<string, StatusEintrag> = {
  offen: { ton: "grau", text: "Offen" },
  in_arbeit: { ton: "blau", text: "In Arbeit" },
  ueberfaellig: { ton: "rot", text: "Überfällig" },
  erledigt: { ton: "gruen", text: "Erledigt" },
};

export const EINSATZ_STATUS: Record<string, StatusEintrag> = {
  geplant: { ton: "grau", text: "Geplant" },
  begonnen: { ton: "blau", text: "Läuft" },
  erledigt: { ton: "gruen", text: "Erledigt" },
};

// ── Projekte ────────────────────────────────────────────────────────────
export type ProjektStatus = "angebot" | "aktiv" | "verrechnen" | "abgeschlossen";

export const PROJEKT_STATUS: Record<ProjektStatus, StatusEintrag> = {
  angebot: { ton: "cyan", text: "Angebot" },
  aktiv: { ton: "blau", text: "In Arbeit" },
  verrechnen: { ton: "gelb", text: "Zu verrechnen" },
  abgeschlossen: { ton: "gruen", text: "Abgeschlossen" },
};

/** Förderung (PV): Schritte in der Reihenfolge des Ablaufs, „abgelehnt“ zuletzt */
export type FoerderStatus = "keine" | "vorbereitet" | "eingereicht" | "zugesagt" | "fertig_gemeldet" | "ausbezahlt" | "abgelehnt";
export const FOERDER_STATUS: Record<FoerderStatus, StatusEintrag> = {
  keine: { ton: "grau", text: "Keine Förderung" },
  vorbereitet: { ton: "cyan", text: "Antrag vorbereitet" },
  eingereicht: { ton: "blau", text: "Eingereicht" },
  zugesagt: { ton: "gelb", text: "Zugesagt" },
  fertig_gemeldet: { ton: "lila", text: "Fertigstellung gemeldet" },
  ausbezahlt: { ton: "gruen", text: "Ausbezahlt" },
  abgelehnt: { ton: "rosa", text: "Abgelehnt" },
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

// ── Änderungswünsche ───────────────────────────────────────────────────
export const WUNSCH_STATUS: Record<string, StatusEintrag> = {
  neu: { ton: "cyan", text: "Neu" },
  gesehen: { ton: "blau", text: "In Arbeit" },
  umgesetzt: { ton: "gruen", text: "Umgesetzt" },
  abgelehnt: { ton: "rosa", text: "Nicht umgesetzt" },
};

// ── Eingangsrechnungen ────────────────────────────────────────────────
export const EINGANG_STATUS: Record<string, StatusEintrag> = {
  zuzuordnen: { ton: "gelb", text: "Zuzuordnen" },
  teilweise: { ton: "gelb", text: "Teilweise zugeordnet" },
  offen: { ton: "grau", text: "Nicht bezahlt" },
  ueberfaellig: { ton: "rot", text: "Überfällig" },
  bezahlt: { ton: "gruen", text: "Bezahlt" },
};

/** Ablauf einer Eingangsrechnung: prüfen → freigeben → überweisen */
export const FREIGABE_STATUS: Record<string, StatusEintrag> = {
  pruefen: { ton: "cyan", text: "Zu prüfen" },
  freigegeben: { ton: "blau", text: "Zu überweisen" },
  ueberwiesen: { ton: "gruen", text: "Überwiesen" },
  abgelehnt: { ton: "rot", text: "Abgelehnt" },
};

// ── Fuhrpark ────────────────────────────────────────────────────────────
export type FahrzeugArt = "bus" | "pkw" | "steiger" | "anhaenger" | "maschine" | "messgeraet";
export const FAHRZEUG_ART: Record<FahrzeugArt, { text: string; mehrzahl: string; mitKennzeichen: boolean }> = {
  bus: { text: "Bus", mehrzahl: "Busse", mitKennzeichen: true },
  pkw: { text: "PKW", mehrzahl: "PKW", mitKennzeichen: true },
  steiger: { text: "Steiger", mehrzahl: "Steiger & Hebebühnen", mitKennzeichen: true },
  anhaenger: { text: "Anhänger", mehrzahl: "Anhänger", mitKennzeichen: true },
  maschine: { text: "Maschine", mehrzahl: "Maschinen", mitKennzeichen: false },
  messgeraet: { text: "Messgerät", mehrzahl: "Messgeräte", mitKennzeichen: false },
};
export const FAHRZEUG_EINTRAG: Record<string, StatusEintrag> = {
  service: { ton: "blau", text: "Service" },
  reparatur: { ton: "gelb", text: "Reparatur" },
  pruefung: { ton: "lila", text: "Prüfung" },
  schaden: { ton: "rot", text: "Schaden" },
  tanken: { ton: "grau", text: "Tanken" },
  sonstiges: { ton: "grau", text: "Sonstiges" },
};
/** Teamfarben: Fläche und Rand auf der Plantafel */
export const TEAM_FARBEN: Record<string, { text: string; klasse: string; punkt: string }> = {
  blau: { text: "Blau", klasse: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100", punkt: "bg-sky-500" },
  gruen: { text: "Grün", klasse: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100", punkt: "bg-emerald-500" },
  orange: { text: "Orange", klasse: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-100", punkt: "bg-orange-500" },
  lila: { text: "Lila", klasse: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100", punkt: "bg-violet-500" },
  rosa: { text: "Rosa", klasse: "border-pink-300 bg-pink-50 text-pink-900 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-100", punkt: "bg-pink-500" },
  grau: { text: "Grau", klasse: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100", punkt: "bg-slate-500" },
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
