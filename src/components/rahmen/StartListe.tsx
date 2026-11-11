import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NavEintrag } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Ab so vielen Einträgen wandern die seltenen einer Gruppe unter „Mehr“ */
const MEHR_AB = 6;
const MEHR_SCHLUESSEL = "start.mehr";
const mehrGemerkt = (): string[] => {
  try { const roh = JSON.parse(localStorage.getItem(MEHR_SCHLUESSEL) || "[]"); return Array.isArray(roh) ? roh : []; } catch { return []; }
};

export type StartGruppe = { titel: string; eintraege: NavEintrag[] };

/**
 * Die Menü-Karten der Startseite (Handy und Tablet) nach dem Vorbild
 * Lengauer Stockner: Symbol im blauen Quadrat, Titel groß, Unterzeile, unten
 * ein blauer Knopf „… öffnen“. Die ganze Karte ist tippbar. Seltenes steht
 * aufklappbar unter „Mehr“ (gemerkt). Ab 640 px zwei Spalten.
 */
export function StartListe({ gruppen, monteur }: { gruppen: StartGruppe[]; monteur: boolean }) {
  const [offen, setOffen] = useState<string[]>(mehrGemerkt);
  const umschalten = (g: string) => setOffen((alt) => {
    const neu = alt.includes(g) ? alt.filter((x) => x !== g) : [...alt, g];
    try { localStorage.setItem(MEHR_SCHLUESSEL, JSON.stringify(neu)); } catch { /* egal */ }
    return neu;
  });
  const text = (e: NavEintrag) => (monteur && e.textMonteur) || e.text;

  return (
    <div className="space-y-6" data-start-menue>
      {gruppen.map((g) => {
        if (!g.eintraege.length) return null;
        const kuerzen = g.eintraege.length > MEHR_AB && g.eintraege.some((e) => e.selten);
        const gross = kuerzen ? g.eintraege.filter((e) => !e.selten) : g.eintraege;
        const mehr = kuerzen ? g.eintraege.filter((e) => e.selten) : [];
        const mehrOffen = offen.includes(g.titel);
        return (
          <section key={g.titel}>
            <h2 className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{g.titel}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {gross.map((e) => (
                <li key={e.pfad}>
                  <Link to={e.pfad} data-kachel={e.titel}
                    className="group flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="flex flex-1 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <e.icon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold leading-tight">{e.titel}</span>
                        <span className="block text-sm text-muted-foreground">{text(e)}</span>
                      </span>
                    </span>
                    <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground group-hover:bg-primary-hover">
                      {e.titel} öffnen <ChevronRight className="h-4 w-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {mehr.length > 0 && (
              <div className="mt-3 rounded-xl border bg-card shadow-sm" data-start-mehr={g.titel}>
                <button type="button" onClick={() => umschalten(g.titel)} aria-expanded={mehrOffen}
                  className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-base font-semibold">
                  <ChevronDown className={cn("h-5 w-5 transition-transform", mehrOffen && "rotate-180")} />
                  Mehr in {g.titel} <span className="text-sm font-normal text-muted-foreground">({mehr.length})</span>
                </button>
                <ul className="divide-y border-t" hidden={!mehrOffen}>
                  {mehr.map((e) => (
                    <li key={e.pfad}>
                      <Link to={e.pfad} data-kachel={e.titel} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                        <e.icon className="h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-tight">{e.titel}</span>
                          <span className="block truncate text-xs text-muted-foreground">{text(e)}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
