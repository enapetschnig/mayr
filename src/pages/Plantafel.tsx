import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, FolderKanban, Settings2, Truck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Avatar, Gruppentitel } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useIstPc } from "@/components/AppLayout";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { TeamsDialog } from "@/components/plantafel/TeamsDialog";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { faelligkeiten } from "@/lib/fuhrpark";
import { ablegen, amTag, inZeile, konflikte, zuweisen, type Konflikt, type Zeile } from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import { ABWESENHEIT_ART, FAHRZEUG_ART, TEAM_FARBEN, name, type AbwesenheitArt, type Fahrzeug, type FahrzeugArt, type Profil, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WOCHENENDE_KEY = "elektro.plantafel.wochenende";
const montagVon = (iso: string) => tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);
const zeileSchluessel = (z: Zeile) => (z.art === "offen" ? "offen" : `${z.art}:${z.id}`);

/** Was gerade gezogen wird */
type Gezogen =
  | { typ: "termin"; id: string; zeile: Zeile; tag: string }
  | { typ: "projekt"; id: string }
  | { typ: "ressource"; art: "person" | "fahrzeug"; id: string };
const ZIEH_TYP = "application/x-plantafel";

const ziehenStarten = (e: DragEvent, g: Gezogen) => {
  e.dataTransfer.setData(ZIEH_TYP, JSON.stringify(g));
  e.dataTransfer.effectAllowed = "copyMove";
};
const gezogenLesen = (e: DragEvent): Gezogen | null => {
  try { return JSON.parse(e.dataTransfer.getData(ZIEH_TYP)) as Gezogen; } catch { return null; }
};

/**
 * /plantafel — wer fährt mit welchem Bus wohin. Zeilen: Teams, Leute,
 * Fahrzeuge und Geräte; Spalten: Tage. Am PC wird gezogen: Einsatz in eine
 * andere Zelle (Tag und Zeile wechseln), Projekt aus der Liste rechts auf
 * einen Tag (neuer Einsatz), Person oder Steiger auf einen Einsatz
 * (dazuholen). Mit Strg/Alt gezogen wird kopiert. Am Handy: Tagesliste.
 */
