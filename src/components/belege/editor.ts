import type { Json } from "@/integrations/supabase/types";
import { zahlLesen } from "@/lib/format";
import {
  artikelVk, belegSummen, leistungMaterialEk, leistungPreis, runden2, type LeistungsMaterial,
} from "@/lib/preise";
import type { Artikel, Beleg, Firma, Kunde, Leistung, Position } from "@/lib/types";

/**
 * Der Positions-Editor als reine Daten: anlegen, einfügen, verschieben,
 * zusammenfassen, rechnen. Keine Oberfläche, kein Supabase — dadurch testbar
 * und von Angebot, Rechnung, Sprache und Import gemeinsam benutzt.
 */

export type BelegTyp = "angebot" | "rechnung";
export type PositionsArt = "titel" | "leistung" | "artikel" | "arbeit" | "material" | "pauschale" | "text";

export const ART_NAME: Record<PositionsArt, string> = {
  titel: "Titel / Raum",
  leistung: "Leistung",
  artikel: "Artikel",
  arbeit: "Arbeitszeit",
  material: "Material",
  pauschale: "Pauschale",
  text: "Hinweistext",
};

/** Herkunft einer Position — beim Löschen gibt der Trigger diese Buchungen frei */
/** Herkunft einer Position. `eingang`: weiterverrechnete Anteile von Eingangsrechnungen */
export type Quelle = { zeiten: string[]; material: string[]; regie: string[]; eingang?: string[] };

/** Eine Zeile im Editor. Menge und Preis als Text, damit „2,“ beim Tippen stehen bleibt. */
export type EditorPosition = {
  id: string;
  art: PositionsArt;
  bezeichnung: string;
  langtext: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
  ek_preis: number | null;
  minuten: number | null;
  artikel_id: string | null;
  leistung_id: string | null;
  quelle: Quelle | null;
};

/** Leistung aus dem Katalog samt Material — für Preis und Einsatz-EK */
export type KatalogLeistung = Leistung & { leistung_material: LeistungsMaterial[] };

export const ohneBetrag = (p: { art: string }) => p.art === "titel" || p.art === "text";

export function neueId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Unsicherer Kontext (http im LAN): selbst würfeln, Format wie v4
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 2.5 → "2,5" — für Eingabefelder, ohne Tausenderpunkt */
export function zahlText(n: number | null | undefined, stellen = 3): string {
  const v = Number(n) || 0;
  return v.toLocaleString("de-AT", { maximumFractionDigits: stellen, useGrouping: false });
}

/** 39.1 → "39,10" */
export function preisText(n: number | null | undefined): string {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

export const mengeVon = (p: Pick<EditorPosition, "menge">) => zahlLesen(p.menge);
export const preisVon = (p: Pick<EditorPosition, "einzelpreis">) => zahlLesen(p.einzelpreis);

export function positionGesamt(p: EditorPosition): number {
  return ohneBetrag(p) ? 0 : runden2(mengeVon(p) * preisVon(p));
}

export function summen(positionen: EditorPosition[], ustSatz: number, ohneUst: boolean) {
  return belegSummen(
    positionen.map((p) => ({ art: p.art, menge: mengeVon(p), einzelpreis: preisVon(p) })),
    ustSatz,
    ohneUst,
  );
}

// ── Quelle ──────────────────────────────────────────────────────────────

const LEERE_QUELLE = (): Quelle => ({ zeiten: [], material: [], regie: [], eingang: [] });

export function quelleLesen(j: Json | null | undefined): Quelle | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const liste = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  const q: Quelle = { zeiten: liste(o.zeiten), material: liste(o.material), regie: liste(o.regie) };
  const eingang = liste(o.eingang);
  if (eingang.length) q.eingang = eingang;
  return q.zeiten.length || q.material.length || q.regie.length || eingang.length ? q : null;
}

/** Nur befüllte Listen schreiben — `{"zeiten":[…]}` wie im Bestand */
export function quelleJson(q: Quelle | null | undefined): Json | null {
  if (!q) return null;
  const o: Record<string, string[]> = {};
  if (q.zeiten.length) o.zeiten = q.zeiten;
  if (q.material.length) o.material = q.material;
  if (q.regie.length) o.regie = q.regie;
  if (q.eingang?.length) o.eingang = q.eingang;
  return Object.keys(o).length ? o : null;
}

