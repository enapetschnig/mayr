/**
 * Gemeinsamer Teil des Artikel-Imports (Datanorm und CSV): Einkaufspreis aus
 * Listenpreis und Rabatt, Zeilen für die Tabelle `artikel`, Pakete fürs
 * Hochladen und der Upload selbst. Reine Logik — der Upload bekommt die
 * Speicherfunktion von außen, damit er ohne Datenbank testbar bleibt.
 */
import type { TablesInsert } from "@/integrations/supabase/types";
import { normalisieren } from "@/lib/strichcode";

/** Ein Artikel aus einer Importdatei, Preise schon je 1 Einheit. */
export interface ImportArtikel {
  artikelnummer: string;
  bezeichnung: string;
  langtext: string | null;
  einheit: string;
  ean: string | null;
  hersteller: string | null;
  hersteller_nr: string | null;
  warengruppe: string | null;
  rabattgruppe: string | null;
  listenpreis: number | null;
  /** Nettopreis aus der Datei (Datanorm PK 2 / Preisdatei, CSV-Spalte EK) */
  netto: number | null;
}

export interface RabattEinstellung {
  /** Rabatt in % je Rabattgruppe; fehlt eine Gruppe, gilt der pauschale */
  gruppen: Record<string, number | null | undefined>;
  /** Rabatt in % für alle übrigen Artikel, null = keiner */
  pauschal: number | null;
  /**
   * Nettopreis aus der Datei geht vor „Liste − Rabatt“. Eine Preisdatei mit
   * Nettopreisen enthält die ausgehandelten Preise je Artikel — genauer als
   * ein Rabatt für die ganze Gruppe.
   */
  nettoVorziehen: boolean;
}

export const runden4 = (n: number) => Math.round(n * 10000) / 10000;

/** Welcher Rabatt gilt für den Artikel? Gruppe vor pauschal; null = keiner. */
export function rabattFuer(a: Pick<ImportArtikel, "rabattgruppe">, r: RabattEinstellung): number | null {
  const g = a.rabattgruppe ? r.gruppen[a.rabattgruppe] : null;
  if (g != null && Number.isFinite(g)) return g;
  return r.pauschal != null && Number.isFinite(r.pauschal) ? r.pauschal : null;
}

/** EK je Einheit: Liste − Rabatt (falls Rabatt), sonst der Nettopreis aus der Datei. */
export function ekBerechnen(a: Pick<ImportArtikel, "rabattgruppe" | "listenpreis" | "netto">, r: RabattEinstellung): number | null {
  if (r.nettoVorziehen && a.netto != null) return runden4(a.netto);
  const rabatt = rabattFuer(a, r);
  if (rabatt != null && a.listenpreis != null) {
    return runden4(a.listenpreis * (1 - Math.min(100, Math.max(0, rabatt)) / 100));
  }
  return a.netto != null ? runden4(a.netto) : null;
}

export type ArtikelZeile = TablesInsert<"artikel">;

/** Diese Felder kommen nur mit, wenn die Datei einen Wert hat — leer überschreibt nichts. */
const WAHLFELDER = ["langtext", "ean", "hersteller", "hersteller_nr", "warengruppe", "rabattgruppe", "listenpreis", "ek_preis"] as const;

/**
 * Zeilen für den Upsert. Gleiche Artikelnummer mehrfach in der Datei: die
 * letzte Zeile gilt. Kategorie, VK, Lager-Einstellungen und „aktiv“ bleiben
 * unangetastet — die pflegt der Betrieb selbst.
 */
