import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Settings2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useIstPc } from "@/components/AppLayout";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { TeamsDialog } from "@/components/plantafel/TeamsDialog";
import { Gantt } from "@/components/plantafel/Gantt";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { amTag, ANSICHTEN, konflikte, type Ansicht, type Konflikt, type Zeile } from "@/lib/plantafel";
import { TEAM_FARBEN, name, type Fahrzeug, type Profil, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ANSICHT_KEY = "elektro.plantafel.ansicht";
const montagVon = (iso: string) => tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);

/**
 * /plantafel — wer fährt mit welchem Bus wohin. Am PC ein Gantt
 * (components/plantafel/Gantt.tsx): Teams mit ihren Leuten, Leute ohne Team,
 * Busse, Steiger und Geräte; Balken ziehen, Ränder ziehen, aufziehen.
 * Am Handy: Tagesliste.
 */
export default function Plantafel() {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const heute = isoTag();
  const [bezug, setBezug] = useState(heute);
  const [ansicht, setAnsichtState] = useState<Ansicht>(() => {
    try { const w = localStorage.getItem(ANSICHT_KEY); return ANSICHTEN.some((x) => x.wert === w) ? (w as Ansicht) : "2wochen"; } catch { return "2wochen"; }
  });
  const setAnsicht = (a: Ansicht) => { setAnsichtState(a); try { localStorage.setItem(ANSICHT_KEY, a); } catch { /* egal */ } };
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string; bisDatum?: string; mitarbeiterId?: string; teamId?: string; fahrzeugId?: string } | null>(null);
  const [teamsOffen, setTeamsOffen] = useState(false);

  // Am Handy immer eine Arbeitswoche als Liste
  const a = ANSICHTEN.find((x) => x.wert === (pc ? ansicht : "woche"))!;
  const start = a.wert === "3monate" ? tageDazu(montagVon(bezug), -7) : montagVon(bezug);
  const tage = useMemo(() => Array.from({ length: pc ? a.tage : 5 }, (_, i) => tageDazu(start, i)), [start, a.tage, pc]);
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: projekte = [] } = useProjekte();
  const { data: abwesend = [] } = useKalenderAbwesenheit(von, bis);
  const termineKey = ["termine", "plantafel", von, bis];
  const { data: termine = [] } = useQuery({
    queryKey: termineKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*").lte("datum", bis)
        .or(`bis_datum.gte.${von},and(bis_datum.is.null,datum.gte.${von})`)
        .order("datum").order("von", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Termin[];
    },
    placeholderData: (alt) => alt,
  });

  useEffect(() => {
    const kanal = supabase.channel("plantafel")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => void neuLaden("termine"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abw = abwesend.filter((x): x is typeof x & { user_id: string; von: string; bis: string } => !!x.user_id && !!x.von && !!x.bis);
  const liste = konflikte(termine, tage, abw);
  const konfliktIds = new Set(liste.flatMap((k) => k.termine));
  const titel = `${datumText(von).slice(0, 6)} – ${datumText(bis)}`;

  const neuAus = (v: { datum: string; bisDatum?: string; zeile: Zeile }) => setDialog({
    datum: v.datum, bisDatum: v.bisDatum,
    mitarbeiterId: v.zeile.art === "person" ? v.zeile.id : undefined,
    teamId: v.zeile.art === "team" ? v.zeile.id : undefined,
    fahrzeugId: v.zeile.art === "fahrzeug" ? v.zeile.id : undefined,
  });

  return (
    <Seite titel="Plantafel" untertitel={titel} breit
      aktionen={(
        <div className="flex gap-2">
          {istChef && pc && <Button variant="outline" className="h-11 gap-1.5" onClick={() => setTeamsOffen(true)}><Settings2 className="h-4 w-4" /> Teams</Button>}
          <Button className="h-11 gap-1.5" onClick={() => setDialog({ datum: tage.includes(heute) ? heute : von })}><CalendarPlus className="h-4 w-4" /> Einsatz</Button>
        </div>
      )}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Zurück" onClick={() => setBezug(tageDazu(bezug, -(pc ? a.schritt : 7)))}><ChevronLeft className="h-5 w-5" /></Button>
          <Button variant="outline" className="h-11" onClick={() => setBezug(heute)}>Heute</Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Weiter" onClick={() => setBezug(tageDazu(bezug, pc ? a.schritt : 7))}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        {pc && (
          <div className="flex rounded-md border bg-card p-0.5" role="group" aria-label="Zeitraum">
            {ANSICHTEN.map((x) => (
              <button key={x.wert} type="button" aria-pressed={ansicht === x.wert} onClick={() => setAnsicht(x.wert)}
                className={cn("h-9 rounded px-3 text-sm font-medium", ansicht === x.wert ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {x.text}
              </button>
            ))}
          </div>
        )}
        {pc && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">Gehe zu
            <input type="date" className="h-11 rounded-md border bg-card px-2 text-sm text-foreground" onChange={(e) => e.target.value && setBezug(e.target.value)} />
          </label>
        )}
      </div>

      {liste.length > 0 && <KonfliktListe liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}

      {pc ? (
        <Gantt start={start} ansicht={ansicht} termine={termine} termineKey={termineKey} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge}
          projekte={projekte} abwesend={abwesend} konfliktIds={konfliktIds} darf={istChef} heute={heute} seitenleiste
          onOeffnen={(t) => setDialog({ termin: t })} onNeu={neuAus} />
      ) : (
        <HandyListe tage={tage} heute={heute} termine={termine} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} projekte={projekte}
          konfliktIds={konfliktIds} onTermin={(t) => setDialog({ termin: t })} onNeu={(datum) => setDialog({ datum })} />
      )}

      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} termin={dialog?.termin} datum={dialog?.datum} bisDatum={dialog?.bisDatum}
        mitarbeiterId={dialog?.mitarbeiterId} teamId={dialog?.teamId} fahrzeugId={dialog?.fahrzeugId} />
      <TeamsDialog open={teamsOffen} onOpenChange={setTeamsOffen} />
    </Seite>
  );
}

