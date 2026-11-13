import {
  BarChart3, BookOpenCheck, MessageSquarePlus, Bus, FileCheck2, FileText, LayoutGrid, HandCoins, ClipboardSignature, Clock, FolderKanban, Home, Inbox, ListChecks, Package,
  FolderArchive, ListTodo, Receipt, ScanBarcode, Settings, ShieldCheck, ShoppingCart, Smartphone, Users, Warehouse, type LucideIcon,
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
  /** Startseite am Handy: unter „Mehr“, wenn die Gruppe lang ist */
  selten?: boolean;
  /** Weitere Wörter, unter denen die Suche (Strg+K) die Seite findet */
  stichworte?: string;
};

export const NAVIGATION: NavEintrag[] = [
  { titel: "Start", text: "Übersicht", pfad: "/", icon: Home, gruppe: "haupt" },
  { titel: "Projekte", text: "Baustellen mit Fotos, Stunden, Material", pfad: "/projekte", icon: FolderKanban, gruppe: "haupt", stichworte: "Baustelle Förderung Planung" },
  { titel: "Kontakte", text: "Kunden, Lieferanten, Karte", pfad: "/kunden", icon: Users, gruppe: "haupt", stichworte: "Kunde Lieferant Partner Telefon Adresse Karte PV-Anlage" },
  { titel: "Angebote", text: "Schreiben, vor Ort per Sprache, nachfassen", pfad: "/angebote", icon: FileText, gruppe: "haupt", nurChef: true, stichworte: "Vorlage Kostenvoranschlag Sprache" },
  { titel: "Rechnungen", text: "Aus dem Projekt, PDF mit Bezahl-QR", pfad: "/rechnungen", icon: Receipt, gruppe: "haupt", nurChef: true, stichworte: "Teilrechnung Schlussrechnung Storno Gutschrift" },
  { titel: "Plantafel", text: "Einsätze, Teams und Busse — mit Kalender", textMonteur: "Wer fährt wann mit wem wohin", pfad: "/plantafel", icon: LayoutGrid, gruppe: "haupt", stichworte: "Kalender Termin Einsatz Terminplaner Team Bus Urlaub Krank" },

  { titel: "Stunden", text: "Meine Woche und mein Monat, Stunden buchen", pfad: "/zeiten", icon: Clock, gruppe: "baustelle", stichworte: "Zeiten Arbeitszeit Zeitkonto Urlaub Krank Abwesenheit Monat" },
  { titel: "Aufgaben", text: "Wer muss was bis wann erledigen", textMonteur: "Was ich erledigen soll — abhaken", pfad: "/aufgaben", icon: ListTodo, gruppe: "baustelle", stichworte: "To-do erledigen Erinnerung" },
  { titel: "Scannen", text: "Material ausfassen und zurückgeben", pfad: "/scan", icon: ScanBarcode, gruppe: "baustelle", stichworte: "Material ausfassen Strichcode Barcode Rückgabe" },
  { titel: "Regieberichte", text: "Mit Unterschrift des Kunden", pfad: "/regie", icon: ClipboardSignature, gruppe: "baustelle", stichworte: "Regie Unterschrift Arbeitsbericht" },
  { titel: "Lieferscheine", text: "Fotografieren — die KI liest mit", pfad: "/lieferscheine", icon: FileCheck2, gruppe: "baustelle", stichworte: "Wareneingang Lieferung" },
  { titel: "Lager", selten: true, text: "Bestand, Busse, was nachbestellen", pfad: "/lager", icon: Warehouse, gruppe: "baustelle", stichworte: "Bestand Material Nachbestellen Regal" },
  { titel: "Fuhrpark", selten: true, text: "Busse, Steiger, Maschinen — Pickerl, Service, Schäden", pfad: "/fuhrpark", icon: Bus, gruppe: "baustelle", stichworte: "Auto Fahrzeug Pickerl Service Schaden" },
  { titel: "Anlagen & Prüfungen", selten: true, text: "E-Check, Verteiler, Blitzschutz — was fällig ist", pfad: "/anlagen", icon: ShieldCheck, gruppe: "baustelle", stichworte: "E-Check Prüfprotokoll Prüfung PV-Anlage Wartung" },

  { titel: "Eingangsrechnungen", text: "Rechnungen vom Großhändler prüfen, zuordnen, zahlen", pfad: "/eingang", icon: Inbox, gruppe: "buero", nurChef: true, stichworte: "Lieferantenrechnung Großhändler Überweisen Skonto Freigabe" },
  { titel: "Offene Posten", text: "Wer noch zahlen muss, mahnen mit einem Tipp", pfad: "/offene-posten", icon: HandCoins, gruppe: "buero", nurChef: true, stichworte: "Mahnung mahnen Zahlung bezahlt Zahlungseingang" },
  { titel: "Dokumente", text: "Vorlagen, Zertifikate, Lohnzettel, Krankenscheine", textMonteur: "Firmendokumente, meine Lohnzettel", pfad: "/dokumente", icon: FolderArchive, gruppe: "buero", stichworte: "Lohnzettel Krankenschein Vorlage Zertifikat Anmeldung Versicherung" },
  { titel: "Buchhaltung", selten: true, text: "Ein- und Ausgang, Kategorien, der Monat für den Steuerberater", pfad: "/buchhaltung", icon: BookOpenCheck, gruppe: "buero", nurChef: true, stichworte: "Steuerberater Kanzlei BMD RZL Altrechnungen Kategorie Export" },
  { titel: "Bestellungen", selten: true, text: "Beim Großhändler bestellen, Lieferung einbuchen", pfad: "/bestellungen", icon: ShoppingCart, gruppe: "buero", nurChef: true, stichworte: "Bestellen Großhändler" },
  { titel: "Artikel", selten: true, text: "Artikelstamm, Datanorm, Strichcodes", pfad: "/artikel", icon: Package, gruppe: "buero", stichworte: "Material Preis Datanorm Datenblatt Strichcode" },
  { titel: "Leistungskatalog", selten: true, text: "Leistungen mit Material und Montagezeit", pfad: "/leistungen", icon: ListChecks, gruppe: "buero", nurChef: true, stichworte: "Leistungen Pauschale Kalkulation" },
  { titel: "Auswertung", selten: true, text: "Stunden, Umsatz, Nachkalkulation", pfad: "/auswertung", icon: BarChart3, gruppe: "buero", nurChef: true, stichworte: "Nachkalkulation Umsatz Statistik Lohnkosten" },

  { titel: "Einstellungen", text: "Betrieb, Mitarbeiter, Konto, App", textMonteur: "Mein Konto, Passwort, App aufs Handy", pfad: "/einstellungen", icon: Settings, gruppe: "system", stichworte: "Mitarbeiter Betrieb Firma Passwort Konto Bank Logo Stundensatz Lohnkosten Einladen Team" },
  { titel: "Änderungswünsche", text: "Sagen, was anders sein soll — und was schon umgesetzt ist", textMonteur: "Was ich gemeldet habe und was umgesetzt ist", pfad: "/wuensche", icon: MessageSquarePlus, gruppe: "system", stichworte: "Änderung melden Fehler Wunsch" },
  { titel: "Handyansicht", text: "So sieht die App am Handy aus", pfad: "/handyansicht", icon: Smartphone, gruppe: "system", nurPc: true },
];

export const GRUPPEN_TITEL: Record<NavEintrag["gruppe"], string> = {
  haupt: "Übersicht",
  baustelle: "Baustelle",
  buero: "Büro",
  system: "System",
};

/** Passt der Suchtext zur Seite? Titel und Stichworte, ohne Groß/klein. */
export const navPasst = (n: NavEintrag, q: string) =>
  !q || `${n.titel} ${n.stichworte ?? ""}`.toLowerCase().includes(q.toLowerCase());

export const sichtbareNavigation = (istChef: boolean, pc = false) =>
  NAVIGATION.filter((n) => (istChef || !n.nurChef) && (pc || !n.nurPc));

/** Ist dieser Menüpunkt für die aktuelle Adresse aktiv? */
export const istAktiv = (pfad: string, jetzt: string) =>
  pfad === "/" ? jetzt === "/" : jetzt === pfad || jetzt.startsWith(pfad + "/");
