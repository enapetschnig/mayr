import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardSignature, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, StatusPille } from "@/components/Bausteine";
import { datumKurz, isoTag, stunden, uhrzeit } from "@/lib/format";
import { name, type Profil, type Zeit } from "@/lib/types";

export type ZeitMitInfo = Zeit & {
  projekte: { nummer: string; name: string } | null;
  profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null;
  regieberichte: { nummer: string | null; status: string } | null;
};

/** Stunden nach Zeitraum, Person oder Projekt — neueste zuerst. */
export function useZeitenListe(filter: { von?: string; bis?: string; userId?: string; projektId?: string }) {
  return useQuery({
    queryKey: ["zeiten", "liste", filter],
    queryFn: async () => {
      let q = supabase.from("zeiten")
        .select("*, projekte(nummer, name), profiles(vorname, nachname, farbe), regieberichte(nummer, status)")
        .order("datum", { ascending: false }).order("von", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (filter.von) q = q.gte("datum", filter.von);
      if (filter.bis) q = q.lte("datum", filter.bis);
      if (filter.userId) q = q.eq("user_id", filter.userId);
      if (filter.projektId) q = q.eq("projekt_id", filter.projektId);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as ZeitMitInfo[];
    },
  });
}

/**
 * Stunden nach Tagen gruppiert, je Tag die Summe. Antippen öffnet die
 * Buchung — verrechnete oder unterschriebene sind gesperrt (Schloss).
 */
export function ZeitenListe({
  zeiten, onWahl, mitPerson = false, mitProjekt = true,
}: {
  zeiten: ZeitMitInfo[];
  onWahl: (z: ZeitMitInfo) => void;
  mitPerson?: boolean;
  mitProjekt?: boolean;
}) {
  const heute = isoTag();
  const tage: { datum: string; eintraege: ZeitMitInfo[] }[] = [];
  zeiten.forEach((z) => {
    const tag = tage.find((t) => t.datum === z.datum);
    if (tag) tag.eintraege.push(z);
    else tage.push({ datum: z.datum, eintraege: [z] });
  });

  return (
    <div className="space-y-4">
      {tage.map((t) => (
        <section key={t.datum}>
          <div className="flex items-baseline justify-between px-1 pb-1.5">
            <h3 className="text-sm font-semibold">{t.datum === heute ? "Heute" : datumKurz(t.datum)}</h3>
            <span className="zahl text-sm font-semibold">{stunden(t.eintraege.reduce((s, z) => s + Number(z.stunden), 0))}</span>
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {t.eintraege.map((z) => {
              const fest = !!z.rechnung_id || z.regieberichte?.status === "unterschrieben";
              return (
                <li key={z.id}>
                  <button type="button" onClick={() => onWahl(z)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50">
                    {mitPerson && <Avatar profil={z.profiles} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {mitPerson && <span>{name(z.profiles)}{mitProjekt && " · "}</span>}
                        {mitProjekt && (z.projekte ? <><span className="font-mono text-xs text-muted-foreground">{z.projekte.nummer}</span> {z.projekte.name}</> : "Ohne Projekt")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {z.von && z.bis ? `${uhrzeit(z.von)}–${uhrzeit(z.bis)}${z.pause_minuten ? ` · ${z.pause_minuten} min Pause` : ""}` : ""}
                        {z.von && z.bis && z.taetigkeit ? " · " : ""}
                        {z.taetigkeit}
                      </p>
                      {(z.regieberichte || z.rechnung_id) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {z.regieberichte && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <ClipboardSignature className="h-3 w-3" /> {z.regieberichte.nummer}
                            </span>
                          )}
                          {z.rechnung_id && <StatusPille eintrag={{ ton: "lila", text: "verrechnet" }} />}
                        </div>
                      )}
                    </div>
                    <span className="zahl shrink-0 font-semibold">{stunden(Number(z.stunden))}</span>
                    {fest ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