/** Alle Stunden, Buchungen und Regieberichte, die die Positionen verrechnen */
export function quellenIds(positionen: Pick<EditorPosition, "quelle">[]): Quelle {
  const q = LEERE_QUELLE();
  positionen.forEach((p) => {
    if (!p.quelle) return;
    q.zeiten.push(...p.quelle.zeiten);
    q.material.push(...p.quelle.material);
    q.regie.push(...p.quelle.regie);
    q.eingang!.push(...(p.quelle.eingang ?? []));
  });
  return {
    zeiten: [...new Set(q.zeiten)], material: [...new Set(q.material)], regie: [...new Set(q.regie)], eingang: [...new Set(q.eingang)],
  };
}

// ── Umwandeln: Datenbank ↔ Editor ──────────────────────────────────────

const ARTEN: PositionsArt[] = ["titel", "leistung", "artikel", "arbeit", "material", "pauschale", "text"];

export function positionAusDb(p: Position): EditorPosition {
  return {
    id: p.id,
    art: ARTEN.includes(p.art as PositionsArt) ? (p.art as PositionsArt) : "leistung",
    bezeichnung: p.bezeichnung ?? "",
    langtext: p.langtext ?? "",
    menge: zahlText(p.menge),
    einheit: p.einheit || "Stk",
    einzelpreis: preisText(p.einzelpreis),
    ek_preis: p.ek_preis == null ? null : Number(p.ek_preis),
    minuten: p.minuten == null ? null : Number(p.minuten),
    artikel_id: p.artikel_id,
    leistung_id: p.leistung_id,
    quelle: quelleLesen(p.quelle),
  };
}

/** Zeile für Insert/Upsert — IMMER alle Felder (PostgREST-Sammel-Insert), nie `gesamt` */
export function positionZuDb(p: EditorPosition, belegId: string, pos: number) {
  const leer = ohneBetrag(p);
  return {
    id: p.id,
    beleg_id: belegId,
    pos,
    art: p.art,
    bezeichnung: p.bezeichnung.trim(),
    langtext: p.langtext.trim() || null,
    menge: leer ? 1 : Math.round(mengeVon(p) * 1000) / 1000,
    einheit: (p.einheit || "Stk").trim() || "Stk",
    einzelpreis: leer ? 0 : runden2(preisVon(p)),
    ek_preis: p.ek_preis,
    minuten: p.minuten,
    artikel_id: p.artikel_id,
    leistung_id: p.leistung_id,
    quelle: quelleJson(p.quelle),
  };
}

// ── Neue Positionen ─────────────────────────────────────────────────────

export function leerePosition(art: PositionsArt, werte: Partial<EditorPosition> = {}): EditorPosition {
  return {
    id: neueId(),
    art,
    bezeichnung: "",
    langtext: "",
    menge: "1",
    einheit: art === "arbeit" ? "h" : art === "pauschale" ? "Psch" : "Stk",
    einzelpreis: "0,00",
    ek_preis: null,
    minuten: null,
    artikel_id: null,
    leistung_id: null,
    quelle: null,
    ...werte,
  };
}

export const titelPosition = (name: string) => leerePosition("titel", { bezeichnung: name.trim() });

export function leistungPosition(
  l: KatalogLeistung,
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined,
  stundensatz: number,
  menge = 1,
): EditorPosition {
  const material = l.leistung_material ?? [];
  return leerePosition("leistung", {
    bezeichnung: l.kurztext,
    langtext: l.langtext ?? "",
    menge: zahlText(menge),
    einheit: l.einheit || "Stk",
    einzelpreis: preisText(leistungPreis(l, material, firma, stundensatz)),
    ek_preis: leistungMaterialEk(material) || null,
    minuten: l.minuten == null ? null : Number(l.minuten),
    leistung_id: l.id,
  });
}

export function artikelPosition(
  a: Pick<Artikel, "id" | "bezeichnung" | "einheit" | "vk_preis" | "ek_preis" | "listenpreis">,
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
): EditorPosition {
  return leerePosition("artikel", {
    bezeichnung: a.bezeichnung,
    einheit: a.einheit || "Stk",
    einzelpreis: preisText(artikelVk(a, firma)),
    ek_preis: a.ek_preis == null ? null : Number(a.ek_preis),
    artikel_id: a.id,
  });
}

/** Kopie ohne Herkunft — sonst wären Stunden doppelt verrechnet */
export const kopieVon = (p: EditorPosition, werte: Partial<EditorPosition> = {}): EditorPosition =>
  ({ ...p, id: neueId(), quelle: null, ...werte });

