/**
 * ============================================================================
 *  KUNDEN-KONFIGURATION — Elektriker-Demo
 * ============================================================================
 *
 * Eigene, schlanke App im Look der Handwerker-Apps (kein hw-core-Fork).
 * Die Firmendaten für Angebote und Rechnungen stehen NICHT hier, sondern in
 * der Tabelle `firma` (in der App unter Einstellungen → Betrieb pflegbar).
 *
 * Hier steht nur, was die App als Ganzes ausmacht: Name, Farben, Logo,
 * Anmelde-Domain. Format wie in hw-core, damit branding.py funktioniert.
 */

export interface KundeConfig {
  slug: string;
  firma: string;
  kurzname: string;
  slogan: string;
  anschrift: { strasse: string; plz: string; ort: string; land: string };
  kontakt: { telefon: string; email: string; website: string; uid: string };
  /** Benutzername ohne @ → <name>@<loginDomain> */
  loginDomain: string;
  logo: string;
  farben: { primary: string; primaryHex: string };
}

export const KUNDE: KundeConfig = {
  slug: "mayr",

  firma: "Elektro Muster GmbH",
  kurzname: "Elektro Muster",
  slogan: "Elektriker-App",

  anschrift: {
    strasse: "",
    plz: "",
    ort: "",
    land: "Österreich",
  },

  kontakt: {
    telefon: "",
    email: "",
    website: "",
    uid: "",
  },

  loginDomain: "elektro.handwerkapp.at",

  logo: "/logo.png",

  // Elektro-Blau — die einzige Aktionsfarbe (Design „Werkbank“)
  farben: {
    primary: "224 76% 48%",
    primaryHex: "#1D4ED8",
  },
};

/**
 * Setzt die Markenfarbe zur Laufzeit aus kunde.config.ts. Text und Flächen
 * bleiben neutral grau — nur die Aktionsfarbe kommt von hier.
 */
export function farbenAnwenden(): void {
  const wurzel = document.documentElement;
  const setze = (name: string, wert: string) => wurzel.style.setProperty(name, wert);

  const teile = KUNDE.farben.primary.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!teile) {
    setze("--primary", KUNDE.farben.primary);
    return;
  }
  const h = Number(teile[1]);
  const s = Number(teile[2]);
  const l = Number(teile[3]);

  const haupt = `${h} ${s}% ${l}%`;
  const dunkler = `${h} ${s}% ${Math.max(l - 7, 10)}%`;
  const hell = `${h} ${Math.round(s * 0.9)}% ${Math.min(l + 12, 92)}%`;
  const zart = `${h} 90% 96%`;

  // Nur im hellen Modus überschreiben — der dunkle bringt eigene, hellere Werte mit
  if (document.documentElement.classList.contains("dark")) return;
  setze("--primary", haupt);
  setze("--primary-hover", dunkler);
  setze("--primary-soft", zart);
  setze("--ring", haupt);
  setze("--sidebar-primary", haupt);
  setze("--sidebar-ring", hell);
}
