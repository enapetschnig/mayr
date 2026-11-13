import { Link } from "react-router-dom";
import { ChevronRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dateiOeffnen, useNeueDokumente } from "@/components/dokumente/dokumentDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { personalTitel } from "@/lib/dokumente";

/**
 * Startseite: „Neuer Lohnzettel Oktober 2026“ — solange der Mitarbeiter ihn
 * nicht geöffnet hat. Antippen öffnet die Datei und nimmt den Hinweis weg.
 */
export function NeueDokumente() {
  const { profil } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: neue = [] } = useNeueDokumente(profil?.id);
  if (!neue.length) return null;

  const oeffnen = async (d: (typeof neue)[number]) => {
    if (await dateiOeffnen("personal", d.pfad)) {
      await supabase.rpc("personal_dokument_gelesen", { p_id: d.id });
      await neuLaden("dokumente");
    }
  };

  return (
    <section className="space-y-2" data-neue-dokumente>
      {neue.slice(0, 3).map((d) => (
        <button key={d.id} type="button" onClick={() => void oeffnen(d)}
          className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft p-3 text-left transition-colors hover:border-primary">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><FileText className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-tight">Neu für dich: {personalTitel(d)}</span>
            <span className="block truncate text-xs text-muted-foreground">Antippen zum Öffnen · {d.name}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
        </button>
      ))}
      {neue.length > 3 && <Link to="/dokumente?bereich=meine" className="block px-1 text-sm font-medium text-primary">Alle {neue.length} neuen Dokumente</Link>}
    </section>
  );
}
