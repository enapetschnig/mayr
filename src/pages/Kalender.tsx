import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Avatar, Leer } from "@/components/Bausteine";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { useIstPc } from "@/components/AppLayout";
import { useMitarbeiter, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import type { Profil, Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

type Ansicht = "woche" | "monat";
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ANSICHT_KEY = "elektro.kalender.ansicht";

/** Läuft der Termin an diesem Tag? (mehrtägige eingeschlossen) */
const amTag = (t: Termin, tag: string) => t.datum <= tag && (t.bis_datum ?? t.datum) >= tag;
const montagVon = (iso: string) => tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
const zeitText = (t: Termin) => (t.ganztags ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);

/**
 * Kalender mit Einteilung: Woche als Plantafel (wer ist wo), am Handy als
 * Tagesliste; Monat als Raster. Termine kommen live herein.
 */
export default function Kalender() {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const { profil } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const heute = isoTag();
  const [ansicht, setAnsicht] = useState<Ansicht>(() => {
    try { return (localStorage.getItem(ANSICHT_KEY) as Ansicht) || "woche"; } catch { return "woche"; }
  });
  const [bezug, setBezug] = useState(heute);
  const [nurMeine, setNurMeine] = useState(false);
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string; mitarbeiterId?: string } | null>(null);

  const ansichtSetzen = (a: Ansicht) => {
    setAnsicht(a);
    try { localStorage.setItem(ANSICHT_KEY, a); } catch { /* egal */ }
  };

  const tage = useMemo(() => {
    if (ansicht === "woche") return Array.from({ length: 7 }, (_, i) => tageDazu(montagVon(bezug), i));
    const d = isoZuDatum(bezug);
    const erster = isoTag(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    const letzter = isoTag(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    const start = montagVon(erster);
    const ende = tageDazu(montagVon(letzter), 6);
    const liste: string[] = [];
    for (let t = start; t <= ende; t = tageDazu(t, 1)) liste.push(t);
    return liste;
  }, [ansicht, bezug]);
  const von = tage[0];
  const bis = tage[tage.length - 1];

  const { data: termine = [] } = useQuery({
    queryKey: ["termine", "kalender", von, bis],
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*")
        .lte("datum", bis)
        .or(`bis_datum.gte.${von},and(bis_datum.is.null,datum.gte.${von})`)
        .order("datum").order("von", { nullsFirst: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const kanal = supabase.channel("kalender")
      .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, () => void neuLaden("termine"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sichtbar = nurMeine && profil ? termine.filter((t) => t.mitarbeiter.includes(profil.id)) : termine;
  const blaettern = (r: number) => {
    if (ansicht === "woche") return setBezug(tageDazu(bezug, r * 7));
    const d = isoZuDatum(bezug);
    setBezug(isoTag(new Date(d.getFullYear(), d.getMonth() + r, 1, 12)));
  };
  const titel = ansicht === "woche"
    ? `${datumText(von).slice(0, 6)} – ${datumText(tage[6])}`
    : isoZuDatum(bezug).toLocaleDateString("de-AT", { month: "long", year: "numeric" });

  return (
    <Seite titel="Kalender" untertitel={titel} breit
      aktionen={<Button onClick={() => setDialog({ datum: ansicht === "woche" && heute >= von && heute <= bis ? heute : bezug })} className="gap-1.5"><CalendarPlus className="h-4 w-4" /> Termin</Button>}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => blaettern(-1)} aria-label={ansicht === "woche" ? "Vorige Woche" : "Voriger Monat"}><ChevronLeft className="h-5 w-5" /></Button>
          <Button variant="outline" className="h-11" onClick={() => setBezug(heute)}>Heute</Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => blaettern(1)} aria-label={ansicht === "woche" ? "Nächste Woche" : "Nächster Monat"}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <Segment werte={[["woche", "Woche"], ["monat", "Monat"]]} wert={ansicht} onChange={(a) => ansichtSetzen(a as Ansicht)} />
        <Segment werte={[["alle", "Alle"], ["meine", "Meine"]]} wert={nurMeine ? "meine" : "alle"} onChange={(w) => setNurMeine(w === "meine")} />
      </div>

      {ansicht === "woche" && pc && (
        <Plantafel tage={tage} termine={sichtbar} mitarbeiter={nurMeine ? mitarbeiter.filter((m) => m.id === profil?.id) : mitarbeiter}
          heute={heute} onTermin={(t) => setDialog({ termin: t })} onLeer={(datum, mitarbeiterId) => setDialog({ datum, mitarbeiterId })} />
      )}

      {ansicht === "woche" && !pc && (
        <div className="space-y-4">
          {tage.map((tag, i) => {
            const liste = sichtbar.filter((t) => amTag(t, tag));
            // Leeres Wochenende ausblenden — außer es ist heute
            if (i >= 5 && liste.length === 0 && tag !== heute) return null;
            return (
              <section key={tag}>
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <h3 className={cn("text-sm font-semibold", tag === heute && "text-primary")}>
                    {tag === heute ? "Heute, " : `${WOCHENTAGE[i]}, `}{datumText(tag).slice(0, 6)}
                  </h3>
                  <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-sm font-medium text-primary" onClick={() => setDialog({ datum: tag })}>+ Termin</button>
                </div>
                {liste.length === 0
                  ? <p className="rounded-lg border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">Nichts eingeteilt</p>
                  : <TerminListe termine={liste} mitarbeiter={mitarbeiter} onWahl={(t) => setDialog({ termin: t })} />}
              </section>
            );
          })}
        </div>
      )}

      {ansicht === "monat" && (
        <Monat tage={tage} bezug={bezug} heute={heute} termine={sichtbar} mitarbeiter={mitarbeiter}
          onTag={setBezug} onNeu={(datum) => setDialog({ datum })} onTermin={(t) => setDialog({ termin: t })} />
      )}

      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}
        termin={dialog?.termin} datum={dialog?.datum} mitarbeiterId={dialog?.mitarbeiterId} />
    </Seite>
  );
}

function Segment({ werte, wert, onChange }: { werte: [string, string][]; wert: string; onChange: (w: string) => void }) {
  return (
    <div className="flex h-11 overflow-hidden rounded-md border bg-card">
      {werte.map(([w, t], i) => (
        <button key={w} type="button" onClick={() => onChange(w)} aria-pressed={wert === w}
          className={cn("px-3.5 text-sm font-medium transition-colors", i > 0 && "border-l",
            wert === w ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Woche am PC: Zeilen = Mitarbeiter, Spalten = Tage. Leeres Feld antippen = Termin für diese Person. */
function Plantafel({
  tage, termine, mitarbeiter, heute, onTermin, onLeer,
}: {
  tage: string[];
  termine: Termin[];
  mitarbeiter: Profil[];
  heute: string;
  onTermin: (t: Termin) => void;
  onLeer: (datum: string, mitarbeiterId?: string) => void;
}) {
  const { data: projekte = [] } = useProjekte();
  const ohne = termine.filter((t) => t.mitarbeiter.length === 0);
  const zeilen: { id?: string; profil?: Profil; titel: string }[] = [
    ...mitarbeiter.map((m) => ({ id: m.id, profil: m, titel: `${m.vorname} ${m.nachname}`.trim() })),
    ...(ohne.length ? [{ titel: "Nicht eingeteilt" }] : []),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="w-44 px-3 py-2 text-left font-medium">Mitarbeiter</th>
            {tage.map((t, i) => (
              <th key={t} className={cn("px-2 py-2 text-left font-medium", t === heute && "text-primary", i >= 5 && "w-28")}>
                {WOCHENTAGE[i]} {datumText(t).slice(0, 6)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id ?? "ohne"} className="border-b last:border-b-0">
              <td className="px-3 py-2 align-top">
                <span className="flex items-center gap-2 font-medium">
                  {z.profil && <Avatar profil={z.profil} className="h-7 w-7 text-[11px]" />}
                  <span className="truncate">{z.titel}</span>
                </span>
              </td>
              {tage.map((tag) => {
                const liste = termine.filter((t) => amTag(t, tag) && (z.id ? t.mitarbeiter.includes(z.id) : t.mitarbeiter.length === 0));
                return (
                  <td key={tag} className={cn("h-20 border-l p-1 align-top", tag === heute && "bg-primary-soft/40")}>
                    <div className="flex h-full flex-col gap-1">
                      {liste.map((t) => {
                        const p = projekte.find((x) => x.id === t.projekt_id);
                        return (
                          <button key={t.id} type="button" onClick={() => onTermin(t)}
                            className="rounded-md border border-primary/25 bg-primary-soft px-1.5 py-1 text-left text-xs leading-tight text-primary hover:border-primary">
                            <span className="block truncate font-semibold">{t.titel}</span>
                            <span className="block truncate opacity-80">{zeitText(t)}{p ? ` · ${p.nummer}` : ""}</span>
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => onLeer(tag, z.id)} aria-label={`Termin am ${datumText(tag)} anlegen`}
                        className="min-h-5 flex-1 rounded-md text-xs text-transparent transition-colors hover:bg-muted hover:text-muted-foreground">
                        +
                      </button>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TerminListe({ termine, mitarbeiter, onWahl }: { termine: Termin[]; mitarbeiter: Profil[]; onWahl: (t: Termin) => void }) {
  const { data: projekte = [] } = useProjekte();
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {termine.map((t) => {
        const p = projekte.find((x) => x.id === t.projekt_id);
        return (
          <li key={t.id}>
            <button type="button" onClick={() => onWahl(t)} className="flex w-full gap-3 p-3 text-left hover:bg-muted/50">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold">{t.ganztags ? "ganztags" : uhrzeit(t.von)}</span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold">{t.titel}</span>
                <span className="block text-xs text-muted-foreground">
                  {zeitText(t)}{p ? ` · ${p.nummer} ${p.name}` : ""}
                </span>
                {t.ort && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{t.ort}</span>}
              </span>
              <span className="flex shrink-0 -space-x-1.5">
                {t.mitarbeiter.map((id) => <Avatar key={id} profil={mitarbeiter.find((m) => m.id === id)} className="h-7 w-7 text-[10px] ring-2 ring-card" />)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Monat({
  tage, bezug, heute, termine, mitarbeiter, onTag, onNeu, onTermin,
}: {
  tage: string[];
  bezug: string;
  heute: string;
  termine: Termin[];
  mitarbeiter: Profil[];
  onTag: (t: string) => void;
  onNeu: (t: string) => void;
  onTermin: (t: Termin) => void;
}) {
  const monat = isoZuDatum(bezug).getMonth();
  const tagesTermine = termine.filter((t) => amTag(t, bezug));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WOCHENTAGE.map((w) => <div key={w} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {tage.map((tag) => {
            const liste = termine.filter((t) => amTag(t, tag));
            return (
              <button key={tag} type="button" onClick={() => onTag(tag)}
                className={cn("min-h-16 border-b border-r p-1 text-left align-top transition-colors hover:bg-muted/40 sm:min-h-24",
                  isoZuDatum(tag).getMonth() !== monat && "bg-muted/20 text-muted-foreground", tag === bezug && "ring-2 ring-inset ring-primary")}>
                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  tag === heute && "bg-primary text-primary-foreground")}>{isoZuDatum(tag).getDate()}</span>
                <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                  {liste.slice(0, 4).map((t) => <span key={t.id} className="h-1.5 w-1.5 rounded-full bg-primary" />)}
                </div>
                <div className="mt-0.5 hidden space-y-0.5 sm:block">
                  {liste.slice(0, 3).map((t) => (
                    <div key={t.id} className="truncate rounded bg-primary-soft px-1 text-[11px] leading-4 text-primary">
                      {!t.ganztags && t.von && t.datum === tag ? `${uhrzeit(t.von)} ` : ""}{t.titel}
                    </div>
                  ))}
                  {liste.length > 3 && <div className="text-[11px] text-muted-foreground">+{liste.length - 3} weitere</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {bezug === heute ? "Heute, " : ""}
            {isoZuDatum(bezug).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          <Button variant="ghost" className="h-11 text-primary" onClick={() => onNeu(bezug)}>+ Termin</Button>
        </div>
        {tagesTermine.length === 0
          ? <Leer icon={CalendarPlus} text="Keine Termine an diesem Tag." className="py-6" />
          : <TerminListe termine={tagesTermine} mitarbeiter={mitarbeiter} onWahl={onTermin} />}
      </div>
    </div>
  );
}
