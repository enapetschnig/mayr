import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Settings2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Seite } from "@/components/PageHeader";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useIstPc } from "@/components/AppLayout";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { TeamsDialog } from "@/components/plantafel/TeamsDialog";
import { Gantt } from "@/components/plantafel/Gantt";
import { Monat } from "@/components/plantafel/Monat";
import { FilterWahl, gefiltert, MiniKalender, Terminplaner, TerminplanerHandy, useGruppen, type HandyModus, type PlanNeu } from "@/components/plantafel/Terminplaner";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { kalenderwoche } from "@/lib/terminplaner";
import { amTag, ANSICHTEN, konflikte, projektFarbe, type Ansicht, type Konflikt, type Zeile } from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import { ABWESENHEIT_ART, name, type AbwesenheitArt, type Fahrzeug, type Profil, type Projekt, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ANSICHT_KEY = "elektro.plantafel.ansicht";
/** Tafel (Zeilen = Teams/Leute, Spalten = Tage) oder Terminplaner (Spalten = Leute, Zeilen = Tage mit Stunden) */
const SICHT_KEY = "elektro.plantafel.sicht";
const HANDY_KEY = "elektro.plantafel.handy";
type Sicht = "tafel" | "leute";
const lesen = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const merken = (k: string, w: string) => { try { localStorage.setItem(k, w); } catch { /* egal */ } };
const montagVon = (iso: string) => tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);

/** Am PC: die Gantt-Zeiträume plus das Kalenderblatt */
type PcAnsicht = Ansicht | "kalender";

