import { dezimalLesenFormat, zahlenFormatErkennen, type ZahlenFormat } from "@/lib/csvImport";
import { runden2 } from "@/lib/preise";

/**
 * Buchhaltung: Rechnen ohne Datenbank — Kategorie-Vorschlag, Summen je
 * Kategorie, Zahlstatus, Altrechnungen lesen (Tabelle und CSV). Getestet in
 * buchhaltungLogik.test.ts.
 */

export type Richtung = "eingang" | "ausgang";

export type Kategorie = {
  id: string;
  richtung: Richtung | string;
  name: string;
  art: string | null;
  konto: number | null;
  stichworte: string;
  sortierung: number;
};

/** „PV, Photovoltaik , Modul“ → ["pv", "photovoltaik", "modul"] */
export const stichwortListe = (s: string | null | undefined): string[] =>
  (s ?? "").split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

const wortGrenze = (text: string, wort: string) => {
  // kurze Stichworte („PV“) nur als ganzes Wort, längere auch in Zusammensetzungen („Wallboxmontage“)
  if (wort.length > 3) return text.includes(wort);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${wort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);
};

/**
 * Welche Kategorie passt zum Text (Betreff, Projekt, Positionen; beim Eingang
 * Lieferant und Positionen)? Je Treffer eines Stichworts (oder des Namens) ein
 * Punkt; die meisten Punkte gewinnen, bei Gleichstand die weiter oben.
 * null = kein Treffer.
 */
export function kategorieVorschlag(text: string, kategorien: Kategorie[]): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  let beste: { id: string; punkte: number; sortierung: number } | null = null;
  for (const k of kategorien) {
    const woerter = [...new Set([k.name.toLowerCase(), ...stichwortListe(k.stichworte)])];
    const punkte = woerter.filter((w) => wortGrenze(t, w)).length;
    if (punkte && (!beste || punkte > beste.punkte || (punkte === beste.punkte && k.sortierung < beste.sortierung))) {
      beste = { id: k.id, punkte, sortierung: k.sortierung };
    }
  }
  return beste?.id ?? null;
}

/** Eingang: zuerst, was beim selben Lieferanten zuletzt gewählt wurde, sonst die Stichworte */
export function eingangVorschlag(
  lieferant: string,
  texte: string[],
  letzteJeLieferant: Map<string, string>,
  kategorien: Kategorie[],
): string | null {
  const letzte = letzteJeLieferant.get(lieferant.trim().toLowerCase());
  if (letzte && kategorien.some((k) => k.id === letzte)) return letzte;
  return kategorieVorschlag([lieferant, ...texte].join(" "), kategorien);
}

/** Letzte Kategorie je Lieferant aus einer Liste, neueste zuerst sortiert */
export function letzteKategorien(liste: { lieferant: string; kategorie_id: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of liste) {
    const s = r.lieferant.trim().toLowerCase();
    if (r.kategorie_id && !m.has(s)) m.set(s, r.kategorie_id);
  }
  return m;
}

export type KategorieSumme = { id: string | null; name: string; anzahl: number; netto: number; brutto: number; anteil: number };

/** Summen je Kategorie, größte zuerst; „Ohne Kategorie“ immer zuletzt. `anteil` = 0…1 am größten Wert (für den Balken) */
export function nachKategorie(zeilen: { kategorie_id: string | null; netto: number | string; brutto: number | string }[], kategorien: Kategorie[]): KategorieSumme[] {
  const je = new Map<string | null, KategorieSumme>();
  const name = new Map(kategorien.map((k) => [k.id, k.name]));
  for (const z of zeilen) {
    const id = z.kategorie_id && name.has(z.kategorie_id) ? z.kategorie_id : null;
    const s = je.get(id) ?? { id, name: id ? name.get(id)! : "Ohne Kategorie", anzahl: 0, netto: 0, brutto: 0, anteil: 0 };
    s.anzahl++;
    s.netto = runden2(s.netto + Number(z.netto));
    s.brutto = runden2(s.brutto + Number(z.brutto));
    je.set(id, s);
  }
  const liste = [...je.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.netto - a.netto));
  const max = Math.max(0, ...liste.map((s) => Math.abs(s.netto)));
  return liste.map((s) => ({ ...s, anteil: max ? Math.abs(s.netto) / max : 0 }));
}

// ── Zahlstatus ───────────────────────────────────────────────────────────

export type ZahlStatus = "offen" | "teilbezahlt" | "bezahlt" | "ausgebucht" | "storniert";

