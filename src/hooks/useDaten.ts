import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Projekt, ProjektRolle } from "@/lib/types";

export type ProjektMitRollen = Projekt & { projekt_rollen: ProjektRolle[] };

/** Alle Projekte, die ich sehen darf — eigene und gemeinsame. */
export function useProjekte() {
  return useQuery({
    queryKey: ["projekte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projekte")
        .select("*, projekt_rollen(*)")
        .order("status")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjektMitRollen[];
    },
  });
}

/** Nach jedem Speichern: diese Schlüssel neu holen. */
export function useNeuLaden() {
  const qc = useQueryClient();
  return (...schluessel: string[]) =>
    Promise.all(schluessel.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/** Rolle einer Firma im Projekt */
export function rolleVon(p: ProjektMitRollen, firmaId: string | undefined): "GU" | "SU" | null {
  const r = p.projekt_rollen?.find((x) => x.firma_id === firmaId);
  return (r?.rolle as "GU" | "SU") ?? null;
}
