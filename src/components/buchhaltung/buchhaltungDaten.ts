import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { archivieren } from "@/lib/belegArchiv";
import { isoTag } from "@/lib/format";
import type { Kunde } from "@/lib/types";
import type { AltRechnung, Kategorie, Richtung } from "./buchhaltungLogik";

/**
 * Buchhaltung: Abfragen und Speichern. Query-Keys beginnen mit „buchhaltung“;
 * wer Rechnungen ändert, lädt auch „belege“ und „op“ neu.
 */

export const KATEGORIE_ARTEN = [
  { wert: "material", text: "Material" },
  { wert: "fremdleistung", text: "Fremdleistung" },
  { wert: "werkzeug", text: "Werkzeug" },
  { wert: "fahrzeug", text: "Fahrzeug" },
  { wert: "buero", text: "Büro" },
  { wert: "sonstiges", text: "Sonstiges" },
] as const;

/** Alle Kategorien, in der eingestellten Reihenfolge */
export function useKategorien(aktiv = true) {
  return useQuery({
    queryKey: ["buchhaltung", "kategorien"],
    enabled: aktiv,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("rechnung_kategorien")
        .select("id, richtung, name, art, konto, stichworte, sortierung").order("sortierung").order("name");
      if (error) throw error;
      return (data ?? []) as Kategorie[];
    },
  });
}

export async function kategorieSpeichern(k: Omit<Kategorie, "id"> & { id: string | null }): Promise<void> {
  const zeile = { richtung: k.richtung, name: k.name.trim(), art: k.richtung === "eingang" ? k.art ?? "sonstiges" : null, konto: k.konto, stichworte: k.stichworte.trim(), sortierung: k.sortierung };
  const { error } = k.id
    ? await supabase.from("rechnung_kategorien").update(zeile).eq("id", k.id)
    : await supabase.from("rechnung_kategorien").insert(zeile);
  if (error) throw error;
}

export async function kategorieLoeschen(id: string): Promise<void> {
  const { error } = await supabase.from("rechnung_kategorien").delete().eq("id", id);
  if (error) throw error;
}

/** Kategorie an Rechnungen setzen. Beim Eingang geht die Art für die Buchhaltung mit. */
export async function kategorieSetzen(richtung: Richtung, ids: string[], kategorie: Kategorie | null): Promise<void> {
  if (!ids.length) return;
  const { error } = richtung === "ausgang"
    ? await supabase.from("belege").update({ kategorie_id: kategorie?.id ?? null }).in("id", ids)
    : await supabase.from("eingangsrechnungen").update({ kategorie_id: kategorie?.id ?? null, ...(kategorie?.art ? { kategorie: kategorie.art } : {}) }).in("id", ids);
  if (error) throw error;
}

// ── Listen je Zeitraum ───────────────────────────────────────────────────

export type AusgangZeile = {
  id: string; nummer: string | null; datum: string; faellig_am: string | null; status: string; altbestand: boolean;
  netto: number; ust: number; brutto: number; kategorie_id: string | null; empf_name: string | null; betreff: string | null;
  projekte: { nummer: string; name: string } | null;
  zahlungen: { betrag: number; art: string }[];
  beleg_positionen: { bezeichnung: string }[];
};

export type EingangZeile = {
  id: string; lieferant: string; nummer: string | null; datum: string; faellig_am: string | null; bezahlt_am: string | null;
  netto: number; ust: number; brutto: number; kategorie: string; kategorie_id: string | null; datei_pfad: string | null; freigabe: string;
  eingang_positionen: { bezeichnung: string }[];
};