export function artikelZeilen(
  liste: ImportArtikel[],
  opt: { lieferant: string; quelle: "datanorm" | "csv"; rabatt: RabattEinstellung },
): { zeilen: ArtikelZeile[]; doppelt: number; ohneNummer: number; ohneBezeichnung: number } {
  const nachNummer = new Map<string, ArtikelZeile>();
  let doppelt = 0;
  let ohneNummer = 0;
  let ohneBezeichnung = 0;
  const lieferant = opt.lieferant.trim();
  for (const a of liste) {
    const nr = (a.artikelnummer ?? "").trim();
    const bez = (a.bezeichnung ?? "").trim();
    if (!nr) {
      ohneNummer++;
      continue;
    }
    if (!bez) {
      ohneBezeichnung++;
      continue;
    }
    const werte: Record<(typeof WAHLFELDER)[number], string | number | null> = {
      langtext: a.langtext?.trim() || null,
      // in der Schreibweise, die der Scanner sucht (GTIN-14 „04012…“ → EAN-13)
      ean: a.ean?.trim() ? normalisieren(a.ean) : null,
      hersteller: a.hersteller?.trim() || null,
      hersteller_nr: a.hersteller_nr?.trim() || null,
      warengruppe: a.warengruppe?.trim() || null,
      rabattgruppe: a.rabattgruppe?.trim() || null,
      listenpreis: a.listenpreis != null ? runden4(a.listenpreis) : null,
      ek_preis: ekBerechnen(a, opt.rabatt),
    };
    const z: ArtikelZeile = { lieferant, artikelnummer: nr, bezeichnung: bez, einheit: a.einheit?.trim() || "Stk", quelle: opt.quelle };
    for (const k of WAHLFELDER) {
      const w = werte[k];
      if (w != null && w !== "") (z as Record<string, unknown>)[k] = w;
    }
    if (nachNummer.has(nr)) {
      doppelt++;
      nachNummer.delete(nr); // neu einfügen, damit die Reihenfolge der letzten Zeile folgt
    }
    nachNummer.set(nr, z);
  }
  return { zeilen: [...nachNummer.values()], doppelt, ohneNummer, ohneBezeichnung };
}

/**
 * Pakete für PostgREST: jede Zeile eines Pakets hat exakt dieselben Felder —
 * sonst setzt ein Sammel-Upsert fehlende Felder auf NULL und überschreibt
 * vorhandene Werte.
 */
export function pakete<T extends object>(zeilen: T[], groesse = 500): T[][] {
  const gruppen = new Map<string, T[]>();
  for (const z of zeilen) {
    const k = Object.keys(z).sort().join(",");
    const g = gruppen.get(k);
    if (g) g.push(z);
    else gruppen.set(k, [z]);
  }
  const out: T[][] = [];
  for (const g of gruppen.values()) for (let i = 0; i < g.length; i += groesse) out.push(g.slice(i, i + groesse));
  return out;
}

export interface UploadErgebnis {
  neu: number;
  aktualisiert: number;
  fehler: number;
  /** verschiedene Fehlermeldungen (höchstens 5) */
  meldungen: string[];
  /** nicht mehr hochgeladen (abgebrochen) */
  offen: number;
}

/**
 * Pakete hochladen, `parallel` gleichzeitig. Ein fehlgeschlagenes Paket wird
 * gezählt und übersprungen; nach drei Fehlern hintereinander oder auf
 * Wunsch (`abbrechen`) bleibt der Rest liegen.
 */
export async function hochladen<T>(
  liste: T[][],
  speichern: (paket: T[]) => Promise<{ neu: number; aktualisiert: number }>,
  opt: { parallel?: number; fortschritt?: (erledigt: number) => void; abbrechen?: () => boolean } = {},
): Promise<UploadErgebnis> {
  const erg: UploadErgebnis = { neu: 0, aktualisiert: 0, fehler: 0, meldungen: [], offen: 0 };
  let naechstes = 0;
  let erledigt = 0;
  let fehlerFolge = 0;
  let stopp = false;

  const arbeiter = async () => {
    while (!stopp) {
      if (opt.abbrechen?.()) {
        stopp = true;
        break;
      }
      const i = naechstes++;
      if (i >= liste.length) break;
      const paket = liste[i];
      try {
        const r = await speichern(paket);
        erg.neu += r.neu;
        erg.aktualisiert += r.aktualisiert;
        fehlerFolge = 0;
      } catch (e) {
        erg.fehler += paket.length;
        const m = e instanceof Error ? e.message : String(e);
        if (erg.meldungen.length < 5 && !erg.meldungen.includes(m)) erg.meldungen.push(m);
        if (++fehlerFolge >= 3) stopp = true;
      }
      erledigt += paket.length;
      opt.fortschritt?.(erledigt);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opt.parallel ?? 1) }, arbeiter));
  for (let i = naechstes; i < liste.length; i++) erg.offen += liste[i].length;
  return erg;
}
