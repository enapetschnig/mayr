import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fehlerText } from "@/components/stamm/stammDaten";
import type { Beleg, Mahnung, Zahlung } from "@/lib/types";
import type { MahnVorschlag, ZahlungArt } from "./opLogik";

/**
 * Offene Posten: Abfragen und Speichern. Query-Keys beginnen mit „op“;
 * wer Zahlungen ändert, lädt auch „belege“ neu (der Trigger hat dort den
 * Status gesetzt).
 */

export type { Mahnung, Zahlung };

export type OpBeleg = Pick<
  Beleg,
  | "id" | "nummer" | "status" | "datum" | "faellig_am" | "brutto" | "netto" | "projekt_id" | "kunde_id"
  | "empf_name" | "empf_zusatz" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_uid" | "empf_email"
> & {
  projekte: { id: string; nummer: string; name: string } | null;
  zahlungen: Zahlung[];
  mahnungen: Mahnung[];
};

const FELDER =
  "id, nummer, status, datum, faellig_am, brutto, netto, projekt_id, kunde_id, empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email, projekte(id, nummer, name), zahlungen(*), mahnungen(*)";

const fehler = (text: string, e: { code?: string; message: string } | null | undefined) =>
  new Error(e?.message ? `${text}: ${fehlerText(e)}` : text);

/** Alle offenen Rechnungen mit Zahlungen und Mahnungen, älteste Fälligkeit zuerst */
export function useOffenePosten(aktiv = true) {
  return useQuery({
    queryKey: ["op", "liste"],
    enabled: aktiv,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege").select(FELDER)
        .eq("typ", "rechnung").eq("status", "offen")
        .order("faellig_am", { ascending: true, nullsFirst: false }).order("datum");
      if (error) throw error;
      return (data ?? []) as unknown as OpBeleg[];
    },
  });
}

/** Zahlungen und Mahnungen einer Rechnung (im Editor) */
export function useBelegOp(belegId: string | null | undefined, aktiv = true) {
  return useQuery({
    queryKey: ["op", "beleg", belegId],
    enabled: aktiv && !!belegId,
    queryFn: async () => {
      const [z, m] = await Promise.all([
        supabase.from("zahlungen").select("*").eq("beleg_id", belegId!).order("datum").order("created_at"),
        supabase.from("mahnungen").select("*").eq("beleg_id", belegId!).order("stufe"),
      ]);
      if (z.error) throw z.error;
      if (m.error) throw m.error;
      return { zahlungen: z.data ?? [], mahnungen: m.data ?? [] };
    },
  });
}

export async function zahlungErfassen(z: { beleg_id: string; datum: string; betrag: number; art: ZahlungArt; notiz: string | null }): Promise<void> {
  const { error } = await supabase.from("zahlungen").insert(z);
  if (error) throw fehler("Zahlung nicht gespeichert", error);
}

export async function zahlungLoeschen(id: string): Promise<void> {
  const { data, error } = await supabase.from("zahlungen").delete().eq("id", id).select("id");
  if (error) throw fehler("Zahlung nicht gelöscht", error);
  if (!data?.length) throw new Error("Zahlung nicht gelöscht.");
}

/** Mahnung festhalten — je Rechnung und Stufe eine (ein Doppelklick legt keine zweite an) */
export async function mahnungAnlegen(belegId: string, v: MahnVorschlag, heute: string): Promise<Mahnung> {
  const { data, error } = await supabase.from("mahnungen").insert({
    beleg_id: belegId, stufe: v.stufe, datum: heute, frist_bis: v.frist_bis, offen: v.offen, spesen: v.spesen, zinsen: v.zinsen,
  }).select("*").single();
  if (error?.code === "23505") {
    const { data: da } = await supabase.from("mahnungen").select("*").eq("beleg_id", belegId).eq("stufe", v.stufe).single();
    if (da) return da;
  }
  if (error || !data) throw fehler("Mahnung nicht gespeichert", error);
  return data;
}

/** Nur die jeweils letzte Stufe lässt sich zurücknehmen (falsch geschickt, doch bezahlt) */
export async function mahnungLoeschen(id: string): Promise<void> {
  const { data, error } = await supabase.from("mahnungen").delete().eq("id", id).select("id");
  if (error) throw fehler("Mahnung nicht gelöscht", error);
  if (!data?.length) throw new Error("Mahnung nicht gelöscht.");
}
