import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { fehlerText } from "@/components/stamm/stammDaten";
import type { Firma } from "@/lib/types";
import type { KatalogLeistung } from "./editor";
import { ausVorlage, vorlageNetto, vorlagePositionenLesen, type PreisArtikel, type Vorlage, type VorlagePosition } from "./vorlagen";

/** Angebotsvorlagen lesen und schreiben — nur der Chef (RLS) */

const fehler = (text: string, e: { code?: string; message: string }) =>
  new Error(e.code === "23505" ? "Eine Vorlage mit diesem Namen gibt es schon — anderen Namen wählen oder die vorhandene ersetzen." : `${text}: ${fehlerText(e)}`);

export function useVorlagen(aktiv = true) {
  return useQuery({
    queryKey: ["angebot_vorlagen"],
    enabled: aktiv,
    queryFn: async (): Promise<Vorlage[]> => {
      const { data, error } = await supabase
        .from("angebot_vorlagen")
        .select("id, name, kategorie, betreff, einleitung, schlusstext, positionen, netto, updated_at")
        .order("kategorie", { nullsFirst: false })
        .order("name");
      if (error) throw error;
      return (data ?? []).map((v) => ({ ...v, netto: Number(v.netto), positionen: vorlagePositionenLesen(v.positionen) }));
    },
  });
}

export type VorlageKopf = { name: string; kategorie: string | null; betreff: string | null; einleitung: string | null; schlusstext: string | null };

/** Neue Vorlage anlegen oder eine vorhandene (id) mit dem Stand des Angebots ersetzen */
export async function vorlageSpeichern(kopf: VorlageKopf, positionen: VorlagePosition[], id?: string): Promise<string> {
  const zeile = {
    name: kopf.name.trim(),
    kategorie: kopf.kategorie?.trim() || null,
    betreff: kopf.betreff?.trim() || null,
    einleitung: kopf.einleitung?.trim() || null,
    schlusstext: kopf.schlusstext?.trim() || null,
    positionen: positionen as unknown as Json,
    netto: vorlageNetto(positionen),
  };
  const antwort = id
    ? await supabase.from("angebot_vorlagen").update(zeile).eq("id", id).select("id").maybeSingle()
    : await supabase.from("angebot_vorlagen").insert(zeile).select("id").single();
  if (antwort.error) throw fehler("Vorlage nicht gespeichert", antwort.error);
  if (!antwort.data) throw new Error("Vorlage nicht gefunden — wurde sie inzwischen gelöscht?");
  return antwort.data.id;
}

export async function vorlageUmbenennen(id: string, name: string, kategorie: string | null): Promise<void> {
  const { data, error } = await supabase.from("angebot_vorlagen")
    .update({ name: name.trim(), kategorie: kategorie?.trim() || null }).eq("id", id).select("id");
  if (error) throw fehler("Nicht umbenannt", error);
  if (!data?.length) throw new Error("Vorlage nicht gefunden.");
}

export async function vorlageLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from("angebot_vorlagen").delete().eq("id", id);
  if (error) throw fehler("Nicht gelöscht", error);
}

/** Heutige Preise der Artikel einer Vorlage (in Stücken — die Adresse hat eine Längengrenze) */
export async function artikelPreiseLaden(ids: string[]): Promise<Map<string, PreisArtikel>> {
  const map = new Map<string, PreisArtikel>();
  const eindeutig = [...new Set(ids)];
  for (let i = 0; i < eindeutig.length; i += 100) {
    const { data, error } = await supabase.from("artikel")
      .select("id, bezeichnung, einheit, vk_preis, ek_preis, listenpreis, aktiv").in("id", eindeutig.slice(i, i + 100));
    if (error) throw new Error(`Preise nicht geladen: ${error.message}`);
    (data ?? []).forEach((a) => map.set(a.id, a));
  }
  return map;
}

/**
 * Vorlage mit heutigen Preisen rechnen — beide Fassungen, damit die Auswahl
 * die Abweichungen zeigen und der Chef wählen kann.
 */
export async function vorlageBerechnen(
  v: Vorlage, katalog: KatalogLeistung[], firma: Firma | null, stundensatz: number,
) {
  const artikel = await artikelPreiseLaden(v.positionen.flatMap((p) => (p.artikel_id ? [p.artikel_id] : [])));
  const quellen = { artikel, leistungen: new Map(katalog.map((l) => [l.id, l])) };
  return {
    heute: ausVorlage(v.positionen, quellen, firma, stundensatz, true),
    wieVorlage: ausVorlage(v.positionen, quellen, firma, stundensatz, false),
  };
}
export type VorlageBerechnet = Awaited<ReturnType<typeof vorlageBerechnen>>;
