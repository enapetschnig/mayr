import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dezimalLesen } from "@/lib/format";
import { bildVerkleinern, sichererDateiname } from "@/lib/upload";
import type { EingangAnteil, EingangPosition, Eingangsrechnung, Lieferschein } from "@/lib/types";
import type { AnteilEntwurf, PositionEntwurf } from "./eingangLogik";

/**
 * Eingangsrechnungen: Abfragen und Speichern. Query-Keys beginnen mit
 * „eingang“, damit neuLaden("eingang") alles Abhängige trifft.
 */

export const BUCKET = "eingangsrechnungen";

export type AnteilMitProjekt = EingangAnteil & { projekte: { id: string; nummer: string; name: string } | null };
export type EingangMitAnteilen = Eingangsrechnung & { eingang_anteile: AnteilMitProjekt[]; eingang_positionen: EingangPosition[] };

const FELDER = "*, eingang_anteile(*, projekte(id, nummer, name)), eingang_positionen(*)";

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

/** Eine Eingangsrechnung samt Anteilen und Positionen (zum Öffnen aus der Buchhaltung) */
export async function eingangLaden(id: string): Promise<EingangMitAnteilen | null> {
  const { data, error } = await supabase.from("eingangsrechnungen").select(FELDER).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as EingangMitAnteilen | null;
}

