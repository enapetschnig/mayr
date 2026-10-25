import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardSignature, Loader2, Plus, Search, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { RegieListe } from "@/components/regie/RegieListe";
import { stundenSumme, useRegieberichte } from "@/components/regie/regieDaten";
import { REGIE_FILTER, filterAusUrl, passtFilter, passtSuche, type RegieFilter } from "@/components/regie/regieLogik";
import { stunden } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEER_TEXT: Record<RegieFilter, string> = {
  alle: "Noch kein Regiebericht. Auf der Baustelle anlegen, vom Kunden unterschreiben lassen — fertig.",
  entwurf: "Keine offenen Entwürfe.",
  unterschrieben: "Noch kein unterschriebener Regiebericht.",
  offen: "Alles verrechnet — kein unterschriebener Bericht wartet.",
};

/** /regie — alle Regieberichte, Filter über ?filter= (Startseite verlinkt ?filter=offen) */
export default function Regieberichte() {
  const pc = useIstPc();
  const [params, setParams] = useSearchParams();
  const filter = filterAusUrl(params.get("filter"));
  const [suche, setSuche] = useState("");
  const { data: alle = [], isLoading, error, refetch } = useRegieberichte();

  const filterSetzen = (f: RegieFilter) => {
    const neu = new URLSearchParams(params);
    if (f === "alle") neu.delete("filter");
    else neu.set("filter", f);
    setParams(neu, { replace: true });
  };

  const anzahl = useMemo(() => {
    const z = {} as Record<RegieFilter, number>;
    REGIE_FILTER.forEach((f) => { z[f.wert] = alle.filter((r) => passtFilter(r, f.wert)).length; });
    return z;
  }, [alle]);

  const liste = useMemo(() => alle.filter((r) => passtFilter(r, filter) && passtSuche([
    r.nummer, r.projekte?.nummer, r.projekte?.name, r.projekte?.ort, r.projekte?.kunden?.name, r.arbeiten, r.unterschrift_name,
  ], suche)), [alle, filter, suche]);

  const summe = liste.reduce((s, r) => s + stundenSumme(r), 0);

  return (
    <Seite
      titel="Regieberichte"
      untertitel={isLoading ? undefined : `${alle.length} ${alle.length === 1 ? "Bericht" : "Berichte"}`}
      breit
      aktionen={
        <Button asChild className="h-11 gap-1.5 px-3 sm:px-4">
          <Link to="/regie/neu"><Plus className="h-4 w-4" />{pc ? "Neuer Regiebericht" : "Neu"}</Link>
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {REGIE_FILTER.map((f) => (
            <button
              key={f.wert}
              type="button"
              onClick={() => filterSetzen(f.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === f.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {f.text}
              <span className={cn("zahl text-xs", filter === f.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[f.wert] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen – Nummer, Projekt, Kunde, Arbeiten …"
            className="h-11 pl-9 pr-10"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
          />
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
        <Leer icon={ClipboardSignature} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      ) : liste.length === 0 ? (
        <Leer icon={ClipboardSignature} text={suche.trim() ? "Nichts gefunden." : LEER_TEXT[filter]}>
          {!suche.trim() && (filter === "alle" || filter === "entwurf") && (
            <Button asChild className="h-11 gap-1.5">
              <Link to="/regie/neu"><Plus className="h-4 w-4" /> Neuer Regiebericht</Link>
            </Button>
          )}
        </Leer>
      ) : (
        <div className="space-y-2">
          <RegieListe eintraege={liste} />
          <p className="px-1 text-right text-xs text-muted-foreground">
            {liste.length} {liste.length === 1 ? "Bericht" : "Berichte"} · <span className="zahl font-semibold text-foreground">{stunden(summe)}</span>
          </p>
        </div>
      )}
    </Seite>
  );
}
