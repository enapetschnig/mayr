import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, PanelLeft, Plus, Search } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KontoMenue } from "@/components/KontoMenue";
import { useSitzung } from "@/hooks/useSitzung";
import { GRUPPEN_TITEL, istAktiv, sichtbareNavigation, type NavEintrag } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { KUNDE } from "@/kunde.config";
import { NeuKnopf, neuStarten, useNeuAktionen, type NeuArt } from "./NeuMenue";
import { sucheOeffnen } from "./Suchpalette";

/** Menüpunkte mit „+“ beim Überfahren — gleich anlegen, ohne erst hinzugehen */
const SCHNELL: Record<string, NeuArt> = {
  "/projekte": "projekt",
  "/angebote": "angebot",
  "/rechnungen": "rechnung",
  "/plantafel": "termin",
  "/zeiten": "zeit",
  "/regie": "regie",
};

/**
 * Seitenleiste nach dem Vorbild Lengauer Stockner im SETEC-Look: schwarz,
 * 240 px, einklappbar auf 56 px (nur Symbole mit Tooltip, Zustand gemerkt).
 * Oben das Querlogo (eingeklappt das Schild), darunter Suchen (Strg+K) und das
 * goldene „+ Neu“. Gruppen mit Versal-Etikett, einzeln einklappbar; der aktive
 * Punkt hat eine hellere Fläche, goldene Schrift und einen goldenen Strich links. Im Fuß Einstellungen, Wünsche,
 * Handyansicht und das Konto mit Namen.
 * Tablet (768–1023 px): immer schmal, ohne Umschalter.
 */
