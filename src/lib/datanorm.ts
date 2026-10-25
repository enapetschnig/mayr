/**
 * DATANORM 4 und 5 lesen — so liefern die Elektro-Großhändler ihre Artikel
 * und Preise. Nach einem an Händler-Lieferungen erprobten Leser; hier ohne
 * Staffelpreise und Packungs-Umrechnung, weil der Artikelstamm dafür keine
 * Spalten hat.
 *
 * Satzarten (Feldnummern 0-basiert nach dem Zerlegen an „;“):
 *   V  Vorlauf. DN5 »V;050;A;Datum;EUR;Text;…;Firma(8)«, DN4 feste Breite »V 220726 … 04EUR«
 *   A  Artikel
 *      DN4: A;Kz;Nr;Textkz;KT1;KT2;PK;PE-Code;ME;Preis;RabGr;HWG;…
 *           PE-Code 0 = je 1, 1 = je 10, 2 = je 100, 3 = je 1000
 *      DN5: A;Kz;Nr;KT1;KT2;ME;PK;PE-Menge;Preis;RabGr;HWG;WG;Matchcode;…;EAN(18)
 *           PE ist hier die Menge selbst (1/10/100/1000)
 *      PK 1 = Listenpreis (Rabatt noch abziehen), 2 = Nettopreis
 *      Preis: ganze Zahl mit zwei impliziten Nachkommastellen (»4300« = 43,00)
 *      Kz L = Artikel gelöscht
 *   B  Zusatz (DN4): Matchcode(3), EAN(9), Warengruppe(11)
 *   P  Preise (DATPREIS)
 *      DN4: P;A;[Nr;PK;Preis;RabKz;R1;R2;R3(;…)] × bis zu 3 – Blocklänge 7 oder 9
 *      DN5: P;Nr;PK;PE-Menge;Preis;RabGr;RabKz1;R1;RabKz2;R2;RabKz3;R3;Datum
 *           RabKz 1 = Rabatt in % mit zwei Nachkommastellen (»4500« = 45 %)
 *   S  Warengruppen (.WRG) – DN5: S;HWG;WG;Name   DN4: S;Kz;HWG;HWG-Name;WG;WG-Name
 *   R  Rabattgruppen (.RAB) – R;Code;Kz;Rabatt;Name
 *   T/D/Z/E  Langtexte, Zuschläge, Dateiende – für den Stamm nicht gebraucht
 *
 * Mehrere Dateien eines Lieferanten (DATANORM.001 + DATPREIS + .RAB + .WRG)
 * werden gemeinsam gelesen, die Reihenfolge ist egal. Preis 0 oder leer =
 * „ohne Preis“ – nie als 0 € übernehmen.
 *
 * Große Dateien (50 MB und mehr) laufen häppchenweise mit einer kurzen Pause
 * nach jedem Megabyte, damit der Browser dazwischen zeichnen kann.
 */

// ── Zeichensätze ────────────────────────────────────────────────────────
// TextDecoder kennt kein CP850 (nicht im WHATWG-Standard) — die obere
// Hälfte steht deshalb hier als Tabelle.

export type Zeichensatz = "utf-8" | "cp850" | "windows-1252";

export const ZEICHENSATZ_TEXT: Record<Zeichensatz, string> = {
  "utf-8": "UTF-8",
  cp850: "DOS (CP850)",
  "windows-1252": "Windows (1252)",
};

const CP850_OBEN =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ";

const CP850 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 128; i++) t[i] = i;
  for (let i = 0; i < 128; i++) t[128 + i] = CP850_OBEN.charCodeAt(i);
  return t;
})();

/** Ein Megabyte je Häppchen — groß genug für Tempo, klein genug fürs Zeichnen. */
export const HAEPPCHEN = 1 << 20;

/** Kurz die Hand abgeben, damit Fortschrittsbalken und Knöpfe reagieren. */
export const pause = () => new Promise<void>((r) => setTimeout(r));

export type Fortschritt = (anteil: number) => void;

/**
 * Zählt die typischen Umlaut-Bytes beider Welten: DOS (ü=81 ä=84 ö=94 Ä=8E
 * Ö=99 Ü=9A ß=E1) gegen Windows (ä=E4 ö=F6 ü=FC Ä=C4 Ö=D6 Ü=DC ß=DF).
 */
