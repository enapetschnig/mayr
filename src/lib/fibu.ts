/**
 * Monatsübergabe an die Buchhaltung: Buchungszeilen für BMD und RZL, ohne
 * Datenbank. Die Formate folgen den Beschreibungen der Hersteller — BMD
 * „Verbuchen Erfassungsfile“ (variabler Satzaufbau, BMD macht Gegen- und
 * Sammelbuchungen) und RZL „Handbuch Datenimport“ (Euro-Version, je Beleg
 * zwei Zeilen). Beide lesen Windows-1252, Strichpunkt, CR/LF.
 *
 * Teil- und Schlussrechnungen gehen als normale Rechnungen mit ihren eigenen
 * Beträgen hinaus: die Schlussrechnung ist netto schon um die Teilrechnungen
 * gekürzt. Die Belegliste nennt sie, damit die Kanzlei sie umbuchen kann.
 */

export type FibuFormat = "bmd" | "rzl";

export type FibuKonten = {
  erloes20: number; erloes13: number; erloes10: number; erloes0: number; erloesBau: number;
  material: number; fremdleistung: number; werkzeug: number; fahrzeug: number; buero: number; sonstiges: number;
};

export const KONTEN_TEXT: Record<keyof FibuKonten, string> = {
  erloes20: "Erlöse 20 %", erloes13: "Erlöse 13 %", erloes10: "Erlöse 10 %", erloes0: "Erlöse ohne USt",
  erloesBau: "Erlöse Bauleistung (Reverse Charge)", material: "Material", fremdleistung: "Fremdleistung",
  werkzeug: "Werkzeug", fahrzeug: "Fahrzeug", buero: "Büro", sonstiges: "Sonstiges",
};

export type FibuBeleg = {
  id: string;
  nummer: string;
  datum: string;
  faellig_am: string | null;
  status: string;
  netto: number;
  ust: number;
  brutto: number;
  ust_satz: number;
  reverse_charge: boolean;
  empf_name: string | null;
  empf_uid: string | null;
  teil_nr: number | null;
  storno_von: string | null;
  kunde: { nummer: number; name: string; strasse: string | null; plz: string | null; ort: string | null; uid: string | null } | null;
  /** Pfad im ZIP, wenn das Original-PDF mitgeht */
  datei?: string | null;
};

export type FibuEingang = {
  id: string;
  lieferant: string;
  nummer: string | null;
  datum: string;
  faellig_am: string | null;
  netto: number;
  ust: number;
  brutto: number;
  ust_satz: number;
  reverse_charge: boolean;
  kategorie: string;
  datei_pfad: string | null;
  kreditor?: number;
  datei?: string | null;
};

