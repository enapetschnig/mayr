import { CalendarPlus, MapPin } from "lucide-react";
import { Avatar, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { isoZuDatum, uhrzeit } from "@/lib/format";
import { amTag, projektFarbe } from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import { EINSATZ_STATUS, type Profil, type Projekt, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);

/** Einsätze eines Tages als Liste — Farbstreifen = Projekt */
export function TerminListe({ termine, mitarbeiter, projekte, onWahl }: {
  termine: Termin[]; mitarbeiter: Profil[]; projekte: Projekt[]; onWahl: (t: Termin) => void;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
      {termine.map((t) => {
        const p = projekte.find((x) => x.id === t.projekt_id);
        return (
          <li key={t.id} style={{ borderLeft: `5px solid ${projektFarbe(p)}` }}>
            <button type="button" onClick={() => onWahl(t)} className="flex w-full gap-3 p-3 text-left hover:bg-muted/50">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold">{t.ganztags || !t.von ? "ganztags" : uhrzeit(t.von)}</span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold">{t.titel}</span>
                {(t.status !== "geplant" || t.dringend) && (
                  <span className="flex flex-wrap gap-1">
                    {t.dringend && t.status !== "erledigt" && <StatusPille eintrag={{ ton: "rot", text: "Dringend" }} />}
                    {t.status !== "geplant" && <StatusPille eintrag={EINSATZ_STATUS[t.status]} />}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">{zeitText(t)}{p ? ` · ${p.nummer} ${p.name}` : ""}</span>
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

/** Monat als Kalenderblatt, rechts der gewählte Tag */
export function Monat({
  tage, bezug, heute, termine, mitarbeiter, projekte, darf, onTag, onNeu, onTermin,
}: {
  tage: string[];
  bezug: string;
  heute: string;
  termine: Termin[];
  mitarbeiter: Profil[];
  projekte: Projekt[];
  darf: boolean;
  onTag: (t: string) => void;
  onNeu: (t: string) => void;
  onTermin: (t: Termin) => void;
}) {
  const monat = isoZuDatum(bezug).getMonth();
  const tagesTermine = termine.filter((t) => amTag(t, bezug));
  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-3 lg:grid-cols-[1fr_24rem] lg:p-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WOCHENTAGE.map((w) => <div key={w} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {tage.map((tag) => {
            const liste = termine.filter((t) => amTag(t, tag));
            const wt = (isoZuDatum(tag).getDay() + 6) % 7;
            return (
              <button key={tag} type="button" onClick={() => onTag(tag)} title={feiertagName(tag) || undefined}
                className={cn("min-h-16 border-b border-r p-1 text-left align-top transition-colors hover:bg-muted/40 sm:min-h-28",
                  (wt >= 5 || feiertagName(tag)) && "bg-amber-50/70",
                  isoZuDatum(tag).getMonth() !== monat && "bg-muted/30 text-muted-foreground", tag === bezug && "ring-2 ring-inset ring-primary")}>
                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  tag === heute && "bg-red-600 text-white")}>{isoZuDatum(tag).getDate()}</span>
                <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                  {liste.slice(0, 4).map((t) => <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: projektFarbe(projekte.find((p) => p.id === t.projekt_id)) }} />)}
                </div>
                <div className="mt-0.5 hidden space-y-0.5 sm:block">
                  {liste.slice(0, 4).map((t) => {
                    const farbe = projektFarbe(projekte.find((p) => p.id === t.projekt_id));
                    return (
                      <div key={t.id} className="truncate rounded px-1 text-[11px] font-medium leading-4" style={{ background: `${farbe}26`, borderLeft: `3px solid ${farbe}` }}>
                        {!t.ganztags && t.von && t.datum === tag ? `${uhrzeit(t.von)} ` : ""}{t.titel}
                      </div>
                    );
                  })}
                  {liste.length > 4 && <div className="text-[11px] text-muted-foreground">+{liste.length - 4} weitere</div>}
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
          {darf && <Button variant="ghost" className="h-11 text-primary" onClick={() => onNeu(bezug)}>+ Einsatz</Button>}
        </div>
        {tagesTermine.length === 0
          ? <Leer icon={CalendarPlus} text="Nichts eingeteilt an diesem Tag." className="py-6" />
          : <TerminListe termine={tagesTermine} mitarbeiter={mitarbeiter} projekte={projekte} onWahl={onTermin} />}
      </div>
    </div>
  );
}
