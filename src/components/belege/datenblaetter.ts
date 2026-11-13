import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DATEIEN_BUCKET, datenblaetterOrdnen, type Datenblatt } from "./datenblattLogik";

export { artikelIdsVon, DATEIEN_BUCKET, paketNamen, type Datenblatt } from "./datenblattLogik";

/**
 * Datenblätter der Artikel im Angebot — als Anhang zum Angebot.
 * Abgelegt werden sie am Artikel (Tabelle `artikel_dateien`, Speicher
 * `dateien`, Pfad `artikel/<artikel_id>/…`). Fehlt die Tabelle noch oder
 * schlägt die Abfrage fehl, gibt es eben keine Anhänge — kein Fehler.
 */

// `artikel_dateien` steht (noch) nicht in den erzeugten Typen
type LoseAbfrage = {
  from: (t: string) => {
    select: (s: string) => {
      in: (f: string, w: string[]) => { eq: (f: string, w: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
    };
  };
};

/** `namen`: Artikel-ID → Bezeichnung (aus dem Angebot — kein Join, die Tabelle kommt aus einem anderen Paket) */
export function useDatenblaetter(artikelIds: string[], namen: Map<string, string>, aktiv = true) {
  return useQuery({
    queryKey: ["artikel_dateien", "datenblaetter", artikelIds.join(",")],
    enabled: aktiv && artikelIds.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Datenblatt[]> => {
      try {
        const { data, error } = await (supabase as unknown as LoseAbfrage)
          .from("artikel_dateien")
          .select("id, artikel_id, name, pfad")
          .in("artikel_id", artikelIds.slice(0, 300))
          .eq("art", "datenblatt");
        if (error) return [];
        return datenblaetterOrdnen(((data ?? []) as { id: string; artikel_id: string; name: string | null; pfad: string }[])
          .map((d) => ({ id: d.id, artikel_id: d.artikel_id, name: d.name || d.pfad.split("/").pop() || "Datenblatt", pfad: d.pfad, artikel: namen.get(d.artikel_id) ?? null })));
      } catch {
        return [];
      }
    },
  });
}

export async function datenblattLaden(pfad: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(DATEIEN_BUCKET).download(pfad);
  if (error || !data) throw new Error(`Datenblatt nicht geladen: ${error?.message ?? "unbekannt"}`);
  return data;
}

/** Angebot + Datenblätter als ZIP (fflate, ohne Komprimierung — PDFs sind schon gepackt) */
export async function paketZip(dateien: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const inhalt: Record<string, Uint8Array> = {};
  for (const d of dateien) inhalt[d.name] = new Uint8Array(await d.blob.arrayBuffer());
  const zip = zipSync(inhalt, { level: 0 });
  return new Blob([zip], { type: "application/zip" });
}