// ── Gruppen (Titel = Raum) ──────────────────────────────────────────────

/**
 * Wo endet die Gruppe eines Titels? Ohne Titel (null) ist die Gruppe der
 * Bereich vor dem ersten Titel.
 */
export function gruppenEnde(positionen: Pick<EditorPosition, "id" | "art">[], titelId: string | null): number {
  if (!titelId) {
    const erster = positionen.findIndex((p) => p.art === "titel");
    return erster < 0 ? positionen.length : erster;
  }
  const i = positionen.findIndex((p) => p.id === titelId);
  if (i < 0) return positionen.length;
  let j = i + 1;
  while (j < positionen.length && positionen[j].art !== "titel") j++;
  return j;
}

function gruppenStart(positionen: Pick<EditorPosition, "id">[], titelId: string | null): number {
  if (!titelId) return 0;
  const i = positionen.findIndex((p) => p.id === titelId);
  return i < 0 ? positionen.length : i + 1;
}

const gleicheHerkunft = (a: EditorPosition, b: EditorPosition) =>
  a.art === b.art
  && a.leistung_id === b.leistung_id
  && a.artikel_id === b.artikel_id
  && a.einheit === b.einheit
  && preisVon(a) === preisVon(b)
  && !a.quelle && !b.quelle;

/**
 * Neue Position ans Ende der Gruppe. Gibt es dieselbe Leistung/denselben
 * Artikel zum selben Preis dort schon, wird nur die Menge erhöht —
 * dreimal „Steckdose“ antippen ergibt eine Zeile mit 3 Stück.
 */
export function hinzufuegen(
  positionen: EditorPosition[],
  neu: EditorPosition,
  titelId: string | null,
): { liste: EditorPosition[]; id: string } {
  const start = gruppenStart(positionen, titelId);
  const ende = gruppenEnde(positionen, titelId);
  if (neu.leistung_id || neu.artikel_id) {
    for (let k = start; k < ende; k++) {
      const p = positionen[k];
      if (gleicheHerkunft(p, neu)) {
        const liste = [...positionen];
        liste[k] = { ...p, menge: zahlText(mengeVon(p) + mengeVon(neu)) };
        return { liste, id: p.id };
      }
    }
  }
  const liste = [...positionen];
  liste.splice(ende, 0, neu);
  return { liste, id: neu.id };
}

/** Mehrere Positionen (Sprache, Import) — jede wie `hinzufuegen` */
export function alleHinzufuegen(positionen: EditorPosition[], neue: EditorPosition[], titelId: string | null): EditorPosition[] {
  return neue.reduce((liste, p) => hinzufuegen(liste, p, titelId).liste, positionen);
}

/** Wie oft steckt eine Leistung schon in der Gruppe? (Zahl auf der Kachel) */
export function mengeInGruppe(positionen: EditorPosition[], titelId: string | null, leistungId: string): number {
  const start = gruppenStart(positionen, titelId);
  const ende = gruppenEnde(positionen, titelId);
  let summe = 0;
  for (let k = start; k < ende; k++) if (positionen[k].leistung_id === leistungId) summe += mengeVon(positionen[k]);
  return summe;
}

/** Menge der letzten passenden Zeile der Gruppe um eins senken; bei 0 fällt die Zeile weg */
export function leistungWeniger(positionen: EditorPosition[], titelId: string | null, leistungId: string): EditorPosition[] {
  const start = gruppenStart(positionen, titelId);
  const ende = gruppenEnde(positionen, titelId);
  for (let k = ende - 1; k >= start; k--) {
    const p = positionen[k];
    if (p.leistung_id !== leistungId || p.quelle) continue;
    const m = mengeVon(p) - 1;
    if (m <= 0) return positionen.filter((x) => x.id !== p.id);
    const liste = [...positionen];
    liste[k] = { ...p, menge: zahlText(m) };
    return liste;
  }
  return positionen;
}

/** Titel, unter dem eine Position steht (oder null) */
export function titelVon(positionen: Pick<EditorPosition, "id" | "art">[], id: string): string | null {
  const i = positionen.findIndex((p) => p.id === id);
  for (let k = i; k >= 0; k--) if (positionen[k].art === "titel") return positionen[k].id;
  return null;
}

