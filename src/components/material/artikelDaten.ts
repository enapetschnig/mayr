import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { alleZeilen } from "@/lib/abfrage";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import { bedarfAusAngebot, type AngebotsPosition } from "@/components/bestellung/bestellLogik";
import { ARTIKEL_KURZ, neueId, type ArtikelKurz, type BuchungMitBezug } from "./materialDaten";
import type { WeitererLieferant } from "./artikelLogik";

/**
 * Daten rund um einen Artikel: Bilder und Datenblätter, weitere Lieferanten,
 * Lagerplätze, Bewegungen. Query-Keys unter "artikel" bzw. "lager", damit
 * `neuLaden("artikel")` / `neuLaden("lager")` sie mitnimmt.
 */

/** Dateien am Artikel liegen im Bucket der Projektdateien unter artikel/<artikel_id>/… */
export const ARTIKEL_BUCKET = "projekt-dateien";

export type ArtikelDatei = Tables<"artikel_dateien">;
export type ArtikelDateiMitUrl = ArtikelDatei & { url: string | null };
export type ArtikelLieferant = Tables<"artikel_lieferanten">;
export type Lagerplatz = Tables<"artikel_lagerplaetze">;

/** Signierte Adressen (1 h) für viele Pfade auf einmal */
async function adressen(pfade: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let i = 0; i < pfade.length; i += 100) {
    const { data } = await supabase.storage.from(ARTIKEL_BUCKET).createSignedUrls(pfade.slice(i, i + 100), 3600);
    (data ?? []).forEach((d) => { if (d.path && d.signedUrl) m.set(d.path, d.signedUrl); });
  }
  return m;
}

/** Bilder (Hauptbild = das älteste zuerst) und Datenblätter eines Artikels. */
export function useArtikelDateien(artikelId: string | null | undefined) {
  return useQuery({
    queryKey: ["artikel", "dateien", artikelId],
    enabled: !!artikelId,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("artikel_dateien").select("*").eq("artikel_id", artikelId!).order("created_at").order("id");
      if (error) throw error;
      const url = await adressen((data ?? []).map((d) => d.pfad));
      return (data ?? []).map((d) => ({ ...d, url: url.get(d.pfad) ?? null })) as ArtikelDateiMitUrl[];
    },
  });
}

/**
 * Hauptbild je Artikel für Listen (Artikel, Katalog, Scan): artikel_id → Adresse.
 * Eine Abfrage für die ganze Seite, die Adressen halten eine Stunde.
 */
export function useHauptbilder(ids: string[]) {
  const sortiert = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["artikel", "hauptbilder", sortiert.join(",")],
    enabled: sortiert.length > 0,
    staleTime: 30 * 60_000,
    placeholderData: (vorher) => vorher,
    queryFn: async () => {
      const erste = new Map<string, string>();
      for (let i = 0; i < sortiert.length; i += 150) {
        const { data, error } = await supabase.from("artikel_dateien").select("artikel_id, pfad")
          .in("artikel_id", sortiert.slice(i, i + 150)).eq("art", "bild").order("created_at").order("id");
        if (error) throw error;
        (data ?? []).forEach((d) => { if (!erste.has(d.artikel_id)) erste.set(d.artikel_id, d.pfad); });
      }
      const url = await adressen([...erste.values()]);
      const m = new Map<string, string>();
      erste.forEach((pfad, id) => { const u = url.get(pfad); if (u) m.set(id, u); });
      return m;
    },
  });
}

/** Bild (verkleinert auf 1200 px) oder Datenblatt hochladen und eintragen. */
export async function artikelDateiHochladen(artikelId: string, roh: File, art: "bild" | "datenblatt"): Promise<void> {
  const datei = art === "bild" ? await bildVerkleinern(roh, 1200) : roh;
  const pfad = `artikel/${artikelId}/${neueId().slice(0, 8)}-${sichererDateiname(datei.name)}`;
  const { error: e1 } = await supabase.storage.from(ARTIKEL_BUCKET)
    .upload(pfad, datei, { contentType: datei.type || "application/octet-stream" });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await supabase.from("artikel_dateien").insert({ artikel_id: artikelId, art, pfad, name: roh.name });
  if (e2) {
    await supabase.storage.from(ARTIKEL_BUCKET).remove([pfad]);
    throw e2;
  }
}

/** Erst die Zeile, dann die Datei — eine verwaiste Datei stört nicht, eine Zeile ohne Datei schon. */
export async function artikelDateiLoeschen(d: ArtikelDatei): Promise<void> {
  const { error } = await supabase.from("artikel_dateien").delete().eq("id", d.id);
  if (error) throw error;
  await supabase.storage.from(ARTIKEL_BUCKET).remove([d.pfad]);
}

// ── Lieferanten ────────────────────────────────────────────────────────

export function useArtikelLieferanten(artikelId: string | null | undefined, aktiv = true) {
  return useQuery({
    queryKey: ["artikel", "lieferanten-je", artikelId],
    enabled: !!artikelId && aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("artikel_lieferanten").select("*").eq("artikel_id", artikelId!).order("lieferant");
      if (error) throw error;
      return (data ?? []) as ArtikelLieferant[];
    },
  });
}

