import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bus, Plus, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { FahrzeugDialog } from "@/components/fuhrpark/FahrzeugDialog";
import { FAHRZEUG_ICON as ART_ICON, useOffeneSchaeden } from "@/components/fuhrpark/fuhrparkDaten";
import { useFahrzeuge, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, isoTag } from "@/lib/format";
import { faelligkeiten, faelligText } from "@/lib/fuhrpark";
import { amTag } from "@/lib/plantafel";
import { FAHRZEUG_ART, TEAM_FARBEN, type Fahrzeug, type FahrzeugArt } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * /fuhrpark — oben je Art eine Kachel (Anzahl, wie viele heute unterwegs) zum
 * Filtern, darunter je Art ein eigener Block mit Kacheln: im Einsatz oder frei,
 * welches Team ihn fährt, was fällig ist. Antippen öffnet das Fahrzeug.
 */
export default function Fuhrpark() {
  const { istChef } = useSitzung();
  const heute = isoTag();
  const [stillgelegte, setStillgelegte] = useState(false);
  const [filter, setFilter] = useState<FahrzeugArt | "achtung" | null>(null);
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
  const unterwegs = (f: Fahrzeug) => heuteEinsaetze.filter((t) => t.fahrzeuge.includes(f.id) && amTag(t, heute));
  const achtung = (f: Fahrzeug) => faelligkeiten(f, heute).length > 0 || !!schaeden[f.id];
  const arten = (Object.keys(FAHRZEUG_ART) as FahrzeugArt[]).filter((art) => sichtbar.some((f) => f.art === art));
  const gruppen = arten
    .filter((art) => !filter || filter === "achtung" || filter === art)
    .map((art) => ({ art, liste: sichtbar.filter((f) => f.art === art && (filter !== "achtung" || achtung(f))) }))
    .filter((g) => g.liste.length);
  const anzahlAchtung = sichtbar.filter(achtung).length;

  return (
    <Seite titel="Fuhrpark" untertitel={`${sichtbar.length} Fahrzeuge und Geräte · ${sichtbar.filter((f) => unterwegs(f).length).length} heute im Einsatz`}
      aktionen={istChef && <Button className="h-11 gap-1.5" onClick={() => setOffen({ fahrzeug: null })}><Plus className="h-4 w-4" /> Neu</Button>}>

      {!isLoading && sichtbar.length === 0 && (
        <Leer icon={Bus} text="Noch nichts im Fuhrpark. Busse, Steiger und Maschinen anlegen — dann lassen sie sich auf der Plantafel einteilen.">
          {istChef && <Button className="h-11 gap-1.5" onClick={() => setOffen({ fahrzeug: null })}><Plus className="h-4 w-4" /> Fahrzeug anlegen</Button>}
        </Leer>
      )}

      {sichtbar.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]" role="group" aria-label="Nach Art filtern">
          {anzahlAchtung > 0 && (
            <FilterKachel aktiv={filter === "achtung"} onClick={() => setFilter(filter === "achtung" ? null : "achtung")}
              icon={AlertTriangle} titel="Fällig & Schäden" zahl={anzahlAchtung} unter="ansehen" warn />
          )}
          {arten.map((art) => {
            const liste = sichtbar.filter((f) => f.art === art);
            const weg = liste.filter((f) => unterwegs(f).length).length;
            return (
              <FilterKachel key={art} aktiv={filter === art} onClick={() => setFilter(filter === art ? null : art)}
                icon={ART_ICON[art]} titel={FAHRZEUG_ART[art].mehrzahl} zahl={liste.length} unter={weg ? `${weg} unterwegs` : "alle frei"} />
            );
          })}
        </div>
      )}

      {gruppen.map(({ art, liste }) => {
        const Icon = ART_ICON[art];
        return (
          <section key={art} className="overflow-hidden rounded-xl border bg-muted/30">
            <div className="flex items-center gap-2.5 border-b bg-card px-4 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-5 w-5" /></span>
              <h2 className="font-semibold">{FAHRZEUG_ART[art].mehrzahl}</h2>
              <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">{liste.length}</span>
              {istChef && (
                <button type="button" className="ml-auto min-h-10 px-2 text-sm font-medium text-primary" onClick={() => setOffen({ fahrzeug: null, art })}>
                  + {FAHRZEUG_ART[art].text}
                </button>
              )}
            </div>
            <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {liste.map((f) => {
                const bei = unterwegs(f);
                const stammTeam = teams.find((t) => t.fahrzeug_id === f.id);
                const faellig = faelligkeiten(f, heute);
                return (
                  <li key={f.id} className="min-w-0">
                    <button type="button" onClick={() => setOffen({ fahrzeug: f })} data-fahrzeug={f.id}
                      className={cn("flex h-full w-full flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50", !f.aktiv && "opacity-60")}>
                      <div className="flex w-full items-start gap-3">
                        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", bei.length ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold leading-tight">{f.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{[f.kennzeichen, f.typ].filter(Boolean).join(" · ") || FAHRZEUG_ART[art].text}</p>
                        </div>
                        {!f.aktiv ? <StatusPille eintrag={{ ton: "grau", text: "Stillgelegt" }} />
                          : bei.length ? <StatusPille eintrag={{ ton: "blau", text: "Im Einsatz" }} />
                          : <StatusPille eintrag={{ ton: "gruen", text: "Frei" }} />}
                      </div>
                      <div className="w-full space-y-1 border-t pt-2 text-sm">
                        <p className="flex items-center gap-1.5">
                          <span className="w-12 shrink-0 text-xs text-muted-foreground">Team</span>
                          {stammTeam ? (
                            <span className="flex items-center gap-1.5 font-medium"><span className={cn("h-2.5 w-2.5 rounded-full", TEAM_FARBEN[stammTeam.farbe]?.punkt ?? "bg-slate-500")} />{stammTeam.name}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className="w-12 shrink-0 text-xs text-muted-foreground">Heute</span>
                          <span className={cn("truncate", bei.length ? "font-medium" : "text-muted-foreground")}>{bei.length ? bei.map((t) => t.titel).join(", ") : "frei"}</span>
                        </p>
                      </div>
                      {(faellig.length > 0 || schaeden[f.id] || f.gemietet) && (
                        <span className="flex flex-wrap gap-1">
                          {f.gemietet && <StatusPille eintrag={{ ton: "lila", text: "Gemietet" }} />}
                          {schaeden[f.id] ? <StatusPille eintrag={{ ton: "rot", text: schaeden[f.id] === 1 ? "1 Schaden offen" : `${schaeden[f.id]} Schäden offen` }} /> : null}
                          {faellig.map((x) => <StatusPille key={x.was} eintrag={{ ton: x.ueberfaellig ? "rot" : "gelb", text: faelligText(x, datumKurz) }} />)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {alle.some((f) => !f.aktiv) && (
        <button type="button" className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStillgelegte(!stillgelegte)}>
          {stillgelegte ? "Stillgelegte ausblenden" : "Stillgelegte zeigen"}
        </button>
      )}

      <FahrzeugDialog open={!!offen} onOpenChange={(o) => !o && setOffen(null)} fahrzeug={offen?.fahrzeug ?? null} neueArt={offen?.art} />
    </Seite>
  );
}

function FilterKachel({ aktiv, onClick, icon: Icon, titel, zahl, unter, warn }: {
  aktiv: boolean; onClick: () => void; icon: LucideIcon; titel: string; zahl: number; unter: string; warn?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={aktiv}
      className={cn("flex min-h-20 flex-col justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50",
        aktiv && "border-primary ring-2 ring-primary", warn && !aktiv && "border-status-gelb-fg/40 bg-status-gelb/40")}>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className={cn("h-4 w-4", warn ? "text-status-gelb-fg" : "text-muted-foreground")} /><span className="truncate">{titel}</span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="zahl text-2xl font-bold">{zahl}</span>
        <span className="truncate text-xs text-muted-foreground">{unter}</span>
      </span>
    </button>
  );
}
