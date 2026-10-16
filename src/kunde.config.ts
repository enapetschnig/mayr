/**
 * ============================================================================
 *  KUNDEN-KONFIGURATION
 * ============================================================================
 *
 * Diese App ist KEIN Fork von hw-core, sondern eine eigene, schlanke App im
 * selben Look: drei Elektrofirmen, die sich Projekte teilen. Die Firmendaten
 * für Rechnungen stehen deshalb NICHT hier, sondern je Firma in der Tabelle
 * `firmen` (in der App unter Einstellungen → Meine Firma pflegbar).
 *
 * Hier steht nur, was die App als Ganzes ausmacht: Name, Farbe, Logo.
 * Das Format ist dasselbe wie in hw-core, damit die Werkzeuge
 * (branding.py, kunde-cloud.sh) unverändert funktionieren.
 */

export interface KundeConfig {
  slug: string;
  firma: string;
  kurzname: string;
  slogan: string;
  anschrift: { strasse: string; plz: string; ort: string; land: string };
  kontakt: { telefon: string; email: string; website: string; uid: string };
  loginDomain: string;
  logo: string;
  farben: { primary: string; primaryHex: string };
}

export const KUNDE: KundeConfig = {
  slug: "mayr",

  firma: "MAM Mechatronik",
  kurzname: "MAM Mechatronik",
  slogan: "Elektro-Partner",

  anschrift: {
    strasse: "Guntendorf 18",
    plz: "4550",
    ort: "Kremsmünster",
    land: "Österreich",
  },

  kontakt: {
    telefon: "",
    email: "",
    website: "",
    uid: "",
  },

  loginDomain: "app.mayr.at",

  logo: "/logo.png",

  farben: {
    primary: "163 73% 20%",
    primaryHex: "#0E5A44",
  },
};

/**
 * Setzt die komplette Farbwelt zur Laufzeit aus der einen Hauptfarbe
 * (gleiche Logik wie in hw-core).
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
  const hell = `${h} ${Math.round(s * 0.72)}% ${Math.min(l + 10, 92)}%`;
  const schrift = `${h} ${Math.min(s, 35)}% 11%`;

  setze("--primary", haupt);
  setze("--ring", hell);
  setze("--accent", hell);
  setze("--foreground", schrift);
  setze("--card-foreground", schrift);
  setze("--popover-foreground", schrift);
  setze("--secondary-foreground", haupt);
  setze("--marke-primaer", haupt);
  setze("--marke-hell", hell);
  setze("--shadow-soft", `0 2px 8px hsl(${haupt} / 0.08)`);
  setze("--shadow-medium", `0 4px 16px hsl(${haupt} / 0.12)`);
  setze("--sidebar-foreground", haupt);
  setze("--sidebar-primary", haupt);
  setze("--sidebar-accent-foreground", haupt);
  setze("--sidebar-ring", hell);
}
