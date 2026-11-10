import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Offene Schäden je Fahrzeug */
export function useOffeneSchaeden() {
  return useQuery({
    queryKey: ["fahrzeuge", "schaeden"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fahrzeug_eintraege").select("fahrzeug_id").eq("art", "schaden").eq("erledigt", false);
      if (error) throw error;
      const z: Record<string, number> = {};
      (data ?? []).forEach((e) => { z[e.fahrzeug_id] = (z[e.fahrzeug_id] ?? 0) + 1; });
      return z;
    },
  });
}