/** Tage des Kalenderblatts: Montag vor dem Ersten bis Sonntag nach dem Letzten */
function monatsTage(bezug: string): string[] {
  const d = isoZuDatum(bezug);
  const erster = isoTag(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const letzter = isoTag(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  const liste: string[] = [];
  for (let t = montagVon(erster); t <= tageDazu(montagVon(letzter), 6); t = tageDazu(t, 1)) liste.push(t);
  return liste;
}

/**
 * /plantafel — wer fährt wann mit wem wohin. Plantafel und Kalender sind eins:
 * beide zeigen dieselben Einsätze (Tabelle `termine`).
 * - PC: Gantt über die ganze Breite und Höhe (components/plantafel/Gantt.tsx),
 *   Woche bis 3 Monate, dazu „Kalender“ als Monatsblatt
 * - Handy: Tagesliste der Woche, Alle oder nur meine, mit Abwesenheiten
 */
export default function Plantafel() {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const { istChef, profil } = useSitzung();
  const heute = isoTag();
  const [bezug, setBezug] = useState(heute);
  const [ansicht, setAnsichtState] = useState<PcAnsicht>(() => {
    try { const w = localStorage.getItem(ANSICHT_KEY); return w === "kalender" || ANSICHTEN.some((x) => x.wert === w) ? (w as PcAnsicht) : "2wochen"; } catch { return "2wochen"; }
  });
  const setAnsicht = (a: PcAnsicht) => { setAnsichtState(a); try { localStorage.setItem(ANSICHT_KEY, a); } catch { /* egal */ } };
  const [nurMeine, setNurMeine] = useState(!istChef);
  const [sicht, setSichtState] = useState<Sicht>(() => (lesen(SICHT_KEY) === "leute" ? "leute" : "tafel"));
  const setSicht = (s: Sicht) => { setSichtState(s); merken(SICHT_KEY, s); };
  const [handyModus, setHandyModusState] = useState<HandyModus>(() => (lesen(HANDY_KEY) === "person" ? "person" : "tag"));
  const setHandyModus = (m: HandyModus) => { setHandyModusState(m); merken(HANDY_KEY, m); };
  const [filter, setFilter] = useState("");
  const [tagIndex, setTagIndex] = useState(() => Math.min(6, (isoZuDatum(heute).getDay() + 6) % 7));
  const [person, setPerson] = useState(profil?.id ?? "");
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string; bisDatum?: string; mitarbeiterId?: string; teamId?: string; fahrzeugId?: string; von?: string; bis?: string } | null>(null);
  const [teamsOffen, setTeamsOffen] = useState(false);

  const leute = sicht === "leute";
  const kalender = pc && ansicht === "kalender" && !leute;
  // Am Handy immer eine Woche als Liste
  const a = ANSICHTEN.find((x) => x.wert === (pc && ansicht !== "kalender" && !leute ? ansicht : "woche"))!;
  const start = a.wert === "3monate" ? tageDazu(montagVon(bezug), -7) : montagVon(bezug);
  const tage = useMemo(
    () => (kalender ? monatsTage(bezug) : Array.from({ length: pc ? a.tage : 7 }, (_, i) => tageDazu(start, i))),
    [kalender, bezug, start, a.tage, pc],
  );
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: projekte = [] } = useProjekte();
  const { data: abwesend = [] } = useKalenderAbwesenheit(von, bis);
  const gruppen = useGruppen(mitarbeiter, teams);
  const sichtbar = gefiltert(gruppen, filter);
  useEffect(() => { if (!person && profil?.id) setPerson(profil.id); }, [person, profil?.id]);
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
  // Für „Noch nicht eingeplant“: Projekte mit einem Einsatz ab heute
  const { data: eingeplant = new Set<string>() } = useQuery({
    queryKey: ["termine", "eingeplant", heute],
    enabled: pc && istChef,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("projekt_id").not("projekt_id", "is", null)
        .or(`datum.gte.${heute},bis_datum.gte.${heute}`);
      if (error) throw error;
      return new Set((data ?? []).map((x) => x.projekt_id as string));
    },
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
  const meine = nurMeine && profil ? termine.filter((t) => t.mitarbeiter.includes(profil.id)) : termine;

  const blaettern = (r: number) => {
    if (kalender) {
      const d = isoZuDatum(bezug);
      setBezug(isoTag(new Date(d.getFullYear(), d.getMonth() + r, 1, 12)));
    } else setBezug(tageDazu(bezug, r * (pc ? a.schritt : 7)));
  };
  const titel = kalender
    ? isoZuDatum(bezug).toLocaleDateString("de-AT", { month: "long", year: "numeric" })
    : `${leute ? `KW ${kalenderwoche(von)} · ` : ""}${datumText(von).slice(0, 6)} – ${datumText(bis)}`;

  const neuAus = (v: { datum: string; bisDatum?: string; zeile: Zeile }) => setDialog({
    datum: v.datum, bisDatum: v.bisDatum,
    mitarbeiterId: v.zeile.art === "person" ? v.zeile.id : undefined,
    teamId: v.zeile.art === "team" ? v.zeile.id : undefined,
    fahrzeugId: v.zeile.art === "fahrzeug" ? v.zeile.id : undefined,
  });
  const neuAusPlan = (v: PlanNeu) => setDialog({ datum: v.datum, von: v.von, bis: v.bis, mitarbeiterId: v.mitarbeiterId });
  const planDaten = {
    tage, termine, termineKey, teams, mitarbeiter, fahrzeuge, projekte, abwesend, konfliktIds, darf: istChef, heute,
    onBearbeiten: (t: Termin) => setDialog({ termin: t }), onNeu: neuAusPlan,
  };
  const neuerEinsatz = () => setDialog({ datum: tage.includes(heute) ? heute : kalender ? bezug : von });

  const dialoge = (
    <>
      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} termin={dialog?.termin} datum={dialog?.datum} bisDatum={dialog?.bisDatum}
        mitarbeiterId={dialog?.mitarbeiterId} teamId={dialog?.teamId} fahrzeugId={dialog?.fahrzeugId} von={dialog?.von} bis={dialog?.bis} />
      <TeamsDialog open={teamsOffen} onOpenChange={setTeamsOffen} />
    </>
  );

  const blaetterKnoepfe = (hoch: string) => (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className={cn(hoch, "w-auto aspect-square")} aria-label="Zurück blättern" onClick={() => blaettern(-1)}><ChevronLeft className="h-5 w-5" /></Button>
      <Button variant="outline" className={hoch} onClick={() => setBezug(heute)}>Heute</Button>
      <Button variant="outline" size="icon" className={cn(hoch, "w-auto aspect-square")} aria-label="Weiter blättern" onClick={() => blaettern(1)}><ChevronRight className="h-5 w-5" /></Button>
    </div>
  );

  if (!pc) {
    return (
      <Seite titel="Plantafel" untertitel={titel}
        aktionen={istChef ? <Button className="h-11 gap-1.5" onClick={neuerEinsatz}><CalendarPlus className="h-4 w-4" /> Einsatz</Button> : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {blaetterKnoepfe("h-11")}
          <Segment werte={[["tafel", "Liste"], ["leute", "Leute"]]} wert={sicht} onChange={(w) => setSicht(w as Sicht)} />
          {leute
            ? <Segment werte={[["tag", "Tag"], ["person", "Person"]]} wert={handyModus} onChange={(w) => setHandyModus(w as HandyModus)} />
            : <Segment werte={[["alle", "Alle"], ["meine", "Meine"]]} wert={nurMeine ? "meine" : "alle"} onChange={(w) => setNurMeine(w === "meine")} />}
          {leute && handyModus === "tag" && <FilterWahl gruppen={gruppen} wert={filter} onChange={setFilter} alleText="Alle" className="h-11 min-w-0 flex-1 text-base" />}
        </div>
        {liste.length > 0 && istChef && <KonfliktListe liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}
        {leute ? (
          <TerminplanerHandy {...planDaten} gruppen={handyModus === "tag" ? sichtbar : gruppen} modus={handyModus} tagIndex={tagIndex} onTagIndex={setTagIndex}
            person={person} onPerson={(id) => { setPerson(id); setHandyModus("person"); }} onBlaettern={blaettern} />
        ) : <HandyListe tage={tage} heute={heute} termine={meine} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} projekte={projekte}
          abwesend={nurMeine && profil ? abwesend.filter((x) => x.user_id === profil.id) : abwesend} darf={istChef}
          konfliktIds={konfliktIds} onTermin={(t) => setDialog({ termin: t })} onNeu={(datum) => setDialog({ datum })} />}
        {dialoge}
      </Seite>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="Plantafel" untertitel={titel} voll
        aktionen={istChef ? (
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => setTeamsOffen(true)}><Settings2 className="h-4 w-4" /> Teams</Button>
            <Button className="h-10 gap-1.5" onClick={neuerEinsatz}><CalendarPlus className="h-4 w-4" /> Einsatz</Button>
          </>
        ) : undefined} />
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
        {blaetterKnoepfe("h-9")}
        <div className="flex rounded-md border bg-card p-0.5" role="group" aria-label="Ansicht">
          {([["tafel", "Tafel"], ["leute", "Mitarbeiter"]] as [Sicht, string][]).map(([w, t]) => (
            <button key={w} type="button" aria-pressed={sicht === w} onClick={() => setSicht(w)}
              title={w === "leute" ? "Spalten = Mitarbeiter, Zeilen = Tage mit Uhrzeit" : "Zeilen = Teams und Leute, Spalten = Tage"}
              className={cn("h-8 rounded px-3 text-sm font-medium", sicht === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{t}</button>
          ))}
        </div>
        {leute && <FilterWahl gruppen={gruppen} wert={filter} onChange={setFilter} className="h-9" />}
        {!leute && <div className="flex rounded-md border bg-card p-0.5" role="group" aria-label="Zeitraum">
          {[...ANSICHTEN.map((x) => ({ wert: x.wert as PcAnsicht, text: x.text })), { wert: "kalender" as PcAnsicht, text: "Kalender" }].map((x) => (
            <button key={x.wert} type="button" aria-pressed={ansicht === x.wert} onClick={() => setAnsicht(x.wert)}
              className={cn("h-8 rounded px-3 text-sm font-medium", ansicht === x.wert ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                x.wert === "kalender" && "ml-1 border-l pl-3")}>
              {x.text}
            </button>
          ))}
        </div>}
        {kalender && <Segment klein werte={[["alle", "Alle"], ["meine", "Meine"]]} wert={nurMeine ? "meine" : "alle"} onChange={(w) => setNurMeine(w === "meine")} />}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">Gehe zu
          <input type="date" className="h-9 rounded-md border bg-card px-2 text-base text-foreground [@media(pointer:fine)]:text-sm" onChange={(e) => e.target.value && setBezug(e.target.value)} />
        </label>
        {liste.length > 0 && <KonfliktKnopf liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}
      </div>

      {leute ? (
        <Terminplaner className="flex-1" {...planDaten} gruppen={sichtbar}
          seite={<MiniKalender bezug={bezug} woche={tage} heute={heute} onTag={setBezug} />} />
      ) : kalender ? (
        <Monat tage={tage} bezug={bezug} heute={heute} termine={meine} mitarbeiter={mitarbeiter} projekte={projekte} darf={istChef}
          onTag={setBezug} onNeu={(datum) => setDialog({ datum })} onTermin={(t) => setDialog({ termin: t })} />
      ) : (
        <Gantt className="flex-1" start={start} ansicht={a.wert} termine={termine} termineKey={termineKey} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge}
          projekte={projekte} eingeplant={eingeplant} abwesend={abwesend} konfliktIds={konfliktIds} darf={istChef} heute={heute}
          onBearbeiten={(t) => setDialog({ termin: t })} onNeu={neuAus} />
      )}
      {dialoge}
    </div>
  );
}

function Segment({ werte, wert, onChange, klein }: { werte: [string, string][]; wert: string; onChange: (w: string) => void; klein?: boolean }) {
  return (
    <div className={cn("flex overflow-hidden rounded-md border bg-card", klein ? "h-9" : "h-11")}>
      {werte.map(([w, t], i) => (
        <button key={w} type="button" onClick={() => onChange(w)} aria-pressed={wert === w}
          className={cn("px-3.5 text-sm font-medium transition-colors", i > 0 && "border-l", wert === w ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {t}
        </button>
      ))}
    </div>
  );
}

const konfliktText = (k: Konflikt, mitarbeiter: Profil[], fahrzeuge: Fahrzeug[]) => {
  const wer = k.art === "fahrzeug_doppelt" ? fahrzeuge.find((f) => f.id === k.ressource)?.name ?? "Fahrzeug" : name(mitarbeiter.find((m) => m.id === k.ressource));
  const tag = `${WOCHENTAGE[(isoZuDatum(k.tag).getDay() + 6) % 7]} ${datumText(k.tag).slice(0, 6)}`;
  return k.art === "person_abwesend" ? `${wer} ist am ${tag} abwesend, aber eingeteilt` : `${wer} ist am ${tag} doppelt eingeteilt`;
};

function KonfliktZeilen({ liste, termine, mitarbeiter, fahrzeuge, onTermin }: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {liste.map((k) => (
        <li key={`${k.art}${k.tag}${k.ressource}`} className="flex flex-wrap items-center gap-x-2">
          <span>{konfliktText(k, mitarbeiter, fahrzeuge)}:</span>
          {k.termine.map((id) => {
            const t = termine.find((x) => x.id === id);
            return t && <button key={id} type="button" className="min-h-8 font-medium text-primary underline-offset-2 hover:underline" onClick={() => onTermin(t)}>{t.titel}</button>;
          })}
        </li>
      ))}
    </ul>
  );
}

/** PC: kleiner roter Knopf in der Leiste, die Liste klappt darunter auf */
function KonfliktKnopf(p: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="relative ml-auto">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen}
        className="flex h-9 items-center gap-1.5 rounded-md border border-status-rot-fg/40 bg-status-rot px-3 text-sm font-semibold text-status-rot-fg">
        <AlertTriangle className="h-4 w-4" />{p.liste.length === 1 ? "1 Konflikt" : `${p.liste.length} Konflikte`}
      </button>
      {offen && (
        <div className="absolute right-0 top-11 z-50 max-h-96 w-[28rem] overflow-auto rounded-lg border-2 border-status-rot-fg/40 bg-card p-3 shadow-xl">
          <KonfliktZeilen {...p} onTermin={(t) => { setOffen(false); p.onTermin(t); }} />
        </div>
      )}
    </div>
  );
}

