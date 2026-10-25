import { supabase } from "@/integrations/supabase/client";
import { datum as datumText } from "@/lib/format";
import { buchungVk, runden2 } from "@/lib/preise";
import type { Artikel, Firma, Position } from "@/lib/types";
import {
  kopieVon, leerePosition, positionAusDb, preisText, titelPosition, zahlText,
  type EditorPosition, type Quelle,
} from "./editor";

/**
 * „Rechnung aus dem Projekt“: alles, was am Projekt noch nicht verrechnet
 * ist, als Vorschlag laden — und daraus Positionen bauen, die ihre Herkunft
 * kennen (`quelle`). Gebunden (rechnung_id gesetzt) wird erst beim Speichern.
 */

export type ImportZeit = {
  id: string;
  datum: string;
  stunden: number;
  taetigkeit: string | null;
  user_id: string;
  name: string;
  regiebericht_id: string | null;
};

export type ImportMaterial = {
  id: string;
  art: string;
  menge: number;
  ek_preis: number | null;
  bezeichnung: string;
  einheit: string;
  artikel_id: string | null;
  artikel: Pick<Artikel, "vk_preis" | "ek_preis" | "listenpreis"> | null;
  regiebericht_id: string | null;
  datum: string;
};

export type ImportRegie = {
  id: string;
  nummer: string | null;
  datum: string;
  arbeiten: string;
  zeiten: ImportZeit[];
  material: ImportMaterial[];
};

export type ImportAngebot = {
  id: string;
  nummer: string | null;
  betreff: string | null;
  status: string;
  netto: number;
  positionen: Position[];
};

export type ImportDaten = {
  angebote: ImportAngebot[];
  regie: ImportRegie[];
  /** Stunden ohne Regiebericht */
  zeiten: ImportZeit[];
  /** Material ohne Regiebericht */
  material: ImportMaterial[];
  /** Regieberichte, die noch nicht unterschrieben sind (Hinweis) */
  unsigniert: { id: string; nummer: string | null; datum: string }[];
  /** Angebot, das schon in diesem Entwurf steckt — wird nicht noch einmal angeboten */
  angebotImEntwurf: { id: string; nummer: string | null } | null;
};

export type ImportAuswahl = {
  angebote: string[];
  regie: string[];
  zeiten: string[];
  /** Schlüssel der Materialgruppen (ohne Regiebericht) */
  material: string[];
};

export type ImportOptionen = {
  stundenJeMitarbeiter: boolean;
  materialPauschale: boolean;
  stundensatz: number;
  /**
   * Nach Angebot abgerechnet: Stunden und Material, die nicht angehakt sind,
   * mit dem Angebot abgegolten — eine Textzeile bindet sie an die Rechnung
   * (gelten als verrechnet, ohne Betrag). Sonst blieben sie für immer „offen“.
   */
  abgegolten?: boolean;
};

export const ABGEGOLTEN_TEXT = "Arbeitszeit und Material sind im Angebotspreis enthalten.";

// ── Laden ───────────────────────────────────────────────────────────────

type ZeitZeile = {
  id: string; datum: string; stunden: number; taetigkeit: string | null; user_id: string;
  regiebericht_id: string | null; profiles: { vorname: string; nachname: string } | null;
};
type MaterialZeile = {
  id: string; art: string; menge: number; ek_preis: number | null; einheit: string | null; bezeichnung: string | null;
  artikel_id: string | null; regiebericht_id: string | null; created_at: string;
  artikel: { bezeichnung: string; einheit: string; vk_preis: number | null; ek_preis: number | null; listenpreis: number | null } | null;
};

/**
 * Lädt alles Offene eines Projekts. `belegId`: was schon an DIESEM Entwurf
 * hängt, zählt als frei (es kann im Editor gelöscht und neu übernommen
 * werden); `belegt`: was im Editor gerade schon übernommen ist, fehlt.
 * `angebotDrin`: Angebot dieses Entwurfs (auch ungespeichert) — fehlt auch.
 */
