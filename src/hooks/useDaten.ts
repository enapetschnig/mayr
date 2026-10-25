import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Kunde, Lagerort, Profil, Projekt, ProjektZahlen } from "@/lib/types";

export type ProjektMitKunde = Projekt & { kunden: Pick<Kunde, "id" | "name" | "ort" | "telefon" | "email"> | null };

const PROJEKT_FELDER = "*, kunden(id, name, ort, telefon, email)";

/** Alle Projekte, neueste zuerst. Gefiltert wird in der Ansicht. */
export function useProjekte() {
  return useQuery({
    queryKey: ["projekte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projekte")
        .select(PROJEKT_FELDER)
        .order("nummer", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjektMitKunde[];
    },
  });
}

export function useProjekt(id: string | undefined) {
  return useQuery({
    queryKey: ["projekte", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projekte").select(PROJEKT_FELDER).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as ProjektMitKunde | null;
    },
  });
}

/** Offene Stunden, Regieberichte und Material je Projekt — als Nachschlagewerk. */
export function useProjektZahlen() {
  return useQuery({
    queryKey: ["projekt_zahlen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projekt_zahlen").select("*");
      if (error) throw error;
      const nachId: Record<string, ProjektZahlen> = {};
      (data ?? []).forEach((z) => { if (z.projekt_id) nachId[z.projekt_id] = z; });
      return nachId;
    },
  });
}

export function useKunden() {
  return useQuery({
    queryKey: ["kunden"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kunden").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Kunde[];
    },
  });
}

/** Aktive Mitarbeiter (inkl. Chef), alphabetisch */
export function useMitarbeiter() {
  return useQuery({
    queryKey: ["mitarbeiter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("aktiv", true).order("vorname");
      if (error) throw error;
      return (data ?? []) as Profil[];
    },
  });
}

export function useLagerorte() {
  return useQuery({
    queryKey: ["lagerorte"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lagerorte").select("*").eq("aktiv", true).order("reihenfolge").order("name");
      if (error) throw error;
      return (data ?? []) as Lagerort[];
    },
  });
}

/** Nach jedem Speichern: diese Schlüssel neu holen. */
export function useNeuLaden() {
  const qc = useQueryClient();
  return (...schluessel: string[]) =>
    Promise.all(schluessel.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