class Umlautzaehler {
  dos = 0;
  win = 0;
  steuer = 0;
  zaehlen(b: Uint8Array) {
    for (let i = 0; i < b.length; i++) {
      const x = b[i];
      if (x < 0x80) continue;
      if (x === 0x81 || x === 0x84 || x === 0x94 || x === 0x8e || x === 0x99 || x === 0x9a || x === 0xe1) this.dos++;
      else if (x === 0xe4 || x === 0xf6 || x === 0xfc || x === 0xc4 || x === 0xd6 || x === 0xdc || x === 0xdf) this.win++;
      else if (x <= 0x9f) this.steuer++; // in Windows-1252 selten (€ „ “ – …), in DOS Buchstaben
    }
  }
  urteil(): Zeichensatz {
    if (this.dos > this.win) return "cp850";
    if (this.win > this.dos) return "windows-1252";
    return this.steuer > 0 ? "cp850" : "windows-1252";
  }
}

const alsBytes = (d: ArrayBuffer | Uint8Array) => (d instanceof Uint8Array ? d : new Uint8Array(d));

/** Welcher Zeichensatz passt? Gültiges UTF-8 zuerst, sonst DOS oder Windows nach den Umlaut-Bytes. */
export function zeichensatzErkennen(daten: ArrayBuffer | Uint8Array): Zeichensatz {
  const b = alsBytes(daten);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return "utf-8";
  } catch {
    /* kein UTF-8 */
  }
  const z = new Umlautzaehler();
  z.zaehlen(b);
  return z.urteil();
}

/** Wie zeichensatzErkennen, aber häppchenweise — für große Dateien. */
export async function zeichensatzErkennenStueckweise(daten: Uint8Array, fortschritt?: Fortschritt): Promise<Zeichensatz> {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const z = new Umlautzaehler();
  let istUtf8 = true;
  for (let i = 0; i < daten.length; i += HAEPPCHEN) {
    const teil = daten.subarray(i, i + HAEPPCHEN);
    const letztes = i + HAEPPCHEN >= daten.length;
    if (istUtf8) {
      try {
        utf8.decode(teil, { stream: !letztes });
      } catch {
        istUtf8 = false;
      }
    }
    z.zaehlen(teil);
    fortschritt?.(Math.min(1, (i + teil.length) / daten.length));
    await pause();
  }
  return istUtf8 ? "utf-8" : z.urteil();
}

/** Dekodiert Häppchen für Häppchen; bei UTF-8 bleibt ein zerschnittenes Zeichen fürs nächste Häppchen liegen. */
function dekodierer(zs: Zeichensatz): (teil: Uint8Array, letztes: boolean) => string {
  if (zs === "cp850") {
    const utf16 = new TextDecoder("utf-16le");
    return (teil) => {
      const u = new Uint16Array(teil.length);
      for (let i = 0; i < teil.length; i++) u[i] = CP850[teil[i]];
      return utf16.decode(u);
    };
  }
  const d = new TextDecoder(zs);
  return (teil, letztes) => d.decode(teil, { stream: !letztes });
}

/** Ganzer Text in einem Zug (Tests, kleine Dateien, Kopf einer Datei). */
export function dateiText(daten: ArrayBuffer | Uint8Array, zeichensatz?: Zeichensatz): string {
  const b = alsBytes(daten);
  const text = dekodierer(zeichensatz ?? zeichensatzErkennen(b))(b, true);
  return text.replace(/^﻿/, "").replace(/\u001A+\s*$/, "");
}

/**
 * Text häppchenweise an `proStueck` geben (Bytes → Zeichen). Zwischen den
 * Häppchen eine Pause, damit die Seite bedienbar bleibt.
 */
export async function textStueckweise(
  daten: Uint8Array,
  zeichensatz: Zeichensatz,
  proStueck: (text: string) => void,
  fortschritt?: Fortschritt,
): Promise<void> {
  const dek = dekodierer(zeichensatz);
  let erstes = true;
  if (daten.length === 0) return;
  for (let i = 0; i < daten.length; i += HAEPPCHEN) {
    const teil = daten.subarray(i, i + HAEPPCHEN);
    let text = dek(teil, i + HAEPPCHEN >= daten.length);
    if (erstes) {
      text = text.replace(/^﻿/, "");
      erstes = false;
    }
    proStueck(text);
    fortschritt?.(Math.min(1, (i + teil.length) / daten.length));
    await pause();
  }
}