export async function importDatenLaden(projektId: string, belegId: string | null, belegt: Quelle, angebotDrin: string | null = null): Promise<ImportDaten> {
  // frei = noch nicht verrechnet, oder an genau diesem Entwurf
  const frei = belegId ? `rechnung_id.is.null,rechnung_id.eq.${belegId}` : "rechnung_id.is.null";

  const [rb, zt, mt, an] = await Promise.all([
    supabase.from("regieberichte").select("id, nummer, datum, arbeiten, status, rechnung_id").eq("projekt_id", projektId).order("datum"),
    supabase.from("zeiten")
      .select("id, datum, stunden, taetigkeit, user_id, regiebericht_id, profiles(vorname, nachname)")
      .eq("projekt_id", projektId).or(frei).order("datum").order("created_at"),
    supabase.from("material_buchungen")
      .select("id, art, menge, ek_preis, einheit, bezeichnung, artikel_id, regiebericht_id, created_at, artikel(bezeichnung, einheit, vk_preis, ek_preis, listenpreis)")
      .eq("projekt_id", projektId).in("art", ["ausfassung", "rueckgabe", "direkt"]).or(frei).order("created_at"),
    supabase.from("belege").select("id, nummer, betreff, status, netto").eq("projekt_id", projektId).eq("typ", "angebot")
      .in("status", ["offen", "angenommen"]).order("datum"),
  ]);
  for (const r of [rb, zt, mt, an]) if (r.error) throw new Error(r.error.message);
  const zeitZeilen = (zt.data ?? []) as unknown as ZeitZeile[];
  const materialZeilen = (mt.data ?? []) as unknown as MaterialZeile[];

  // Angebote, die schon in einer (nicht stornierten) Rechnung stecken, fallen
  // weg — auch in diesem Entwurf: ein zweites Mal übernommen = doppelt verrechnet
  const angebotIds = (an.data ?? []).map((a) => a.id);
  let verrechnet = new Set<string>();
  let angebotPositionen: Position[] = [];
  if (angebotIds.length) {
    const [re, po] = await Promise.all([
      supabase.from("belege").select("id, angebot_id").eq("typ", "rechnung").neq("status", "storniert").in("angebot_id", angebotIds),
      supabase.from("beleg_positionen").select("*").in("beleg_id", angebotIds).order("pos"),
    ]);
    if (re.error) throw new Error(re.error.message);
    if (po.error) throw new Error(po.error.message);
    verrechnet = new Set((re.data ?? []).map((r) => r.angebot_id as string));
    angebotPositionen = po.data ?? [];
  }
  if (angebotDrin) verrechnet.add(angebotDrin);

  const zeiten: ImportZeit[] = zeitZeilen
    .filter((z) => !belegt.zeiten.includes(z.id))
    .map((z) => ({
      id: z.id,
      datum: z.datum,
      stunden: Number(z.stunden),
      taetigkeit: z.taetigkeit,
      user_id: z.user_id,
      name: z.profiles ? `${z.profiles.vorname} ${z.profiles.nachname}`.trim() : "Mitarbeiter",
      regiebericht_id: z.regiebericht_id,
    }));
  const material: ImportMaterial[] = materialZeilen
    .filter((m) => !belegt.material.includes(m.id))
    .map((m) => ({
      id: m.id,
      art: m.art,
      menge: Number(m.menge),
      ek_preis: m.ek_preis == null ? null : Number(m.ek_preis),
      bezeichnung: m.artikel?.bezeichnung ?? m.bezeichnung ?? "Material",
      einheit: m.artikel?.einheit ?? m.einheit ?? "Stk",
      artikel_id: m.artikel_id,
      artikel: m.artikel,
      regiebericht_id: m.regiebericht_id,
      datum: m.created_at.slice(0, 10),
    }));

  const berichte = rb.data ?? [];
  const offen = berichte.filter((r) =>
    r.status === "unterschrieben" && (r.rechnung_id == null || r.rechnung_id === belegId) && !belegt.regie.includes(r.id));

  return {
    angebote: (an.data ?? [])
      .filter((a) => !verrechnet.has(a.id))
      .map((a) => ({
        id: a.id,
        nummer: a.nummer,
        betreff: a.betreff,
        status: a.status,
        netto: Number(a.netto),
        positionen: angebotPositionen.filter((p) => p.beleg_id === a.id),
      })),
    regie: offen.map((r) => ({
      id: r.id,
      nummer: r.nummer,
      datum: r.datum,
      arbeiten: r.arbeiten ?? "",
      zeiten: zeiten.filter((z) => z.regiebericht_id === r.id),
      material: material.filter((m) => m.regiebericht_id === r.id),
    })),
    // Stunden/Material eines Regieberichts gehören zum Bericht, nie einzeln
    zeiten: zeiten.filter((z) => !z.regiebericht_id),
    material: material.filter((m) => !m.regiebericht_id),
    unsigniert: berichte.filter((r) => r.status !== "unterschrieben").map((r) => ({ id: r.id, nummer: r.nummer, datum: r.datum })),
    angebotImEntwurf: angebotDrin ? { id: angebotDrin, nummer: (an.data ?? []).find((a) => a.id === angebotDrin)?.nummer ?? null } : null,
  };
}

// ── Rechnen ─────────────────────────────────────────────────────────────

export type MaterialGruppe = {
  schluessel: string;
  bezeichnung: string;
  einheit: string;
  artikel_id: string | null;
  /** ausgefasst + direkt − zurück */
  menge: number;
  /** EK je Einheit (gewichtet aus den Buchungen) */
  ek: number | null;
  vk: number;
  ids: string[];
};

