import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Firma, Kunde } from "@/lib/types";
import { datum as datumText } from "@/lib/format";
import { fehlerText } from "@/components/stamm/stammDaten";
import { empfaengerAusKunde, kopfNeu, leerePosition, neueId, preisText } from "@/components/belege/editor";
import { belegSpeichern } from "@/components/belege/speichern";
import { ANLAGEN_ART, PRUEF_ART, type AnlagenArt, type Besichtigung, type Messung, type PruefArt } from "./pruefLogik";

/**
 * Anlagen und Prüfprotokolle: laden, speichern, unterschreiben, verrechnen.
 * Query-Schlüssel beginnen mit "anlagen" — `neuLaden("anlagen")` holt alles neu.
 */

export type Anlage = Tables<"anlagen">;
export type Pruefung = Tables<"pruefungen">;
export type AnlageMitKunde = Anlage & { kunden: Pick<Kunde, "id" | "name" | "ort" | "strasse" | "plz" | "telefon"> | null };
export type PruefungKurz = Pick<Pruefung, "id" | "nummer" | "datum" | "art" | "status" | "ergebnis" | "rechnung_id" | "anlage_id" | "unterschrieben_am">;
export type PruefungVoll = Pruefung & {
  anlagen: AnlageMitKunde | null;
  ersteller: { vorname: string | null; nachname: string | null } | null;
};

const fehler = (text: string, e: { code?: string; message: string } | null | undefined) =>
  new Error(e?.message ? `${text}: ${fehlerText(e)}` : text);

const ANLAGE_FELDER = "*, kunden(id, name, ort, strasse, plz, telefon)";

export function useAnlagen() {
  return useQuery({
    queryKey: ["anlagen", "liste"],
    queryFn: async () => {
      const { data, error } = await supabase.from("anlagen").select(ANLAGE_FELDER).order("naechste_pruefung", { nullsFirst: false }).order("bezeichnung");
      if (error) throw error;
      return (data ?? []) as AnlageMitKunde[];
    },
  });
}

export function useAnlage(id: string | undefined) {
  return useQuery({
    queryKey: ["anlagen", "eine", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("anlagen").select(ANLAGE_FELDER).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as AnlageMitKunde | null;
    },
  });
}

export function usePruefungen(anlageId: string | undefined) {
  return useQuery({
    queryKey: ["anlagen", "pruefungen", anlageId],
    enabled: !!anlageId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pruefungen")
        .select("id, nummer, datum, art, status, ergebnis, rechnung_id, anlage_id, unterschrieben_am")
        .eq("anlage_id", anlageId!).order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PruefungKurz[];
    },
  });
}

export async function pruefungLaden(id: string): Promise<PruefungVoll | null> {
  const { data, error } = await supabase.from("pruefungen")
    .select(`*, anlagen(${ANLAGE_FELDER}), ersteller:profiles(vorname, nachname)`).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PruefungVoll | null;
}

export function usePruefung(id: string | undefined) {
  return useQuery({
    queryKey: ["anlagen", "pruefung", id],
    enabled: !!id,
    queryFn: () => pruefungLaden(id!),
  });
}

/** Kurztext für Listen: „Verteiler · Keller, Hauptverteiler“ */
export const anlageText = (a: Pick<Anlage, "art" | "standort">) =>
  [ANLAGEN_ART[a.art as AnlagenArt] ?? a.art, a.standort].filter(Boolean).join(" · ");

