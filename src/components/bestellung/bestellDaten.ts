import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { artikelInfo, fehlerText, neueId, runden3, type ArtikelKurz } from "@/components/material/materialDaten";
import {
  LIEFERANT_OHNE, bedarfAusAngebot, offeneMenge, vorschlagAusBedarf, type AngebotsPosition, type BestellStatus, type Vorschlag,
} from "./bestellLogik";

/**
 * Bestellungen laden, anlegen, bestellen, Wareneingang buchen.
 * Query-Schlüssel beginnen mit "bestellungen" — `neuLaden("bestellungen")`
 * holt alles neu. Nach dem Wareneingang auch "lager" und "material".
 */

export type Bestellung = Tables<"bestellungen">;
export type BestellPosition = Tables<"bestell_positionen">;
type ProjektKurz = { id: string; nummer: string; name: string; strasse: string | null; plz: string | null; ort: string | null };
export type BestellungKurz = Bestellung & {
  projekte: ProjektKurz | null;
  lagerorte: { id: string; name: string } | null;
  bestell_positionen: Pick<BestellPosition, "menge" | "ek_preis" | "geliefert">[];
};
export type PositionMitArtikel = BestellPosition & { artikel: ArtikelKurz & { lieferant: string } };
export type BestellungVoll = Omit<BestellungKurz, "bestell_positionen"> & { bestell_positionen: PositionMitArtikel[] };

/** „233602 · Gira · 233602“ vermeiden: Lieferanten-Nr. nur, wenn sie von der Hersteller-Nr. abweicht */
export const positionInfo = (a: Pick<ArtikelKurz, "artikelnummer" | "hersteller" | "hersteller_nr">) =>
  [a.hersteller_nr && a.artikelnummer && a.artikelnummer !== a.hersteller_nr ? a.artikelnummer : null, artikelInfo(a)].filter(Boolean).join(" · ");

const fehler = (text: string, e: { code?: string; message: string } | null | undefined) =>
  new Error(e?.message ? `${text}: ${fehlerText(e)}` : text);

const KOPF = "*, projekte(id, nummer, name, strasse, plz, ort), lagerorte(id, name)";
const ARTIKEL = "id, bezeichnung, einheit, ek_preis, hersteller, hersteller_nr, artikelnummer, kategorie, ean, lagerartikel, lieferant";

export function useBestellungen(aktiv = true) {
  return useQuery({
    queryKey: ["bestellungen", "liste"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("bestellungen")
        .select(`${KOPF}, bestell_positionen(menge, ek_preis, geliefert)`)
        .order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BestellungKurz[];
    },
  });
}

export async function bestellungLaden(id: string): Promise<BestellungVoll | null> {
  const { data, error } = await supabase.from("bestellungen")
    .select(`${KOPF}, bestell_positionen(*, artikel(${ARTIKEL}))`)
    .eq("id", id).order("pos", { referencedTable: "bestell_positionen" }).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as BestellungVoll | null;
}

export function useBestellung(id: string | undefined) {
  return useQuery({ queryKey: ["bestellungen", "eine", id], enabled: !!id, queryFn: () => bestellungLaden(id!) });
}

export type Lieferung = { vorgang: string; wann: string; notiz: string | null; wer: { vorname: string | null; nachname: string | null } | null; zeilen: { position: string; menge: number }[] };

/** Wareneingänge zur Bestellung, je Lieferschein (Vorgang) zusammengefasst, neueste zuerst. */
export function useLieferungen(bestellungId: string | undefined, positionIds: string[]) {
  return useQuery({
    queryKey: ["bestellungen", "lieferungen", bestellungId, positionIds.length],
    enabled: !!bestellungId && positionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("material_buchungen")
        .select("id, menge, created_at, notiz, vorgang, bestellposition_id, profiles(vorname, nachname)")
        .in("bestellposition_id", positionIds).order("created_at", { ascending: false });
      if (error) throw error;
      const karte = new Map<string, Lieferung>();
      for (const b of data ?? []) {
        const k = b.vorgang ?? b.id;
        const l = karte.get(k) ?? { vorgang: k, wann: b.created_at, notiz: b.notiz, wer: b.profiles, zeilen: [] };
        l.zeilen.push({ position: b.bestellposition_id!, menge: Number(b.menge) });
        karte.set(k, l);
      }
      return [...karte.values()];
    },
  });
}

