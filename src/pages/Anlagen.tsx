import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Loader2, Plus, ScanLine, Search, ShieldCheck, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { AnlageDialog } from "@/components/anlagen/AnlageDialog";
import { anlageAdresse, anlageText, useAnlagen } from "@/components/anlagen/anlagenDaten";
import { anlageIdAusCode, faelligkeit } from "@/components/anlagen/pruefLogik";
import { passtSuche } from "@/components/regie/regieLogik";
import { ScanDialog } from "@/components/scanner/ScanDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { datum, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "faellig" | "alle" | "aus";

const FILTER: { wert: Filter; text: string }[] = [
  { wert: "faellig", text: "Fällig" },
  { wert: "alle", text: "Alle" },
  { wert: "aus", text: "Nicht mehr geprüft" },
];

/**
 * /anlagen — Anlagen beim Kunden mit Prüfintervall. „Fällig“: überfällig
 * oder in den nächsten 30 Tagen. Scannen öffnet die Anlage über den
 * QR-Aufkleber am Verteiler.
 */
export default function Anlagen() {
  const pc = useIstPc();
  const navigate = useNavigate();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const f = params.get("filter");
  const filter: Filter = f === "alle" || f === "aus" ? f : "faellig";
  const [suche, setSuche] = useState("");
  const [neu, setNeu] = useState(false);
  const [scan, setScan] = useState(false);
  const { data: alle = [], isLoading, error } = useAnlagen();

  const zeilen = useMemo(() => alle.map((a) => ({ a, f: faelligkeit(a.aktiv ? a.naechste_pruefung : null, heute) })), [alle, heute]);
  const passt = (z: (typeof zeilen)[number], w: Filter) =>
    w === "aus" ? !z.a.aktiv : z.a.aktiv && (w === "alle" || z.f.stufe === "ueberfaellig" || z.f.stufe === "bald");
  const anzahl = Object.fromEntries(FILTER.map((x) => [x.wert, zeilen.filter((z) => passt(z, x.wert)).length])) as Record<Filter, number>;
  const liste = zeilen.filter((z) => passt(z, filter)
    && passtSuche([z.a.bezeichnung, z.a.standort, z.a.kunden?.name, z.a.kunden?.ort, z.a.ort, `A${z.a.nummer}`], suche));

  const filterSetzen = (w: Filter) => {
    const n = new URLSearchParams(params);
    if (w === "faellig") n.delete("filter");
    else n.set("filter", w);
    setParams(n, { replace: true });
  };

  const codeGelesen = (code: string) => {
    const id = anlageIdAusCode(code);
    if (!id) {
      toast.error("Das ist kein Anlagen-Aufkleber.", { description: code });
      return;
    }
    setScan(false);
    navigate(`/anlagen/${id}`);
  };

  return (
    <Seite
      titel="Anlagen & Prüfungen"
      untertitel={isLoading ? undefined : `${alle.filter((a) => a.aktiv).length} Anlagen`}
      breit={pc}
      aktionen={(
        <>
          <Button variant="outline" className="h-11 px-3" onClick={() => setScan(true)} aria-label="Aufkleber scannen">
            <ScanLine className="h-4 w-4" /><span className="hidden sm:inline">Scannen</span>
          </Button>
          <Button className="h-11 px-3" onClick={() => setNeu(true)} aria-label="Neue Anlage">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Neue Anlage</span>
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button key={x.wert} type="button" onClick={() => filterSetzen(x.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}>
              {x.text}
              <span className={cn("zahl text-xs", filter === x.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[x.wert]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Kunde, Anlage, Ort …"
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
        <Leer icon={ShieldCheck} text={`Konnte nicht geladen werden: ${(error as Error).message}`} />
      ) : liste.length === 0 ? (
        <Leer icon={ShieldCheck} text={suche.trim() ? "Nichts gefunden."
          : filter === "faellig" ? "Keine Prüfung fällig — in den nächsten 30 Tagen ist nichts dran."
            : alle.length ? "Keine Anlage in dieser Liste." : "Noch keine Anlagen. Verteiler, E-Check, Blitzschutz, Notlicht — alles, was regelmäßig geprüft wird."}>
          {!alle.length && <Button className="h-11" onClick={() => setNeu(true)}><Plus className="h-4 w-4" /> Erste Anlage anlegen</Button>}
          {filter === "faellig" && anzahl.alle > 0 && (
            <Button variant="outline" className="h-11" onClick={() => filterSetzen("alle")}>Alle {anzahl.alle} Anlagen zeigen</Button>
          )}
        </Leer>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map(({ a, f: fa }) => (
            <li key={a.id}>
              <Link to={`/anlagen/${a.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50 lg:px-5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{a.kunden?.name ?? "Ohne Kunde"}</span>
                    {a.aktiv && fa.stufe !== "spaeter" && <StatusPille eintrag={fa.eintrag} />}
                  </div>
                  <p className="truncate text-sm">{a.bezeichnung} <span className="text-muted-foreground">· {anlageText(a)}</span></p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[anlageAdresse(a), a.naechste_pruefung && a.aktiv ? `nächste Prüfung ${datum(a.naechste_pruefung)}` : a.letzte_pruefung ? `zuletzt ${datum(a.letzte_pruefung)}` : "noch nie geprüft"]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AnlageDialog open={neu} onOpenChange={setNeu} anlage={null} onGespeichert={(a) => navigate(`/anlagen/${a.id}`)} />
      <ScanDialog open={scan} onOpenChange={setScan} onCode={codeGelesen} titel="Anlagen-Aufkleber scannen" />
    </Seite>
  );
}
