import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bus, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Gruppentitel, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { FahrzeugDialog } from "@/components/fuhrpark/FahrzeugDialog";
import { useOffeneSchaeden } from "@/components/fuhrpark/fuhrparkDaten";
import { useFahrzeuge, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, isoTag } from "@/lib/format";
import { faelligkeiten, faelligText } from "@/lib/fuhrpark";
import { amTag } from "@/lib/plantafel";
import { FAHRZEUG_ART, type Fahrzeug, type FahrzeugArt } from "@/lib/types";
import { cn } from "@/lib/utils";

/** /fuhrpark — Busse, Steiger, Maschinen, Messgeräte: wer hat ihn heute, was ist fällig */
export default function Fuhrpark() {
  const { istChef } = useSitzung();
  const heute = isoTag();
  const [stillgelegte, setStillgelegte] = useState(false);
  const { data: alle = [], isLoading } = useFahrzeuge(true);
  const { data: teams = [] } = useTeams();
  const { data: schaeden = {} } = useOffeneSchaeden();
  const [offen, setOffen] = useState<{ fahrzeug: Fahrzeug | null; art?: FahrzeugArt } | null>(null);

  const { data: heuteEinsaetze = [] } = useQuery({
    queryKey: ["termine", "fuhrpark", heute],
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("id, titel, datum, bis_datum, fahrzeuge, team_id")
        .lte("datum", heute).or(`bis_datum.gte.${heute},and(bis_datum.is.null,datum.eq.${heute})`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sichtbar = alle.filter((f) => stillgelegte || f.aktiv);
  const gruppen = useMemo(() => (Object.keys(FAHRZEUG_ART) as FahrzeugArt[])
    .map((art) => ({ art, liste: sichtbar.filter((f) => f.art === art) }))
    .filter((g) => g.liste.length), [sichtbar]);
  const faelligAlle = alle.flatMap((f) => faelligkeiten(f, heute).map((x) => ({ f, x })));

  return (
    <Seite titel="Fuhrpark" untertitel="Busse, Steiger, Maschinen, Messgeräte"
      aktionen={istChef && <Button className="h-11 gap-1.5" onClick={() => setOffen({ fahrzeug: null })}><Plus className="h-4 w-4" /> Neu</Button>}>
      {faelligAlle.length > 0 && (
        <section className="rounded-lg border border-status-gelb bg-status-gelb/30 p-3">
          <p className="mb-1.5 text-sm font-semibold">Fällig</p>
          <ul className="space-y-1">
            {faelligAlle.map(({ f, x }) => (
              <li key={f.id + x.was}>
                <button type="button" onClick={() => setOffen({ fahrzeug: f })} className="flex min-h-9 w-full items-center gap-2 text-left text-sm hover:underline">
                  <StatusPille eintrag={{ ton: x.ueberfaellig ? "rot" : "gelb", text: faelligText(x, datumKurz) }} />
                  <span className="truncate">{f.name}{f.kennzeichen ? ` · ${f.kennzeichen}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isLoading && sichtbar.length === 0 && (
        <Leer icon={Bus} text="Noch nichts im Fuhrpark. Busse, Steiger und Maschinen anlegen — dann lassen sie sich auf der Plantafel einteilen.">
          {istChef && <Button className="h-11 gap-1.5" onClick={() => setOffen({ fahrzeug: null })}><Plus className="h-4 w-4" /> Fahrzeug anlegen</Button>}
        </Leer>
      )}

      {gruppen.map(({ art, liste }) => (
        <section key={art}>
          <div className="flex items-center justify-between">
            <Gruppentitel>{FAHRZEUG_ART[art].mehrzahl}</Gruppentitel>
            {istChef && (
              <button type="button" className="-mt-2 min-h-11 px-2 text-sm font-medium text-primary" onClick={() => setOffen({ fahrzeug: null, art })}>
                + {FAHRZEUG_ART[art].text}
              </button>
            )}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {liste.map((f) => {
              const bei = heuteEinsaetze.filter((t) => t.fahrzeuge.includes(f.id) && amTag(t, heute));
              const stammTeam = teams.find((t) => t.fahrzeug_id === f.id);
              const faellig = faelligkeiten(f, heute);
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setOffen({ fahrzeug: f })}
                    className={cn("flex h-full w-full items-start gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/50", !f.aktiv && "opacity-60")}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold leading-tight">{f.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[f.kennzeichen, f.typ, stammTeam && `Team ${stammTeam.name}`].filter(Boolean).join(" · ") || FAHRZEUG_ART[art].text}</p>
                      <p className="truncate text-sm">
                        {bei.length ? <>Heute: <span className="font-medium">{bei.map((t) => t.titel).join(", ")}</span></> : <span className="text-muted-foreground">Heute frei</span>}
                      </p>
                      {(faellig.length > 0 || schaeden[f.id] || f.gemietet || !f.aktiv) && (
                        <span className="flex flex-wrap gap-1 pt-0.5">
                          {!f.aktiv && <StatusPille eintrag={{ ton: "grau", text: "Stillgelegt" }} />}
                          {f.gemietet && <StatusPille eintrag={{ ton: "lila", text: "Gemietet" }} />}
                          {schaeden[f.id] ? <StatusPille eintrag={{ ton: "rot", text: schaeden[f.id] === 1 ? "1 Schaden offen" : `${schaeden[f.id]} Schäden offen` }} /> : null}
                          {faellig.map((x) => <StatusPille key={x.was} eintrag={{ ton: x.ueberfaellig ? "rot" : "gelb", text: faelligText(x, datumKurz) }} />)}
                        </span>
                      )}
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {alle.some((f) => !f.aktiv) && (
        <button type="button" className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStillgelegte(!stillgelegte)}>
          {stillgelegte ? "Stillgelegte ausblenden" : "Stillgelegte zeigen"}
        </button>
      )}

      <FahrzeugDialog open={!!offen} onOpenChange={(o) => !o && setOffen(null)} fahrzeug={offen?.fahrzeug ?? null} neueArt={offen?.art} />
    </Seite>
  );
}
