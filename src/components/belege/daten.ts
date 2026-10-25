import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { belegStatus, type Beleg, type Position, type Projekt } from "@/lib/types";
import type { KatalogLeistung } from "./editor";

/** Eine Zeile der Belegliste — ohne Positionen */
export type BelegListenEintrag = Pick<
  Beleg,
  | "id" | "typ" | "nummer" | "status" | "datum" | "faellig_am" | "gueltig_bis" | "betreff" | "empf_name"
  | "netto" | "brutto" | "projekt_id" | "angebot_id" | "kunde_id" | "bezahlt_am" | "created_at"
> & { projekte: Pick<Projekt, "id" | "nummer" | "name"> | null };

const LISTEN_FELDER =
  "id, typ, nummer, status, datum, faellig_am, gueltig_bis, betreff, empf_name, netto, brutto, projekt_id, angebot_id, kunde_id, bezahlt_am, created_at, projekte(id, nummer, name)";

/** Alle Angebote und Rechnungen (oder die eines Projekts), neueste zuerst */
export function useBelege(projektId?: string, aktiv = true) {
  return useQuery({
    queryKey: ["belege", "liste", projektId ?? "alle"],
    enabled: aktiv,
    queryFn: async () => {
      let q = supabase.from("belege").select(LISTEN_FELDER);
      if (projektId) q = q.eq("projekt_id", projektId);
      const { data, error } = await q.order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BelegListenEintrag[];
    },
  });
}

/**
 * Status für Listen: überfällig aus dem Fälligkeitstag, und ein Angebot, aus
 * dem schon eine Rechnung geworden ist, zeigt „Verrechnet“.
 */
export function listenStatus(b: BelegListenEintrag, heute: string, verrechneteAngebote: Set<string>): string {
  if (b.typ === "angebot" && verrechneteAngebote.has(b.id) && (b.status === "angenommen" || b.status === "offen")) return "verrechnet";
  return belegStatus(b, heute);
}

/** IDs der Angebote, auf die eine nicht stornierte Rechnung zeigt */
export function verrechneteAngeboteAus(belege: BelegListenEintrag[]): Set<string> {
  return new Set(belege.filter((b) => b.typ === "rechnung" && b.status !== "storniert" && b.angebot_id).map((b) => b.angebot_id!));
}

export type BelegMitPositionen = { beleg: Beleg; positionen: Position[] };

export function belegLaden(id: string) {
  return Promise.all([
    supabase.from("belege").select("*").eq("id", id).maybeSingle(),
    supabase.from("beleg_positionen").select("*").eq("beleg_id", id).order("pos"),
  ]).then(([b, p]) => {
    if (b.error) throw b.error;
    if (p.error) throw p.error;
    return b.data ? ({ beleg: b.data, positionen: p.data ?? [] } as BelegMitPositionen) : null;
  });
}

export function useBeleg(id: string | undefined) {
  return useQuery({
    queryKey: ["belege", "detail", id],
    enabled: !!id,
    queryFn: () => belegLaden(id!),
  });
}

export type BelegKurz = Pick<Beleg, "id" | "typ" | "nummer" | "status">;

/** Rechnungen, die aus einem Angebot entstanden sind */
export function useFolgeRechnungen(angebotId: string, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "folge", angebotId],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("belege")
        .select("id, typ, nummer, status")
        .eq("angebot_id", angebotId)
        .eq("typ", "rechnung")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BelegKurz[];
    },
  });
}

/** Nummer und Status eines verknüpften Belegs (Angebot einer Rechnung) */
export function useBelegKurz(id: string | null) {
  return useQuery({
    queryKey: ["belege", "kurz", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege").select("id, typ, nummer, status").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as BelegKurz | null;
    },
  });
}

/** Die Stornorechnung zu einer stornierten Rechnung */
export function useStornoZu(rechnungId: string, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "storno", rechnungId],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege").select("id, typ, nummer, status").eq("storno_von", rechnungId).maybeSingle();
      if (error) throw error;
      return data as BelegKurz | null;
    },
  });
}

/** Leistungskatalog mit Material — für Preis (lib/preise.ts) und Spracherkennung */
export function useLeistungsKatalog() {
  return useQuery({
    queryKey: ["leistungen", "katalog"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leistungen")
        .select("*, leistung_material(menge, artikel(id, bezeichnung, einheit, ek_preis, vk_preis, listenpreis))")
        .eq("aktiv", true)
        .order("reihenfolge")
        .order("kurztext");
      if (error) throw error;
      return ((data ?? []) as unknown as KatalogLeistung[]).map((l) => ({
        ...l,
        leistung_material: (l.leistung_material ?? []).map((m) => ({ ...m, menge: Number(m.menge) })),
      }));
    },
  });
}