const runden2 = (n: number) => Math.round(n * 100) / 100;
const betrag = (n: number) => runden2(n).toFixed(2).replace(".", ",");
const prozent = (n: number) => String(Number(n)).replace(".", ",");
/** Trennzeichen und Zeilenumbrüche haben in den Textfeldern nichts verloren */
const textFeld = (s: string | null | undefined, max: number) => (s ?? "").replace(/[;\r\n\t"]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const tage = (von: string, bis: string | null) => (bis ? Math.round((Date.parse(bis) - Date.parse(von)) / 86_400_000) : null);
const ziffern = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");

export const debitorKonto = (b: Pick<FibuBeleg, "kunde">, sammel = 20000) => (b.kunde ? 20000 + b.kunde.nummer : sammel);

const AUFWAND: Record<string, keyof FibuKonten> = {
  material: "material", fremdleistung: "fremdleistung", werkzeug: "werkzeug", fahrzeug: "fahrzeug", buero: "buero", sonstiges: "sonstiges",
};
export const aufwandKonto = (e: Pick<FibuEingang, "kategorie">, k: FibuKonten) => k[AUFWAND[e.kategorie] ?? "sonstiges"];

export type ErloesFall = "normal" | "bau" | "klein";
export const erloesFall = (b: Pick<FibuBeleg, "reverse_charge" | "ust">, kleinunternehmer: boolean): ErloesFall =>
  b.reverse_charge ? "bau" : kleinunternehmer && !Number(b.ust) ? "klein" : "normal";

export function erloesKonto(b: Pick<FibuBeleg, "reverse_charge" | "ust" | "ust_satz">, k: FibuKonten, kleinunternehmer: boolean) {
  const fall = erloesFall(b, kleinunternehmer);
  if (fall === "bau") return k.erloesBau;
  if (fall === "klein") return k.erloes0;
  const satz = Number(b.ust_satz);
  return satz === 13 ? k.erloes13 : satz === 10 ? k.erloes10 : satz === 0 ? k.erloes0 : k.erloes20;
}

/** Eingangsrechnungen: numerische Nummer für Belegnummer und Offene Posten, immer gleich für dieselbe Rechnung */
export function eingangNummer(e: Pick<FibuEingang, "id" | "datum">): string {
  const rest = parseInt(e.id.replace(/-/g, "").slice(0, 8), 16) % 100_000;
  return `${e.datum.slice(2, 4)}${e.datum.slice(5, 7)}${String(rest).padStart(5, "0")}`;
}

/** Steuer bei Reverse Charge: die Rechnung ist netto, die Steuer entsteht erst in der Buchhaltung */
const rcSteuer = (e: Pick<FibuEingang, "netto" | "ust_satz">) => runden2((Number(e.netto) * (Number(e.ust_satz) || 20)) / 100);

// ── BMD ──────────────────────────────────────────────────────────────────

const BMD_KOPF = ["satzart", "konto", "gkto", "belegnr", "belegdat", "buchdat", "bucod", "steucod", "betrag", "mwst", "steuer", "text", "symbol", "extbelegnr", "zziel", "verbuchkz", "gegenbuchkz"];
const bmdDatum = (iso: string) => iso.replace(/-/g, "");

type BmdZeile = { konto: number; gkto: number; belegnr: string; datum: string; bucod: 1 | 2; steucod: string; betrag: number; mwst: number; steuer: number; text: string; symbol: "AR" | "ER"; ext: string; zziel: number | null };

const bmdFelder = (z: BmdZeile) => [
  "0", String(z.konto), String(z.gkto), z.belegnr, bmdDatum(z.datum), bmdDatum(z.datum), String(z.bucod), z.steucod,
  betrag(z.betrag), prozent(z.mwst), betrag(z.steuer), textFeld(z.text, 60), z.symbol, textFeld(z.ext, 12),
  z.zziel == null ? "" : String(z.zziel), "A", "E",
].join(";");

/** Führend ist das Personenkonto: brutto, Vorzeichen zeigt Rechnung oder Gutschrift, Kundenkonto bleibt im Soll */
export function bmdAusgang(b: FibuBeleg, k: FibuKonten, kleinunternehmer: boolean): string {
  const fall = erloesFall(b, kleinunternehmer);
  return bmdFelder({
    konto: debitorKonto(b), gkto: erloesKonto(b, k, kleinunternehmer), belegnr: ziffern(b.nummer), datum: b.datum, bucod: 1,
    steucod: fall === "bau" ? "17" : fall === "klein" ? "00" : "03",
    betrag: Number(b.brutto), mwst: fall === "normal" ? Number(b.ust_satz) : 0, steuer: -Number(b.ust),
    text: `${b.nummer} ${b.kunde?.name ?? b.empf_name ?? ""}`, symbol: "AR", ext: b.nummer, zziel: tage(b.datum, b.faellig_am),
  });
}

/** Lieferant im Haben. Bauleistung: netto, die Steuer trägt das Vorzeichen der Umsatzsteuer */
export function bmdEingang(e: FibuEingang, k: FibuKonten): string {
  const basis = {
    konto: e.kreditor as number, gkto: aufwandKonto(e, k), belegnr: eingangNummer(e), datum: e.datum, bucod: 2 as const,
    text: `${e.nummer ?? ""} ${e.lieferant}`, symbol: "ER" as const, ext: e.nummer ?? "", zziel: tage(e.datum, e.faellig_am),
  };
  const zeichen = Number(e.netto) < 0 ? -1 : 1;
  return bmdFelder(e.reverse_charge
    ? { ...basis, steucod: "29", betrag: -Number(e.netto), mwst: Number(e.ust_satz) || 20, steuer: -zeichen * Math.abs(rcSteuer(e)) }
    : { ...basis, steucod: "00", betrag: -Number(e.brutto), mwst: Number(e.ust_satz), steuer: Number(e.ust) });
}

// ── RZL ──────────────────────────────────────────────────────────────────

type RzlZeile = {
  konto: number; gkto: number; op: string; datum: string; soll: number; haben: number; steuer: number; kreis: "AR" | "ER"; nummer: string;
  schluessel: string; code: string; sonder: string; frist: number | null; text: string; text2?: string; uid?: string | null; fremd?: string; datei?: string | null;
};

const rzlDatum = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const rzlDatei = (p: string | null | undefined) => (p ? `\\${p.replace(/\//g, "\\")}` : "");

/** Satzaufbau Buchungen, Euro-Version: 37 Felder, auch die leeren */
const rzlFelder = (z: RzlZeile) => [
  z.konto, z.gkto, z.op, rzlDatum(z.datum), "", "EUR", betrag(z.soll), betrag(z.haben), betrag(z.steuer),
  "", "0,00", "0,00", "0", z.kreis, textFeld(z.nummer, 15), "1", z.schluessel, z.code, z.sonder, "1",
  z.frist == null ? "" : z.frist, "", "", textFeld(z.text, 40), textFeld(z.text2, 40), (z.uid ?? "").replace(/\s/g, ""),
  "", "", "", "", "", textFeld(z.fremd, 19), "", "", "", "", rzlDatei(z.datei),
].join(";");

export function rzlAusgang(b: FibuBeleg, k: FibuKonten, kleinunternehmer: boolean): string[] {
  const fall = erloesFall(b, kleinunternehmer);
  const steuerfall = fall === "bau"
    ? { schluessel: "1", code: "2", sonder: "14" }
    : fall === "klein" ? { schluessel: "1", code: "2", sonder: "22" } : { schluessel: String(Number(b.ust_satz)), code: "2", sonder: "0" };
  const deb = debitorKonto(b), erl = erloesKonto(b, k, kleinunternehmer);
  const brutto = Math.abs(Number(b.brutto)), netto = Math.abs(Number(b.netto)), ust = Math.abs(Number(b.ust));
  const basis = {
    op: ziffern(b.nummer), datum: b.datum, kreis: "AR" as const, nummer: b.nummer, ...steuerfall, frist: tage(b.datum, b.faellig_am),
    text: `${b.storno_von ? "Storno " : ""}${b.nummer}`, text2: b.kunde?.name ?? b.empf_name ?? "", uid: fall === "bau" ? b.empf_uid : null, datei: b.datei,
  };
  const kunde = { ...basis, konto: deb, gkto: erl };
  const erloes = { ...basis, konto: erl, gkto: deb };
  return Number(b.brutto) < 0
    ? [rzlFelder({ ...erloes, soll: netto, haben: 0, steuer: -ust }), rzlFelder({ ...kunde, soll: 0, haben: brutto, steuer: 0 })]
    : [rzlFelder({ ...kunde, soll: brutto, haben: 0, steuer: 0 }), rzlFelder({ ...erloes, soll: 0, haben: netto, steuer: ust })];
}

export function rzlEingang(e: FibuEingang, k: FibuKonten): string[] {
  const steuerfall = e.reverse_charge
    ? { schluessel: String(Number(e.ust_satz) || 20), code: "1", sonder: "15" }
    : Number(e.ust_satz) ? { schluessel: String(Number(e.ust_satz)), code: "1", sonder: "0" } : { schluessel: "", code: "1", sonder: "" };
  const kred = e.kreditor as number, auf = aufwandKonto(e, k);
  const brutto = Math.abs(Number(e.brutto)), netto = Math.abs(Number(e.netto));
  const steuer = e.reverse_charge ? Math.abs(rcSteuer(e)) : Math.abs(Number(e.ust));
  const basis = {
    op: ziffern(e.nummer).slice(-16) || eingangNummer(e), datum: e.datum, kreis: "ER" as const, nummer: e.nummer || eingangNummer(e), ...steuerfall,
    frist: tage(e.datum, e.faellig_am), text: `${e.nummer ?? ""} ${e.lieferant}`, fremd: e.nummer ?? "", datei: e.datei,
  };
  const aufwand = { ...basis, konto: auf, gkto: kred };
  const lieferant = { ...basis, konto: kred, gkto: auf };
  return Number(e.brutto) < 0
    ? [rzlFelder({ ...lieferant, soll: brutto, haben: 0, steuer: 0 }), rzlFelder({ ...aufwand, soll: 0, haben: netto, steuer: -steuer })]
    : [rzlFelder({ ...aufwand, soll: netto, haben: 0, steuer }), rzlFelder({ ...lieferant, soll: 0, haben: e.reverse_charge ? netto : brutto, steuer: 0 })];
}

// ── Dateien ──────────────────────────────────────────────────────────────

export function buchungenText(format: FibuFormat, belege: FibuBeleg[], eingaenge: FibuEingang[], k: FibuKonten, kleinunternehmer: boolean): string {
  const zeilen = format === "bmd"
    ? [BMD_KOPF.join(";"), ...belege.map((b) => bmdAusgang(b, k, kleinunternehmer)), ...eingaenge.map((e) => bmdEingang(e, k))]
    : [...belege.flatMap((b) => rzlAusgang(b, k, kleinunternehmer)), ...eingaenge.flatMap((e) => rzlEingang(e, k))];
  return `${zeilen.join("\r\n")}\r\n`;
}

/** Kunden und Lieferanten, je Konto einmal. RZL-Kontenart: 5 Debitor, 7 Kreditor */
export function personenkontenText(format: FibuFormat, belege: FibuBeleg[], eingaenge: FibuEingang[]): string {
  const je = new Map<number, { art: 5 | 7; name: string; strasse?: string | null; plz?: string | null; ort?: string | null; uid?: string | null }>();
  belege.forEach((b) => { if (b.kunde) je.set(debitorKonto(b), { art: 5, ...b.kunde }); });
  eingaenge.forEach((e) => { if (e.kreditor) je.set(e.kreditor, { art: 7, name: e.lieferant }); });
  const liste = [...je.entries()].sort(([a], [b]) => a - b);
  const zeilen = format === "bmd"
    ? ["konto;name;strasse;plz;ort;uidnr", ...liste.map(([konto, p]) => [konto, textFeld(p.name, 60), textFeld(p.strasse, 60), textFeld(p.plz, 10), textFeld(p.ort, 40), (p.uid ?? "").replace(/\s/g, "")].join(";"))]
    : liste.map(([konto, p]) => [konto, p.art, "", (p.uid ?? "").replace(/\s/g, ""), "", textFeld(p.name, 40), textFeld(p.strasse, 40), textFeld(p.ort, 25), "", "", "", "", "", textFeld(p.plz, 10), "", "", "", "", ""].join(";"));
  return zeilen.length ? `${zeilen.join("\r\n")}\r\n` : "";
}

/** Windows-1252: was die Zeichentabelle nicht kennt, wird zum Fragezeichen statt zu Zeichensalat */
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
export function windows1252(text: string): Uint8Array {
  const zeichen = [...text];
  const aus = new Uint8Array(zeichen.length);
  zeichen.forEach((z, i) => {
    const c = z.codePointAt(0) as number;
    aus[i] = CP1252[z] ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f);
  });
  return aus;
}

// ── Kontrollliste ────────────────────────────────────────────────────────

export type FibuHinweis = { schwer: boolean; text: string };

/** Was die Kanzlei sonst zurückschickt. Die Übergabe bleibt trotzdem möglich: der Mensch entscheidet */
export function kontrolle(belege: FibuBeleg[], eingaenge: FibuEingang[], kleinunternehmer: boolean, entwuerfe = 0): FibuHinweis[] {
  const h: FibuHinweis[] = [];
  const stimmt = (x: { netto: number; ust: number; brutto: number }) => Math.abs(Number(x.netto) + Number(x.ust) - Number(x.brutto)) < 0.005;
  for (const b of belege) {
    if (!b.kunde) h.push({ schwer: true, text: `${b.nummer}: kein Kunde zugeordnet, es fehlt die Kontonummer.` });
    if (b.reverse_charge && !b.empf_uid?.trim()) h.push({ schwer: true, text: `${b.nummer}: Reverse Charge ohne UID des Kunden.` });
    if (!stimmt(b)) h.push({ schwer: true, text: `${b.nummer}: Netto und USt ergeben nicht den Bruttobetrag.` });
    if (!b.reverse_charge && !kleinunternehmer && !Number(b.ust) && Number(b.netto)) h.push({ schwer: true, text: `${b.nummer}: keine USt, obwohl weder Reverse Charge noch Kleinunternehmer.` });
    if (![0, 10, 13, 20].includes(Number(b.ust_satz))) h.push({ schwer: true, text: `${b.nummer}: für ${prozent(b.ust_satz)} % USt gibt es kein Erlöskonto.` });
    if (b.teil_nr) h.push({ schwer: false, text: `${b.nummer}: ${b.teil_nr}. Teilrechnung, geht als normale Rechnung hinaus.` });
  }
  for (const e of eingaenge) {
    const name = `${e.lieferant}${e.nummer ? ` ${e.nummer}` : ""}`;
    if (!e.nummer?.trim()) h.push({ schwer: true, text: `${name}: Rechnungsnummer fehlt.` });
    if (!e.datei_pfad) h.push({ schwer: true, text: `${name}: kein Foto oder PDF der Rechnung.` });
    if (!stimmt(e)) h.push({ schwer: true, text: `${name}: Netto und USt ergeben nicht den Bruttobetrag.` });
    if (!e.reverse_charge && !Number(e.ust) && Number(e.netto)) h.push({ schwer: false, text: `${name}: ohne Vorsteuer. Ist das Reverse Charge? Dann in der Rechnung ankreuzen.` });
  }
  if (entwuerfe) h.push({ schwer: false, text: `${entwuerfe} ${entwuerfe === 1 ? "Rechnung ist" : "Rechnungen sind"} noch Entwurf und ${entwuerfe === 1 ? "geht" : "gehen"} nicht mit.` });
  return h;
}

export const summen = (liste: { netto: number; ust: number; brutto: number }[]) => ({
  anzahl: liste.length,
  netto: runden2(liste.reduce((s, x) => s + Number(x.netto), 0)),
  ust: runden2(liste.reduce((s, x) => s + Number(x.ust), 0)),
  brutto: runden2(liste.reduce((s, x) => s + Number(x.brutto), 0)),
});
