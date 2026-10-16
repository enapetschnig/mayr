import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FolderKanban, FolderPlus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FirmaBadge, Leer, SichtbarkeitBadge } from "@/components/Bausteine";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { rolleVon, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { cn } from "@/lib/utils";

type Filter = "alle" | "gemeinsam" | "privat" | "abgeschlossen";

export default function Projekte() {
  const navigate = useNavigate();
  const { firma, firmaVon } = useSitzung();
  const { data: projekte = [], isLoading } = useProjekte();
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);

  const liste = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return projekte.filter((p) => {
      if (filter === "abgeschlossen" ? p.status !== "abgeschlossen" : p.status === "abgeschlossen") return false;
      if (filter === "gemeinsam" && p.sichtbarkeit !== "gemeinsam") return false;
      if (filter === "privat" && p.sichtbarkeit !== "privat") return false;
      if (!s) return true;
      return [p.name, p.kunde_name, p.ort, p.adresse].some((x) => x?.toLowerCase().includes(s));
    });
  }, [projekte, filter, suche]);

  const zaehler = (f: Filter) => projekte.filter((p) =>
    f === "abgeschlossen" ? p.status === "abgeschlossen"
      : p.status === "aktiv" && (f === "alle" || p.sichtbarkeit === f)).length;

  const FILTER: [Filter, string][] = [["alle", "Alle"], ["gemeinsam", "Gemeinsam"], ["privat", "Nur ich"], ["abgeschlossen", "Abgeschlossen"]];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Projekte" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex rounded-lg border overflow-x-auto w-full sm:w-fit">
            {FILTER.map(([f, text], i) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("flex-1 sm:flex-none whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors", i > 0 && "border-l",
                  filter === f ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {text} <span className="opacity-70">({zaehler(f)})</span>
              </button>
            ))}
          </div>
          <Button onClick={() => setNeuOffen(true)} className="gap-2">
            <FolderPlus className="h-4 w-4" /> Neues Projekt
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-11" placeholder="Projekt, Kunde oder Ort suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt…</p>
        ) : liste.length === 0 ? (
          <Leer icon={FolderKanban} text={suche ? "Nichts gefunden." : "Hier gibt es noch keine Projekte."}>
            {!suche && <Button onClick={() => setNeuOffen(true)}>Erstes Projekt anlegen</Button>}
          </Leer>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liste.map((p) => {
              const rolle = rolleVon(p, firma?.id);
              const fremd = p.firma_id !== firma?.id;
              return (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-all hover:border-primary/50" onClick={() => navigate(`/projekte/${p.id}`)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {p.sichtbarkeit === "gemeinsam" ? <Users className="h-5 w-5 text-primary" /> : <FolderKanban className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[p.kunde_name, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Keine Kundendaten"}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SichtbarkeitBadge wert={p.sichtbarkeit} />
                      {rolle && <Badge variant={rolle === "GU" ? "default" : "secondary"} className="text-xs">{rolle === "GU" ? "Ich bin GU" : "Ich bin SU"}</Badge>}
                      {fremd && <FirmaBadge firma={firmaVon(p.firma_id)} />}
                      {p.status === "abgeschlossen" && <Badge variant="outline" className="text-xs">Abgeschlossen</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <ProjektDialog open={neuOffen} onOpenChange={setNeuOffen} />
    </div>
  );
}