/** Adresse der Anlage, sonst die des Kunden */
export function anlageAdresse(a: Pick<Anlage, "strasse" | "plz" | "ort"> & { kunden?: Pick<Kunde, "strasse" | "plz" | "ort"> | null }): string {
  const q = a.strasse || a.ort ? a : a.kunden;
  if (!q) return "";
  return [q.strasse, [q.plz, q.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export type AnlageEingabe = Pick<Anlage,
  "kunde_id" | "projekt_id" | "bezeichnung" | "art" | "standort" | "strasse" | "plz" | "ort" | "hersteller" | "typ" | "baujahr"
  | "intervall_monate" | "naechste_pruefung" | "preis" | "notiz" | "aktiv">;

export async function anlageSpeichern(id: string | null, werte: AnlageEingabe): Promise<Anlage> {
  const antwort = id
    ? await supabase.from("anlagen").update(werte).eq("id", id).select("*").single()
    : await supabase.from("anlagen").insert(werte).select("*").single();
  if (antwort.error) throw fehler("Anlage konnte nicht gespeichert werden", antwort.error);
  return antwort.data;
}

export async function anlageLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from("anlagen").delete().eq("id", id);
  if (error) {
    throw new Error(error.code === "23503"
      ? "Zu dieser Anlage gibt es Prüfprotokolle — die bleiben als Nachweis. Stattdessen „Nicht mehr prüfen“ wählen."
      : `Anlage konnte nicht gelöscht werden: ${fehlerText(error)}`);
  }
}

/** Neues Prüfprotokoll: Besichtigung aus der Vorlage, Netz und Messgerät wie beim letzten Mal */
export async function pruefungAnlegen(anlageId: string, art: PruefArt, besichtigung: Besichtigung[], datum: string): Promise<string> {
  const { data: letzte } = await supabase.from("pruefungen").select("netz, messgeraet, messungen")
    .eq("anlage_id", anlageId).order("datum", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  // Stromkreise der letzten Prüfung ohne Messwerte vorschlagen — gleiche Anlage, gleiche Kreise
  const kreise = Array.isArray(letzte?.messungen)
    ? (letzte.messungen as Partial<Messung>[]).map((m) => ({
      stromkreis: m.stromkreis ?? "", schutz: m.schutz ?? "", querschnitt: m.querschnitt ?? "",
      riso: null, zs: null, fi_in: m.fi_in ?? null, fi_ia: null, fi_ta: null,
    }))
    : [];
  const { data, error } = await supabase.from("pruefungen").insert({
    anlage_id: anlageId, art, datum, besichtigung, messungen: kreise,
    netz: letzte?.netz ?? "TN-S", messgeraet: letzte?.messgeraet ?? null,
  }).select("id").single();
  if (error) throw fehler("Prüfprotokoll konnte nicht angelegt werden", error);
  return data.id;
}

export type PruefungEingabe = Pick<Pruefung, "datum" | "art" | "netz" | "messgeraet" | "erder_ohm" | "ergebnis" | "maengel" | "bemerkung"> & {
  besichtigung: Besichtigung[];
  messungen: Messung[];
};

export async function pruefungSpeichern(id: string, werte: PruefungEingabe): Promise<void> {
  const { error } = await supabase.from("pruefungen").update(werte).eq("id", id).eq("status", "entwurf");
  if (error) throw fehler("Prüfprotokoll konnte nicht gespeichert werden", error);
}

export async function pruefungLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from("pruefungen").delete().eq("id", id);
  if (error) throw fehler("Prüfprotokoll konnte nicht gelöscht werden", error);
}

/** Unterschrift hochladen (wie beim Regiebericht: Überschreiben gesperrt) und festschreiben */
export async function pruefungUnterschreiben(id: string, name: string, png: Blob): Promise<void> {
  const speicher = supabase.storage.from("projekt-dateien");
  const ordner = "anlagen/unterschriften";
  let pfad = `${ordner}/${id}.png`;
  let { error } = await speicher.upload(pfad, png, { upsert: true, contentType: "image/png" });
  if (error) {
    pfad = `${ordner}/${id}-${Date.now()}.png`;
    ({ error } = await speicher.upload(pfad, png, { upsert: false, contentType: "image/png" }));
  }
  if (error) throw fehler("Unterschrift nicht gespeichert", error);
  const { error: e2 } = await supabase.from("pruefungen")
    .update({ status: "unterschrieben", unterschrift_pfad: pfad, unterschrift_name: name })
    .eq("id", id).eq("status", "entwurf").select("id").single();
  if (e2) throw fehler("Nicht unterschrieben", e2);
}

/**
 * Rechnung aus unterschriebenen Prüfprotokollen eines Kunden: je Protokoll
 * eine Pauschale zum vereinbarten Preis der Anlage (leer = 0, im Entwurf
 * eintragen). Verrechnet an der Quelle wie Stunden und Material.
 */
export async function rechnungAusPruefungen(
  pruefungen: (Pick<Pruefung, "id" | "nummer" | "datum" | "art"> & { anlage: Pick<Anlage, "bezeichnung" | "art" | "standort" | "preis" | "projekt_id"> })[],
  kunde: Kunde | null,
  firma: Firma | null,
  heute: string,
): Promise<{ id: string; konflikte: number }> {
  if (!pruefungen.length) throw new Error("Kein Prüfprotokoll gewählt.");
  const id = neueId();
  const daten = pruefungen.map((p) => p.datum).sort();
  const kopf = {
    ...kopfNeu("rechnung", firma, heute),
    ...empfaengerAusKunde(kunde),
    projekt_id: pruefungen[0].anlage.projekt_id ?? null,
    betreff: pruefungen.length === 1
      ? `${PRUEF_ART[pruefungen[0].art as PruefArt] ?? "Prüfung"} ${pruefungen[0].anlage.bezeichnung}`
      : `Prüfung von ${pruefungen.length} Anlagen`,
    leistung_von: daten[0],
    leistung_bis: daten[daten.length - 1],
  };
  const positionen = pruefungen.map((p) => leerePosition("pauschale", {
    bezeichnung: `${PRUEF_ART[p.art as PruefArt] ?? "Prüfung"}: ${p.anlage.bezeichnung}`,
    langtext: [anlageText(p.anlage), `laut Prüfprotokoll ${p.nummer ?? ""} vom ${datumText(p.datum)}`].filter(Boolean).join("\n"),
    menge: "1",
    einheit: "Psch",
    einzelpreis: preisText(Number(p.anlage.preis ?? 0)),
    quelle: { zeiten: [], material: [], regie: [], pruefung: [p.id] },
  }));
  const { konflikte } = await belegSpeichern({ id, neu: true, kopf, positionen, geloescht: [], firma });
  return { id, konflikte };
}
