import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, Inbox, Loader2, Paperclip, Plus, Search, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { EingangDialog } from "@/components/eingang/EingangDialog";
import { useEingangsrechnungen, type EingangMitAnteilen } from "@/components/eingang/eingangDaten";
import { kategorieText, zahlung, zuordnung } from "@/components/eingang/eingangLogik";
import { passtSuche } from "@/components/regie/regieLogik";
import { datum, euro, isoTag } from "@/lib/format";
import { EINGANG_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "alle" | "zuzuordnen" | "unbezahlt";

const FILTER: { wert: Filter; text: string }[] = [
  { wert: "zuzuordnen", text: "Zuzuordnen" },
  { wert: "unbezahlt", text: "Nicht bezahlt" },
  { wert: "alle", text: "Alle" },
];

const LEER_TEXT: Record<Filter, string> = {
  alle: "Noch keine Eingangsrechnung. Rechnung vom Großhändler fotografieren, Betrag eintragen, Projekt wählen — fertig.",
  zuzuordnen: "Alles zugeordnet.",
  unbezahlt: "Alles bezahlt.",
};

const passt = (r: EingangMitAnteilen, f: Filter, heute: string) =>
  f === "alle" ? true
    : f === "zuzuordnen" ? zuordnung(r, r.eingang_anteile) !== "zugeordnet"
      : zahlung(r, heute) !== "bezahlt";

/** /eingang — Eingangsrechnungen (nur Chef), Filter über ?filter= */
export default function Eingang() {
  const pc = useIstPc();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const f = params.get("filter");
  const filter: Filter = f === "zuzuordnen" || f === "unbezahlt" ? f : "alle";
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<EingangMitAnteilen | "neu" | null>(null);
  const { data: alle = [], isLoading, error, refetch } = useEingangsrechnungen();

  const filterSetzen = (w: Filter) => {
    const neu = new URLSearchParams(params);
    if (w === "alle") neu.delete("filter");
    else neu.set("filter", w);
    setParams(neu, { replace: true });
  };

  const anzahl = useMemo(() => {
    const z = {} as Record<Filter, number>;
    FILTER.forEach((x) => { z[x.wert] = alle.filter((r) => passt(r, x.wert, heute)).length; });
    return z;
  }, [alle, heute]);

  const liste = useMemo(() => alle.filter((r) => passt(r, filter, heute) && passtSuche([
    r.lieferant, r.nummer, r.notiz, kategorieText(r.kategorie), ...r.eingang_anteile.flatMap((a) => [a.text, a.projekte?.nummer, a.projekte?.name]),
  ], suche)), [alle, filter, suche, heute]);

  const lieferanten = useMemo(() => [...new Set(alle.map((r) => r.lieferant.trim()))].sort((a, b) => a.localeCompare(b, "de")), [alle]);
  const summe = liste.reduce((s, r) => s + Number(r.brutto), 0);

  return (
    <Seite
      titel="Eingangsrechnungen"
      untertitel={isLoading ? undefined : `${alle.length} ${alle.length === 1 ? "Rechnung" : "Rechnungen"}`}
      breit
      aktionen={
        <Button className="h-11 gap-1.5 px-3 sm:px-4" onClick={() => setOffen("neu")}>
          <Plus className="h-4 w-4" />{pc ? "Rechnung erfassen" : "Neu"}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button
              key={x.wert}
              type="button"
              onClick={() => filterSetzen(x.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {x.text}
              <span className={cn("zahl text-xs", filter === x.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[x.wert] ?? 0}</span>
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
        <Leer icon={Inbox} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      ) : liste.length === 0 ? (
        <Leer icon={Inbox} text={suche.trim() ? "Nichts gefunden." : LEER_TEXT[filter]}>
          {!suche.trim() && filter === "alle" && (
            <Button className="h-11 gap-1.5" onClick={() => setOffen("neu")}><Plus className="h-4 w-4" /> Rechnung erfassen</Button>
          )}
        </Leer>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y rounded-lg border bg-card">
            {liste.map((r) => {
              const z = zuordnung(r, r.eingang_anteile);
              const zahl = zahlung(r, heute);
              const projekte = r.eingang_anteile.map((a) => a.projekte ? `${a.projekte.nummer} ${a.projekte.name}` : "").filter(Boolean);
              const wohin = [...projekte, ...(r.betrieb ? ["Betrieb"] : [])].join(" · ");
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setOffen(r)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:px-5">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{r.lieferant}</span>
                        {z !== "zugeordnet" && <StatusPille eintrag={EINGANG_STATUS[z]} />}
                        <StatusPille eintrag={EINGANG_STATUS[zahl]} />
                      </div>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {r.datei_pfad && <Paperclip className="h-3 w-3 shrink-0" aria-label="mit Beleg" />}
                        {[r.nummer, datum(r.datum), kategorieText(r.kategorie)].filter(Boolean).join(" · ")}
                      </p>
                      {wohin && <p className="truncate text-xs">{wohin}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="zahl font-semibold">{euro(Number(r.brutto))}</p>
                      <p className="zahl text-xs text-muted-foreground">{euro(Number(r.netto))} netto</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-1 text-right text-xs text-muted-foreground">
            {liste.length} {liste.length === 1 ? "Rechnung" : "Rechnungen"} · <span className="zahl font-semibold text-foreground">{euro(summe)}</span> brutto
          </p>
        </div>
      )}

      <EingangDialog
        open={offen !== null}
        onOpenChange={(o) => { if (!o) setOffen(null); }}
        rechnung={offen === "neu" ? null : offen}
        lieferanten={lieferanten}
      />
    </Seite>
  );
}
