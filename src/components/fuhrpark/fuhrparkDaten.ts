import { useQuery } from "@tanstack/react-query";
import { Bus, Car, Container, Gauge, Truck, Wrench, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FahrzeugArt } from "@/lib/types";

/** Bild je Art — Fuhrpark und Plantafel */
export const FAHRZEUG_ICON: Record<FahrzeugArt, LucideIcon> = { bus: Bus, pkw: Car, steiger: Truck, anhaenger: Container, maschine: Wrench, messgeraet: Gauge };

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
