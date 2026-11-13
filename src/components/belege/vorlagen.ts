import type { Json } from "@/integrations/supabase/types";
import { artikelVk, leistungMaterialEk, leistungPreis, runden2 } from "@/lib/preise";
import type { Artikel, Firma } from "@/lib/types";
import {
  gruppenEnde, leerePosition, mengeVon, ohneBetrag, preisText, preisVon, summen, zahlText,
  type EditorPosition, type KatalogLeistung, type PositionsArt,
} from "./editor";

/**
 * Angebotsvorlagen als reine Daten: aus einem Angebot eine Vorlage machen,
 * aus einer Vorlage Positionen mit aktuellen Preisen. Eine Vorlage ist ein
 * ganzes Angebot („PV 10 kWp Aufdach“) — eine Leistung aus dem Katalog ist
 * dagegen EINE Position mit Material. Keine Oberfläche, kein Supabase.
 */

/** Eine Position in der Vorlage — wie im Editor, aber ohne ID und Herkunft */
export type VorlagePosition = {
  art: PositionsArt;
  bezeichnung: string;
  langtext: string | null;
  menge: number;
  einheit: string;
  einzelpreis: number;
  ek_preis: number | null;
  minuten: number | null;
  artikel_id: string | null;
  leistung_id: string | null;
};

export type Vorlage = {
  id: string;
  name: string;
  kategorie: string | null;
  betreff: string | null;
  einleitung: string | null;
  schlusstext: string | null;
  positionen: VorlagePosition[];
  netto: number;
  updated_at: string;
};

/** Vorschläge für Kategorien — dazu kommen die schon benutzten */
export const KATEGORIE_VORSCHLAEGE = ["PV-Anlage", "Speicher", "Wallbox", "E-Befund", "Elektroinstallation", "Service"];

const ARTEN: PositionsArt[] = ["titel", "leistung", "artikel", "arbeit", "material", "pauschale", "text"];

/**
 * Editor → Vorlage. Abzüge (Teilrechnungen) gehören zu einer Rechnung, nicht
 * in eine Vorlage; Herkunft (Stunden, Material) wird nie mitgenommen.
 */
export function vorlageAusEditor(positionen: EditorPosition[]): VorlagePosition[] {
  return positionen
    .filter((p) => p.art !== "abzug")
    .map((p) => {
      const leer = ohneBetrag(p);
      return {
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
      };
    });
}

/** Netto der Vorlage (zur Anzeige in der Auswahl) */
export function vorlageNetto(positionen: VorlagePosition[]): number {
  return positionen.reduce((s, p) => (ohneBetrag(p) ? s : runden2(s + runden2(p.menge * p.einzelpreis))), 0);
}

/** jsonb aus der Datenbank lesen — Kaputtes fällt weg statt abzustürzen */
export function vorlagePositionenLesen(j: Json | null | undefined): VorlagePosition[] {
  if (!Array.isArray(j)) return [];
  const text = (x: unknown) => (typeof x === "string" ? x : "");
  const zahlOder = (x: unknown, ersatz: number | null) => (x == null || x === "" || !Number.isFinite(Number(x)) ? ersatz : Number(x));
  return j.flatMap((roh) => {
    if (!roh || typeof roh !== "object" || Array.isArray(roh)) return [];
    const o = roh as Record<string, unknown>;
    const art = ARTEN.includes(o.art as PositionsArt) ? (o.art as PositionsArt) : null;
    if (!art) return [];
    return [{
      art,
      bezeichnung: text(o.bezeichnung),
      langtext: text(o.langtext) || null,
      menge: zahlOder(o.menge, 1) ?? 1,
      einheit: text(o.einheit) || "Stk",
      einzelpreis: zahlOder(o.einzelpreis, 0) ?? 0,
      ek_preis: zahlOder(o.ek_preis, null),
      minuten: zahlOder(o.minuten, null),
      artikel_id: text(o.artikel_id) || null,
      leistung_id: text(o.leistung_id) || null,
    }];
  });
}

export type PreisArtikel = Pick<Artikel, "id" | "bezeichnung" | "einheit" | "vk_preis" | "ek_preis" | "listenpreis"> & { aktiv?: boolean | null };

/** Ein Preis aus der Vorlage weicht vom heutigen ab */
export type Abweichung = { bezeichnung: string; alt: number; neu: number };

/**
 * Vorlage → Editor-Positionen. Mit `nachziehen` kommen Preis und Einkauf
 * verknüpfter Positionen aus dem heutigen Artikelstamm bzw. Leistungskatalog
 * (Menge, Text und Einheit bleiben aus der Vorlage). Was es nicht mehr gibt,
 * behält den Preis der Vorlage und steht als `fehlt` im Ergebnis.
 */