/** Weitere Lieferanten vieler Artikel (Bestellvorschlag): artikel_id → Liste. */
export async function weitereLieferantenLaden(ids: string[]): Promise<Map<string, WeitererLieferant[]>> {
  const m = new Map<string, WeitererLieferant[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("artikel_lieferanten")
      .select("artikel_id, lieferant, lieferanten_nr, ek_preis, listenpreis, rabatt, lieferzeit_tage, bevorzugt")
      .in("artikel_id", ids.slice(i, i + 150));
    if (error) throw error;
    (data ?? []).forEach((z) => m.set(z.artikel_id, [...(m.get(z.artikel_id) ?? []), z]));
  }
  return m;
}

// ── Lagerplätze ────────────────────────────────────────────────────────

export const platzSchluessel = (artikelId: string, lagerortId: string) => `${artikelId}:${lagerortId}`;

/** Alle Lagerplätze: „artikel:lagerort“ → „Regal 3, Fach B“. Wenige hundert Zeilen. */
export function useLagerplaetze() {
  return useQuery({
    queryKey: ["lager", "plaetze"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const zeilen = await alleZeilen<Lagerplatz>((von, bis) =>
        supabase.from("artikel_lagerplaetze").select("*").order("artikel_id").order("lagerort_id").range(von, bis) as unknown as
          PromiseLike<{ data: Lagerplatz[] | null; error: unknown }>);
      return new Map(zeilen.map((z) => [platzSchluessel(z.artikel_id, z.lagerort_id), z.platz]));
    },
  });
}

/** Lagerplatz setzen — leer löscht ihn. */
export async function lagerplatzSetzen(artikelId: string, lagerortId: string, platz: string): Promise<void> {
  const p = platz.trim().slice(0, 60);
  const { error } = p
    ? await supabase.from("artikel_lagerplaetze").upsert({ artikel_id: artikelId, lagerort_id: lagerortId, platz: p })
    : await supabase.from("artikel_lagerplaetze").delete().eq("artikel_id", artikelId).eq("lagerort_id", lagerortId);
  if (error) throw error;
}

// ── Bewegungen ─────────────────────────────────────────────────────────

const BEWEGUNG = "*, artikel(bezeichnung, einheit), projekte(id, nummer, name), lagerorte(name), profiles(vorname, nachname)";

/** Alle Buchungen eines Artikels (für „Bestand danach“ braucht es alle, nicht nur die letzten). */
export function useArtikelBewegungen(artikelId: string | null | undefined) {
  return useQuery({
    queryKey: ["material", "artikel", artikelId],
    enabled: !!artikelId,
    queryFn: () => alleZeilen<BuchungMitBezug>((von, bis) =>
      supabase.from("material_buchungen").select(BEWEGUNG).eq("artikel_id", artikelId!)
        .order("created_at", { ascending: false }).order("id").range(von, bis) as unknown as
        PromiseLike<{ data: BuchungMitBezug[] | null; error: unknown }>),
  });
}

// ── Ausfassen: Material laut Angebot ───────────────────────────────────

export type AngebotMaterial = { angebot: string; status: string; bedarf: Map<string, number>; artikel: Map<string, ArtikelKurz> };

/**
 * Was laut Angebot des Projekts (angenommen vor offen) an Material gebraucht
 * wird — je Artikel, Leistungen über ihr Material. Über `angebot_material`,
 * denn Monteure dürfen Belege nicht lesen; Preise kommen keine mit.
 */
export function useAngebotMaterial(projektId: string | null | undefined) {
  return useQuery({
    queryKey: ["material", "angebot", projektId],
    enabled: !!projektId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AngebotMaterial | null> => {
      const { data, error } = await supabase.rpc("angebot_material", { p_projekt: projektId! });
      if (error) throw error;
      const d = data as {
        angebot: string; status: string; positionen: AngebotsPosition[];
        leistung_material: { leistung_id: string; artikel_id: string; menge: number }[];
      } | null;
      if (!d) return null;
      const lm = new Map<string, { artikel_id: string; menge: number }[]>();
      d.leistung_material.forEach((z) => lm.set(z.leistung_id, [...(lm.get(z.leistung_id) ?? []), { artikel_id: z.artikel_id, menge: Number(z.menge) }]));
      const bedarf = bedarfAusAngebot(d.positionen, lm);
      const ids = [...bedarf.keys()];
      const artikel = new Map<string, ArtikelKurz>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data: a, error: e2 } = await supabase.from("artikel").select(ARTIKEL_KURZ).eq("aktiv", true).in("id", ids.slice(i, i + 150));
        if (e2) throw e2;
        ((a ?? []) as ArtikelKurz[]).forEach((x) => artikel.set(x.id, x));
      }
      // stillgelegte Artikel kann man nicht ausfassen
      for (const id of ids) if (!artikel.has(id)) bedarf.delete(id);
      return { angebot: d.angebot, status: d.status, bedarf, artikel };
    },
  });
}
