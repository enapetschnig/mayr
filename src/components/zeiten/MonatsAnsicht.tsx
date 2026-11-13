import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { ZeitenListe, useZeitenListe, type ZeitMitInfo } from "@/components/zeiten/ZeitenListe";
import { useAbwesenheiten, useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { datumKurz, isoTag, stunden, zahl } from "@/lib/format";
import { monatDazu, monatsGrenzen, monatsKalender, type TagTon } from "@/lib/monatsKalender";
import { monatText } from "@/lib/dokumente";
import { ABWESENHEIT_ART, type AbwesenheitArt, type Profil } from "@/lib/types";
import { cn } from "@/lib/utils";

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
/** Farbe je Tag: grün = Soll erreicht, gelb = weniger, rot = nichts gebucht, grau = abwesend */
const TON: Record<TagTon, string> = {
  voll: "bg-status-gruen text-status-gruen-fg",
  knapp: "bg-status-gelb text-status-gelb-fg",
  fehlt: "bg-status-rot text-status-rot-fg",
  abwesend: "bg-status-grau text-status-grau-fg",
  frei: "bg-muted/40 text-muted-foreground",
  kommt: "bg-card text-muted-foreground",
};

function MonatsKopf({ monat, setMonat }: { monat: string; setMonat: (m: string) => void }) {
  const jetzt = isoTag().slice(0, 7);
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonat(monatDazu(monat, -1))} aria-label="Monat zurück">
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setMonat(jetzt)} disabled={monat === jetzt}>
        {monat === jetzt ? "Dieser Monat" : `Zurück zu ${monatText(`${jetzt}-01`).split(" ")[0]}`}
      </Button>
      <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonat(monatDazu(monat, 1))} aria-label="Monat vor">
        <ChevronRight className="h-5 w-5" />
      </Button>
      <span className="ml-1 font-semibold" data-monat>{monatText(`${monat}-01`)}</span>
    </div>
  );
}

/**
 * Monatsblatt einer Person: je Tag die Stunden in der Ampelfarbe (Soll
 * erreicht, weniger, nichts), Abwesenheiten als Kürzel, rechts die
 * Wochensumme, oben Monat und Stand gegen das Soll bis gestern. Tag antippen
 * zeigt dessen Buchungen.
 */