/** Titel mit diesem Namen finden (ohne Groß-/Kleinschreibung) */
export function titelMitNamen(positionen: EditorPosition[], name: string): EditorPosition | undefined {
  const n = name.trim().toLowerCase();
  return positionen.find((p) => p.art === "titel" && p.bezeichnung.trim().toLowerCase() === n);
}

/** „Kinderzimmer“ gibt es schon → „Kinderzimmer 2“ */
export function freierTitelName(positionen: EditorPosition[], wunsch: string): string {
  const basis = wunsch.trim().replace(/\s+\d+$/, "");
  const namen = positionen.filter((p) => p.art === "titel").map((p) => p.bezeichnung.trim().toLowerCase());
  if (!namen.includes(wunsch.trim().toLowerCase())) return wunsch.trim();
  let hoechste = 1;
  namen.forEach((n) => {
    if (n === basis.toLowerCase()) hoechste = Math.max(hoechste, 1);
    const m = n.match(/^(.*)\s+(\d+)$/);
    if (m && m[1] === basis.toLowerCase()) hoechste = Math.max(hoechste, Number(m[2]));
  });
  return `${basis} ${hoechste + 1}`;
}

type Block = { start: number; ende: number; titel: boolean };

function bloecke(positionen: Pick<EditorPosition, "art">[]): Block[] {
  const b: Block[] = [];
  positionen.forEach((p, i) => {
    if (p.art === "titel" || i === 0) b.push({ start: i, ende: i + 1, titel: p.art === "titel" });
    else b[b.length - 1].ende = i + 1;
  });
  return b;
}

/**
 * Eine Zeile nach oben/unten. Ein Titel nimmt seine ganze Gruppe mit und
 * tauscht mit der Nachbargruppe — so ordnet man Räume um.
 */
export function verschieben(positionen: EditorPosition[], id: string, richtung: -1 | 1): EditorPosition[] {
  const i = positionen.findIndex((p) => p.id === id);
  if (i < 0) return positionen;
  if (positionen[i].art !== "titel") {
    const j = i + richtung;
    if (j < 0 || j >= positionen.length) return positionen;
    const liste = [...positionen];
    [liste[i], liste[j]] = [liste[j], liste[i]];
    return liste;
  }
  const b = bloecke(positionen);
  const k = b.findIndex((x) => x.start === i);
  const n = k + richtung;
  if (k < 0 || n < 0 || n >= b.length || !b[n].titel) return positionen;
  const [vorne, hinten] = richtung < 0 ? [b[n], b[k]] : [b[k], b[n]];
  return [
    ...positionen.slice(0, vorne.start),
    ...positionen.slice(hinten.start, hinten.ende),
    ...positionen.slice(vorne.start, vorne.ende),
    ...positionen.slice(hinten.ende),
  ];
}

export const kannVerschieben = (positionen: EditorPosition[], id: string, richtung: -1 | 1) =>
  verschieben(positionen, id, richtung) !== positionen;

/** Zeile kopieren — ein Titel kopiert seinen ganzen Raum („Kinderzimmer 2“) */
export function duplizieren(positionen: EditorPosition[], id: string): { liste: EditorPosition[]; neueId: string } {
  const i = positionen.findIndex((p) => p.id === id);
  if (i < 0) return { liste: positionen, neueId: id };
  const p = positionen[i];
  if (p.art !== "titel") {
    const kopie = kopieVon(p);
    const liste = [...positionen];
    liste.splice(i + 1, 0, kopie);
    return { liste, neueId: kopie.id };
  }
  const ende = gruppenEnde(positionen, id);
  const block = positionen.slice(i, ende).map((x) => kopieVon(x));
  block[0] = { ...block[0], bezeichnung: freierTitelName(positionen, p.bezeichnung) };
  const liste = [...positionen];
  liste.splice(ende, 0, ...block);
  return { liste, neueId: block[0].id };
}

/** Zeile löschen; bei einem Titel auf Wunsch samt seiner Positionen */
export function entfernen(positionen: EditorPosition[], id: string, mitGruppe = false): EditorPosition[] {
  const i = positionen.findIndex((p) => p.id === id);
  if (i < 0) return positionen;
  if (!mitGruppe || positionen[i].art !== "titel") return positionen.filter((p) => p.id !== id);
  return [...positionen.slice(0, i), ...positionen.slice(gruppenEnde(positionen, id))];
}

export const gruppenGroesse = (positionen: EditorPosition[], titelId: string) =>
  gruppenEnde(positionen, titelId) - gruppenStart(positionen, titelId);