function KonfliktListe({
  liste, termine, mitarbeiter, fahrzeuge, onTermin,
}: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const [offen, setOffen] = useState(false);
  const text = (k: Konflikt) => {
    const wer = k.art === "fahrzeug_doppelt" ? fahrzeuge.find((f) => f.id === k.ressource)?.name ?? "Fahrzeug" : name(mitarbeiter.find((m) => m.id === k.ressource));
    const tag = `${WOCHENTAGE[(isoZuDatum(k.tag).getDay() + 6) % 7]} ${datumText(k.tag).slice(0, 6)}`;
    return k.art === "person_abwesend" ? `${wer} ist am ${tag} abwesend, aber eingeteilt` : `${wer} ist am ${tag} doppelt eingeteilt`;
  };
  return (
    <section className="rounded-lg border border-status-rot-fg/40 bg-status-rot/30 px-3 py-1.5" role="status">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} className="flex min-h-9 w-full items-center gap-1.5 text-left text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-semibold">{liste.length === 1 ? "1 Konflikt" : `${liste.length} Konflikte`}</span>
        {!offen && <span className="truncate text-muted-foreground">· {text(liste[0])}{liste.length > 1 ? " …" : ""}</span>}
        <span className="ml-auto shrink-0 text-xs font-medium text-primary">{offen ? "zuklappen" : "zeigen"}</span>
      </button>
      {offen && (
        <ul className="space-y-0.5 pb-1.5 text-sm">
          {liste.map((k) => (
            <li key={`${k.art}${k.tag}${k.ressource}`} className="flex flex-wrap items-center gap-x-2">
              <span>{text(k)}:</span>
              {k.termine.map((id) => {
                const t = termine.find((x) => x.id === id);
                return t && <button key={id} type="button" className="min-h-8 font-medium text-primary underline-offset-2 hover:underline" onClick={() => onTermin(t)}>{t.titel}</button>;
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Handy: je Tag die Einsätze, nach Team gruppiert */
function HandyListe({
  tage, heute, termine, teams, mitarbeiter, fahrzeuge, projekte, konfliktIds, onTermin, onNeu,
}: {
  tage: string[];
  heute: string;
  termine: Termin[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: { id: string; nummer: string }[];
  konfliktIds: Set<string>;
  onTermin: (t: Termin) => void;
  onNeu: (tag: string) => void;
}) {
  return (
    <div className="space-y-4">
      {tage.map((tag) => {
        const liste = termine.filter((t) => amTag(t, tag));
        return (
          <section key={tag}>
            <div className="flex items-center justify-between px-1 pb-1.5">
              <h3 className={cn("text-sm font-semibold", tag === heute && "text-primary")}>
                {tag === heute ? "Heute, " : `${WOCHENTAGE[(isoZuDatum(tag).getDay() + 6) % 7]}, `}{datumText(tag).slice(0, 6)}
              </h3>
              <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-sm font-medium text-primary" onClick={() => onNeu(tag)}>+ Einsatz</button>
            </div>
            {liste.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">Nichts eingeteilt</p>
            ) : (
              <ul className="space-y-2">
                {liste.map((t) => {
                  const team = teams.find((x) => x.id === t.team_id);
                  const p = projekte.find((x) => x.id === t.projekt_id);
                  const fz = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => onTermin(t)}
                        className={cn("w-full rounded-lg border p-3 text-left", team ? TEAM_FARBEN[team.farbe]?.klasse : "bg-card", konfliktIds.has(t.id) && "ring-2 ring-status-rot-fg")}>
                        <span className="block font-semibold">{konfliktIds.has(t.id) ? "⚠ " : ""}{t.titel}</span>
                        <span className="block text-sm opacity-80">{zeitText(t)}{p ? ` · ${p.nummer}` : ""}{team ? ` · Team ${team.name}` : ""}</span>
                        {fz.length > 0 && <span className="flex items-center gap-1 text-sm opacity-80"><Truck className="h-3.5 w-3.5" />{fz.join(", ")}</span>}
                        <span className="mt-1.5 flex -space-x-1.5">
                          {t.mitarbeiter.map((id) => <Avatar key={id} profil={mitarbeiter.find((m) => m.id === id)} className="h-7 w-7 text-[10px] ring-2 ring-card" />)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
