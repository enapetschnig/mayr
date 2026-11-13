/**
 * ============================================================================
 *  KUNDEN-KONFIGURATION — SETEC GmbH (Elektrik · Photovoltaik)
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
  /** Quadratisches App-Zeichen (Schild auf Schwarz) */
  logo: string;
  /** Querlogo mit Schriftzug: für dunkle bzw. helle Flächen */
  logoQuerHell: string;
  logoQuerDunkel: string;
  /** Schild allein, durchsichtig */
  logoZeichen: string;
  farben: { primary: string; primaryHex: string };
}

export const KUNDE: KundeConfig = {
  slug: "mayr",

  firma: "SETEC GmbH",
  kurzname: "SETEC",
  slogan: "Elektrik · Photovoltaik",

  anschrift: {
    strasse: "Grazer Straße 41",
    plz: "8644",
    ort: "Kindberg-Mürzhofen",
    land: "Österreich",
  },

  kontakt: {
    telefon: "+43 664 88228429",
    email: "s.sattler@setec-gmbh.at",
    website: "www.setec-gmbh.at",
    uid: "ATU75443156",
  },

  loginDomain: "elektro.handwerkapp.at",

  logo: "/logo.png",
  logoQuerHell: "/logo-quer-hell.png",
  logoQuerDunkel: "/logo-quer-dunkel.png",
  logoZeichen: "/logo-zeichen.png",

  // SETEC-Bronze — die einzige Aktionsfarbe (dunkler als das Logo-Gold #C4A983, damit weiße Schrift lesbar bleibt)
  farben: {
    primary: "37 44% 36%",
    primaryHex: "#866634",
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
  const zart = `${h} ${Math.min(s, 45)}% 94%`;

  // Nur im hellen Modus überschreiben — der dunkle bringt eigene, hellere Werte mit
  if (document.documentElement.classList.contains("dark")) return;
  setze("--primary", haupt);
  setze("--primary-hover", dunkler);
  setze("--primary-soft", zart);
  setze("--ring", haupt);
  // Die Seitenleiste ist schwarz und trägt das helle Logo-Gold aus index.css
}