function KonfliktListe(p: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const [offen, setOffen] = useState(false);
  return (
    <section className="rounded-lg border border-status-rot-fg/40 bg-status-rot/30 px-3 py-1.5" role="status">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} className="flex min-h-9 w-full items-center gap-1.5 text-left text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-semibold">{p.liste.length === 1 ? "1 Konflikt" : `${p.liste.length} Konflikte`}</span>
        {!offen && <span className="truncate text-muted-foreground">· {konfliktText(p.liste[0], p.mitarbeiter, p.fahrzeuge)}{p.liste.length > 1 ? " …" : ""}</span>}
        <span className="ml-auto shrink-0 text-xs font-medium text-primary">{offen ? "zuklappen" : "zeigen"}</span>
      </button>
      {offen && <div className="pb-1.5"><KonfliktZeilen {...p} /></div>}
    </section>
  );
}

/** Handy: je Tag die Einsätze, Farbe = Projekt; leeres Wochenende fällt weg */
function HandyListe({
  tage, heute, termine, teams, mitarbeiter, fahrzeuge, projekte, abwesend, darf, konfliktIds, onTermin, onNeu,
}: {
  tage: string[];
  heute: string;
  termine: Termin[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: Projekt[];
  abwesend: { id: string | null; user_id: string | null; von: string | null; bis: string | null; art: string | null }[];
  darf: boolean;
  konfliktIds: Set<string>;
  onTermin: (t: Termin) => void;
  onNeu: (tag: string) => void;
}) {
  return (
    <div className="space-y-4">
      {tage.map((tag, i) => {
        const liste = termine.filter((t) => amTag(t, tag));
        const weg = abwesend.filter((x) => x.von && x.bis && x.von <= tag && x.bis >= tag);
        if (i >= 5 && !liste.length && tag !== heute) return null;
        return (
          <section key={tag}>
            <div className="flex items-center justify-between px-1 pb-1.5">
              <h3 className={cn("text-sm font-semibold", tag === heute && "text-primary")}>
                {tag === heute ? "Heute, " : `${WOCHENTAGE[(isoZuDatum(tag).getDay() + 6) % 7]}, `}{datumText(tag).slice(0, 6)}
                {feiertagName(tag) && <span className="font-normal text-muted-foreground"> · {feiertagName(tag)}</span>}
              </h3>
              {darf && <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-sm font-medium text-primary" onClick={() => onNeu(tag)}>+ Einsatz</button>}
            </div>
            {weg.map((x) => (
              <p key={`${x.id}${tag}`} className="mb-1.5 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                <Avatar profil={mitarbeiter.find((m) => m.id === x.user_id)} className="h-6 w-6 text-[10px]" />
                {name(mitarbeiter.find((m) => m.id === x.user_id))} · {ABWESENHEIT_ART[x.art as AbwesenheitArt]?.text ?? "Abwesend"}
              </p>
            ))}
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
                      <button type="button" onClick={() => onTermin(t)} style={{ borderLeft: `6px solid ${projektFarbe(p)}` }}
                        className={cn("w-full rounded-lg border bg-card p-3 text-left", konfliktIds.has(t.id) && "ring-2 ring-status-rot-fg")}>
                        <span className="block font-semibold">{konfliktIds.has(t.id) ? "⚠ " : ""}{t.status === "erledigt" ? "✓ " : ""}{t.titel}</span>
                        <span className="block text-sm text-muted-foreground">{zeitText(t)}{p ? ` · ${p.nummer}` : ""}{team ? ` · Team ${team.name}` : ""}</span>
                        {t.ort && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{t.ort}</span>}
                        {fz.length > 0 && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Truck className="h-3.5 w-3.5" />{fz.join(", ")}</span>}
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
