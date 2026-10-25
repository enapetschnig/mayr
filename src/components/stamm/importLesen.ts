import type { ImportArtikel } from "@/lib/artikelImport";
import {
  CsvLeser, csvArtikelStueckweise, kopfzeileFinden, spaltenZuordnen, trennzeichenErkennen,
  type CsvAuswertung, type Trennzeichen, type Zuordnung,
} from "@/lib/csvImport";
import {
  datanormDateiart, datanormDateienLesen, dateiText, textStueckweise, zeichensatzErkennenStueckweise,
  type DatanormArtikel, type DatanormErgebnis, type Fortschritt, type Zeichensatz,
} from "@/lib/datanorm";

/**
 * Importdateien erkennen und lesen — ohne Oberfläche, damit es testbar
 * bleibt. Datanorm (eine oder mehrere Dateien eines Lieferanten) oder genau
 * eine CSV-Datei; ZIP und Excel bekommen einen verständlichen Hinweis.
 */

export interface RohDatei {
  name: string;
  daten: Uint8Array;
}

/** Fehler mit einem Satz für den Benutzer */
export class ImportFehler extends Error {}

const KOPF = 64 * 1024;

export type DateiArt = "datanorm" | "text" | "zip" | "excel" | "leer" | "bild" | "pdf" | "unicode" | "binaer";

const beginntMit = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const ascii = (b: Uint8Array, von: number, bis: number) => String.fromCharCode(...b.subarray(von, bis));

