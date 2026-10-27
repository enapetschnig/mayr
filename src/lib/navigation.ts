import {
  BarChart3, CalendarDays, ClipboardSignature, Clock, FolderKanban, Home, Inbox, ListChecks, Package,
  Receipt, ScanBarcode, Settings, Smartphone, Users, Warehouse, type LucideIcon,
} from "lucide-react";

/**
 * Alle Ziele der App an einer Stelle — Seitenleiste (PC) und die großen
 * Menü-Karten der Startseite (Handy/Tablet) lesen von hier. `nurChef`
 * blendet für Monteure aus; die Datenbank sperrt dieselben Dinge
 * zusätzlich per RLS.
 */
export type NavEintrag = {
  titel: string;
  /** Unterzeile auf der Menü-Karte der Startseite */
  text: string;
  /** Unterzeile für Monteure, wenn sie dort weniger sehen als der Chef */
  textMonteur?: string;
  pfad: string;
  icon: LucideIcon;
  gruppe: "haupt" | "baustelle" | "buero" | "system";
  nurChef?: boolean;
  /** Nur im Seitenmenü am PC */
  nurPc?: boolean;
};

export const NAVIGATION: NavEintrag[] = [
  { titel: "Start", text: "Übersicht", pfad: "/", icon: Home, gruppe: "haupt" },
  { titel: "Projekte", text: "Baustellen mit Fotos, Stunden, Material", pfad: "/projekte", icon: FolderKanban, gruppe: "haupt" },
  { titel: "Kalender", text: "Termine und wer wo eingeteilt ist", pfad: "/kalender", icon: CalendarDays, gruppe: "haupt" },

  { titel: "Stunden", text: "Meine Woche, Stunden buchen", pfad: "/zeiten", icon: Clock, gruppe: "baustelle" },
  { titel: "Scannen", text: "Material ausfassen und zurückgeben", pfad: "/scan", icon: ScanBarcode, gruppe: "baustelle" },
  { titel: "Regieberichte", text: "Mit Unterschrift des Kunden", pfad: "/regie", icon: ClipboardSignature, gruppe: "baustelle" },
  { titel: "Lager", text: "Bestand, Busse, was nachbestellen", pfad: "/lager", icon: Warehouse, gruppe: "baustelle" },

  { titel: "Angebote & Rechnungen", text: "Vor Ort per Sprache, PDF mit Bezahl-QR", pfad: "/belege", icon: Receipt, gruppe: "buero", nurChef: true },
  { titel: "Eingangsrechnungen", text: "Rechnungen vom Großhändler zuordnen", pfad: "/eingang", icon: Inbox, gruppe: "buero", nurChef: true },
  { titel: "Kunden", text: "Adressen und Kontakte", pfad: "/kunden", icon: Users, gruppe: "buero" },
  { titel: "Artikel", text: "Artikelstamm, Datanorm, Strichcodes", pfad: "/artikel", icon: Package, gruppe: "buero" },
  { titel: "Leistungskatalog", text: "Leistungen mit Material und Montagezeit", pfad: "/leistungen", icon: ListChecks, gruppe: "buero", nurChef: true },
  { titel: "Auswertung", text: "Stunden, Umsatz, Nachkalkulation", pfad: "/auswertung", icon: BarChart3, gruppe: "buero", nurChef: true },

  { titel: "Einstellungen", text: "Betrieb, Mitarbeiter, Konto, App", textMonteur: "Mein Konto, Passwort, App aufs Handy", pfad: "/einstellungen", icon: Settings, gruppe: "system" },
  { titel: "Handyansicht", text: "So sieht die App am Handy aus", pfad: "/handyansicht", icon: Smartphone, gruppe: "system", nurPc: true },
];

export const GRUPPEN_TITEL: Record<NavEintrag["gruppe"], string> = {
  haupt: "Übersicht",
  baustelle: "Baustelle",
  buero: "Büro",
  system: "System",
};

export const sichtbareNavigation = (istChef: boolean, pc = false) =>
  NAVIGATION.filter((n) => (istChef || !n.nurChef) && (pc || !n.nurPc));

/** Ist dieser Menüpunkt für die aktuelle Adresse aktiv? */
export const istAktiv = (pfad: string, jetzt: string) =>
  pfad === "/" ? jetzt === "/" : jetzt === pfad || jetzt.startsWith(pfad + "/");