// ── Nummern und Zwischensummen (Editor und PDF) ─────────────────────────

/**
 * Positionsnummern: Titel 1, 2, 3 — darunter 1.1, 1.2 …; Positionen vor dem
 * ersten Titel zählen oben mit. Textzeilen bekommen keine Nummer.
 */
export function positionsNummern(arten: string[]): string[] {
  let oben = 0;
  let titel: number | null = null;
  let unter = 0;
  return arten.map((art) => {
    if (art === "text") return "";
    if (art === "titel") {
      oben += 1;
      titel = oben;
      unter = 0;
      return String(oben);
    }
    if (titel == null) {
      oben += 1;
      return String(oben);
    }
    unter += 1;
    return `${titel}.${unter}`;
  });
}

/** Summe je Titelgruppe — Index des Titels → Betrag */
export function zwischensummen(zeilen: { art: string; gesamt: number }[]): Record<number, number> {
  const s: Record<number, number> = {};
  let titel: number | null = null;
  zeilen.forEach((z, i) => {
    if (z.art === "titel") {
      titel = i;
      s[i] = 0;
    } else if (titel != null) {
      s[titel] = runden2(s[titel] + z.gesamt);
    }
  });
  return s;
}

// ── Kopfdaten ───────────────────────────────────────────────────────────

export type Kopf = {
  typ: BelegTyp;
  projekt_id: string | null;
  kunde_id: string | null;
  angebot_id: string | null;
  empf_name: string;
  empf_zusatz: string;
  empf_strasse: string;
  empf_plz: string;
  empf_ort: string;
  empf_uid: string;
  empf_email: string;
  datum: string;
  leistung_von: string;
  leistung_bis: string;
  gueltig_bis: string;
  faellig_am: string;
  betreff: string;
  einleitung: string;
  schlusstext: string;
  ust_satz: number;
  reverse_charge: boolean;
  /** nur Angebote: Kostenvoranschlag mit Gewähr (§ 1170a Abs. 1 ABGB) */
  kv_verbindlich: boolean;
};

export function kopfNeu(typ: BelegTyp, firma: Firma | null | undefined, heute: string): Kopf {
  return {
    typ,
    projekt_id: null,
    kunde_id: null,
    angebot_id: null,
    empf_name: "",
    empf_zusatz: "",
    empf_strasse: "",
    empf_plz: "",
    empf_ort: "",
    empf_uid: "",
    empf_email: "",
    datum: heute,
    leistung_von: "",
    leistung_bis: "",
    gueltig_bis: "",
    faellig_am: "",
    betreff: "",
    einleitung: (typ === "angebot" ? firma?.angebot_einleitung : firma?.rechnung_einleitung) ?? "",
    schlusstext: (typ === "angebot" ? firma?.angebot_schluss : firma?.rechnung_schluss) ?? "",
    ust_satz: 20,
    reverse_charge: false,
    kv_verbindlich: false,
  };
}

export function kopfAusBeleg(b: Beleg): Kopf {
  return {
    typ: b.typ === "rechnung" ? "rechnung" : "angebot",
    projekt_id: b.projekt_id,
    kunde_id: b.kunde_id,
    angebot_id: b.angebot_id,
    empf_name: b.empf_name ?? "",
    empf_zusatz: b.empf_zusatz ?? "",
    empf_strasse: b.empf_strasse ?? "",
    empf_plz: b.empf_plz ?? "",
    empf_ort: b.empf_ort ?? "",
    empf_uid: b.empf_uid ?? "",
    empf_email: b.empf_email ?? "",
    datum: b.datum,
    leistung_von: b.leistung_von ?? "",
    leistung_bis: b.leistung_bis ?? "",
    gueltig_bis: b.gueltig_bis ?? "",
    faellig_am: b.faellig_am ?? "",
    betreff: b.betreff ?? "",
    einleitung: b.einleitung ?? "",
    schlusstext: b.schlusstext ?? "",
    ust_satz: Number(b.ust_satz ?? 20),
    reverse_charge: !!b.reverse_charge,
    kv_verbindlich: !!b.kv_verbindlich,
  };
}

const oderNull = (s: string) => (s.trim() ? s.trim() : null);