export function dateiArt(d: RohDatei): DateiArt {
  const b = d.daten;
  if (!b.length) return "leer";
  const name = d.name.toLowerCase();
  // ZIP-Kennung »PK\3\4« — auch .xlsx ist innen ein ZIP
  if (beginntMit(b, 0x50, 0x4b, 0x03, 0x04)) return /\.(xlsx|xlsm|ods)$/.test(name) ? "excel" : "zip";
  if (beginntMit(b, 0xd0, 0xcf, 0x11, 0xe0)) return "excel"; // altes .xls
  if (beginntMit(b, 0xff, 0xd8, 0xff) || beginntMit(b, 0x89, 0x50, 0x4e, 0x47) || ascii(b, 0, 4) === "GIF8"
    || (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") || /^ftyp(hei|hev|mif|avi)/.test(ascii(b, 4, 11))) return "bild";
  if (ascii(b, 0, 5) === "%PDF-") return "pdf";
  // Excel „Unicode-Text“ ist UTF-16 — dafür hat der Leser keinen Zeichensatz
  if (beginntMit(b, 0xff, 0xfe) || beginntMit(b, 0xfe, 0xff)) return "unicode";
  // Steuerzeichen außer Tab, Zeilenende, Seitenvorschub und DOS-Dateiende gibt es in Text nicht
  const probe = b.subarray(0, 4096);
  let steuer = 0;
  for (const x of probe) if (x < 0x20 && x !== 0x09 && x !== 0x0a && x !== 0x0d && x !== 0x0c && x !== 0x1a) steuer++;
  if (steuer > Math.max(8, probe.length * 0.02)) return "binaer";
  return datanormDateiart(dateiText(b.subarray(0, KOPF))) ? "datanorm" : "text";
}

/** Satz für eine Datei, die weder Datanorm noch CSV ist — null = lesbar */
function fremdText(d: RohDatei, art: DateiArt): string | null {
  switch (art) {
    case "bild":
      return `„${d.name}“ ist ein Bild, keine Artikelliste. Bitte die Datanorm- oder CSV-Datei des Lieferanten wählen.`;
    case "pdf":
      return `„${d.name}“ ist eine PDF-Datei. Preislisten als PDF lassen sich nicht einlesen — bitte beim Lieferanten Datanorm oder eine CSV-Liste anfordern.`;
    case "unicode":
      return `„${d.name}“ ist als „Unicode-Text“ gespeichert. In Excel „Speichern unter“ → „CSV UTF-8 (durch Trennzeichen getrennt)“ wählen und diese Datei importieren.`;
    case "binaer":
      return `„${d.name}“ ist keine Textdatei und lässt sich nicht einlesen. Gebraucht wird Datanorm (.001, .dat, .txt) oder eine CSV-Liste.`;
    default:
      return null;
  }
}

export interface DatanormGelesen {
  art: "datanorm";
  /** Ergebnis ohne die Artikelliste (die steht umgewandelt in `artikel`) */
  ergebnis: Omit<DatanormErgebnis, "artikel">;
  artikel: ImportArtikel[];
  zeichensatz: Zeichensatz;
  /** Dateien, die keine Datanorm-Dateien sind (Liesmich o. ä.) — übergangen */
  uebergangen: string[];
}

export interface CsvGelesen {
  art: "csv";
  datei: string;
  zeichensatz: Zeichensatz;
  trennzeichen: Trennzeichen;
  zeilen: string[][];
  /** Index der Kopfzeile */
  kopf: number;
  kopfErkannt: boolean;
  zuordnung: Zuordnung;
  auswertung: CsvAuswertung;
}

export type Gelesen = DatanormGelesen | CsvGelesen;

export interface LeseOptionen {
  /** vorgegeben statt erkannt */
  zeichensatz?: Zeichensatz;
  trennzeichen?: Trennzeichen;
  fortschritt?: Fortschritt;
}

/** Warengruppe: der Name aus der Warengruppendatei liest sich besser als die Nummer */
export const datanormZuImport = (a: DatanormArtikel): ImportArtikel => ({
  artikelnummer: a.artikelnummer,
  bezeichnung: a.bezeichnung,
  langtext: null,
  einheit: a.einheit,
  ean: a.ean || null,
  hersteller: null,
  hersteller_nr: null,
  warengruppe: a.warengruppeName || a.warengruppe || null,
  rabattgruppe: a.rabattgruppe || null,
  listenpreis: a.listenpreis,
  netto: a.netto,
});

export async function importLesen(dateien: RohDatei[], opt: LeseOptionen = {}): Promise<Gelesen> {
  if (!dateien.length) throw new ImportFehler("Keine Datei gewählt.");
  const arten = dateien.map((d) => ({ d, art: dateiArt(d) }));
  const excel = arten.find((x) => x.art === "excel");
  if (excel) {
    throw new ImportFehler(`„${excel.d.name}“ ist eine Excel-Datei. In Excel „Speichern unter“ → „CSV (Trennzeichen-getrennt)“ wählen und die CSV-Datei importieren.`);
  }
  const zip = arten.find((x) => x.art === "zip");
  if (zip) throw new ImportFehler(`„${zip.d.name}“ ist ein ZIP-Archiv. Bitte zuerst entpacken und die Dateien darin wählen.`);
  const mitInhalt = arten.filter((x) => x.art !== "leer");
  if (!mitInhalt.length) throw new ImportFehler(dateien.length === 1 ? "Die Datei ist leer." : "Die Dateien sind leer.");

  const datanorm = mitInhalt.filter((x) => x.art === "datanorm").map((x) => x.d);
  const text = mitInhalt.filter((x) => x.art === "text").map((x) => x.d);
  // Bild, PDF …: neben Datanorm-Dateien übergangen (Logo, Liesmich), allein ein klarer Satz
  const fremd = mitInhalt.filter((x) => fremdText(x.d, x.art));

  if (datanorm.length) {
    const e = await datanormDateienLesen(datanorm, { zeichensatz: opt.zeichensatz, fortschritt: opt.fortschritt });
    if (!e.artikel.length) {
      const hatArtikeldatei = e.dateien.some((d) => d.art === "artikel");
      throw new ImportFehler(hatArtikeldatei
        ? "In der Datei steht kein Artikel, der übernommen werden kann."
        : "Das sind nur Preise, Rabatte oder Warengruppen. Bitte die Artikeldatei (meist .001) mit auswählen — die Preise werden dann zugeordnet.");
    }
    const { artikel, zeichensaetze, ...rest } = e;
    return {
      art: "datanorm",
      ergebnis: rest,
      artikel: artikel.map(datanormZuImport),
      zeichensatz: zeichensaetze[0],
      uebergangen: [...text, ...fremd.map((x) => x.d)].map((d) => d.name),
    };
  }

  if (fremd.length) throw new ImportFehler(fremdText(fremd[0].d, fremd[0].art)!);
  if (text.length > 1) throw new ImportFehler("Bitte nur eine CSV-Datei auf einmal wählen (mehrere Dateien gehen nur bei Datanorm).");
  return csvLesen(text[0], opt);
}

async function csvLesen(d: RohDatei, opt: LeseOptionen): Promise<CsvGelesen> {
  // Anteile am Fortschritt: Zeichensatz erkennen 30 %, zerlegen 60 %, auswerten 10 %
  const erkennen = opt.zeichensatz ? 0 : 0.3;
  const zeichensatz = opt.zeichensatz
    ?? await zeichensatzErkennenStueckweise(d.daten, (a) => opt.fortschritt?.(a * erkennen));
  const kopfText = dateiText(d.daten.subarray(0, KOPF), zeichensatz);
  const trennzeichen = opt.trennzeichen ?? trennzeichenErkennen(kopfText.split(/\r\n|\n|\r/).slice(0, 40));
  const leser = new CsvLeser(trennzeichen);
  await textStueckweise(d.daten, zeichensatz, (t) => leser.text(t.replace(/\u001A/g, "")),
    (a) => opt.fortschritt?.(erkennen + a * (0.9 - erkennen)));
  const zeilen = leser.ende();
  if (!zeilen.length) throw new ImportFehler("In der Datei steht nichts, was sich lesen lässt.");
  const gefunden = kopfzeileFinden(zeilen);
  const kopf = Math.max(0, gefunden);
  const zuordnung = gefunden >= 0 ? spaltenZuordnen(zeilen[kopf]) : {};
  const auswertung = (await csvArtikelStueckweise(zeilen, kopf, zuordnung))!;
  opt.fortschritt?.(1);
  return { art: "csv", datei: d.name, zeichensatz, trennzeichen, zeilen, kopf, kopfErkannt: gefunden >= 0, zuordnung, auswertung };
}

/** Rabattgruppen der Datei mit Anzahl Artikel und — falls die Datei sie mitbringt — Name und Rabatt */
export interface Rabattgruppe {
  code: string;
  name: string;
  anzahl: number;
  rabatt: number | null;
}

export function rabattgruppenAus(artikel: ImportArtikel[], ausDatei: { code: string; name: string; rabatt: number }[] = []): Rabattgruppe[] {
  const anzahl = new Map<string, number>();
  for (const a of artikel) if (a.rabattgruppe) anzahl.set(a.rabattgruppe, (anzahl.get(a.rabattgruppe) ?? 0) + 1);
  const info = new Map(ausDatei.map((r) => [r.code, r]));
  return [...anzahl.entries()]
    .map(([code, n]) => ({ code, name: info.get(code)?.name ?? "", anzahl: n, rabatt: info.get(code)?.rabatt ?? null }))
    .sort((a, b) => a.code.localeCompare(b.code, "de", { numeric: true }));
}