export type ProjektAnteil =AnteilMitProjekt & {
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
  "lieferant" | "nummer" | "datum" | "faellig_am" | "netto" | "ust_satz" | "ust" | "brutto" | "kategorie" | "kategorie_id" | "reverse_charge" | "betrieb" | "bezahlt_am" | "notiz"
  | "iban" | "skonto_prozent" | "skonto_bis" | "lieferschein_nummern">;

/** Schon hochgeladene Datei (z. B. für die KI vor dem ersten Speichern) */
export type Hochgeladen = { pfad: string; name: string; mime: string | null };

/** Foto/PDF gleich hochladen — Fotos verkleinert (bleiben lesbar), PDFs im Original */
export async function eingangDateiHochladen(rid: string, datei: File): Promise<Hochgeladen> {
  const f = datei.type === "application/pdf" ? datei : await bildVerkleinern(datei, 2400);
  const pfad = `${rid}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(f.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(pfad, f, { contentType: f.type || "application/octet-stream" });
  if (error) throw new Error(`Datei konnte nicht hochgeladen werden: ${error.message}`);
  return { pfad, name: datei.name, mime: f.type || null };
}

/**
 * Speichert Kopf, Datei und Aufteilung. Verrechnete Anteile bleiben, wie sie
 * sind (die Datenbank würde sie auch nicht ändern lassen). Gibt die ID zurück.
 */
export async function eingangSpeichern(
  id: string | null,
  kopf: EingangKopf,
  anteile: AnteilEntwurf[],
  vorher: Pick<EingangAnteil, "id" | "rechnung_id">[],
  datei: File | Hochgeladen | null,
  alteDatei: string | null,
  positionen: PositionEntwurf[] | null = null,
  neueId: string | null = null,
): Promise<string> {
  const rid = id ?? neueId ?? crypto.randomUUID();
  let dateiFelder: Pick<Eingangsrechnung, "datei_pfad" | "datei_name" | "datei_mime"> | Record<string, never> = {};
  if (datei) {
    const h = datei instanceof File ? await eingangDateiHochladen(rid, datei) : datei;
    dateiFelder = { datei_pfad: h.pfad, datei_name: h.name, datei_mime: h.mime };
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
  if (positionen) {
    // ganz ersetzen — Positionen hängen an nichts anderem
    const { error: weg } = await supabase.from("eingang_positionen").delete().eq("eingangsrechnung_id", rid);
    if (weg) throw weg;
    const zeilen = positionen.filter((p) => p.bezeichnung.trim()).map((p, i) => ({
      eingangsrechnung_id: rid,
      pos: i + 1,
      artikelnummer: p.artikelnummer.trim() || null,
      bezeichnung: p.bezeichnung.trim(),
      menge: dezimalLesen(p.menge),
      einheit: p.einheit.trim() || null,
      einzelpreis: dezimalLesen(p.einzelpreis),
      gesamt: dezimalLesen(p.gesamt) ?? 0,
      lieferschein_nr: p.lieferschein_nr.trim() || null,
      projekt_id: p.projekt_id || null,
    }));
    if (zeilen.length) {
      const { error } = await supabase.from("eingang_positionen").insert(zeilen);
      if (error) throw error;
    }
  }
  return rid;
}

/** Freigeben, ablehnen oder zurück auf „prüfen“ */
export async function freigabeSetzen(id: string, freigabe: "offen" | "freigegeben" | "abgelehnt", grund: string | null = null) {
  const { data, error } = await supabase.from("eingangsrechnungen")
    .update({ freigabe, abgelehnt_grund: freigabe === "abgelehnt" ? grund : null }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Die Rechnung gibt es nicht mehr.");
}

/** Mehrere freigegebene als überwiesen markieren */
export async function ueberwiesen(ids: string[], am: string) {
  const { error } = await supabase.from("eingangsrechnungen").update({ bezahlt_am: am }).in("id", ids).eq("freigabe", "freigegeben");
  if (error) throw error;
}

// ── Lieferscheine ────────────────────────────────────────────────────────

export const LS_BUCKET = "lieferscheine";
export type LieferscheinMitProjekt = Lieferschein & {
  projekte: { id: string; nummer: string; name: string } | null;
  profiles: { vorname: string; nachname: string } | null;
};
export type LsPosition = { artikelnummer: string | null; bezeichnung: string; menge: number | null; einheit: string | null };

export const lsPositionen = (l: Pick<Lieferschein, "positionen">): LsPosition[] =>
  Array.isArray(l.positionen) ? (l.positionen as unknown as LsPosition[]).filter((p) => p && typeof p.bezeichnung === "string") : [];

/** Lieferscheine (Chef: alle, Monteur: eigene — regelt die Datenbank) */
export function useLieferscheine(aktiv = true) {
  return useQuery({
    queryKey: ["eingang", "lieferscheine"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("lieferscheine")
        .select("*, projekte(id, nummer, name), profiles!lieferscheine_erstellt_von_fkey(vorname, nachname)")
        .order("datum", { ascending: false }).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as LieferscheinMitProjekt[];
    },
  });
}

export async function lsAdresse(pfad: string): Promise<string> {
  const { data, error } = await supabase.storage.from(LS_BUCKET).createSignedUrl(pfad, 600);
  if (error || !data) throw new Error(error?.message ?? "Datei nicht gefunden");
  return data.signedUrl;
}

/** Foto hochladen (Ordner = eigene Benutzer-ID) und Lieferschein anlegen */
export async function lieferscheinAnlegen(uid: string, datei: File, projektId: string | null, notiz: string | null): Promise<Lieferschein> {
  const f = datei.type === "application/pdf" ? datei : await bildVerkleinern(datei, 2400);
  const pfad = `${uid}/${crypto.randomUUID()}-${sichererDateiname(f.name)}`;
  const { error: hoch } = await supabase.storage.from(LS_BUCKET).upload(pfad, f, { contentType: f.type || "application/octet-stream" });
  if (hoch) throw new Error(`Foto konnte nicht hochgeladen werden: ${hoch.message}`);
  const { data, error } = await supabase.from("lieferscheine")
    .insert({ datei_pfad: pfad, datei_mime: f.type || null, projekt_id: projektId, notiz, erstellt_von: uid }).select("*").single();
  if (error) {
    await supabase.storage.from(LS_BUCKET).remove([pfad]);
    throw error;
  }
  return data;
}

/** Löschen samt Foto */
export async function lieferscheinLoeschen(l: Pick<Lieferschein, "id" | "datei_pfad">) {
  const { data, error } = await supabase.from("lieferscheine").delete().eq("id", l.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Der Lieferschein ist schon einer Rechnung zugeordnet und bleibt.");
  await supabase.storage.from(LS_BUCKET).remove([l.datei_pfad]);
}

/** Löschen samt Datei. Verrechnete Anteile verhindern das (Datenbank). */
export async function eingangLoeschen(r: Pick<Eingangsrechnung, "id" | "datei_pfad">): Promise<void> {
  const { data, error } = await supabase.from("eingangsrechnungen").delete().eq("id", r.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Die Rechnung konnte nicht gelöscht werden.");
  if (r.datei_pfad) await supabase.storage.from(BUCKET).remove([r.datei_pfad]);
}
