/**
 * Artikellisten als CSV (Excel „Speichern unter → CSV“, Webshop-Export):
 * Trennzeichen ; , oder Tab automatisch, Felder in Anführungszeichen (auch
 * mit Zeilenumbruch), Kopfzeile irgendwo in den ersten Zeilen, Spalten
 * automatisch zugeordnet — von Hand korrigierbar.
 *
 * Zahlen: deutsch (1.250,50) und englisch (1,250.50) — welche Schreibweise
 * gilt, entscheidet die ganze Spalte.
 */
import type { ImportArtikel } from "@/lib/artikelImport";
import { einheitNorm, kurztextVerbinden, pause } from "@/lib/datanorm";
import { dezimalLesen } from "@/lib/format";

// ── Zahlen ─────────────────────────────────────────────────────────────

// Dieselbe Leselogik wie in den Eingabefeldern (lib/format.ts)
export { dezimalLesen };

export type ZahlenFormat = "punkt" | "komma" | null;

/** Schreibweise einer ganzen Spalte — »12.125« in einer englischen Liste ist 12,125 und nicht 12125. */
export function zahlenFormatErkennen(werte: string[]): ZahlenFormat {
  let punkt = 0;
  let komma = 0;
  for (const w of werte) {
    const s = (w ?? "").replace(/[^\d,.-]/g, "");
    if (/^-?\d+\.\d{1,2}$/.test(s) || /^-?\d+\.\d{4,}$/.test(s) || /^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) punkt++;
    else if (/^-?\d+,\d+$/.test(s) || /^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) komma++;
  }
  if (punkt > 0 && komma === 0) return "punkt";
  if (komma > 0 && punkt === 0) return "komma";
  return null;
}

export function dezimalLesenFormat(eingabe: string, format: ZahlenFormat): number | null {
  if (format !== "punkt") return dezimalLesen(eingabe);
  const s = (eingabe ?? "").replace(/[^\d,.-]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return dezimalLesen(eingabe);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Zerlegen ───────────────────────────────────────────────────────────

export type Trennzeichen = ";" | "," | "\t";
export const TRENNZEICHEN_TEXT: Record<Trennzeichen, string> = { ";": "Strichpunkt", ",": "Beistrich", "\t": "Tabulator" };

/** Trennzeichen außerhalb von Anführungszeichen zählen */
function zaehlen(zeile: string, tz: string): number {
  let n = 0;
  let inAnf = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') inAnf = !inAnf;
    else if (c === tz && !inAnf) n++;
  }
  return n;
}

/**
 * Welches Trennzeichen? Das, das in den ersten Zeilen am gleichmäßigsten
 * vorkommt — Beistriche in Preisen (»12,50«) schwanken, die echten Trenner nicht.
 */
export function trennzeichenErkennen(zeilen: string[]): Trennzeichen {
  const probe = zeilen.filter((z) => z.trim()).slice(0, 30);
  let best: Trennzeichen = ";";
  let bestWert = -1;
  for (const tz of [";", "\t", ","] as Trennzeichen[]) {
    const anzahl = probe.map((z) => zaehlen(z, tz));
    const haeufig = new Map<number, number>();
    for (const n of anzahl) if (n > 0) haeufig.set(n, (haeufig.get(n) ?? 0) + 1);
    let modus = 0;
    let treffer = 0;
    for (const [n, h] of haeufig) if (h > treffer || (h === treffer && n > modus)) { modus = n; treffer = h; }
    if (!modus) continue;
    // Gleichmäßigkeit zuerst, dann mehr Spalten
    const wert = (treffer / probe.length) * 1000 + modus;
    if (wert > bestWert) {
      bestWert = wert;
      best = tz;
    }
  }
  return best;
}

const ANF = 34; // "
const LF = 10;
const CR = 13;

/**
 * CSV Stück für Stück zerlegen (RFC 4180): Felder in Anführungszeichen dürfen
 * Trennzeichen, Zeilenumbrüche und verdoppelte Anführungszeichen enthalten.
 * Leere Zeilen fallen weg.
 */
export class CsvLeser {
  readonly zeilen: string[][] = [];
  private zeile: string[] = [];
  private feld = "";
  private inAnf = false;
  /** im Anführungszeichen-Feld stand zuletzt ein " — schließt es, oder kommt ein zweites? */
  private anfOffen = false;
  private feldBegonnen = false;
  private readonly tz: number;

  constructor(trennzeichen: Trennzeichen) {
    this.tz = trennzeichen.charCodeAt(0);
  }

  private feldFertig() {
    this.zeile.push(this.feld);
    this.feld = "";
    this.feldBegonnen = false;
  }

  private zeileFertig() {
    this.feldFertig();
    if (this.zeile.some((f) => f.trim() !== "")) this.zeilen.push(this.zeile);
    this.zeile = [];
  }

  text(s: string) {
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (this.inAnf) {
        if (this.anfOffen) {
          this.anfOffen = false;
          if (c === ANF) {
            this.feld += '"';
            start = i + 1;
            continue;
          }
          this.inAnf = false; // das " hat das Feld geschlossen — c normal behandeln
          start = i;
        } else {
          if (c === ANF) {
            this.feld += s.slice(start, i);
            this.anfOffen = true;
            start = i + 1;
          }
          continue;
        }
      }
      if (c === this.tz) {
        this.feld += s.slice(start, i);
        this.feldFertig();
        start = i + 1;
      } else if (c === LF || c === CR) {
        this.feld += s.slice(start, i);
        this.zeileFertig();
        start = i + 1;
      } else if (c === ANF && !this.feldBegonnen && i === start && this.feld === "") {
        this.inAnf = true;
        this.feldBegonnen = true;
        start = i + 1;
      } else {
        this.feldBegonnen = true;
      }
    }
    this.feld += s.slice(start);
  }

  /** Letzte Zeile ohne Zeilenumbruch abschließen und alle Zeilen liefern. */
  ende(): string[][] {
    if (this.feld !== "" || this.zeile.length) this.zeileFertig();
    return this.zeilen;
  }
}

