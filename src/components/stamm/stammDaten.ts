import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Artikel, Beleg, Leistung } from "@/lib/types";

/**
 * Daten für Artikelstamm, Leistungskatalog und Kunden. Die Query-Keys
 * beginnen mit dem Bereich, damit `neuLaden("artikel")` usw. alles
 * Abhängige mitnimmt.
 */

/**
 * Alle Lieferanten im Artikelstamm. PostgREST kennt kein DISTINCT — deshalb
 * „springend“ über den Index (lieferant, artikelnummer): je Lieferant eine
 * winzige Abfrage, auch bei 200.000 Artikeln.
 */
export function useLieferanten() {
  return useQuery({
    queryKey: ["artikel", "lieferanten"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const liste: string[] = [];
      let letzter: string | null = null;
      for (let i = 0; i < 100; i++) {
        let q = supabase.from("artikel").select("lieferant");
        if (letzter !== null) q = q.gt("lieferant", letzter);
        const { data, error } = await q.order("lieferant").limit(1);
        if (error) throw error;
        if (!data?.length) break;
        letzter = data[0].lieferant;
        liste.push(letzter);
      }
      return liste;
    },
  });
}

/** Bestand je Artikel über alle Lagerorte (View lagerbestand, summiert) */
export function useBestandSummen() {
  return useQuery({
    queryKey: ["lager", "bestand-summen"],
    queryFn: async () => {
      const summe: Record<string, number> = {};
      for (let von = 0; von < 200_000; von += 1000) {
        const { data, error } = await supabase.from("lagerbestand").select("artikel_id, bestand")
          .order("artikel_id").order("lagerort_id").range(von, von + 999);
        if (error) throw error;
        for (const z of data ?? []) {
          if (z.artikel_id) summe[z.artikel_id] = (summe[z.artikel_id] ?? 0) + Number(z.bestand ?? 0);
        }
        if (!data || data.length < 1000) break;
      }
      return summe;
    },
  });
}

export type MaterialArtikel = Pick<Artikel, "id" | "bezeichnung" | "einheit" | "ek_preis" | "vk_preis" | "listenpreis" | "aktiv" | "hersteller" | "hersteller_nr" | "artikelnummer">;
export type LeistungMitMaterial = Leistung & {
  leistung_material: { menge: number; artikel_id: string; artikel: MaterialArtikel | null }[];
};

/** Leistungskatalog mit Material (für Preis und Kalkulation) */
export function useLeistungenKatalog() {
  return useQuery({
    queryKey: ["leistungen", "katalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leistungen")
        .select("*, leistung_material(menge, artikel_id, artikel(id, bezeichnung, einheit, ek_preis, vk_preis, listenpreis, aktiv, hersteller, hersteller_nr, artikelnummer))")
        .order("reihenfolge").order("nummer").order("kurztext");
      if (error) throw error;
      return (data ?? []) as unknown as LeistungMitMaterial[];
    },
  });
}

export type KundenBeleg = Pick<Beleg, "id" | "typ" | "nummer" | "status" | "datum" | "brutto" | "faellig_am" | "betreff" | "projekt_id">;

/** Angebote und Rechnungen eines Kunden (nur Chef — RLS) */
export function useKundeBelege(kundeId: string | null | undefined, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "kunde", kundeId],
    enabled: !!kundeId && aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege")
        .select("id, typ, nummer, status, datum, brutto, faellig_am, betreff, projekt_id")
        .eq("kunde_id", kundeId!).order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KundenBeleg[];
    },
  });
}

/** Datenbank-Fehler in einen Satz, den man auf der Baustelle versteht */
export function fehlerText(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "Unbekannter Fehler";
  if (e.code === "23505") {
    if (/artikel_codes/.test(e.message ?? "")) return "Dieser Code ist schon einem Artikel zugeordnet.";
    if (/lieferant/.test(e.message ?? "")) return "Diese Artikelnummer gibt es bei diesem Lieferanten schon.";
    return "Diesen Eintrag gibt es schon.";
  }
  if (e.code === "23503") return "Der Eintrag wird noch verwendet.";
  if (e.code === "22003") return "Eine Zahl ist zu groß — bitte Menge und Preis prüfen.";
  if (e.code === "22P02") return "Eine Eingabe ist keine gültige Zahl.";
  if (e.code === "42501") return "Dafür fehlt die Berechtigung.";
  if (/Failed to fetch|NetworkError/i.test(e.message ?? "")) return "Keine Verbindung — bitte später noch einmal versuchen.";
  return e.message ?? "Unbekannter Fehler";
}