/** Fertige Ausgangsrechnungen im Zeitraum (auch Altrechnungen und Stornos) */
export function useAusgang(von: string, bis: string) {
  return useQuery({
    queryKey: ["buchhaltung", "ausgang", von, bis],
    queryFn: async () => {
      const { data, error } = await supabase.from("belege")
        .select("id, nummer, datum, faellig_am, status, altbestand, netto, ust, brutto, kategorie_id, empf_name, betreff, projekte(nummer, name), zahlungen(betrag, art), beleg_positionen(bezeichnung)")
        .eq("typ", "rechnung").neq("status", "entwurf").gte("datum", von).lte("datum", bis)
        .order("datum", { ascending: false }).order("nummer", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AusgangZeile[];
    },
  });
}

export function useEingangZeitraum(von: string, bis: string) {
  return useQuery({
    queryKey: ["buchhaltung", "eingang", von, bis],
    queryFn: async () => {
      const { data, error } = await supabase.from("eingangsrechnungen")
        .select("id, lieferant, nummer, datum, faellig_am, bezahlt_am, netto, ust, brutto, kategorie, kategorie_id, datei_pfad, freigabe, eingang_positionen(bezeichnung)")
        .gte("datum", von).lte("datum", bis)
        .order("datum", { ascending: false }).order("lieferant");
      if (error) throw error;
      return (data ?? []) as unknown as EingangZeile[];
    },
  });
}

/** Letzte Kategorie je Lieferant (für den Vorschlag): Lieferant + Kategorie, neueste zuerst */
export function useLetzteEingangKategorien(aktiv = true) {
  return useQuery({
    queryKey: ["buchhaltung", "eingang-letzte"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("eingangsrechnungen").select("lieferant, kategorie_id")
        .not("kategorie_id", "is", null).order("datum", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Altrechnungen ────────────────────────────────────────────────────────

export type AltZeile = {
  id: string; nummer: string; datum: string; faellig_am: string | null; status: string; netto: number; ust: number; brutto: number;
  ust_satz: number; empf_name: string | null; kunde_id: string | null; kategorie_id: string | null;
  zahlungen: { id: string; betrag: number; art: string; datum: string }[];
  mahnungen: { stufe: number }[];
};

export function useAltrechnungen() {
  return useQuery({
    queryKey: ["buchhaltung", "alt"],
    queryFn: async () => {
      const { data, error } = await supabase.from("belege")
        .select("id, nummer, datum, faellig_am, status, netto, ust, brutto, ust_satz, empf_name, kunde_id, kategorie_id, zahlungen(id, betrag, art, datum), mahnungen(stufe)")
        .eq("altbestand", true).order("datum", { ascending: false }).order("nummer", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AltZeile[];
    },
  });
}

export type AltNeu = AltRechnung & { kunde_id: string | null; kategorie_id: string | null; pdf: File | null };

const empfaenger = (k: Pick<Kunde, "name" | "strasse" | "plz" | "ort" | "uid" | "email" | "ansprechpartner"> | undefined, name: string) => ({
  empf_name: k?.name ?? name,
  empf_zusatz: k?.ansprechpartner ?? null,
  empf_strasse: k?.strasse ?? null,
  empf_plz: k?.plz ?? null,
  empf_ort: k?.ort ?? null,
  empf_uid: k?.uid ?? null,
  empf_email: k?.email ?? null,
});

/**
 * Altrechnungen anlegen: unbekannte Kunden werden angelegt (sonst fehlten sie
 * in der Kundenhistorie), schon Bezahltes wird eine Zahlung zum Fälligkeitstag
 * (ohne Fälligkeit: Rechnungsdatum; nie in der Zukunft). Gibt die Zahl der neuen Kunden zurück.
 */
export async function altrechnungenAnlegen(zeilen: AltNeu[], kunden: Kunde[]): Promise<{ angelegt: number; neueKunden: number; ohnePdf: string[] }> {
  const jeName = new Map(kunden.map((k) => [k.name.trim().toLowerCase(), k]));
  const fehlend = [...new Set(zeilen.filter((z) => !z.kunde_id && !jeName.has(z.kunde.trim().toLowerCase())).map((z) => z.kunde.trim()))];
  if (fehlend.length) {
    const { data, error } = await supabase.from("kunden").insert(fehlend.map((name) => ({ name, notiz: "Aus dem alten Programm (Altrechnung)" }))).select("*");
    if (error) throw error;
    (data ?? []).forEach((k) => jeName.set(k.name.trim().toLowerCase(), k as Kunde));
  }
  const kundeVon = (z: AltNeu) => (z.kunde_id ? kunden.find((k) => k.id === z.kunde_id) : undefined) ?? jeName.get(z.kunde.trim().toLowerCase());

  const neu = zeilen.map((z) => ({ id: crypto.randomUUID(), z }));
  // alle Felder in jeder Zeile — sonst setzt PostgREST fehlende auf NULL
  const { error } = await supabase.from("belege").insert(neu.map(({ id, z }) => ({
    id, typ: "rechnung", status: "offen", altbestand: true, nummer: z.nummer.trim(), datum: z.datum, faellig_am: z.faellig_am,
    kunde_id: kundeVon(z)?.id ?? null, ...empfaenger(kundeVon(z), z.kunde.trim()),
    netto: z.netto, ust: z.ust, brutto: z.brutto, ust_satz: z.ust_satz, kategorie_id: z.kategorie_id,
    betreff: "Rechnung aus dem alten Programm",
  })));
  if (error) throw error;

  const bezahlt = neu.filter(({ z }) => z.bezahlt > 0);
  if (bezahlt.length) {
    const { error: e } = await supabase.from("zahlungen").insert(bezahlt.map(({ id, z }) => ({
      beleg_id: id, datum: [z.faellig_am ?? z.datum, isoTag()].sort()[0], betrag: z.bezahlt, art: "zahlung", notiz: "Übernommen aus dem alten Programm",
    })));
    if (e) throw e;
  }
  const ohnePdf: string[] = [];
  for (const { id, z } of neu) {
    if (z.pdf && !(await archivieren(id, z.pdf))) ohnePdf.push(z.nummer);
  }
  return { angelegt: neu.length, neueKunden: fehlend.length, ohnePdf };
}

export async function altrechnungAendern(id: string, felder: {
  nummer: string; datum: string; faellig_am: string | null; netto: number; ust: number; brutto: number; ust_satz: number;
  kunde_id: string | null; empf_name: string; kategorie_id: string | null;
}, kunde: Kunde | undefined): Promise<void> {
  const { data, error } = await supabase.from("belege").update({ ...felder, ...empfaenger(kunde, felder.empf_name) }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Die Altrechnung gibt es nicht mehr.");
}

/** Löschen samt Zahlungen und Mahnungen (Datenbank), danach das Original im Archiv */
export async function altrechnungLoeschen(id: string): Promise<void> {
  const { data, error } = await supabase.from("belege").delete().eq("id", id).eq("altbestand", true).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Nicht gelöscht.");
  await supabase.storage.from("beleg-archiv").remove([`${id}.pdf`]);
}
