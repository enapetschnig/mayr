import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alleZeilen } from "@/lib/abfrage";
import { isoTag } from "@/lib/format";
import { kontoRechnen, type KontoProfil } from "@/lib/zeitkonto";
import type { Abwesenheit, Profil } from "@/lib/types";

/** Eigene Abwesenheiten bzw. die einer Person — der Chef sieht alle, Monteure nur die eigenen (RLS). */
export function useAbwesenheiten(userId: string | undefined) {
  return useQuery({
    queryKey: ["abwesenheiten", "person", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abwesenheiten").select("*").eq("user_id", userId!).order("von", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type Antrag = Abwesenheit & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };

export function useAntraege(aktiv: boolean) {
  return useQuery({
    queryKey: ["abwesenheiten", "antraege"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("abwesenheiten")
        .select("*, profiles!abwesenheiten_user_id_fkey(vorname, nachname, farbe)").eq("status", "beantragt").order("von");
      if (error) throw error;
      return (data ?? []) as unknown as Antrag[];
    },
  });
}

export type KalenderAbwesenheit = { id: string; user_id: string; von: string; bis: string; art: string; stunden: number | null };

/** Für Kalender und Einteilung: genehmigt; der Grund nur für einen selbst und den Chef */
export function useKalenderAbwesenheit(von: string | undefined, bis: string | undefined) {
  return useQuery({
    queryKey: ["abwesenheiten", "kalender", von, bis],
    enabled: !!von && !!bis,
    queryFn: async () => {
      const { data, error } = await supabase.from("abwesenheit_kalender").select("*").lte("von", bis!).gte("bis", von!);
      if (error) throw error;
      return (data ?? []) as KalenderAbwesenheit[];
    },
  });
}

export function useKonto(p: (KontoProfil & { id: string }) | null | undefined) {
  const heute = isoTag();
  return useQuery({
    queryKey: ["zeiten", "konto", p?.id, p?.konto_ab, p?.wochenstunden, p?.urlaub_tage, heute],
    enabled: !!p,
    queryFn: async () => {
      const [zeiten, ab, bu] = await Promise.all([
        alleZeilen((a, b) => supabase.from("zeiten").select("id, datum, stunden").eq("user_id", p!.id).gte("datum", p!.konto_ab).order("id").range(a, b)),
        supabase.from("abwesenheiten").select("art, von, bis, stunden, status").eq("user_id", p!.id),
        supabase.from("konto_buchungen").select("art, menge, datum").eq("user_id", p!.id),
      ]);
      if (ab.error) throw ab.error;
      if (bu.error) throw bu.error;
      return kontoRechnen(p!, zeiten, ab.data ?? [], bu.data ?? [], heute);
    },
  });
}
