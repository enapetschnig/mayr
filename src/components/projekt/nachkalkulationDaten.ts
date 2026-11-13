import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { lohnarten } from "@/lib/kalkulation";
import type { MitarbeiterSatz, Saetze } from "@/lib/nachkalkulation";

/**
 * Lohnkosten und Verrechnungssätze je Mitarbeiter (nur der Chef liest sie,
 * RLS) plus die Lohnart jeder Person. `saetzeFuer(standardSatz)` baut daraus,
 * was `nachkalkulieren` braucht.
 */
export function useMitarbeiterSaetze(aktiv = true) {
  const { firma, istChef } = useSitzung();
  const { data } = useQuery({
    queryKey: ["mitarbeiter_saetze"],
    enabled: aktiv && istChef,
    queryFn: async () => {
      const [s, p] = await Promise.all([
        supabase.from("mitarbeiter_saetze").select("user_id, gueltig_ab, lohnkosten, verrechnungssatz"),
        supabase.from("profiles").select("id, lohnart"),
      ]);
      if (s.error) throw s.error;
      if (p.error) throw p.error;
      return {
        saetze: (s.data ?? []).map((x) => ({
          ...x,
          lohnkosten: x.lohnkosten == null ? null : Number(x.lohnkosten),
          verrechnungssatz: x.verrechnungssatz == null ? null : Number(x.verrechnungssatz),
        })) as MitarbeiterSatz[],
        lohnartVon: Object.fromEntries((p.data ?? []).map((x) => [x.id, x.lohnart])),
      };
    },
  });
  const saetzeFuer = (standardSatz: number): Saetze => ({
    saetze: data?.saetze ?? [],
    lohnartVon: data?.lohnartVon ?? {},
    lohnarten: lohnarten(firma, standardSatz),
    standardSatz,
    standardKosten: firma?.kostensatz != null ? Number(firma.kostensatz) : null,
  });
  return { geladen: !!data, saetzeFuer };
}