/** Je Artikel: was schon bestellt (oder im Entwurf) und noch nicht geliefert ist. */
export async function offeneBestellMengen(projektId?: string): Promise<Map<string, number>> {
  let q = supabase.from("bestell_positionen")
    .select("artikel_id, menge, geliefert, bestellungen!inner(status, projekt_id)")
    .in("bestellungen.status", ["entwurf", "bestellt", "teilgeliefert"]);
  q = projektId ? q.eq("bestellungen.projekt_id", projektId) : q.is("bestellungen.projekt_id", null);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map<string, number>();
  for (const p of data ?? []) m.set(p.artikel_id, runden3((m.get(p.artikel_id) ?? 0) + offeneMenge(p)));
  return m;
}

export function useOffeneBestellMengen() {
  return useQuery({ queryKey: ["bestellungen", "offen-lager"], queryFn: () => offeneBestellMengen() });
}

/** Lieferanten aus dem Artikelstamm, früheren Bestellungen und den Kontakten (für die Auswahl). */
export function useLieferanten() {
  return useQuery({
    queryKey: ["bestellungen", "lieferanten"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [a, b, k] = await Promise.all([
        supabase.from("artikel").select("lieferant").eq("aktiv", true).neq("lieferant", LIEFERANT_OHNE).limit(2000),
        supabase.from("bestellungen").select("lieferant").limit(500),
        supabase.from("kunden").select("lieferant:name").eq("art", "lieferant").limit(500),
      ]);
      const namen = new Set<string>();
      for (const z of [...(a.data ?? []), ...(b.data ?? []), ...(k.data ?? [])]) if (z.lieferant?.trim()) namen.add(z.lieferant.trim());
      return [...namen].sort((x, y) => x.localeCompare(y, "de"));
    },
  });
}

export type Ziel = { lagerort_id: string; projekt_id: null } | { lagerort_id: null; projekt_id: string };

async function positionenEinfuegen(bestellungId: string, positionen: { artikel_id: string; menge: number; ek_preis: number | null }[]) {
  if (!positionen.length) return;
  // Sammel-Insert: alle Zeilen mit denselben Feldern
  const { error } = await supabase.from("bestell_positionen").insert(positionen.map((p, i) => ({
    bestellung_id: bestellungId, pos: i + 1, artikel_id: p.artikel_id, menge: p.menge, ek_preis: p.ek_preis,
  })));
  if (error) throw fehler("Positionen nicht gespeichert", error);
}

/** Je Vorschlag (= Lieferant) ein Entwurf. Gibt die neuen IDs zurück. */
export async function bestellungenAnlegen(vorschlaege: Vorschlag[], ziel: Ziel, datum: string, notiz: string | null = null): Promise<string[]> {
  const ids: string[] = [];
  for (const v of vorschlaege) {
    const { data, error } = await supabase.from("bestellungen")
      .insert({ lieferant: v.lieferant, datum, notiz, ...ziel }).select("id").single();
    if (error) throw fehler("Bestellung nicht angelegt", error);
    try {
      await positionenEinfuegen(data.id, v.positionen);
    } catch (e) {
      await supabase.from("bestellungen").delete().eq("id", data.id);
      throw e;
    }
    ids.push(data.id);
  }
  return ids;
}

export async function bestellungSpeichern(id: string, kopf: Partial<Pick<Bestellung, "lieferant" | "liefertermin" | "notiz" | "lagerort_id" | "projekt_id" | "datum">>) {
  const { error } = await supabase.from("bestellungen").update(kopf).eq("id", id);
  if (error) throw fehler("Nicht gespeichert", error);
}

/** Entwurf: Positionen komplett ersetzen (Reihenfolge = pos). */
export async function positionenErsetzen(id: string, positionen: { artikel_id: string; menge: number; ek_preis: number | null }[]) {
  const { error } = await supabase.from("bestell_positionen").delete().eq("bestellung_id", id);
  if (error) throw fehler("Positionen nicht gespeichert", error);
  await positionenEinfuegen(id, positionen);
}

export async function statusSetzen(id: string, status: BestellStatus) {
  const { error } = await supabase.from("bestellungen").update({ status }).eq("id", id);
  if (error) throw fehler("Status nicht geändert", error);
}

