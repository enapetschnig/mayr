import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FolderKanban, FolderPlus, Search } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leer, ListenZeile, ProjektStatusBadge } from "@/components/Bausteine";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { useIstPc } from "@/components/AppLayout";
import { useProjekte, useProjektZahlen, type ProjektMitKunde } from "@/hooks/useDaten";
import { stunden } from "@/lib/format";
import type { ProjektZahlen } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "laufend" | "aktiv" | "angebot" | "verrechnen" | "offen" | "abgeschlossen";

const FILTER: { wert: Filter; text: string }[] = [
  { wert: "laufend", text: "Laufend" },
  { wert: "aktiv", text: "In Arbeit" },
  { wert: "angebot", text: "Angebot" },
  { wert: "verrechnen", text: "Zu verrechnen" },
  { wert: "offen", text: "Nicht verrechnet" },
  { wert: "abgeschlossen", text: "Abgeschlossen" },
];

const hatOffenes = (z: ProjektZahlen | undefined) =>
  !!z && (Number(z.stunden_offen) > 0 || Number(z.material_offen_ek) > 0 || Number(z.regie_offen) > 0);

function passt(p: ProjektMitKunde, f: Filter, z: ProjektZahlen | undefined): boolean {
  if (f === "laufend") return p.status !== "abgeschlossen";
  if (f === "offen") return p.status !== "abgeschlossen" && hatOffenes(z);
  return p.status === f;
}

export default function Projekte() {
  const navigate = useNavigate();
  const pc = useIstPc();
  const [params, setParams] = useSearchParams();
  const { data: projekte = [], isLoading } = useProjekte();
  const { data: zahlen = {} } = useProjektZahlen();
  const [suche, setSuche] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);
  const filter = (FILTER.some((f) => f.wert === params.get("filter")) ? params.get("filter") : "laufend") as Filter;

  // ?neu=1 (z. B. von der Startseite am PC) öffnet gleich „Neues Projekt“
  useEffect(() => {
    if (params.get("neu") === "1") {
      setNeuOffen(true);
      params.delete("neu");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const liste = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return projekte.filter((p) => {
      if (!passt(p, filter, zahlen[p.id])) return false;
      if (!s) return true;
      return [p.nummer, p.name, p.kunden?.name, p.ort, p.strasse].some((x) => x?.toLowerCase().includes(s));
    });
  }, [projekte, zahlen, filter, suche]);

  const anzahl = (f: Filter) => projekte.filter((p) => passt(p, f, zahlen[p.id])).length;
  const filterSetzen = (f: Filter) => setParams(f === "laufend" ? {} : { filter: f }, { replace: true });

  return (
    <Seite titel="Projekte" zurueckPfad="/" breit
      aktionen={<Button onClick={() => setNeuOffen(true)} className="gap-1.5"><FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">Neues</span> Projekt</Button>}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTER.map((f) => {
          const n = anzahl(f.wert);
          if (f.wert === "offen" && n === 0 && filter !== "offen") return null;
          return (
            <button key={f.wert} type="button" onClick={() => filterSetzen(f.wert)} aria-pressed={filter === f.wert}
              className={cn("flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === f.wert ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
              {f.text} <span className="zahl text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 pl-9" placeholder="Nummer, Projekt, Kunde oder Ort" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Lädt…</p>
      ) : liste.length === 0 ? (
        <Leer icon={FolderKanban} text={suche ? "Nichts gefunden." : "Keine Projekte in dieser Ansicht."}>
          {!suche && <Button onClick={() => setNeuOffen(true)}>Projekt anlegen</Button>}
        </Leer>
      ) : pc ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Nr.</th>
                <th className="px-4 py-2.5 text-left font-medium">Projekt</th>
                <th className="px-4 py-2.5 text-left font-medium">Kunde</th>
                <th className="px-4 py-2.5 text-left font-medium">Ort</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Stunden</th>
                <th className="px-4 py-2.5 text-right font-medium">Nicht verrechnet</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {liste.map((p) => {
                const z = zahlen[p.id];
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/projekte/${p.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.nummer}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">{p.kunden?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.ort ?? "—"}</td>
                    <td className="px-4 py-3"><ProjektStatusBadge status={p.status} /></td>
                    <td className="zahl px-4 py-3 text-right">{z ? stunden(Number(z.stunden)) : "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground"><OffenText z={z} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {liste.map((p) => {
            const z = zahlen[p.id];
            return (
              <ListenZeile key={p.id} to={`/projekte/${p.id}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{p.nummer}</span>
                  <ProjektStatusBadge status={p.status} />
                </div>
                <p className="mt-0.5 truncate font-semibold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.kunden?.name, p.ort].filter(Boolean).join(" · ") || "Ohne Kunde"}
                  {z && Number(z.stunden) > 0 && <> · <span className="zahl">{stunden(Number(z.stunden))}</span></>}
                </p>
                {hatOffenes(z) && p.status !== "abgeschlossen" && <p className="mt-1 text-xs text-muted-foreground"><OffenText z={z} /></p>}
              </ListenZeile>
            );
          })}
        </div>
      )}

      <ProjektDialog open={neuOffen} onOpenChange={setNeuOffen} />
    </Seite>
  );
}

/** „12 h · 1 Regiebericht · Material“ — was am Projekt noch nicht verrechnet ist */
function OffenText({ z }: { z: ProjektZahlen | undefined }) {
  if (!hatOffenes(z)) return <>—</>;
  const teile = [
    Number(z!.stunden_offen) > 0 && stunden(Number(z!.stunden_offen)),
    Number(z!.regie_offen) > 0 && `${z!.regie_offen} ${Number(z!.regie_offen) === 1 ? "Regiebericht" : "Regieberichte"}`,
    Number(z!.material_offen_ek) > 0 && "Material",
  ].filter(Boolean);
  return <>{teile.join(" · ")}</>;
}
