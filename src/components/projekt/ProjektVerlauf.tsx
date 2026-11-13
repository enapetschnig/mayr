import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Landmark, MessageCircle, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Karte } from "@/components/Bausteine";
import { name, type Profil } from "@/lib/types";
import { nummerText } from "@/lib/whatsapp";

const ICON = { whatsapp: MessageCircle, foerderung: Landmark, notiz: StickyNote } as const;
const ZEIT = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Was ans Projekt ging: WhatsApp an den Kunden, Förderschritte — neueste zuerst */
export function ProjektVerlauf({ projektId }: { projektId: string }) {
  const [alle, setAlle] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["projekt_verlauf", projektId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projekt_verlauf")
        .select("id, art, text, an, created_at, profiles(vorname, nachname)")
        .eq("projekt_id", projektId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as { id: string; art: keyof typeof ICON; text: string; an: string | null; created_at: string; profiles: Pick<Profil, "vorname" | "nachname"> | null }[];
    },
  });
  if (!data.length) return null;
  const zeigen = alle ? data : data.slice(0, 4);

  return (
    <Karte titel="Verlauf">
      <ul className="space-y-3">
        {zeigen.map((e) => {
          const I = ICON[e.art] ?? History;
          return (
            <li key={e.id} className="flex gap-3 text-sm">
              <I className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {ZEIT.format(new Date(e.created_at))}{e.profiles && ` · ${name(e.profiles)}`}
                  {e.art === "whatsapp" && ` · WhatsApp${e.an ? ` an ${nummerText(e.an)}` : ""}`}
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap break-words">{e.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {data.length > 4 && (
        <button type="button" className="mt-2 min-h-11 text-sm text-primary hover:underline" onClick={() => setAlle(!alle)}>
          {alle ? "Weniger zeigen" : `Alle ${data.length} zeigen`}
        </button>
      )}
    </Karte>
  );
}