/** Wie steht eine Ausgangsrechnung? Ausgebucht = (auch) abgeschrieben, nicht ganz bezahlt */
export function zahlStatus(
  b: { status: string; brutto: number | string },
  zahlungen: { betrag: number | string; art: string }[],
): { status: ZahlStatus; bezahlt: number; offen: number; ausgebucht: number } {
  const bezahlt = runden2(zahlungen.filter((z) => z.art !== "ausbuchung").reduce((s, z) => s + Number(z.betrag), 0));
  const ausgebucht = runden2(zahlungen.filter((z) => z.art === "ausbuchung").reduce((s, z) => s + Number(z.betrag), 0));
  const brutto = Number(b.brutto);
  if (b.status === "storniert" || b.status === "storno") return { status: "storniert", bezahlt, offen: 0, ausgebucht };
  const offen = Math.max(0, runden2(brutto - bezahlt - ausgebucht));
  const status: ZahlStatus = offen <= 0 || b.status === "bezahlt"
    ? (ausgebucht > 0 ? "ausgebucht" : "bezahlt")
    : bezahlt + ausgebucht > 0 ? "teilbezahlt" : "offen";
  return { status, bezahlt, offen: status === "bezahlt" || status === "ausgebucht" ? 0 : offen, ausgebucht };
}

// ── Altrechnungen ────────────────────────────────────────────────────────

/** Eine Zeile, wie sie getippt oder aus der CSV gelesen wurde — alles Text */
export type AltEingabe = {
  nummer: string; datum: string; kunde: string; netto: string; ust_satz: string; brutto: string; faellig_am: string; bezahlt: string;
};

