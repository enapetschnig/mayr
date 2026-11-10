import { supabase } from "@/integrations/supabase/client";
import type { Artikel } from "@/lib/types";

/**
 * Aufrufe der Edge-Funktion `ki` (Claude). Fehler kommen als lesbarer
 * deutscher Text aus der Funktion — den reichen wir als Error weiter.
 */
async function ki<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ki", { body });
  if (error) {
    let text = "Die KI ist gerade nicht erreichbar.";
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.fehler) text = j.fehler;
    } catch { /* Netzwerk: Standardtext */ }
    throw new Error(text);
  }
  return (data as { daten: T }).daten;
}

export type KiKomponente = {
  gruppe: string;
  was: string;
  suche: string[];
  menge: number;
  einheit: string;
  begruendung: string;
  artikel: Artikel | null;
  passt: "genau" | "aehnlich" | "keiner";
  alternativen: Artikel[];
};
export type KiMaterial = { titel: string; hinweise: string[]; komponenten: KiKomponente[] };

/** „PV-Anlage 9 kWp“ → Komponenten mit passenden Artikeln aus dem Stamm (nur Chef) */
export const materialVorschlag = (text: string) => ki<KiMaterial>({ aufgabe: "material_vorschlag", text });

export type KiBelegPosition = {
  artikelnummer: string | null;
  bezeichnung: string;
  menge: number | null;
  einheit: string | null;
  einzelpreis: number | null;
  gesamt: number | null;
  lieferschein_nr: string | null;
};
export type KiBeleg = {
  art: "lieferschein" | "rechnung" | "gutschrift" | "unklar";
  lieferant: string | null;
  nummer: string | null;
  datum: string | null;
  faellig_am: string | null;
  netto: number | null;
  ust_satz: number | null;
  brutto: number | null;
  iban: string | null;
  skonto_prozent: number | null;
  skonto_bis: string | null;
  lieferschein_nummern: string[];
  positionen: KiBelegPosition[];
  hinweis: string | null;
};

/** Lieferschein oder Rechnung (Foto/PDF im Speicher) lesen */
export const belegLesen = (bucket: "lieferscheine" | "eingangsrechnungen", pfad: string) =>
  ki<KiBeleg>({ aufgabe: "beleg_lesen", bucket, pfad });
