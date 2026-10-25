import { supabase } from "@/integrations/supabase/client";

/**
 * Fertige Rechnungen als PDF aufbewahren — genau so, wie sie verschickt
 * wurden. Neu erzeugt sähe eine alte Rechnung nach einer Änderung im Betrieb
 * (Bank, Anschrift, Logo) oder am Projekt anders aus.
 *
 * Speicher „beleg-archiv“, Datei <beleg-id>.pdf. Die Policies erlauben das
 * Ablegen nur für fertige Rechnungen, nie das Überschreiben und das Löschen
 * erst, wenn die Rechnung weg ist (Migration 20261025170000_beleg_archiv.sql).
 */
const BUCKET = "beleg-archiv";

export const archivPfad = (belegId: string) => `${belegId}.pdf`;

/** Das abgelegte Original — null, wenn (noch) keins da ist */
export async function archivLaden(belegId: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(archivPfad(belegId));
  return error ? null : data;
}

/** Ablegen. Liegt schon eins da, bleibt das erste — true heißt: im Archiv. */
export async function archivieren(belegId: string, pdf: Blob): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).upload(archivPfad(belegId), pdf, { contentType: "application/pdf", upsert: false });
  return !error || /already exists|duplicate/i.test(error.message);
}
