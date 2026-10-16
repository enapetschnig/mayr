import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Lock, MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FirmaBadge, Leer } from "@/components/Bausteine";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag, isoZuDatum, uhrzeit } from "@/lib/format";
import type { Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "alle" | "gemeinsam" | "meine";
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Läuft der Termin an diesem Tag? (mehrtägige eingeschlossen) */
const amTag = (t: Termin, tag: string) => t.datum <= tag && (t.bis_datum ?? t.datum) >= tag;

export default function Kalender() {
  const [params, setParams] = useSearchParams();
  const neuLaden = useNeuLaden();
  const { firma, firmaVon } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const heute = isoTag();
  const gewaehlt = params.get("datum") || heute;
  const [monat, setMonat] = useState(() => { const d = isoZuDatum(gewaehlt); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [filter, setFilter] = useState<Filter>("alle");
  const [dialog, setDialog] = useState<{ termin?: Termin | null; datum?: string } | null>(null);

  // Raster: Montag vor dem Monatsersten bis Sonntag nach dem Monatsletzten
  const tage = useMemo(() => {
    const start = new Date(monat);
    start.setDate(1 - ((monat.getDay() + 6) % 7));
    const ende = new Date(monat.getFullYear(), monat.getMonth() + 1, 0);
    ende.setDate(ende.getDate() + (6 - ((ende.getDay() + 6) % 7)));
    const liste: string[] = [];
    for (const d = new Date(start); d <= ende; d.setDate(d.getDate() + 1)) liste.push(isoTag(d));
    return liste;
  }, [monat]);

  const { data: termine = [] } = useQuery({
    queryKey: ["termine", "monat", tage[0], tage[tage.length - 1]],
    queryFn: async () => {
      const { data } = await supabase.from("termine").select("*")
        .lte("datum", tage[tage.length - 1])
        .or(`bis_datum.gte.${tage[0]},and(bis_datum.is.null,datum.gte.${tage[0]})`)
        .order("datum").order("von", { nullsFirst: true });
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

  const sichtbar = termine.filter((t) =>
    filter === "alle" || (filter === "gemeinsam" ? t.sichtbarkeit === "gemeinsam" : t.firma_id === firma?.id));
  const tagesTermine = sichtbar.filter((t) => amTag(t, gewaehlt));

  const waehlen = (tag: string) => setParams({ datum: tag }, { replace: true });
  const blaettern = (r: number) => setMonat(new Date(monat.getFullYear(), monat.getMonth() + r, 1));

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Kalender" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-6xl">
        <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-white border border-sky-200 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-sky-700" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-sky-900">Kann auch mit Google Kalender verbunden werden</p>
            <p className="text-sky-800/80">Dann stehen eure Termine automatisch auch im Google Kalender am Handy. Bei Interesse einfach melden — wir richten es ein.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => blaettern(-1)} aria-label="Vormonat"><ChevronLeft className="h-5 w-5" /></Button>
            <h2 className="text-lg sm:text-xl font-bold capitalize w-44 text-center">
              {monat.toLocaleDateString("de-AT", { month: "long", year: "numeric" })}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => blaettern(1)} aria-label="Nächster Monat"><ChevronRight className="h-5 w-5" /></Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setMonat(new Date(d.getFullYear(), d.getMonth(), 1)); waehlen(heute); }}>Heute</Button>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {([["alle", "Alle"], ["gemeinsam", "Gemeinsam"], ["meine", "Meine"]] as [Filter, string][]).map(([f, t], i) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-3 py-1.5 text-sm font-medium", i > 0 && "border-l", filter === f ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{t}</button>
              ))}
            </div>
            <Button onClick={() => setDialog({ datum: gewaehlt })} className="gap-2"><CalendarPlus className="h-4 w-4" /><span className="hidden sm:inline">Termin</span></Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          {/* Monatsraster */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WOCHENTAGE.map((w) => <div key={w} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {tage.map((tag) => {
                const imMonat = isoZuDatum(tag).getMonth() === monat.getMonth();
                const liste = sichtbar.filter((t) => amTag(t, tag));
                return (
                  <button key={tag} onClick={() => waehlen(tag)} onDoubleClick={() => setDialog({ datum: tag })}
                    className={cn("min-h-16 sm:min-h-24 border-b border-r p-1 text-left align-top transition-colors hover:bg-muted/40",
                      !imMonat && "bg-muted/20 text-muted-foreground", tag === gewaehlt && "ring-2 ring-inset ring-primary")}>
                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      tag === heute && "bg-primary text-primary-foreground")}>{isoZuDatum(tag).getDate()}</span>
                    {/* Handy: Punkte, größer: Titel */}
                    <div className="flex flex-wrap gap-0.5 sm:hidden mt-0.5">
                      {liste.slice(0, 4).map((t) => <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: firmaVon(t.firma_id)?.farbe }} />)}
                    </div>
                    <div className="hidden sm:block space-y-0.5 mt-0.5">
                      {liste.slice(0, 3).map((t) => (
                        <div key={t.id} className="truncate rounded px-1 text-[11px] leading-4 text-white" style={{ backgroundColor: firmaVon(t.firma_id)?.farbe }}>
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

          {/* Tagesliste */}
          <div className="space-y-2">
            <h3 className="font-bold">
              {gewaehlt === heute ? "Heute, " : ""}
              {isoZuDatum(gewaehlt).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            {tagesTermine.length === 0 ? (
              <Leer icon={CalendarPlus} text="Keine Termine.">
                <Button variant="outline" size="sm" onClick={() => setDialog({ datum: gewaehlt })}>Termin anlegen</Button>
              </Leer>
            ) : tagesTermine.map((t) => {
              const p = projekte.find((x) => x.id === t.projekt_id);
              return (
                <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDialog({ termin: t })}>
                  <CardContent className="p-3 flex gap-3">
                    <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: firmaVon(t.firma_id)?.farbe }} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{t.titel}</p>
                        {t.sichtbarkeit === "gemeinsam" ? <Users className="h-4 w-4 text-primary shrink-0" /> : <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.ganztags ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`}
                        {p ? ` · ${p.name}` : ""}
                      </p>
                      {t.ort && <p className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />{t.ort}</p>}
                      {t.firmen?.length > 0 && <div className="flex gap-1 flex-wrap">{t.firmen.map((fid) => <FirmaBadge key={fid} firma={firmaVon(fid)} />)}</div>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
      <TerminDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} termin={dialog?.termin} datum={dialog?.datum} />
    </div>
  );
}