export function MonatsAnsicht({ person, onBuchen, onWahl }: {
  person: Pick<Profil, "id" | "wochenstunden">;
  onBuchen: (datum: string) => void;
  onWahl: (z: ZeitMitInfo) => void;
}) {
  const heute = isoTag();
  const [monat, setMonat] = useState(heute.slice(0, 7));
  const [tag, setTag] = useState<string | null>(heute);
  const { von, bis } = monatsGrenzen(monat);
  const { data: zeiten = [] } = useZeitenListe({ von, bis, userId: person.id });
  const { data: abwesenheiten = [] } = useAbwesenheiten(person.id);
  const m = useMemo(() => monatsKalender(monat, zeiten, abwesenheiten, Number(person.wochenstunden ?? 38.5), heute),
    [monat, zeiten, abwesenheiten, person.wochenstunden, heute]);
  const tagZeiten = zeiten.filter((z) => z.datum === tag);
  const gewaehlt = m.wochen.flatMap((w) => w.tage).find((t) => t?.iso === tag) ?? null;

  return (
    <section className="space-y-3" data-monatsansicht>
      <MonatsKopf monat={monat} setMonat={(x) => { setMonat(x); setTag(null); }} />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Ist / Soll</p>
          <p className="zahl text-lg font-bold">{zahl(m.ist + m.abwesend)}<span className="text-sm font-normal text-muted-foreground"> / {zahl(m.soll)} h</span></p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Stand bis gestern</p>
          <p className={cn("zahl text-lg font-bold", m.differenz < 0 && "text-status-rot-fg")}>{m.differenz > 0 ? "+" : ""}{zahl(m.differenz)} h</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Unproduktiv</p>
          <p className="zahl text-lg font-bold">{zahl(m.intern)} h
            {m.ist > 0 && <span className="text-sm font-normal text-muted-foreground"> · {Math.round((m.intern / m.ist) * 100)} %</span>}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-2 sm:p-3">
        <table className="w-full table-fixed border-separate border-spacing-1 text-center">
          <thead>
            <tr className="text-xs text-muted-foreground">
              {TAGE.map((t) => <th key={t} className="font-medium">{t}</th>)}
              <th className="w-10 font-medium sm:w-14">Σ</th>
            </tr>
          </thead>
          <tbody>
            {m.wochen.map((w) => (
              <tr key={w.kw}>
                {w.tage.map((t, i) => {
                  if (!t) return <td key={i} />;
                  const ab = t.abwesend ? ABWESENHEIT_ART[t.abwesend.art as AbwesenheitArt]?.kurz ?? "–" : null;
                  return (
                    <td key={t.iso} className="p-0">
                      <button type="button" onClick={() => setTag(t.iso)} data-tag={t.iso} data-ton={t.ton}
                        aria-label={`${datumKurz(t.iso)}: ${stunden(t.ist)}${t.abwesend ? `, ${ABWESENHEIT_ART[t.abwesend.art as AbwesenheitArt]?.text}` : ""}${t.feiertag ? `, ${t.feiertag}` : ""}`}
                        title={t.feiertag ?? undefined}
                        className={cn("flex h-12 w-full flex-col items-center justify-center rounded-md text-xs transition-shadow sm:h-14",
                          TON[t.ton], tag === t.iso && "ring-2 ring-primary ring-offset-1", t.iso === heute && "font-bold")}>
                        <span className="text-[10px] leading-none opacity-70">{t.tag}</span>
                        <span className="zahl text-sm font-semibold leading-tight">
                          {t.ist ? zahl(t.ist) : ab ?? (t.feiertag ? "F" : "")}
                        </span>
                      </button>
                    </td>
                  );
                })}
                <td className={cn("zahl text-xs font-semibold sm:text-sm", w.ist < w.soll && w.tage.some((t) => t && t.iso < heute) && "text-status-rot-fg")}>
                  {zahl(w.ist)}
                  <span className="block text-[10px] font-normal text-muted-foreground">KW {w.kw}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-status-gruen" /> Soll erreicht</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-status-gelb" /> weniger</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-status-rot" /> nichts gebucht</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-status-grau" /> abwesend</span>
        </p>
      </div>

      {tag && (
        <div className="space-y-2" data-tag-liste>
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold">
              {/* mit Einträgen steht das Datum schon als Tageskopf der Liste */}
              {tagZeiten.length ? "Gewählter Tag" : datumKurz(tag)}{gewaehlt?.feiertag ? ` · ${gewaehlt.feiertag}` : ""}
              {gewaehlt?.abwesend ? ` · ${ABWESENHEIT_ART[gewaehlt.abwesend.art as AbwesenheitArt]?.text}` : ""}
            </h3>
            {tag <= heute && <Button variant="outline" className="h-10 gap-1.5" onClick={() => onBuchen(tag)}><Plus className="h-4 w-4" /> Stunden</Button>}
          </div>
          {tagZeiten.length ? <ZeitenListe zeiten={tagZeiten} onWahl={onWahl} /> : <p className="px-1 text-sm text-muted-foreground">An diesem Tag nichts gebucht.</p>}
        </div>
      )}
    </section>
  );
}

/** Chef, „Alle“: je Person der Monat in einer Zeile — antippen öffnet das Monatsblatt */
export function MonatAlle({ mitarbeiter, onPerson }: { mitarbeiter: Profil[]; onPerson: (id: string) => void }) {
  const heute = isoTag();
  const [monat, setMonat] = useState(heute.slice(0, 7));
  const { von, bis } = monatsGrenzen(monat);
  const { data: zeiten = [] } = useZeitenListe({ von, bis });
  const { data: abwesend = [] } = useKalenderAbwesenheit(von, bis);
  const zeilen = mitarbeiter.map((p) => ({
    p, m: monatsKalender(monat, zeiten.filter((z) => z.user_id === p.id), abwesend.filter((a) => a.user_id === p.id), Number(p.wochenstunden ?? 38.5), heute),
  }));
  return (
    <section className="space-y-3">
      <MonatsKopf monat={monat} setMonat={setMonat} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Mitarbeiter</th>
              <th className="px-2 py-2 text-right font-medium">Ist</th>
              <th className="px-2 py-2 text-right font-medium">Soll</th>
              <th className="px-2 py-2 text-right font-medium">Stand</th>
              <th className="px-3 py-2 text-right font-medium">Unprod.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {zeilen.map(({ p, m }) => (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onPerson(p.id)}>
                <td className="px-3 py-2">
                  <span className="flex min-h-9 items-center gap-2 font-medium"><Avatar profil={p} className="h-7 w-7 text-[11px]" /> {p.vorname}</span>
                </td>
                <td className="zahl px-2 py-2 text-right">{zahl(m.ist + m.abwesend)}</td>
                <td className="zahl px-2 py-2 text-right text-muted-foreground">{zahl(m.soll)}</td>
                <td className={cn("zahl px-2 py-2 text-right font-semibold", m.differenz < 0 && "text-status-rot-fg")}>{m.differenz > 0 ? "+" : ""}{zahl(m.differenz)}</td>
                <td className="zahl px-3 py-2 text-right text-muted-foreground">{m.intern ? zahl(m.intern) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-xs text-muted-foreground">Ist mit Urlaub und Krankenstand; Stand = Ist gegen Soll bis gestern. Antippen öffnet das Monatsblatt.</p>
    </section>
  );
}
