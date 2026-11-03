import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Loader2, Plus, Search, ShoppingCart, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { NeueBestellungDialog, type NeuModus } from "@/components/bestellung/NeueBestellungDialog";
import { useBestellungen } from "@/components/bestellung/bestellDaten";
import { BESTELL_STATUS, bestellSumme, istOffen, offeneMenge, type BestellStatus } from "@/components/bestellung/bestellLogik";
import { passtSuche } from "@/components/regie/regieLogik";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { datum, euro, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "offen" | "alle";

/**
 * /bestellungen — Bestellungen beim Großhändler. „Offen“: Entwürfe und
 * alles, was noch nicht (ganz) geliefert ist. `?neu=lager` öffnet gleich
 * den Vorschlag aus dem Mindestbestand (Knopf auf der Lagerseite).
 */
export default function Bestellungen() {
  const pc = useIstPc();
  const navigate = useNavigate();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get("filter") === "alle" ? "alle" : "offen";
  const neuParam = params.get("neu");
  const [neu, setNeu] = useState<NeuModus | null>(neuParam === "lager" || neuParam === "projekt" ? neuParam : null);
  const [suche, setSuche] = useState("");
  const { data: alle = [], isLoading, error } = useBestellungen();

  const passt = (s: string, f: Filter) => f === "alle" || s === "entwurf" || istOffen(s);
  const anzahl = { offen: alle.filter((b) => passt(b.status, "offen")).length, alle: alle.length };
  const liste = alle.filter((b) => passt(b.status, filter)
    && passtSuche([b.nummer, b.lieferant, b.projekte?.name, b.projekte?.nummer, b.lagerorte?.name, b.notiz], suche));

  const filterSetzen = (f: Filter) => {
    const n = new URLSearchParams(params);
    if (f === "offen") n.delete("filter");
    else n.set("filter", f);
    setParams(n, { replace: true });
  };
  const dialogZu = (o: boolean) => {
    if (o) return;
    setNeu(null);
    if (neuParam) {
      const n = new URLSearchParams(params);
      n.delete("neu");
      setParams(n, { replace: true });
    }
  };

  return (
    <Seite
      titel="Bestellungen"
      untertitel={isLoading ? undefined : `${anzahl.offen} offen`}
      breit={pc}
      aktionen={(
        <Button className="h-11 px-3" onClick={() => setNeu("lager")} aria-label="Neue Bestellung">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Neue Bestellung</span>
        </Button>
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["offen", "alle"] as const).map((f) => (
            <button key={f} type="button" onClick={() => filterSetzen(f)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === f ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}>
              {f === "offen" ? "Offen" : "Alle"}
              <span className={cn("zahl text-xs", filter === f ? "text-primary" : "text-muted-foreground")}>{anzahl[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Lieferant, Nummer, Projekt …"
            className="h-11 pl-9 pr-10" inputMode="search" enterKeyHint="search" autoComplete="off" />
          {suche && (
            <button type="button" onClick={() => setSuche("")} aria-label="Suche leeren"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <Leer icon={ShoppingCart} text={`Konnte nicht geladen werden: ${(error as Error).message}`} />
      ) : liste.length === 0 ? (
        <Leer icon={ShoppingCart} text={suche.trim() ? "Nichts gefunden."
          : filter === "offen" && alle.length ? "Nichts offen — alles geliefert."
            : "Noch keine Bestellungen. Die App schlägt vor, was unter Mindestbestand ist oder was ein Projekt laut Angebot braucht."}>
          {filter === "offen" && !suche.trim() && <Button className="h-11" onClick={() => setNeu("lager")}><Plus className="h-4 w-4" /> Bestellung anlegen</Button>}
        </Leer>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((b) => {
            const pos = b.bestell_positionen;
            const offen = pos.filter((p) => offeneMenge(p) > 0).length;
            const spaet = istOffen(b.status) && !!b.liefertermin && b.liefertermin < heute;
            return (
              <li key={b.id}>
                <Link to={`/bestellungen/${b.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 lg:px-5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{b.lieferant}</span>
                      <StatusPille eintrag={BESTELL_STATUS[b.status as BestellStatus]} />
                      {spaet && <StatusPille eintrag={{ ton: "rot", text: "Liefertermin vorbei" }} />}
                    </div>
                    <p className="truncate text-sm">
                      {b.nummer} · {b.projekte ? `Baustelle ${b.projekte.nummer} ${b.projekte.name}` : b.lagerorte?.name ?? "Lager"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[datum(b.datum), pos.length === 1 ? "1 Position" : `${pos.length} Positionen`,
                        b.status === "teilgeliefert" ? `${offen} noch offen` : null,
                        b.liefertermin && istOffen(b.status) ? `Liefertermin ${datum(b.liefertermin)}` : null,
                        euro(bestellSumme(pos))].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NeueBestellungDialog open={!!neu} onOpenChange={dialogZu} startModus={neu ?? "lager"}
        onAngelegt={(ids) => { if (ids.length === 1) navigate(`/bestellungen/${ids[0]}`); }} />
    </Seite>
  );
}