export default function Plantafel() {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const heute = isoTag();
  const [bezug, setBezug] = useState(heute);
  const [mitWochenende, setMitWochenende] = useState(() => {
    try { return localStorage.getItem(WOCHENENDE_KEY) === "1"; } catch { return false; }
  });
  const [tagWahl, setTagWahl] = useState(heute);
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string; mitarbeiterId?: string; teamId?: string; fahrzeugId?: string } | null>(null);
  const [teamsOffen, setTeamsOffen] = useState(false);
  const [ziel, setZiel] = useState<string | null>(null);

  const wochenStart = montagVon(bezug);
  const tage = useMemo(() => Array.from({ length: mitWochenende ? 7 : 5 }, (_, i) => tageDazu(wochenStart, i)), [wochenStart, mitWochenende]);
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: projekte = [] } = useProjekte();
  const { data: abwesend = [] } = useKalenderAbwesenheit(von, bis);
  const { data: termine = [] } = useQuery({
    queryKey: ["termine", "plantafel", von, bis],
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*").lte("datum", bis)
        .or(`bis_datum.gte.${von},and(bis_datum.is.null,datum.gte.${von})`)
        .order("datum").order("von", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as Termin[];
    },
  });

  useEffect(() => {
    const kanal = supabase.channel("plantafel")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => void neuLaden("termine"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wochenendeUmschalten = () => {
    setMitWochenende((x) => {
      try { localStorage.setItem(WOCHENENDE_KEY, x ? "0" : "1"); } catch { /* egal */ }
      return !x;
    });
  };

  const liste = konflikte(termine, tage, abwesend);
  const konfliktIds = new Set(liste.flatMap((k) => k.termine));

  const speichern = async (id: string, aenderung: Partial<Termin>, kopie?: Termin) => {
    const { error } = kopie
      ? await supabase.from("termine").insert({
        titel: kopie.titel, projekt_id: kopie.projekt_id, ort: kopie.ort, beschreibung: kopie.beschreibung,
        ganztags: kopie.ganztags, von: kopie.von, bis: kopie.bis, dringend: kopie.dringend,
        datum: kopie.datum, bis_datum: kopie.bis_datum, mitarbeiter: kopie.mitarbeiter, fahrzeuge: kopie.fahrzeuge, team_id: kopie.team_id,
        ...aenderung,
      })
      : await supabase.from("termine").update(aenderung).eq("id", id);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("termine");
  };

  /** Ablegen in einer Zelle (Zeile × Tag) */
  const inZelle = async (e: DragEvent, zeile: Zeile, tag: string) => {
    e.preventDefault();
    setZiel(null);
    if (!istChef) return;
    const g = gezogenLesen(e);
    if (!g) return;
    if (g.typ === "termin") {
      const t = termine.find((x) => x.id === g.id);
      if (!t) return;
      const kopieren = e.ctrlKey || e.altKey || e.metaKey;
      const a = ablegen(t, { zeile: g.zeile, tag: g.tag }, { zeile, tag }, teams);
      await speichern(t.id, a, kopieren ? t : undefined);
      if (kopieren) toast.success("Einsatz kopiert");
    }
  };

  /** Projekt von rechts auf einen Tag: neuer Einsatz, die Zeile übernimmt ihn */
  const projektAblegen = async (projektId: string, zeile: Zeile, tag: string) => {
    const p = projekte.find((x) => x.id === projektId);
    if (!p) return;
    const leer = { id: "", datum: tag, bis_datum: null, ganztags: false, von: "07:00", bis: "15:30", mitarbeiter: [], fahrzeuge: [], team_id: null };
    const a = ablegen(leer, { zeile: { art: "offen" }, tag }, { zeile, tag }, teams);
    const { error } = await supabase.from("termine").insert({
      titel: p.name, projekt_id: p.id, ort: [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      ganztags: false, von: "07:00", bis: "15:30", ...a,
    });
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(`${p.nummer} eingeplant`);
    await neuLaden("termine");
  };

  const zelleAblegen = async (e: DragEvent, zeile: Zeile, tag: string) => {
    const g = gezogenLesen(e);
    if (g?.typ === "projekt") {
      e.preventDefault();
      setZiel(null);
      if (istChef) await projektAblegen(g.id, zeile, tag);
      return;
    }
    await inZelle(e, zeile, tag);
  };

  /** Person oder Fahrzeug auf einen Einsatz */
  const aufEinsatz = async (e: DragEvent, t: Termin) => {
    const g = gezogenLesen(e);
    if (!g || g.typ !== "ressource") return;
    e.preventDefault();
    e.stopPropagation();
    setZiel(null);
    if (!istChef) return;
    const z = zuweisen(t, { art: g.art, id: g.id });
    if (z.mitarbeiter.length === t.mitarbeiter.length && z.fahrzeuge.length === t.fahrzeuge.length) return;
    await speichern(t.id, z);
  };

  const zeilen: { titel: string; icon: ReactNode; liste: { zeile: Zeile; kopf: ReactNode; leer?: boolean }[] }[] = [
    {
      titel: "Teams", icon: <Users className="h-3.5 w-3.5" />,
      liste: teams.map((t) => ({ zeile: { art: "team", id: t.id } as Zeile, kopf: <TeamKopf team={t} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} /> })),
    },
    {
      titel: "Mitarbeiter", icon: <Users className="h-3.5 w-3.5" />,
      liste: mitarbeiter.map((m) => ({
        zeile: { art: "person", id: m.id } as Zeile,
        kopf: <span className="flex min-w-0 items-center gap-2"><Avatar profil={m} className="h-7 w-7 text-[11px]" /><span className="truncate font-medium">{name(m)}</span></span>,
      })),
    },
    {
      titel: "Fahrzeuge & Geräte", icon: <Truck className="h-3.5 w-3.5" />,
      liste: fahrzeuge.map((f) => ({ zeile: { art: "fahrzeug", id: f.id } as Zeile, kopf: <FahrzeugKopf f={f} heute={heute} /> })),
    },
    { titel: "", icon: null, liste: [{ zeile: { art: "offen" }, kopf: <span className="font-medium text-muted-foreground">Nicht eingeteilt</span> }] },
  ];

  const titel = `${datumText(von).slice(0, 6)} – ${datumText(bis)}`;
  const nachTag = (tag: string) => termine.filter((t) => amTag(t, tag));

  return (
    <Seite titel="Plantafel" untertitel={titel} breit
      aktionen={(
        <div className="flex gap-2">
          {istChef && pc && <Button variant="outline" className="h-11 gap-1.5" onClick={() => setTeamsOffen(true)}><Settings2 className="h-4 w-4" /> Teams</Button>}
          <Button className="h-11 gap-1.5" onClick={() => setDialog({ datum: tagWahl })}><CalendarPlus className="h-4 w-4" /> Einsatz</Button>
        </div>
      )}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Vorige Woche" onClick={() => setBezug(tageDazu(bezug, -7))}><ChevronLeft className="h-5 w-5" /></Button>
          <Button variant="outline" className="h-11" onClick={() => { setBezug(heute); setTagWahl(heute); }}>Heute</Button>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Nächste Woche" onClick={() => setBezug(tageDazu(bezug, 7))}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        {pc && (
          <Button variant="outline" className="h-11" aria-pressed={mitWochenende} onClick={wochenendeUmschalten}>
            {mitWochenende ? "Ohne Wochenende" : "Mit Wochenende"}
          </Button>
        )}
        {pc && istChef && <p className="text-xs text-muted-foreground">Ziehen zum Verschieben · mit Strg kopieren · Projekt oder Person von rechts hereinziehen</p>}
      </div>

      {liste.length > 0 && <KonfliktListe liste={liste} termine={termine} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} onTermin={(t) => setDialog({ termin: t })} />}

      {pc ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="w-52 px-3 py-2 text-left font-medium" />
                  {tage.map((t) => (
                    <th key={t} className="px-1 py-1 text-left font-medium">
                      <button type="button" onClick={() => setTagWahl(t)}
                        className={cn("w-full rounded-md px-1.5 py-1 text-left hover:bg-muted", t === heute && "text-primary", t === tagWahl && "bg-primary-soft text-primary")}>
                        {WOCHENTAGE[(isoZuDatum(t).getDay() + 6) % 7]} {datumText(t).slice(0, 6)}
                        {feiertagName(t) && <span className="block truncate font-normal">{feiertagName(t)}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zeilen.map((gruppe) => (
                  <GruppenZeilen key={gruppe.titel || "offen"} titel={gruppe.titel} icon={gruppe.icon} spalten={tage.length}>
                    {gruppe.liste.map(({ zeile, kopf }) => (
                      <tr key={zeileSchluessel(zeile)} className="border-b last:border-b-0">
                        <td className="px-3 py-1.5 align-top">{kopf}</td>
                        {tage.map((tag) => {
                          const schluessel = `${zeileSchluessel(zeile)}|${tag}`;
                          const drin = nachTag(tag).filter((t) => inZeile(t, zeile));
                          const weg = zeile.art === "person" ? abwesend.filter((a) => a.user_id === zeile.id && a.von <= tag && a.bis >= tag) : [];
                          return (
                            <td key={tag}
                              onDragOver={(e) => { if (istChef) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? "copy" : "move"; setZiel(schluessel); } }}
                              onDragLeave={() => setZiel((z) => (z === schluessel ? null : z))}
                              onDrop={(e) => void zelleAblegen(e, zeile, tag)}
                              className={cn("h-16 border-l p-1 align-top", tag === heute && "bg-primary-soft/30", ziel === schluessel && "bg-primary-soft ring-2 ring-inset ring-primary")}>
                              <div className="flex h-full flex-col gap-1">
                                {weg.map((a) => (
                                  <span key={a.id} className="rounded-md bg-muted px-1.5 py-1 text-xs font-medium text-muted-foreground">
                                    {ABWESENHEIT_ART[a.art as AbwesenheitArt]?.text ?? "Abwesend"}
                                  </span>
                                ))}
                                {drin.map((t) => (
                                  <EinsatzKarte key={t.id} t={t} team={teams.find((x) => x.id === t.team_id)} projekte={projekte} fahrzeuge={fahrzeuge}
                                    konflikt={konfliktIds.has(t.id)} ziehbar={istChef}
                                    onZiehen={(e) => ziehenStarten(e, { typ: "termin", id: t.id, zeile, tag })}
                                    onAblegen={(e) => void aufEinsatz(e, t)}
                                    onOeffnen={() => setDialog({ termin: t })} />
                                ))}
                                <button type="button" aria-label={`Einsatz am ${datumText(tag)} anlegen`}
                                  onClick={() => setDialog({
                                    datum: tag,
                                    mitarbeiterId: zeile.art === "person" ? zeile.id : undefined,
                                    teamId: zeile.art === "team" ? zeile.id : undefined,
                                    fahrzeugId: zeile.art === "fahrzeug" ? zeile.id : undefined,
                                  })}
                                  className="min-h-4 flex-1 rounded-md text-xs text-transparent transition-colors hover:bg-muted hover:text-muted-foreground">+</button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </GruppenZeilen>
                ))}
              </tbody>
            </table>
          </div>

          <Seitenleiste tag={tagWahl} termine={nachTag(tagWahl)} abwesend={abwesend} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge}
            projekte={projekte.filter((p) => p.status === "aktiv" || p.status === "angebot")} ziehbar={istChef} />
        </div>
      ) : (
        <HandyListe tage={tage} heute={heute} termine={termine} teams={teams} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} projekte={projekte}
          konfliktIds={konfliktIds} onTermin={(t) => setDialog({ termin: t })} onNeu={(datum) => setDialog({ datum })} />
      )}

      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} termin={dialog?.termin} datum={dialog?.datum}
        mitarbeiterId={dialog?.mitarbeiterId} teamId={dialog?.teamId} fahrzeugId={dialog?.fahrzeugId} />
      <TeamsDialog open={teamsOffen} onOpenChange={setTeamsOffen} />
    </Seite>
  );
}

function GruppenZeilen({ titel, icon, spalten, children }: { titel: string; icon: ReactNode; spalten: number; children: ReactNode }) {
  return (
    <>
      {titel && (
        <tr className="border-b bg-muted/25">
          <td colSpan={spalten + 1} className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <span className="flex items-center gap-1.5">{icon}{titel}</span>
          </td>
        </tr>
      )}
      {children}
    </>
  );
}

function TeamKopf({ team, mitarbeiter, fahrzeuge }: { team: Team; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[] }) {
  const bus = fahrzeuge.find((f) => f.id === team.fahrzeug_id);
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-2 font-semibold">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TEAM_FARBEN[team.farbe]?.punkt ?? "bg-slate-500")} />
        <span className="truncate">{team.name}</span>
      </span>
      <span className="mt-1 flex items-center gap-1">
        <span className="flex -space-x-1.5">
          {team.mitglieder.map((id) => <Avatar key={id} profil={mitarbeiter.find((m) => m.id === id)} className="h-6 w-6 text-[10px] ring-2 ring-card" />)}
        </span>
        {bus && <span className="truncate text-xs text-muted-foreground">· {bus.name}</span>}
      </span>
    </span>
  );
}

function FahrzeugKopf({ f, heute }: { f: Fahrzeug; heute: string }) {
  const faellig = faelligkeiten(f, heute);
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5 font-medium">
        <span className="truncate">{f.name}</span>
        {faellig.some((x) => x.ueberfaellig) && <span title={faellig.map((x) => x.was).join(", ") + " überfällig"}><AlertTriangle className="h-3.5 w-3.5 text-status-rot-fg" /></span>}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{[FAHRZEUG_ART[f.art as FahrzeugArt]?.text, f.kennzeichen, f.gemietet && "gemietet"].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

function EinsatzKarte({
  t, team, projekte, fahrzeuge, konflikt, ziehbar, onZiehen, onAblegen, onOeffnen,
}: {
  t: Termin;
  team?: Team;
  projekte: { id: string; nummer: string }[];
  fahrzeuge: Fahrzeug[];
  konflikt: boolean;
  ziehbar: boolean;
  onZiehen: (e: DragEvent) => void;
  onAblegen: (e: DragEvent) => void;
  onOeffnen: () => void;
}) {
  const p = projekte.find((x) => x.id === t.projekt_id);
  const fz = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean);
  const farbe = team ? TEAM_FARBEN[team.farbe]?.klasse : "border-primary/25 bg-primary-soft text-primary";
  return (
    <button type="button" draggable={ziehbar} onDragStart={onZiehen} onDragOver={(e) => e.preventDefault()} onDrop={onAblegen} onClick={onOeffnen}
      title={[t.titel, zeitText(t), fz.join(", ")].filter(Boolean).join(" · ")}
      className={cn("rounded-md border px-1.5 py-1 text-left text-xs leading-tight hover:brightness-95", farbe,
        ziehbar && "cursor-grab active:cursor-grabbing", konflikt && "ring-2 ring-status-rot-fg", t.status === "erledigt" && "opacity-60")}>
      <span className="block truncate font-semibold">{konflikt ? "⚠ " : ""}{t.dringend && t.status !== "erledigt" ? "! " : ""}{t.status === "erledigt" ? "✓ " : ""}{t.titel}</span>
      <span className="block truncate opacity-80">{zeitText(t)}{p ? ` · ${p.nummer}` : ""}</span>
      {(fz.length > 0 || t.mitarbeiter.length > 0) && (
        <span className="flex items-center gap-1 truncate opacity-80">
          <Users className="h-3 w-3 shrink-0" />{t.mitarbeiter.length}
          {fz.length > 0 && <><Truck className="ml-1 h-3 w-3 shrink-0" /><span className="truncate">{fz.join(", ")}</span></>}
        </span>
      )}
    </button>
  );
}

function KonfliktListe({
  liste, termine, mitarbeiter, fahrzeuge, onTermin,
}: { liste: Konflikt[]; termine: Termin[]; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; onTermin: (t: Termin) => void }) {
  const text = (k: Konflikt) => {
    const wer = k.art === "fahrzeug_doppelt" ? fahrzeuge.find((f) => f.id === k.ressource)?.name ?? "Fahrzeug" : name(mitarbeiter.find((m) => m.id === k.ressource));
    const tag = `${WOCHENTAGE[(isoZuDatum(k.tag).getDay() + 6) % 7]} ${datumText(k.tag).slice(0, 6)}`;
    return k.art === "person_abwesend" ? `${wer} ist am ${tag} abwesend, aber eingeteilt` : `${wer} ist am ${tag} doppelt eingeteilt`;
  };
  return (
    <section className="rounded-lg border border-status-rot-fg/40 bg-status-rot/30 p-3" role="status">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> {liste.length === 1 ? "1 Konflikt" : `${liste.length} Konflikte`}</p>
      <ul className="space-y-0.5 text-sm">
        {liste.slice(0, 8).map((k) => (
          <li key={`${k.art}${k.tag}${k.ressource}`} className="flex flex-wrap items-center gap-x-2">
            <span>{text(k)}:</span>
            {k.termine.map((id) => {
              const t = termine.find((x) => x.id === id);
              return t && <button key={id} type="button" className="min-h-8 font-medium text-primary underline-offset-2 hover:underline" onClick={() => onTermin(t)}>{t.titel}</button>;
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rechts neben der Tafel: Projekte zum Einplanen, wer und was am gewählten Tag frei ist */
function Seitenleiste({
  tag, termine, abwesend, mitarbeiter, fahrzeuge, projekte, ziehbar,
}: {
  tag: string;
  termine: Termin[];
  abwesend: { user_id: string; von: string; bis: string }[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: { id: string; nummer: string; name: string }[];
  ziehbar: boolean;
}) {
  const [suche, setSuche] = useState("");
  const belegt = new Set(termine.flatMap((t) => [...t.mitarbeiter, ...t.fahrzeuge]));
  const weg = new Set(abwesend.filter((a) => a.von <= tag && a.bis >= tag).map((a) => a.user_id));
  const freiLeute = mitarbeiter.filter((m) => !belegt.has(m.id) && !weg.has(m.id));
  const freiFz = fahrzeuge.filter((f) => !belegt.has(f.id));
  const q = suche.trim().toLowerCase();
  const pListe = projekte.filter((p) => !q || `${p.nummer} ${p.name}`.toLowerCase().includes(q)).slice(0, 30);
  const chip = "flex min-h-9 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium";
  return (
    <aside className="space-y-4">
      <section className="rounded-lg border bg-card p-3">
        <Gruppentitel className="pb-1.5">Frei am {datumText(tag).slice(0, 6)}</Gruppentitel>
        <div className="flex flex-wrap gap-1.5">
          {freiLeute.map((m) => (
            <span key={m.id} draggable={ziehbar} onDragStart={(e) => ziehenStarten(e, { typ: "ressource", art: "person", id: m.id })}
              className={cn(chip, ziehbar && "cursor-grab")}><Avatar profil={m} className="h-6 w-6 text-[10px]" />{m.vorname || m.nachname}</span>
          ))}
          {freiFz.map((f) => (
            <span key={f.id} draggable={ziehbar} onDragStart={(e) => ziehenStarten(e, { typ: "ressource", art: "fahrzeug", id: f.id })}
              className={cn(chip, "px-3", ziehbar && "cursor-grab")}><Truck className="h-3.5 w-3.5 text-muted-foreground" />{f.name}</span>
          ))}
          {!freiLeute.length && !freiFz.length && <p className="text-xs text-muted-foreground">Alle eingeteilt.</p>}
        </div>
        {ziehbar && <p className="mt-2 text-xs text-muted-foreground">Auf einen Einsatz ziehen, um dazuzuholen.</p>}
      </section>
      <section className="rounded-lg border bg-card p-3">
        <Gruppentitel className="pb-1.5">Projekte einplanen</Gruppentitel>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen …" aria-label="Projekt suchen"
          className="mb-2 h-9 w-full rounded-md border bg-background px-2.5 text-sm" />
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
          {pListe.map((p) => (
            <li key={p.id} draggable={ziehbar} onDragStart={(e) => ziehenStarten(e, { typ: "projekt", id: p.id })}
              className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs", ziehbar && "cursor-grab hover:border-primary/50")}>
              <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><span className="block font-semibold">{p.nummer}</span><span className="block truncate">{p.name}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
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