/** Ganzen Text auf einmal zerlegen (Tests, kleine Dateien). */
export function csvZerlegen(text: string, trennzeichen?: Trennzeichen): string[][] {
  const tz = trennzeichen ?? trennzeichenErkennen(text.split(/\r\n|\n|\r/, 40));
  const l = new CsvLeser(tz);
  l.text(text.replace(/^﻿/, ""));
  return l.ende();
}

// ── Spalten zuordnen ────────────────────────────────────────────────────

export type CsvFeld =
  | "artikelnummer" | "bezeichnung" | "bezeichnung2" | "langtext" | "ean" | "einheit"
  | "listenpreis" | "ek_preis" | "preiseinheit" | "hersteller" | "hersteller_nr" | "warengruppe" | "rabattgruppe";

export const CSV_FELDER: { feld: CsvFeld; text: string; pflicht?: boolean; hinweis?: string }[] = [
  { feld: "artikelnummer", text: "Artikelnummer", pflicht: true },
  { feld: "bezeichnung", text: "Bezeichnung", pflicht: true },
  { feld: "bezeichnung2", text: "Bezeichnung, 2. Zeile", hinweis: "wird an die Bezeichnung angehängt" },
  { feld: "langtext", text: "Langtext" },
  { feld: "ean", text: "EAN" },
  { feld: "einheit", text: "Einheit" },
  { feld: "listenpreis", text: "Listenpreis" },
  { feld: "ek_preis", text: "EK / Nettopreis" },
  { feld: "preiseinheit", text: "Preiseinheit", hinweis: "Preis gilt je … Einheiten" },
  { feld: "hersteller", text: "Hersteller" },
  { feld: "hersteller_nr", text: "Hersteller-Nr." },
  { feld: "warengruppe", text: "Warengruppe" },
  { feld: "rabattgruppe", text: "Rabattgruppe" },
];

export type Zuordnung = Partial<Record<CsvFeld, number>>;