/** Kopf als Spalten für belege (ohne Summen, Status, Nummer) */
export function kopfZuDb(k: Kopf) {
  return {
    typ: k.typ,
    projekt_id: k.projekt_id,
    kunde_id: k.kunde_id,
    angebot_id: k.angebot_id,
    empf_name: oderNull(k.empf_name),
    empf_zusatz: oderNull(k.empf_zusatz),
    empf_strasse: oderNull(k.empf_strasse),
    empf_plz: oderNull(k.empf_plz),
    empf_ort: oderNull(k.empf_ort),
    empf_uid: oderNull(k.empf_uid),
    empf_email: oderNull(k.empf_email),
    datum: k.datum,
    leistung_von: oderNull(k.leistung_von),
    leistung_bis: oderNull(k.leistung_bis),
    gueltig_bis: oderNull(k.gueltig_bis),
    faellig_am: oderNull(k.faellig_am),
    betreff: oderNull(k.betreff),
    einleitung: oderNull(k.einleitung),
    schlusstext: oderNull(k.schlusstext),
    ust_satz: k.ust_satz,
    reverse_charge: k.reverse_charge,
    kv_verbindlich: k.typ === "angebot" && k.kv_verbindlich,
  };
}

/** Anschrift des Kunden in den Beleg übernehmen (Momentaufnahme) */
export function empfaengerAusKunde(k: Kunde | null): Partial<Kopf> {
  if (!k) return { kunde_id: null };
  return {
    kunde_id: k.id,
    empf_name: k.name ?? "",
    empf_zusatz: "",
    empf_strasse: k.strasse ?? "",
    empf_plz: k.plz ?? "",
    empf_ort: k.ort ?? "",
    empf_uid: k.uid ?? "",
    empf_email: k.email ?? "",
  };
}

/** Ohne USt: Reverse Charge oder Kleinunternehmer */
export const ohneUstFuer = (k: Pick<Kopf, "reverse_charge">, firma: Pick<Firma, "kleinunternehmer"> | null | undefined) =>
  !!k.reverse_charge || !!firma?.kleinunternehmer;

/**
 * Hinweise vor dem Fertigstellen — blockieren nicht, sollen aber auffallen.
 * Rechnungsangaben nach § 11 UStG (WKO): Leistungszeitraum; eigene UID ab
 * 400 € brutto (bei Reverse Charge immer); UID des Empfängers ab 10.000 €
 * brutto (Firmenkunden) und bei Reverse Charge. Kleinunternehmer haben oft
 * keine UID — dort kein Hinweis auf die eigene.
 */
export function fertigHinweise(
  k: Pick<Kopf, "typ" | "reverse_charge" | "empf_uid" | "empf_strasse" | "empf_ort" | "leistung_von" | "leistung_bis"> & Partial<Pick<Kopf, "datum">>,
  positionen: Pick<EditorPosition, "art" | "menge" | "einzelpreis">[],
  brutto: number,
  firma: Pick<Firma, "uid" | "kleinunternehmer"> | null | undefined,
  heute?: string,
): string[] {
  const rechnung = k.typ === "rechnung";
  const rc = !!k.reverse_charge && !firma?.kleinunternehmer;
  const empfUid = !!k.empf_uid.trim();
  const ohneBetragAnzahl = positionen.filter((p) => !ohneBetrag(p) && (mengeVon(p) === 0 || preisVon(p) === 0)).length;
  return [
    ohneBetragAnzahl > 0 && `${ohneBetragAnzahl} ${ohneBetragAnzahl === 1 ? "Position" : "Positionen"} ohne Betrag (Menge oder Preis 0)`,
    rc && !empfUid && "Reverse Charge, aber keine UID des Empfängers",
    rechnung && !rc && brutto >= 10_000 && !empfUid && "Bei Firmenkunden ab 10.000 € brutto gehört die UID des Empfängers auf die Rechnung.",
    rechnung && !!firma && !firma.kleinunternehmer && !firma.uid?.trim() && (brutto > 400 || rc) && "Eigene UID fehlt — in Einstellungen → Betrieb eintragen.",
    rechnung && !k.leistung_von && !k.leistung_bis && "Kein Leistungszeitraum — auf Rechnungen Pflicht (§ 11 UStG)",
    rechnung && !!heute && !!k.datum && k.datum < heute && "Rechnungsdatum liegt vor heute — auf die Rechnung gehört das Ausstellungsdatum.",
    rechnung && brutto < 0 && "Summe negativ — für eine Gutschrift die Rechnung lieber stornieren.",
    (!k.empf_strasse.trim() || !k.empf_ort.trim()) && "Anschrift des Empfängers unvollständig",
  ].filter((w): w is string => !!w);
}