/**
 * Buchungen je Artikel zusammenfassen: Rückgaben ziehen ab. VK über
 * `buchungVk` wie im Projekt-Material — der aktuelle Preis des Artikels,
 * bei freiem Text der EK der Buchungen + Aufschlag. Der EK der Gruppe bleibt
 * der beim Buchen (Nachkalkulation). Mehr zurück als ausgefasst ergibt keine
 * Minus-Position.
 */
export function materialGruppen(buchungen: ImportMaterial[], firma: Pick<Firma, "material_aufschlag"> | null | undefined): MaterialGruppe[] {
  type Sammler = { g: MaterialGruppe; ekSumme: number; ekMenge: number; artikel: ImportMaterial["artikel"] };
  const map = new Map<string, Sammler>();
  buchungen.forEach((b) => {
    const schluessel = b.artikel_id ?? `frei:${b.bezeichnung.trim().toLowerCase()}|${b.einheit}`;
    let s = map.get(schluessel);
    if (!s) {
      s = {
        g: { schluessel, bezeichnung: b.bezeichnung, einheit: b.einheit, artikel_id: b.artikel_id, menge: 0, ek: null, vk: 0, ids: [] },
        ekSumme: 0,
        ekMenge: 0,
        artikel: b.artikel,
      };
      map.set(schluessel, s);
    }
    s.g.menge += b.art === "rueckgabe" ? -b.menge : b.menge;
    s.g.ids.push(b.id);
    if (b.ek_preis != null && b.art !== "rueckgabe") {
      s.ekSumme += b.ek_preis * b.menge;
      s.ekMenge += b.menge;
    } else if (b.ek_preis != null && s.ekMenge === 0 && s.g.ek == null) {
      s.g.ek = b.ek_preis;
    }
  });
  return [...map.values()]
    .map(({ g, ekSumme, ekMenge, artikel }) => {
      const ek = ekMenge > 0 ? ekSumme / ekMenge : g.ek ?? (artikel?.ek_preis == null ? null : Number(artikel.ek_preis));
      const menge = Math.round(g.menge * 1000) / 1000;
      const vk = buchungVk({ ek_preis: ek, artikel }, firma);
      return { ...g, menge, ek: ek == null ? null : Math.round(ek * 10000) / 10000, vk };
    })
    .filter((g) => g.menge > 0)
    .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"));
}

/** „15.10.2026“ oder „15.10.2026 – 16.10.2026“ */
export function zeitraumText(daten: string[]): string {
  const d = [...new Set(daten)].sort();
  if (!d.length) return "";
  return d.length === 1 ? datumText(d[0]) : `${datumText(d[0])} – ${datumText(d[d.length - 1])}`;
}

const q = (werte: Partial<Quelle>): Quelle => ({ zeiten: [], material: [], regie: [], ...werte });

/** Arbeitszeit-Zeilen: je Mitarbeiter oder eine Zeile */
export function arbeitszeitPositionen(zeiten: ImportZeit[], opt: ImportOptionen, mitDatum: boolean): EditorPosition[] {
  if (!zeiten.length) return [];
  const zeile = (titel: string, z: ImportZeit[]) => leerePosition("arbeit", {
    bezeichnung: titel,
    langtext: mitDatum ? zeitraumText(z.map((x) => x.datum)) : "",
    menge: zahlText(runden2(z.reduce((s, x) => s + x.stunden, 0))),
    einheit: "h",
    einzelpreis: preisText(opt.stundensatz),
    quelle: q({ zeiten: z.map((x) => x.id) }),
  });
  if (!opt.stundenJeMitarbeiter) return [zeile("Arbeitszeit", zeiten)];
  const je = new Map<string, ImportZeit[]>();
  zeiten.forEach((z) => je.set(z.user_id, [...(je.get(z.user_id) ?? []), z]));
  return [...je.values()].map((z) => zeile(`Arbeitszeit ${z[0].name}`, z));
}

/** Material-Zeilen: einzeln zum VK oder als eine Materialpauschale */
export function materialPositionen(gruppen: MaterialGruppe[], opt: ImportOptionen): EditorPosition[] {
  if (!gruppen.length) return [];
  if (opt.materialPauschale) {
    const vk = runden2(gruppen.reduce((s, g) => s + runden2(g.menge * g.vk), 0));
    const ek = gruppen.reduce((s, g) => s + g.menge * (g.ek ?? 0), 0);
    return [leerePosition("pauschale", {
      bezeichnung: "Materialpauschale",
      langtext: gruppen.map((g) => `${zahlText(g.menge)} ${g.einheit} ${g.bezeichnung}`).join(", "),
      menge: "1",
      einheit: "Psch",
      einzelpreis: preisText(vk),
      ek_preis: Math.round(ek * 10000) / 10000,
      quelle: q({ material: gruppen.flatMap((g) => g.ids) }),
    })];
  }
  return gruppen.map((g) => leerePosition("material", {
    bezeichnung: g.bezeichnung,
    menge: zahlText(g.menge),
    einheit: g.einheit,
    einzelpreis: preisText(g.vk),
    ek_preis: g.ek,
    artikel_id: g.artikel_id,
    quelle: q({ material: g.ids }),
  }));
}

