import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import type { FirmenDokument, PersonalDokument } from "@/lib/types";

/** Mitarbeiter-Dokumente einer Person (Chef: jede, sonst nur die eigenen — RLS) */
export function usePersonalDokumente(userId: string | undefined) {
  return useQuery({
    queryKey: ["dokumente", "personal", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_dokumente").select("*").eq("user_id", userId!)
        .order("monat", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PersonalDokument[];
    },
  });
}

/** Neue, noch nicht geöffnete eigene Dokumente — Hinweis auf der Startseite */
export function useNeueDokumente(userId: string | undefined) {
  return useQuery({
    queryKey: ["dokumente", "neu", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_dokumente").select("id, art, titel, monat, pfad, name, mime")
        .eq("user_id", userId!).is("gelesen_am", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFirmenDokumente() {
  return useQuery({
    queryKey: ["dokumente", "firma"],
    queryFn: async () => {
      const { data, error } = await supabase.from("firmen_dokumente").select("*").order("ordner").order("titel");
      if (error) throw error;
      return (data ?? []) as FirmenDokument[];
    },
  });
}

/**
 * Datei öffnen: das Fenster sofort aufmachen (sonst blockt Safari am iPhone
 * das Popup nach dem Warten), dann die signierte Adresse hineinladen.
 */
export async function dateiOeffnen(bucket: "personal" | "firmen-dokumente", pfad: string) {
  const fenster = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(pfad, 600);
  if (error || !data?.signedUrl) {
    fenster?.close();
    toast.error("Datei nicht gefunden", { description: error?.message });
    return false;
  }
  if (fenster) fenster.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return true;
}

/** Hochladen: Fotos verkleinert, PDFs im Original. Pfad <ordner>/<zufall>-<name> */
export async function dateiHochladen(bucket: "personal" | "firmen-dokumente", ordner: string, roh: File) {
  const datei = roh.type.startsWith("image/") ? await bildVerkleinern(roh) : roh;
  const pfad = `${ordner}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(datei.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(pfad, datei, { contentType: datei.type || "application/octet-stream" });
  if (error) throw error;
  return { pfad, name: roh.name, mime: datei.type || null, groesse: datei.size };
}