export function ausVorlage(
  vorlage: VorlagePosition[],
  quellen: { artikel: Map<string, PreisArtikel>; leistungen: Map<string, KatalogLeistung> },
  firma: Pick<Firma, "material_aufschlag" | "stundensatz"> | null | undefined,
  stundensatz: number,
  nachziehen: boolean,
): { positionen: EditorPosition[]; abweichungen: Abweichung[]; fehlt: string[] } {
  const abweichungen: Abweichung[] = [];
  const fehlt: string[] = [];
  const positionen = vorlage.map((v) => {
    const leer = ohneBetrag(v);
    let preis = v.einzelpreis;
    let ek = v.ek_preis;
    let minuten = v.minuten;
    if (!leer && v.artikel_id) {
      const a = quellen.artikel.get(v.artikel_id);
      if (!a || a.aktiv === false) fehlt.push(v.bezeichnung);
      else {
        const heute = artikelVk(a, firma);
        if (heute > 0 && Math.abs(heute - v.einzelpreis) >= 0.005) abweichungen.push({ bezeichnung: v.bezeichnung, alt: v.einzelpreis, neu: heute });
        if (nachziehen && heute > 0) {
          preis = heute;
          ek = a.ek_preis == null ? null : Number(a.ek_preis);
        }
      }
    } else if (!leer && v.leistung_id) {
      const l = quellen.leistungen.get(v.leistung_id);
      if (!l) fehlt.push(v.bezeichnung);
      else {
        const material = l.leistung_material ?? [];
        const heute = leistungPreis(l, material, firma, stundensatz);
        if (heute > 0 && Math.abs(heute - v.einzelpreis) >= 0.005) abweichungen.push({ bezeichnung: v.bezeichnung, alt: v.einzelpreis, neu: heute });
        if (nachziehen && heute > 0) {
          preis = heute;
          ek = leistungMaterialEk(material) || null;
          minuten = l.minuten == null ? null : Number(l.minuten);
        }
      }
    }
    return leerePosition(v.art, {
      bezeichnung: v.bezeichnung,
      langtext: v.langtext ?? "",
      menge: leer ? "0" : zahlText(v.menge),
      einheit: v.einheit || "Stk",
      einzelpreis: preisText(leer ? 0 : preis),
      ek_preis: ek,
      minuten,
      artikel_id: v.artikel_id,
      leistung_id: v.leistung_id,
    });
  });
  return { positionen, abweichungen, fehlt };
}

/**
 * Vorlage in ein Angebot einfügen: alles ans Ende der Gruppe des aktiven
 * Titels. Positionen vor dem ersten Titel der Vorlage landen so unter dem
 * aktiven Titel, die Titel der Vorlage folgen direkt danach als eigene
 * Abschnitte (gleicher Name wie ein vorhandener → „Dach 2“).
 * Gibt die neue Liste und den letzten eingefügten Titel zurück.
 */
export function vorlageEinfuegen(
  liste: EditorPosition[],
  neue: EditorPosition[],
  titelId: string | null,
): { liste: EditorPosition[]; letzterTitel: string | null } {
  if (!neue.length) return { liste, letzterTitel: null };
  const namen = new Set(liste.filter((p) => p.art === "titel").map((p) => p.bezeichnung.trim().toLowerCase()));
  const block = neue.map((p) => {
    if (p.art !== "titel") return p;
    let name = p.bezeichnung.trim();
    if (name && namen.has(name.toLowerCase())) {
      let n = 2;
      while (namen.has(`${name} ${n}`.toLowerCase())) n += 1;
      name = `${name} ${n}`;
    }
    namen.add(name.toLowerCase());
    return { ...p, bezeichnung: name };
  });
  const ende = gruppenEnde(liste, titelId);
  const neueListe = [...liste.slice(0, ende), ...block, ...liste.slice(ende)];
  const letzter = [...block].reverse().find((p) => p.art === "titel");
  return { liste: neueListe, letzterTitel: letzter?.id ?? null };
}

/** Kategorien der vorhandenen Vorlagen plus Vorschläge, ohne doppelte */
export function kategorienAus(vorlagen: Pick<Vorlage, "kategorie">[], mitVorschlaegen = false): string[] {
  const alle = vorlagen.map((v) => v.kategorie?.trim()).filter((k): k is string => !!k);
  const liste = mitVorschlaegen ? [...alle, ...KATEGORIE_VORSCHLAEGE] : alle;
  const gesehen = new Set<string>();
  return liste.filter((k) => {
    const s = k.toLowerCase();
    if (gesehen.has(s)) return false;
    gesehen.add(s);
    return true;
  }).sort((a, b) => a.localeCompare(b, "de"));
}

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Suche über Name, Kategorie, Betreff und die Texte der Positionen */
export function vorlagenFiltern<T extends Pick<Vorlage, "name" | "kategorie" | "betreff" | "positionen">>(vorlagen: T[], suche: string, kategorie: string | null): T[] {
  const woerter = normal(suche).split(/\s+/).filter(Boolean);
  return vorlagen.filter((v) => {
    if (kategorie && (v.kategorie ?? "").toLowerCase() !== kategorie.toLowerCase()) return false;
    if (!woerter.length) return true;
    const text = normal([v.name, v.kategorie, v.betreff, ...v.positionen.map((p) => p.bezeichnung)].filter(Boolean).join(" "));
    return woerter.every((w) => text.includes(w));
  });
}

/** Kurzbeschreibung für die Liste: „3 Abschnitte · 12 Positionen“ */
export function vorlageUmfang(positionen: VorlagePosition[]): string {
  const titel = positionen.filter((p) => p.art === "titel").length;
  const n = positionen.filter((p) => !ohneBetrag(p)).length;
  return [titel ? `${titel} ${titel === 1 ? "Abschnitt" : "Abschnitte"}` : null, `${n} ${n === 1 ? "Position" : "Positionen"}`].filter(Boolean).join(" · ");
}

/** Summe der Editor-Positionen — für „Netto danach“ in der Vorschau */
export const nettoVon = (positionen: EditorPosition[]) => summen(positionen, 0, true).netto;