/** Zeilenweise lesen: jede nicht-leere Zeile an `proZeile`, über Häppchengrenzen hinweg. */
export async function zeilenStueckweise(
  daten: Uint8Array,
  zeichensatz: Zeichensatz,
  proZeile: (zeile: string) => void,
  fortschritt?: Fortschritt,
): Promise<void> {
  let rest = "";
  await textStueckweise(daten, zeichensatz, (text) => {
    const zeilen = (rest + text).split(/\r\n|\n|\r/);
    rest = zeilen.pop() ?? "";
    for (const z of zeilen) {
      const s = z.replace(/\u001A/g, "");
      if (s.trim()) proZeile(s);
    }
  }, fortschritt);
  const s = rest.replace(/\u001A/g, "");
  if (s.trim()) proZeile(s);
}

// ── Erkennen ───────────────────────────────────────────────────────────

export type DatanormVersion = 4 | 5;
export type DatanormDateiart = "artikel" | "preise" | "warengruppen" | "rabatt";

const zeilenVon = (text: string) =>
  text.split(/\r\n|\n|\r/).map((z) => z.replace(/\u001A/g, "")).filter((z) => z.trim());
const satzart = (z: string) => (/^[A-Z][;\s]/.test(z) ? z[0] : "");

/** Version aus dem Vorlauf: DN5 »V;050;…«, DN4 fest »V 220726 … 04EUR« bzw. »V;040;…«. */
export function versionAusVorlauf(zeile: string): DatanormVersion | null {
  const m = zeile.match(/^V;0?(\d)0;/);
  if (m) return m[1] === "5" ? 5 : 4;
  if (/^V\s/.test(zeile)) return /05\s*EUR\s*$/i.test(zeile) ? 5 : 4;
  return null;
}

/** Version an einem A-Satz: DN4 hat ein zweistelliges Textkennzeichen an Stelle 3 und das Preiskennzeichen an Stelle 6. */
const versionAusA = (f: string[]): DatanormVersion =>
  /^\d{2}$/.test((f[3] ?? "").trim()) && /^[12]$/.test((f[6] ?? "").trim()) ? 4 : 5;

/** Art einer DATANORM-Datei (Artikel, Preise, Warengruppen, Rabatte) oder null = keine DATANORM-Datei. */
export function datanormDateiart(text: string): DatanormDateiart | null {
  const zeilen = zeilenVon(text).slice(0, 60);
  if (!zeilen.length || !zeilen.every((z) => satzart(z))) return null;
  const arten = new Set(zeilen.map(satzart));
  if (zeilen.some((z) => /^A;[NLAX];/.test(z))) return "artikel";
  if (zeilen.some((z) => /^P;/.test(z))) return "preise";
  if (arten.has("S")) return "warengruppen";
  if (arten.has("R")) return "rabatt";
  return null;
}

export const istDatanorm = (text: string) => datanormDateiart(text) !== null;

// ── Werte ──────────────────────────────────────────────────────────────

const t = (s: string | undefined) => (s ?? "").trim();
const rund4 = (n: number) => Math.round(n * 10000) / 10000;

/** Preis: ganze Zahl mit zwei impliziten Nachkommastellen; 0 oder leer = ohne Preis. */
function preisAus(roh: string | undefined): number | null {
  const s = t(roh);
  if (!s) return null;
  // Abweichende Dateien schreiben den Preis mit Komma oder Punkt aus
  const n = /^-?\d+$/.test(s)
    ? Number(s) / 100
    : Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return !Number.isFinite(n) || n <= 0 ? null : n;
}

/** DN4: Preiseinheit als Code (0–3 → 1/10/100/1000) */
function teilerAusCode(roh: string | undefined): number {
  const n = Number(t(roh));
  if (!Number.isFinite(n) || n < 0) return 1;
  return Number.isInteger(n) && n <= 3 ? 10 ** n : n;
}