export async function bestellungLoeschen(id: string) {
  const { error } = await supabase.from("bestellungen").delete().eq("id", id);
  if (error) throw fehler("Nicht gelöscht", error);
}

/**
 * Wareneingang: je Position mit Menge eine Buchung — ins Lager (zugang)
 * oder aufs Projekt (direkt), mit Einkaufspreis der Bestellung. Ein Vorgang
 * = ein Lieferschein. Gelieferte Menge und Status rechnet die Datenbank.
 */
export async function wareneingangBuchen(b: BestellungVoll, mengen: { position: PositionMitArtikel; menge: number }[], lieferschein: string) {
  const zeilen = mengen.filter((m) => m.menge > 0);
  if (!zeilen.length) throw new Error("Keine Menge eingetragen.");
  const vorgang = neueId();
  const notiz = [`Bestellung ${b.nummer}`, lieferschein.trim() ? `Lieferschein ${lieferschein.trim()}` : null].filter(Boolean).join(" · ");
  const { error } = await supabase.from("material_buchungen").insert(zeilen.map(({ position: p, menge }) => ({
    art: b.projekt_id ? "direkt" : "zugang",
    artikel_id: p.artikel_id,
    menge: runden3(menge),
    lagerort_id: b.projekt_id ? null : b.lagerort_id,
    projekt_id: b.projekt_id,
    ek_preis: p.ek_preis,
    vorgang,
    notiz,
    bestellposition_id: p.id,
  })));
  if (error) throw fehler("Wareneingang nicht gebucht", error);
}

/**
 * Material laut Angebot des Projekts (angenommen vor offen vor Entwurf,
 * das neueste), abzüglich dessen, was für das Projekt schon bestellt ist.
 */
export async function projektBedarfLaden(projektId: string): Promise<{ angebot: string | null; vorschlaege: Vorschlag[] }> {
  const { data: angebote, error } = await supabase.from("belege").select("id, nummer, status, created_at")
    .eq("projekt_id", projektId).eq("typ", "angebot").in("status", ["angenommen", "offen", "entwurf"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rang = { angenommen: 0, offen: 1, entwurf: 2 } as Record<string, number>;
  const angebot = [...(angebote ?? [])].sort((a, b) => rang[a.status] - rang[b.status])[0];
  if (!angebot) return { angebot: null, vorschlaege: [] };

  const { data: pos, error: e1 } = await supabase.from("beleg_positionen")
    .select("art, menge, artikel_id, leistung_id").eq("beleg_id", angebot.id);
  if (e1) throw e1;
  const leistungIds = [...new Set((pos ?? []).map((p) => p.leistung_id).filter((x): x is string => !!x))];
  const lm = new Map<string, { artikel_id: string; menge: number }[]>();
  if (leistungIds.length) {
    const { data, error: e2 } = await supabase.from("leistung_material").select("leistung_id, artikel_id, menge").in("leistung_id", leistungIds);
    if (e2) throw e2;
    for (const z of data ?? []) lm.set(z.leistung_id, [...(lm.get(z.leistung_id) ?? []), { artikel_id: z.artikel_id, menge: Number(z.menge) }]);
  }
  const bedarf = bedarfAusAngebot((pos ?? []) as AngebotsPosition[], lm);

  // schon für das Projekt bestellt (nicht storniert) zählt ab
  const { data: schon, error: e3 } = await supabase.from("bestell_positionen")
    .select("artikel_id, menge, bestellungen!inner(projekt_id, status)")
    .eq("bestellungen.projekt_id", projektId).neq("bestellungen.status", "storniert");
  if (e3) throw e3;
  for (const s of schon ?? []) if (bedarf.has(s.artikel_id)) bedarf.set(s.artikel_id, bedarf.get(s.artikel_id)! - Number(s.menge));

  const ids = [...bedarf.keys()];
  const artikel: { id: string; lieferant: string; ek_preis: number | null; bezeichnung: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: e4 } = await supabase.from("artikel").select("id, lieferant, ek_preis, bezeichnung, bestell_vpe").eq("aktiv", true).in("id", ids.slice(i, i + 200));
    if (e4) throw e4;
    artikel.push(...(data ?? []));
  }
  return { angebot: angebot.nummer ?? "Entwurf", vorschlaege: vorschlagAusBedarf(bedarf, artikel) };
}