/** »Art.-Nr.« → »artnr«, »Stückpreis €« → »stueckpreis« */
export function spaltenName(s: string): string {
  return (s ?? "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const ALIASE: Record<CsvFeld, string[]> = {
  artikelnummer: ["artikelnummer", "artikelnr", "artnr", "artikelno", "nummer", "nr", "bestellnummer", "bestellnr",
    "materialnummer", "materialnr", "sachnummer", "lieferantenartikelnummer", "lieferantenartnr", "artikelnummerlieferant",
    "artikelid", "artikelcode", "sku", "itemno", "itemnumber", "artno"],
  bezeichnung: ["bezeichnung", "bezeichnung1", "artikelbezeichnung", "kurztext", "kurztext1", "kurzbezeichnung", "name",
    "artikelname", "artikel", "produktbezeichnung", "produkt", "produktname", "text", "text1", "titel", "description"],
  bezeichnung2: ["bezeichnung2", "kurztext2", "text2", "zusatzbezeichnung", "bezeichnungzusatz", "zusatztext"],
  langtext: ["langtext", "langbeschreibung", "langbezeichnung", "beschreibung", "artikelbeschreibung", "produktbeschreibung",
    "longtext", "longdescription", "detailbeschreibung"],
  ean: ["ean", "gtin", "eangtin", "gtinean", "ean13", "eancode", "eannummer", "eannr", "barcode", "strichcode"],
  einheit: ["einheit", "me", "mengeneinheit", "eh", "einh", "verkaufseinheit", "basiseinheit", "basismengeneinheit", "unit"],
  listenpreis: ["listenpreis", "bruttopreis", "listpreis", "bruttolistenpreis", "liste", "brutto", "katalogpreis", "uvp",
    "listprice", "preisliste"],
  ek_preis: ["ek", "ekpreis", "einkaufspreis", "nettopreis", "netto", "ihrpreis", "ihrnettopreis", "preisnetto", "nettoek",
    "ekpreisnetto", "nettoeinkaufspreis", "preis", "einzelpreis", "stueckpreis", "price"],
  preiseinheit: ["preiseinheit", "pe", "preisje", "preispro", "per", "priceunit", "preismenge", "preiseinh"],
  hersteller: ["hersteller", "herstellername", "marke", "fabrikat", "manufacturer", "brand"],
  hersteller_nr: ["herstellernummer", "herstellernr", "herstellerartikelnummer", "herstellerartikelnr", "herstellerartnr",
    "herstellerbestellnummer", "artikelnummerhersteller", "typ", "typnummer", "typennummer", "mpn", "fabrikatsnummer"],
  warengruppe: ["warengruppe", "wg", "warengr", "hauptwarengruppe", "hwg", "artikelgruppe", "produktgruppe", "gruppe",
    "warengruppenname"],
  rabattgruppe: ["rabattgruppe", "rabgr", "rabattgr", "rg", "rabattcode", "rabattschluessel"],
};

/** Teil-Treffer, wenn kein Name exakt passt — Reihenfolge zählt (Hersteller-Nr. vor Artikelnummer). */
const TEILREGELN: [CsvFeld, (n: string) => boolean][] = [
  ["hersteller_nr", (n) => n.includes("hersteller") && (n.includes("nr") || n.includes("nummer"))],
  ["ean", (n) => n.includes("ean") || n.includes("gtin")],
  ["rabattgruppe", (n) => n.includes("rabattgr") || n.includes("rabgr")],
  ["preiseinheit", (n) => n.includes("preiseinheit")],
  ["listenpreis", (n) => n.includes("listenpreis") || n.includes("brutto")],
  ["ek_preis", (n) => n.includes("netto") || n.includes("einkauf") || n.startsWith("ek")],
  ["warengruppe", (n) => n.includes("warengr")],
  ["hersteller", (n) => n.includes("hersteller")],
  ["artikelnummer", (n) => n.includes("artikelnummer") || n.includes("artnr") || n.includes("artikelnr")],
  ["langtext", (n) => n.includes("langtext") || n.includes("beschreibung")],
  ["bezeichnung2", (n) => (n.includes("bezeichnung") || n.includes("kurztext")) && n.endsWith("2")],
  ["bezeichnung", (n) => n.includes("bezeichnung") || n.includes("kurztext")],
  ["einheit", (n) => n.includes("einheit")],
  ["ek_preis", (n) => n.includes("preis")],
];

/** Spalten automatisch zuordnen: erst exakte Namen, dann Teil-Treffer. Jede Spalte höchstens einmal. */
export function spaltenZuordnen(kopf: string[]): Zuordnung {
  const namen = kopf.map(spaltenName);
  const z: Zuordnung = {};
  const vergeben = new Set<number>();
  for (const f of CSV_FELDER) {
    for (const alias of ALIASE[f.feld]) {
      const i = namen.findIndex((n, j) => n === alias && !vergeben.has(j));
      if (i >= 0) {
        z[f.feld] = i;
        vergeben.add(i);
        break;
      }
    }
  }
  namen.forEach((n, i) => {
    if (vergeben.has(i) || !n) return;
    const regel = TEILREGELN.find(([feld, passt]) => z[feld] === undefined && passt(n));
    if (regel) {
      z[regel[0]] = i;
      vergeben.add(i);
    }
  });
  return z;
}

/**
 * Kopfzeile finden: die Zeile unter den ersten 15 mit den meisten
 * erkannten Spalten (Titelzeilen davor werden übersprungen). -1 = keine.
 */
export function kopfzeileFinden(zeilen: string[][]): number {
  let best = -1;
  let bestAnzahl = 1;
  zeilen.slice(0, 15).forEach((z, i) => {
    const zu = spaltenZuordnen(z);
    const anzahl = Object.keys(zu).length;
    if (anzahl > bestAnzahl && (zu.bezeichnung !== undefined || zu.artikelnummer !== undefined)) {
      best = i;
      bestAnzahl = anzahl;
    }
  });
  return best;
}

// ── Zeilen → Artikel ───────────────────────────────────────────────────

const eanAus = (roh: string) => {
  const e = (roh ?? "").replace(/[\s']/g, "").replace(/\.0+$/, "");
  // Excel macht aus langen Zahlen gern »4,01234E+12« — das ist keine EAN mehr
  return /^\d{8,14}$/.test(e) && !/^0+$/.test(e) ? e : "";
};

/** »100«, »100 Stk«, »per 100« → 100; sonst 1 */
const preiseinheitAus = (roh: string) => {
  const m = (roh ?? "").match(/\d+(?:[.,]\d+)?/);
  const n = m ? Number(m[0].replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export interface CsvAuswertung {
  artikel: ImportArtikel[];
  ohneNummer: number;
  ohneBezeichnung: number;
}

/** Datenzeilen (nach der Kopfzeile) mit der Zuordnung in Artikel verwandeln. */
export function csvArtikel(zeilen: string[][], kopf: number, zu: Zuordnung, von = kopf + 1, bis = zeilen.length,
  formate?: { liste: ZahlenFormat; ek: ZahlenFormat }): CsvAuswertung {
  const wert = (f: string[], feld: CsvFeld) => {
    const i = zu[feld];
    return i === undefined ? "" : (f[i] ?? "").trim();
  };
  const fm = formate ?? spaltenFormate(zeilen, kopf, zu);
  const erg: CsvAuswertung = { artikel: [], ohneNummer: 0, ohneBezeichnung: 0 };
  for (let r = Math.max(von, kopf + 1); r < Math.min(bis, zeilen.length); r++) {
    const f = zeilen[r];
    const nr = wert(f, "artikelnummer");
    const bez = kurztextVerbinden(wert(f, "bezeichnung"), wert(f, "bezeichnung2"));
    if (!nr) {
      erg.ohneNummer++;
      continue;
    }
    if (!bez) {
      erg.ohneBezeichnung++;
      continue;
    }
    const pe = zu.preiseinheit === undefined ? 1 : preiseinheitAus(wert(f, "preiseinheit"));
    const preis = (roh: string, format: ZahlenFormat) => {
      if (!roh) return null;
      const n = dezimalLesenFormat(roh, format);
      return n === null || n <= 0 ? null : Math.round((n / pe) * 10000) / 10000;
    };
    erg.artikel.push({
      artikelnummer: nr,
      bezeichnung: bez,
      langtext: wert(f, "langtext").replace(/\r\n?/g, "\n") || null,
      einheit: einheitNorm(wert(f, "einheit")) || "Stk",
      ean: eanAus(wert(f, "ean")) || null,
      hersteller: wert(f, "hersteller") || null,
      hersteller_nr: wert(f, "hersteller_nr") || null,
      warengruppe: wert(f, "warengruppe") || null,
      rabattgruppe: wert(f, "rabattgruppe") || null,
      listenpreis: preis(wert(f, "listenpreis"), fm.liste),
      netto: preis(wert(f, "ek_preis"), fm.ek),
    });
  }
  return erg;
}

/** Zahlenschreibweise der beiden Preisspalten (über höchstens 2000 Zeilen) */
export function spaltenFormate(zeilen: string[][], kopf: number, zu: Zuordnung): { liste: ZahlenFormat; ek: ZahlenFormat } {
  const probe = zeilen.slice(kopf + 1, kopf + 2001);
  const spalte = (i: number | undefined) => (i === undefined ? [] : probe.map((f) => f[i] ?? ""));
  return { liste: zahlenFormatErkennen(spalte(zu.listenpreis)), ek: zahlenFormatErkennen(spalte(zu.ek_preis)) };
}

/** Wie csvArtikel, aber in Häppchen mit Pausen — für Listen mit Hunderttausenden Zeilen. */
export async function csvArtikelStueckweise(zeilen: string[][], kopf: number, zu: Zuordnung,
  abbrechen?: () => boolean): Promise<CsvAuswertung | null> {
  const formate = spaltenFormate(zeilen, kopf, zu);
  const gesamt: CsvAuswertung = { artikel: [], ohneNummer: 0, ohneBezeichnung: 0 };
  const STUECK = 5000;
  for (let von = kopf + 1; von < zeilen.length; von += STUECK) {
    if (abbrechen?.()) return null;
    const teil = csvArtikel(zeilen, kopf, zu, von, von + STUECK, formate);
    for (const a of teil.artikel) gesamt.artikel.push(a);
    gesamt.ohneNummer += teil.ohneNummer;
    gesamt.ohneBezeichnung += teil.ohneBezeichnung;
    await pause();
  }
  return gesamt;
}
