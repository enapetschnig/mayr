import { supabase } from "@/integrations/supabase/client";
import { codeVarianten } from "@/lib/strichcode";

export type CodeTreffer = {
  artikel_id: string;
  /** Packungsinhalt: 1 beim Einzelstück, z. B. 100 beim Karton */
  menge: number;
  /** die Schreibweise, unter der der Artikel gefunden wurde */
  code: string;
};

/**
 * Strichcode → Artikel über `artikel_zu_code` (EAN am Artikel oder
 * zugeordneter Zusatzcode). Erst der Code genau wie gelesen, dann die
 * normalisierten Varianten (UPC-A ↔ EAN-13, GS1-Etikett, UPC-E …).
 * Die Varianten laufen gleichzeitig; gewonnen hat die erste in der
 * Reihenfolge — das kostet am Handy nur eine Runde statt drei.
 * Wirft bei Verbindungsfehlern, null = unbekannt.
 */
export async function artikelZuCode(roh: string): Promise<CodeTreffer | null> {
  const varianten = codeVarianten(roh);
  if (!varianten.length) return null;
  const antworten = await Promise.all(varianten.map((v) => supabase.rpc("artikel_zu_code", { p_code: v })));
  for (let i = 0; i < varianten.length; i++) {
    const { data, error } = antworten[i];
    if (error) throw error;
    const t = (data ?? [])[0];
    if (t?.artikel_id) {
      const menge = Number(t.menge);
      return { artikel_id: t.artikel_id, menge: menge > 0 ? menge : 1, code: varianten[i] };
    }
  }
  return null;
}