/**
 * Aus der Auswahl Positionen bauen. Reihenfolge: Angebot (der Auftrag),
 * Regieberichte (je ein Titel), dann Stunden und Material ohne Bericht.
 * Ein Titel trennt die Blöcke, damit nichts in die Gruppe davor rutscht.
 */
export function importPositionen(
  daten: ImportDaten,
  auswahl: ImportAuswahl,
  opt: ImportOptionen,
  firma: Pick<Firma, "material_aufschlag"> | null | undefined,
  vorhandeneTitel: boolean,
): { positionen: EditorPosition[]; von: string | null; bis: string | null; angebotId: string | null } {
  const tage: string[] = [];
  const angebote = daten.angebote.filter((a) => auswahl.angebote.includes(a.id));
  const berichte = daten.regie.filter((r) => auswahl.regie.includes(r.id)).sort((a, b) => a.datum.localeCompare(b.datum));
  const zeiten = daten.zeiten.filter((z) => auswahl.zeiten.includes(z.id));
  const alleGruppen = materialGruppen(daten.material, firma);
  const gruppen = alleGruppen.filter((g) => auswahl.material.includes(g.schluessel));
  const restDa = zeiten.length > 0 || gruppen.length > 0;

  // Mit dem Angebot abgegolten: was nicht angehakt ist (Regieberichte nie — die sind Zusatzarbeit)
  const mitAngebot = angebote.length > 0 || !!daten.angebotImEntwurf;
  const abgegolten = opt.abgegolten && mitAngebot
    ? q({
      zeiten: daten.zeiten.filter((z) => !auswahl.zeiten.includes(z.id)).map((z) => z.id),
      material: alleGruppen.filter((g) => !auswahl.material.includes(g.schluessel)).flatMap((g) => g.ids),
    })
    : null;
  const abgegoltenZeile = abgegolten && (abgegolten.zeiten.length || abgegolten.material.length)
    ? leerePosition("text", { bezeichnung: ABGEGOLTEN_TEXT, quelle: abgegolten })
    : null;
  const bloeckeGesamt = angebote.length + berichte.length + (restDa ? 1 : 0);

  const aus: EditorPosition[] = [];
  let titelDavor = vorhandeneTitel;

  angebote.forEach((a) => {
    const kopien = a.positionen.map((p) => kopieVon(positionAusDb(p)));
    const brauchtTitel = kopien[0]?.art !== "titel" && (titelDavor || bloeckeGesamt > 1);
    if (brauchtTitel) aus.push(titelPosition(`Laut Angebot ${a.nummer ?? ""}`.trim()));
    aus.push(...kopien);
    if (brauchtTitel || kopien.some((p) => p.art === "titel")) titelDavor = true;
  });
  // gleich unter das Angebot — ist es schon im Entwurf, ganz ans Ende
  if (abgegoltenZeile && angebote.length) aus.push(abgegoltenZeile);

  berichte.forEach((r) => {
    tage.push(r.datum);
    aus.push(leerePosition("titel", {
      bezeichnung: `Regiebericht ${r.nummer ?? ""} vom ${datumText(r.datum)}`.replace(/\s+/g, " "),
      langtext: r.arbeiten.trim(),
      quelle: q({ regie: [r.id] }),
    }));
    aus.push(...arbeitszeitPositionen(r.zeiten, opt, false));
    aus.push(...materialPositionen(materialGruppen(r.material, firma), opt));
    titelDavor = true;
  });

  if (restDa) {
    if (titelDavor) {
      const name = zeiten.length && gruppen.length ? "Arbeitszeit und Material" : zeiten.length ? "Arbeitszeit" : "Material";
      aus.push(titelPosition(name));
    }
    aus.push(...arbeitszeitPositionen(zeiten, opt, true));
    aus.push(...materialPositionen(gruppen, opt));
  }

  if (abgegoltenZeile && !angebote.length) aus.push(abgegoltenZeile);

  zeiten.forEach((z) => tage.push(z.datum));
  daten.material.filter((m) => gruppen.some((g) => g.ids.includes(m.id))).forEach((m) => tage.push(m.datum));
  berichte.forEach((r) => r.zeiten.forEach((z) => tage.push(z.datum)));
  const sortiert = [...new Set(tage)].sort();

  return {
    positionen: aus,
    von: sortiert[0] ?? null,
    bis: sortiert[sortiert.length - 1] ?? null,
    angebotId: angebote[0]?.id ?? null,
  };
}