export type AltRechnung = {
  nummer: string; datum: string; kunde: string; netto: number; ust_satz: number; ust: number; brutto: number;
  faellig_am: string | null; bezahlt: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 31.12.2025, 31.12.25, 2025-12-31 → ISO; sonst null */
export function datumLesen(s: string): string | null {
  const t = (s ?? "").trim();
  let j: number, m: number, d: number;
  if (ISO.test(t)) [j, m, d] = t.split("-").map(Number);
  else {
    const x = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
    if (!x) return null;
    d = Number(x[1]); m = Number(x[2]); j = Number(x[3]);
    if (j < 100) j += 2000;
  }
  const dt = new Date(Date.UTC(j, m - 1, d));
  if (dt.getUTCFullYear() !== j || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Eine Altrechnung prüfen und fertig rechnen. Es genügt Netto oder Brutto
 * (mit USt-Satz, Vorgabe 20 %); stehen beide da, gilt die Differenz als USt.
 * „bezahlt“: leer = offen, „ja“/„x“ = ganz bezahlt, ein Betrag = so viel bezahlt.
 */
export function altZeileLesen(e: AltEingabe, heute: string, format: ZahlenFormat = null): { rechnung: AltRechnung | null; fehler: string | null } {
  const zahl = (s: string) => (s.trim() ? dezimalLesenFormat(s, format) : null);
  const nummer = e.nummer.trim();
  if (!nummer) return { rechnung: null, fehler: "Nummer fehlt" };
  const datum = datumLesen(e.datum);
  if (!datum) return { rechnung: null, fehler: e.datum.trim() ? `Datum „${e.datum.trim()}“ nicht lesbar` : "Datum fehlt" };
  if (datum > heute) return { rechnung: null, fehler: "Datum liegt in der Zukunft" };
  const kunde = e.kunde.trim();
  if (!kunde) return { rechnung: null, fehler: "Kunde fehlt" };
  const satzText = e.ust_satz.replace("%", "").trim();
  const satz = satzText ? dezimalLesenFormat(satzText, format) : 20;
  if (satz === null || satz < 0 || satz > 30) return { rechnung: null, fehler: "USt-Satz nicht lesbar" };
  let netto = zahl(e.netto);
  let brutto = zahl(e.brutto);
  if (netto === null && brutto === null) return { rechnung: null, fehler: "Betrag fehlt (netto oder brutto)" };
  if (netto !== null && brutto === null) brutto = runden2(runden2(netto) + runden2((runden2(netto) * satz) / 100));
  if (brutto !== null && netto === null) netto = runden2(brutto / (1 + satz / 100));
  netto = runden2(netto!);
  brutto = runden2(brutto!);
  if (brutto <= 0) return { rechnung: null, fehler: "Betrag muss über 0 € liegen" };
  if (netto > brutto) return { rechnung: null, fehler: "Netto ist größer als brutto" };
  let faellig: string | null = null;
  if (e.faellig_am.trim()) {
    faellig = datumLesen(e.faellig_am);
    if (!faellig) return { rechnung: null, fehler: `Fällig „${e.faellig_am.trim()}“ nicht lesbar` };
    if (faellig < datum) return { rechnung: null, fehler: "Fällig vor dem Rechnungsdatum" };
  }
  const b = e.bezahlt.trim().toLowerCase();
  let bezahlt = 0;
  // „ja“ oder ein Zahldatum („bezahlt am 12.10.2025“) = ganz bezahlt
  if (["ja", "j", "x", "bezahlt", "yes", "1"].includes(b) || datumLesen(b)) bezahlt = brutto;
  else if (b && !["nein", "n", "offen", "0", "-"].includes(b)) {
    const z = dezimalLesenFormat(e.bezahlt, format);
    if (z === null || z < 0) return { rechnung: null, fehler: `Bezahlt „${e.bezahlt.trim()}“ nicht lesbar` };
    if (z > brutto + 0.005) return { rechnung: null, fehler: "Mehr bezahlt als die Rechnung ausmacht" };
    bezahlt = runden2(z);
  }
  return {
    rechnung: { nummer, datum, kunde, netto, ust_satz: satz, ust: runden2(brutto - netto), brutto, faellig_am: faellig, bezahlt },
    fehler: null,
  };
}

export type AltSpalte = keyof AltEingabe;
export const ALT_SPALTEN: { feld: AltSpalte; text: string; pflicht?: boolean }[] = [
  { feld: "nummer", text: "Rechnungsnummer", pflicht: true },
  { feld: "datum", text: "Datum", pflicht: true },
  { feld: "kunde", text: "Kunde", pflicht: true },
  { feld: "netto", text: "Netto" },
  { feld: "ust_satz", text: "USt %" },
  { feld: "brutto", text: "Brutto" },
  { feld: "faellig_am", text: "Fällig" },
  { feld: "bezahlt", text: "Bezahlt" },
];

const SPALTEN_WOERTER: Record<AltSpalte, RegExp> = {
  nummer: /^(re(chnung)?s?[ -]?n(umme)?r|nummer|nr|beleg(nummer|nr)?|rechnung)\.?$/,
  datum: /^(re(chnungs)?[ -]?)?datum$|^belegdatum$|^datum$/,
  kunde: /^(kunde|kundenname|name|empf(ä|ae)nger|firma|debitor)$/,
  netto: /netto/,
  ust_satz: /^(ust|mwst|steuer)[ -]?(satz|%|prozent)?$|satz/,
  brutto: /brutto|^betrag$|^summe$|gesamt/,
  faellig_am: /f(ä|ae)llig/,
  // nicht „Zahlungsziel“ (14 Tage) oder „Zahlungsart“ — sonst wären 14 € bezahlt
  bezahlt: /bezahlt|gezahlt|^zahlung(en|sbetrag|seingang)?$|^(zahl(ungs)?)?status$/,
};

/** Kopfzeile → welche Spalte welches Feld ist (von Hand änderbar) */
export function altSpaltenErkennen(kopf: string[]): Partial<Record<AltSpalte, number>> {
  const zu: Partial<Record<AltSpalte, number>> = {};
  kopf.forEach((k, i) => {
    const s = k.trim().toLowerCase().replace(/[()€:]/g, "").replace(/\s+/g, " ").trim();
    for (const f of ALT_SPALTEN.map((x) => x.feld)) {
      if (zu[f] === undefined && SPALTEN_WOERTER[f].test(s) && !Object.values(zu).includes(i)) { zu[f] = i; break; }
    }
  });
  return zu;
}

/** CSV-Zeilen (ohne Kopf) mit der Zuordnung in Eingaben verwandeln, samt Zahlenformat der Betragsspalten */
export function altAusCsv(zeilen: string[][], zu: Partial<Record<AltSpalte, number>>): { eingaben: AltEingabe[]; format: ZahlenFormat } {
  const zelle = (z: string[], f: AltSpalte) => (zu[f] === undefined ? "" : (z[zu[f]!] ?? "").trim());
  const eingaben = zeilen
    .filter((z) => z.some((x) => x.trim()))
    .map((z) => Object.fromEntries(ALT_SPALTEN.map(({ feld }) => [feld, zelle(z, feld)])) as AltEingabe);
  const format = zahlenFormatErkennen(eingaben.flatMap((e) => [e.netto, e.brutto]).filter(Boolean));
  return { eingaben, format };
}
