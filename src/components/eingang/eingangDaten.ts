import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dezimalLesen } from "@/lib/format";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import type { EingangAnteil, Eingangsrechnung } from "@/lib/types";
import type { AnteilEntwurf } from "./eingangLogik";

/**
 * Eingangsrechnungen: Abfragen und Speichern. Query-Keys beginnen mit
 * „eingang“, damit neuLaden("eingang") alles Abhängige trifft.
 */

export const BUCKET = "eingangsrechnungen";

export type AnteilMitProjekt = EingangAnteil & { projekte: { id: string; nummer: string; name: string } | null };
export type EingangMitAnteilen = Eingangsrechnung & { eingang_anteile: AnteilMitProjekt[] };

const FELDER = "*, eingang_anteile(*, projekte(id, nummer, name))";

/** Alle Eingangsrechnungen, neueste zuerst */
export function useEingangsrechnungen(aktiv = true) {
  return useQuery({
    queryKey: ["eingang", "liste"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("eingangsrechnungen").select(FELDER)
        .order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EingangMitAnteilen[];
    },
  });
}

export type ProjektAnteil = AnteilMitProjekt & {
  eingangsrechnungen: Pick<Eingangsrechnung, "id" | "lieferant" | "nummer" | "datum" | "kategorie"> | null;
  belege: { id: string; nummer: string | null } | null;
};

/** Anteile, die einem Projekt zugeordnet sind (Projekt → Belege, Nachkalkulation) */
export function useProjektEingang(projektId: string, aktiv = true) {
  return useQuery({
    queryKey: ["eingang", "projekt", projektId],
    enabled: aktiv && !!projektId,
    queryFn: async () => {
      const { data, error } = await supabase.from("eingang_anteile")
        .select("*, projekte(id, nummer, name), eingangsrechnungen(id, lieferant, nummer, datum, kategorie), belege(id, nummer)")
        .eq("projekt_id", projektId).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as ProjektAnteil[];
    },
  });
}

/** Foto/PDF öffnen: kurzlebige Adresse (der Bucket ist privat) */
export async function dateiAdresse(pfad: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pfad, 600);
  if (error || !data) throw new Error(error?.message ?? "Datei nicht gefunden");
  return data.signedUrl;
}

export type EingangKopf = Pick<Eingangsrechnung,
  "lieferant" | "nummer" | "datum" | "faellig_am" | "netto" | "ust_satz" | "ust" | "brutto" | "kategorie" | "betrieb" | "bezahlt_am" | "notiz">;

/**
 * Speichert Kopf, Datei und Aufteilung. Verrechnete Anteile bleiben, wie sie
 * sind (die Datenbank würde sie auch nicht ändern lassen). Gibt die ID zurück.
 */
export async function eingangSpeichern(
  id: string | null,
  kopf: EingangKopf,
  anteile: AnteilEntwurf[],
  vorher: Pick<EingangAnteil, "id" | "rechnung_id">[],
  datei: File | null,
  alteDatei: string | null,
): Promise<string> {
  const rid = id ?? crypto.randomUUID();
  let dateiFelder: Pick<Eingangsrechnung, "datei_pfad" | "datei_name" | "datei_mime"> | Record<string, never> = {};
  if (datei) {
    // Fotos verkleinern (bleiben lesbar), PDFs im Original
    const f = datei.type === "application/pdf" ? datei : await bildVerkleinern(datei, 2400);
    const pfad = `${rid}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(pfad, f, { contentType: f.type || "application/octet-stream" });
    if (error) throw new Error(`Datei konnte nicht hochgeladen werden: ${error.message}`);
    dateiFelder = { datei_pfad: pfad, datei_name: datei.name, datei_mime: f.type || null };
  }

  if (id) {
    const { data, error } = await supabase.from("eingangsrechnungen").update({ ...kopf, ...dateiFelder }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Die Rechnung gibt es nicht mehr — wurde sie inzwischen gelöscht?");
  } else {
    const { error } = await supabase.from("eingangsrechnungen").insert({ id: rid, ...kopf, ...dateiFelder });
    if (error) throw error;
  }
  // Alte Datei erst nach dem Speichern weg — sonst zeigt die Zeile ins Leere
  if (datei && alteDatei) await supabase.storage.from(BUCKET).remove([alteDatei]);

  const bleiben = new Set(anteile.map((a) => a.id).filter(Boolean));
  const weg = vorher.filter((a) => !a.rechnung_id && !bleiben.has(a.id)).map((a) => a.id);
  if (weg.length) {
    const { error } = await supabase.from("eingang_anteile").delete().in("id", weg);
    if (error) throw error;
  }
  const frei = anteile.filter((a) => !a.rechnung_id);
  if (frei.length) {
    // alle Felder in jeder Zeile — sonst setzt PostgREST fehlende auf NULL
    const { error } = await supabase.from("eingang_anteile").upsert(frei.map((a) => ({
      id: a.id ?? crypto.randomUUID(),
      eingangsrechnung_id: rid,
      projekt_id: a.projekt_id,
      betrag: dezimalLesen(a.betrag) ?? 0,
      text: a.text.trim() || null,
    })), { onConflict: "id" });
    if (error) throw error;
  }
  return rid;
}

/** Löschen samt Datei. Verrechnete Anteile verhindern das (Datenbank). */
export async function eingangLoeschen(r: Pick<Eingangsrechnung, "id" | "datei_pfad">): Promise<void> {
  const { data, error } = await supabase.from("eingangsrechnungen").delete().eq("id", r.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Die Rechnung konnte nicht gelöscht werden.");
  if (r.datei_pfad) await supabase.storage.from(BUCKET).remove([r.datei_pfad]);
}