/** DN5: Preiseinheit als Menge (1/10/100/1000) */
function teilerAusMenge(roh: string | undefined): number {
  const n = Number(t(roh).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const eanAus = (roh: string | undefined) => {
  const e = (roh ?? "").replace(/\s/g, "");
  return /^\d{8,14}$/.test(e) && !/^0+$/.test(e) ? e : "";
};

/** Mengeneinheiten (UN/ECE-Codes und Händler-Kürzel) auf die Einheiten der App */
const EINHEIT_CODES: Record<string, string> = {
  PCE: "Stk", STK: "Stk", STCK: "Stk", ST: "Stk", "STÜCK": "Stk", STUECK: "Stk", C62: "Stk", H87: "Stk", EA: "Stk",
  MTR: "m", M: "m", LFM: "m", LM: "m",
  MTK: "m²", QM: "m²", M2: "m²", "M²": "m²",
  MTQ: "m³", CBM: "m³", M3: "m³", "M³": "m³",
  KGM: "kg", KG: "kg", TNE: "t", TO: "t",
  LTR: "l", L: "l",
  HUR: "h", STD: "h",
  PR: "Paar", PAA: "Paar",
  SET: "Set",
  PK: "Pkg", PKG: "Pkg", PG: "Pkg", PAC: "Pkg", PCK: "Pkg", PAK: "Pkg",
  RO: "Rolle", ROL: "Rolle", RL: "Rolle", RLL: "Rolle",
  KTU: "Karton", KT: "Karton", CT: "Karton", KAR: "Karton",
  PSCH: "Psch",
};

/** Mengeneinheit vereinheitlichen; Unbekanntes bleibt wie geliefert. */
export function einheitNorm(roh: string): string {
  const s = (roh ?? "").trim().replace(/\.$/, "");
  if (!s) return "";
  return EINHEIT_CODES[s.toUpperCase()] ?? s;
}

/** Kurztext 1 + 2: ein am Feldende (40 Zeichen) getrenntes Wort wieder zusammensetzen. */
export function kurztextVerbinden(kt1: string, kt2: string): string {
  const a = (kt1 ?? "").replace(/\s+$/, "");
  const b = (kt2 ?? "").trim();
  if (!a.trim()) return b;
  if (!b) return a.trim();
  const getrennt = (kt1 ?? "").length >= 40 && /[A-Za-zÄÖÜäöüß]$/.test(kt1) && /^[a-zäöüß]/.test(b);
  return (getrennt ? a + b : `${a.trim()} ${b}`).replace(/\s+/g, " ").trim();
}

// ── Lesen ──────────────────────────────────────────────────────────────

export interface DatanormArtikel {
  artikelnummer: string;
  /** Kurztext 1 + 2 */
  bezeichnung: string;
  /** Einheit der App (PCE → Stk, MTR → m …) */
  einheit: string;
  /** Mengeneinheit wie in der Datei */
  einheitRoh: string;
  /** Listenpreis je 1 Einheit (PK 1), null = keiner */
  listenpreis: number | null;
  /** Nettopreis je 1 Einheit (PK 2 oder Liste − Rabatt aus der Preisdatei), null = keiner */
  netto: number | null;
  /** Rabatt aus der Preisdatei in %, sonst null */
  rabattDatei: number | null;
  /** Der Preis in der Datei galt je … Einheiten (ist schon geteilt) */
  preiseinheit: number;
  rabattgruppe: string;
  hauptwarengruppe: string;
  /** feinste bekannte Warengruppe (DN5 WG, DN4 aus dem B-Satz, sonst Hauptwarengruppe) */
  warengruppe: string;
  /** Name der Warengruppe aus der .WRG, sonst leer */
  warengruppeName: string;
  ean: string;
}

export interface DatanormRabattgruppe {
  code: string;
  name: string;
  /** in % */
  rabatt: number;
}

export interface DatanormErgebnis {
  artikel: DatanormArtikel[];
  version: DatanormVersion | null;
  /** Lieferant laut Vorlauf — Vorschlag für den Lieferanten-Namen */
  firma: string;
  vorlauf: string;
  rabattgruppen: DatanormRabattgruppe[];
  /** als gelöscht gekennzeichnete Artikel (nicht übernommen) */
  geloescht: number;
  /** Artikel ohne Text (nicht übernommen) */
  ohneText: number;
  ohnePreis: number;
  /** Preise in der Preisdatei ohne passenden Artikel */
  preiseOhneArtikel: number;
  dateien: { name: string; art: DatanormDateiart | null; version: DatanormVersion | null; saetze: number }[];
}

interface Roh {
  nr: string;
  kt1: string;
  kt2: string;
  me: string;
  teiler: number;
  rabattgruppe: string;
  hwg: string;
  wg: string;
  ean: string;
  liste: number | null;
  netto: number | null;
  rabatt: number | null;
  /** Preise aus P-Sätzen (gehen vor den A-Satz-Preisen) */
  pListe: number | null;
  pNetto: number | null;
  geloescht: boolean;
}

const rohLeer = (nr: string): Roh => ({
  nr, kt1: "", kt2: "", me: "", teiler: 1, rabattgruppe: "", hwg: "", wg: "", ean: "",
  liste: null, netto: null, rabatt: null, pListe: null, pNetto: null, geloescht: false,
});

/** Preis (je Preiseinheit) in Liste/Netto einsortieren — „ohne Preis“ überschreibt nie. */
function preisSetzen(r: Roh, pk: string, preis: number | null, ausP: boolean, rabatt: number | null = null) {
  if (preis === null) return;
  const je1 = rund4(preis / r.teiler);
  if (pk === "2") {
    if (ausP) r.pNetto = je1;
    else r.netto = je1;
    return;
  }
  if (ausP) {
    r.pListe = je1;
    if (rabatt && rabatt > 0 && rabatt < 100) {
      r.pNetto = rund4(je1 * (1 - rabatt / 100));
      r.rabatt = rabatt;
    }
  } else r.liste = je1;
}

type PSatz = { nr: string; pk: string; preis: number | null; teiler: number | null; rabatt: number | null };

/**
 * Liest DATANORM Zeile für Zeile. Mehrere Dateien eines Lieferanten gehen
 * durch denselben Leser; Preise (P-Sätze) und Zusätze (B-Sätze) werden erst
 * am Ende den Artikeln zugeordnet, die Reihenfolge der Dateien ist egal.
 */
export class DatanormLeser {
  private roh = new Map<string, Roh>();
  private pSaetze: PSatz[] = [];
  private bZusatz = new Map<string, { ean: string; wg: string }>();
  private wg = new Map<string, { hauptwarengruppe: string; warengruppe: string; name: string }>();
  private rabattgruppen: DatanormRabattgruppe[] = [];
  private dateiInfo: DatanormErgebnis["dateien"] = [];
  private vorlauf = "";
  private firma = "";
  private version: DatanormVersion | null = null;
  private v: DatanormVersion | null = null;
  private saetze = 0;
  private name = "";

  dateiBeginnen(name = "") {
    this.name = name;
    this.v = null;
    this.saetze = 0;
  }

  dateiBeenden(art: DatanormDateiart | null) {
    this.version = this.version ?? this.v;
    this.dateiInfo.push({ name: this.name, art, version: this.v, saetze: this.saetze });
  }

  zeile(zeile: string) {
    const art = satzart(zeile);
    if (!art) return;
    const f = zeile.split(";");
    if (art === "V") {
      this.v = versionAusVorlauf(zeile) ?? this.v;
      const text = /^V;/.test(zeile)
        ? f.slice(3).map((x) => x.trim()).filter((x) => x && !/^(EUR|[A-Z])$/.test(x)).join(" · ")
        : zeile.replace(/^V\s*/, "").replace(/\s{2,}/g, " · ").replace(/\s*·?\s*0[45]EUR\s*$/i, "").trim();
      if (!this.vorlauf) this.vorlauf = text;
      if (!this.firma) {
        this.firma = /^V;/.test(zeile)
          ? t(f[8])
          : zeile.replace(/^V\s*\d{6}/, "").replace(/0[45]\s*EUR\s*$/i, "").split(/\s{2,}|;/).map((x) => x.trim())
            .find((x) => x && !/artikel|preis|diskette|anlage|datei|^\d+$/i.test(x)) ?? "";
      }
      return;
    }
    if (art === "A") {
      this.saetze++;
      const ver = this.v ?? versionAusA(f);
      this.v = this.v ?? ver;
      const nr = t(f[2]);
      if (!nr) return;
      const r = this.roh.get(nr) ?? rohLeer(nr);
      if (t(f[1]) === "L") {
        r.geloescht = true;
        this.roh.set(nr, r);
        return;
      }
      r.geloescht = false;
      if (ver === 5) {
        r.kt1 = f[3] ?? "";
        r.kt2 = f[4] ?? "";
        r.me = t(f[5]);
        r.teiler = teilerAusMenge(f[7]);
        r.rabattgruppe = t(f[9]) || r.rabattgruppe;
        r.hwg = t(f[10]) || r.hwg;
        r.wg = t(f[11]) || r.wg;
        r.ean = eanAus(f[18]) || r.ean;
        preisSetzen(r, t(f[6]), preisAus(f[8]), false);
      } else {
        r.kt1 = f[4] ?? "";
        r.kt2 = f[5] ?? "";
        r.me = t(f[8]);
        r.teiler = teilerAusCode(f[7]);
        r.rabattgruppe = t(f[10]) || r.rabattgruppe;
        r.hwg = t(f[11]) || r.hwg;
        preisSetzen(r, t(f[6]), preisAus(f[9]), false);
      }
      this.roh.set(nr, r);
      return;
    }
    if (art === "B") {
      this.saetze++;
      if (t(f[1]) === "L") return;
      const nr = t(f[2]);
      if (nr) this.bZusatz.set(nr, { ean: eanAus(f[9]), wg: t(f[11]) });
      return;
    }
    if (art === "P") {
      this.saetze++;
      if (/^[ANLX]$/.test(t(f[1]))) {
        // DN4: P;A;[Nr;PK;Preis;RabKz;R1;R2;R3(;…)] × bis zu 3 – Blocklänge 7 (Norm) oder 9 (manche Händler)
        const rest = f.slice(2);
        const passt = (n: number) => !!t(rest[n]) && /^[12]$/.test(t(rest[n + 1]));
        const block = passt(7) ? 7 : passt(9) ? 9 : rest.length > 9 ? 9 : 7;
        for (let i = 0; i + 2 < rest.length; i += block) {
          const nr = t(rest[i]);
          if (!nr) continue;
          const rk = t(rest[i + 3]);
          const r1 = Number(t(rest[i + 4]));
          this.pSaetze.push({ nr, pk: t(rest[i + 1]), preis: preisAus(rest[i + 2]), teiler: null, rabatt: rk === "1" && r1 > 0 ? r1 / 100 : null });
        }
      } else {
        // DN5: P;Nr;PK;PE;Preis;RabGr;RabKz1;R1;RabKz2;R2;RabKz3;R3;Datum
        const nr = t(f[1]);
        if (!nr) return;
        let faktor = 1;
        let hatRabatt = false;
        for (const k of [6, 8, 10]) {
          const r = Number(t(f[k + 1]));
          if (t(f[k]) === "1" && r > 0) {
            faktor *= 1 - r / 10000;
            hatRabatt = true;
          }
        }
        this.pSaetze.push({
          nr, pk: t(f[2]), preis: preisAus(f[4]), teiler: teilerAusMenge(f[3]),
          rabatt: hatRabatt ? Math.round((1 - faktor) * 10000) / 100 : null,
        });
      }
      return;
    }
    if (art === "S") {
      this.saetze++;
      // DN5: S;HWG;WG;Name   DN4: S;Kz;HWG;HWG-Name;WG;WG-Name
      const dn4 = this.v === 4 || (this.v === null && f.length >= 6 && !t(f[1]));
      if (dn4) {
        const h = t(f[2]);
        const w = t(f[4]);
        const name = w ? t(f[5]) : t(f[3]);
        if (name) this.wg.set(`${h}|${w}`, { hauptwarengruppe: h, warengruppe: w, name });
      } else {
        const h = t(f[1]);
        const w = t(f[2]);
        const name = t(f[3]);
        if (name) this.wg.set(`${h}|${w}`, { hauptwarengruppe: h, warengruppe: w, name });
      }
      return;
    }
    if (art === "R") {
      this.saetze++;
      const code = t(f[1]);
      if (code) this.rabattgruppen.push({ code, name: t(f[4]), rabatt: (Number(t(f[3])) || 0) / 100 });
    }
  }

  ergebnis(): DatanormErgebnis {
    // Preisdatei erst jetzt anwenden — dann ist die Reihenfolge der Dateien egal
    let preiseOhneArtikel = 0;
    for (const p of this.pSaetze) {
      const r = this.roh.get(p.nr);
      if (!r || r.geloescht) {
        preiseOhneArtikel++;
        continue;
      }
      if (p.teiler !== null) r.teiler = p.teiler;
      preisSetzen(r, p.pk, p.preis, true, p.rabatt);
    }

    const artikel: DatanormArtikel[] = [];
    let geloescht = 0;
    let ohneText = 0;
    let ohnePreis = 0;
    const wgName = (h: string, w: string) =>
      this.wg.get(`${h}|${w}`)?.name
      ?? (w ? [...this.wg.values()].find((x) => x.warengruppe === w)?.name : this.wg.get(`${h}|`)?.name)
      ?? "";
    for (const r of this.roh.values()) {
      if (r.geloescht) {
        geloescht++;
        continue;
      }
      const b = this.bZusatz.get(r.nr);
      if (b) {
        r.ean = r.ean || b.ean;
        r.wg = r.wg || b.wg;
      }
      const bezeichnung = kurztextVerbinden(r.kt1, r.kt2);
      if (!bezeichnung) {
        ohneText++;
        continue;
      }
      const listenpreis = r.pListe ?? r.liste;
      // Eine neue Liste aus der Preisdatei macht den alten Nettopreis des A-Satzes ungültig
      const netto = r.pNetto ?? (r.pListe !== null ? null : r.netto);
      if (listenpreis === null && netto === null) ohnePreis++;
      artikel.push({
        artikelnummer: r.nr,
        bezeichnung,
        einheit: einheitNorm(r.me) || "Stk",
        einheitRoh: r.me,
        listenpreis,
        netto,
        rabattDatei: netto !== null && r.pNetto !== null ? r.rabatt : null,
        preiseinheit: r.teiler,
        rabattgruppe: r.rabattgruppe,
        hauptwarengruppe: r.hwg,
        warengruppe: r.wg || r.hwg,
        warengruppeName: wgName(r.hwg, r.wg),
        ean: r.ean,
      });
    }
    return {
      artikel,
      version: this.version ?? this.v,
      firma: this.firma,
      vorlauf: this.vorlauf,
      rabattgruppen: this.rabattgruppen,
      geloescht,
      ohneText,
      ohnePreis,
      preiseOhneArtikel,
      dateien: this.dateiInfo,
    };
  }
}

/** Eine oder mehrere DATANORM-Dateien (als Text) gemeinsam lesen. */
export function datanormLesenMehrere(dateien: { name?: string; text: string }[]): DatanormErgebnis {
  const leser = new DatanormLeser();
  for (const d of dateien) {
    leser.dateiBeginnen(d.name ?? "");
    for (const z of zeilenVon(d.text)) leser.zeile(z);
    leser.dateiBeenden(datanormDateiart(d.text));
  }
  return leser.ergebnis();
}

/** Eine DATANORM-Datei lesen (Kurzform). */
export const datanormLesen = (text: string) => datanormLesenMehrere([{ text }]);

/**
 * Große DATANORM-Dateien im Browser lesen: Zeichensatz je Datei erkennen
 * (oder vorgegeben), dann Zeile für Zeile in Häppchen. `fortschritt` läuft
 * über alle Dateien von 0 bis 1.
 */
export async function datanormDateienLesen(
  dateien: { name: string; daten: Uint8Array }[],
  optionen: { zeichensatz?: Zeichensatz; fortschritt?: Fortschritt } = {},
): Promise<DatanormErgebnis & { zeichensaetze: Zeichensatz[] }> {
  const leser = new DatanormLeser();
  const gesamt = dateien.reduce((s, d) => s + d.daten.length, 0) || 1;
  let fertig = 0;
  const zeichensaetze: Zeichensatz[] = [];
  for (const d of dateien) {
    // Erkennen zählt mit einem Fünftel, Lesen mit dem Rest
    const zs = optionen.zeichensatz
      ?? await zeichensatzErkennenStueckweise(d.daten, (a) => optionen.fortschritt?.((fertig + a * d.daten.length * 0.2) / gesamt));
    zeichensaetze.push(zs);
    const kopf = dateiText(d.daten.subarray(0, 64 * 1024), zs);
    leser.dateiBeginnen(d.name);
    await zeilenStueckweise(d.daten, zs, (z) => leser.zeile(z),
      (a) => optionen.fortschritt?.((fertig + d.daten.length * (0.2 + a * 0.8)) / gesamt));
    leser.dateiBeenden(datanormDateiart(kopf));
    fertig += d.daten.length;
  }
  return { ...leser.ergebnis(), zeichensaetze };
}