export function Seitenleiste({ festSchmal }: { festSchmal?: boolean }) {
  const { pathname } = useLocation();
  const { firma, istChef } = useSitzung();
  const { state, toggleSidebar } = useSidebar();
  const schmal = festSchmal || state === "collapsed";
  const neuErlaubt = new Set(useNeuAktionen().map((a) => a.art));
  const { istZu, umschalten } = useZugeklappt();

  const alle = sichtbareNavigation(istChef, !festSchmal);
  const gruppen = (["haupt", "baustelle", "buero"] as const)
    .map((g) => ({ g, eintraege: alle.filter((n) => n.gruppe === g) }))
    .filter((x) => x.eintraege.length > 0);
  const fuss = alle.filter((n) => n.gruppe === "system");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border" data-seitenleiste>
      <SidebarHeader className={cn("gap-3 px-3 pb-2 pt-3", schmal && "items-center px-2")}>
        <div className={cn("flex items-center gap-2", schmal && "flex-col")}>
          <Link to="/" title={firma?.name || KUNDE.kurzname} data-leiste-logo
            className={cn("flex min-w-0 items-center rounded-md transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              schmal ? "h-10 w-10 justify-center" : "h-20 flex-1 px-1")}>
            <img src={schmal ? KUNDE.logoZeichen : KUNDE.logoQuerHell} alt={firma?.name || KUNDE.firma}
              className={cn("object-contain", schmal ? "h-8 w-8" : "h-[76px] w-auto max-w-full")} />
          </Link>
          {!festSchmal && (
            <button type="button" onClick={toggleSidebar}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={schmal ? "Menü aufklappen" : "Menü einklappen"} title={schmal ? "Menü aufklappen" : "Menü einklappen"}>
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={cn("flex flex-col gap-1.5", schmal && "items-center")}>
          <MitTipp tipp="Suchen (Strg+K)" aus={!schmal}>
            <button type="button" onClick={sucheOeffnen} aria-label="Suchen" data-suche-knopf
              className={cn("flex h-8 items-center gap-2.5 rounded-md border border-sidebar-border bg-white/[0.04] text-sm text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                schmal ? "w-8 justify-center border-0 bg-transparent" : "w-full px-2.5")}>
              <Search className="h-4 w-4 shrink-0" />
              {!schmal && (
                <>
                  <span className="text-sidebar-foreground/60">Suchen …</span>
                  <kbd className="ml-auto rounded border border-sidebar-border px-1.5 text-[10px] font-medium text-sidebar-foreground/50">Strg K</kbd>
                </>
              )}
            </button>
          </MitTipp>
          <MitTipp tipp="Neu anlegen" aus={!schmal}>
            <span className={cn(schmal ? "inline-flex" : "block w-full")}>
              <NeuKnopf kompakt={schmal} className="bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary/85" />
            </span>
          </MitTipp>
        </div>
      </SidebarHeader>

      <SidebarContent className={cn("gap-0 px-3 pb-2", schmal && "px-2")}>
        {gruppen.map(({ g, eintraege }) => {
          const titel = g === "haupt" ? "" : GRUPPEN_TITEL[g];
          const aktivDrin = eintraege.some((e) => istAktiv(e.pfad, pathname));
          const offen = schmal || !titel || !istZu(titel, aktivDrin, pathname);
          return (
            <nav key={g} aria-label={titel || "Hauptmenü"} className="pt-3 first:pt-1" data-menue-gruppe={g}>
              {titel && !schmal && (
                <button type="button" onClick={() => umschalten(titel, aktivDrin, pathname)} aria-expanded={offen}
                  className="flex w-full items-center gap-1 rounded px-2.5 pb-1 text-left font-marke text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <span className="flex-1">{titel}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !offen && "-rotate-90")} aria-hidden="true" />
                </button>
              )}
              {titel && schmal && <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden="true" />}
              {offen && (
                <ul className="flex flex-col gap-0.5">
                  {eintraege.map((e) => {
                    const schnell = SCHNELL[e.pfad];
                    return (
                      <li key={e.pfad} className="group/eintrag relative">
                        <Eintrag eintrag={e} aktiv={istAktiv(e.pfad, pathname)} schmal={schmal} />
                        {!schmal && schnell && neuErlaubt.has(schnell) && (
                          <button type="button" onClick={() => neuStarten(schnell)} data-schnell={schnell}
                            className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-border hover:text-sidebar-accent-foreground focus-visible:flex group-hover/eintrag:flex"
                            aria-label={`${e.titel}: neu anlegen`} title="Gleich anlegen">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          );
        })}
      </SidebarContent>

      <SidebarFooter className={cn("gap-1 border-t border-sidebar-border px-3 py-2", schmal && "items-center px-2")}>
        <div className={cn("flex items-center gap-0.5", schmal && "flex-col")}>
          {fuss.map((e) => (
            <MitTipp key={e.pfad} tipp={e.titel}>
              <Link to={e.pfad} aria-label={e.titel} aria-current={istAktiv(e.pfad, pathname) ? "page" : undefined}
                className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  istAktiv(e.pfad, pathname) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                <e.icon className="h-[18px] w-[18px]" />
              </Link>
            </MitTipp>
          ))}
        </div>
        <KontoMenue leiste mitName={!schmal} />
      </SidebarFooter>
    </Sidebar>
  );
}

function Eintrag({ eintrag, aktiv, schmal }: { eintrag: NavEintrag; aktiv: boolean; schmal: boolean }) {
  return (
    <MitTipp tipp={eintrag.titel} aus={!schmal}>
      <Link to={eintrag.pfad} aria-current={aktiv ? "page" : undefined} aria-label={schmal ? eintrag.titel : undefined}
        className={cn(
          "relative flex h-8 items-center gap-2.5 rounded-md text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          schmal ? "mx-auto w-8 justify-center" : "px-2.5",
          aktiv && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        )}>
        {aktiv && <span className="absolute -left-1 bottom-1.5 top-1.5 w-[3px] rounded-full bg-sidebar-primary" aria-hidden="true" />}
        <eintrag.icon className="h-[18px] w-[18px] shrink-0" />
        {!schmal && <span className="truncate">{eintrag.titel}</span>}
      </Link>
    </MitTipp>
  );
}

/** Tooltip rechts neben dem Symbol — nur in der schmalen Leiste */
function MitTipp({ tipp, aus, children }: { tipp: string; aus?: boolean; children: ReactNode }) {
  if (aus) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{tipp}</TooltipContent>
    </Tooltip>
  );
}

const ZU_SCHLUESSEL = "menue.zu";

/**
 * Zugeklappte Gruppen, gemerkt je Gerät. Die Gruppe der offenen Seite ist
 * offen; klappt man sie trotzdem zu, gilt das bis zum nächsten Seitenwechsel.
 */
function useZugeklappt() {
  const [zu, setZu] = useState<string[]>(() => {
    try { const roh = JSON.parse(localStorage.getItem(ZU_SCHLUESSEL) || "[]"); return Array.isArray(roh) ? roh : []; } catch { return []; }
  });
  const [aktivZu, setAktivZu] = useState<{ titel: string; pfad: string } | null>(null);
  const istZu = (titel: string, aktivDrin: boolean, pfad: string) =>
    aktivDrin ? aktivZu?.titel === titel && aktivZu.pfad === pfad : zu.includes(titel);
  const umschalten = (titel: string, aktivDrin: boolean, pfad: string) => {
    if (aktivDrin) { setAktivZu((a) => (a?.titel === titel && a.pfad === pfad ? null : { titel, pfad })); return; }
    const neu = zu.includes(titel) ? zu.filter((t) => t !== titel) : [...zu, titel];
    setZu(neu);
    try { localStorage.setItem(ZU_SCHLUESSEL, JSON.stringify(neu)); } catch { /* privat: gilt bis zum Neuladen */ }
  };
  return { istZu, umschalten };
}

/** Der Einklapp-Zustand bleibt auf diesem Gerät gemerkt */
const LEISTE_SCHLUESSEL = "mayr.seitenleiste";
export function gemerktOffen(): boolean {
  try { return localStorage.getItem(LEISTE_SCHLUESSEL) !== "zu"; } catch { return true; }
}
export function merkeOffen(offen: boolean) {
  try { localStorage.setItem(LEISTE_SCHLUESSEL, offen ? "auf" : "zu"); } catch { /* egal */ }
}
