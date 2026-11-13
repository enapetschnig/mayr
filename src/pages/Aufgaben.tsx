import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListTodo, Plus } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Avatar, Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { AufgabeDialog } from "@/components/aufgaben/AufgabeDialog";
import { AufgabeDetail } from "@/components/aufgaben/AufgabeDetail";
import { AufgabenListe } from "@/components/aufgaben/AufgabenListe";
import { useAufgaben, type AufgabeMitInfo } from "@/components/aufgaben/aufgabenDaten";
import { useMitarbeiter } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { filtern, sortieren, zaehlen, type AufgabenFilter } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_FILTER: AufgabenFilter[] = ["offen", "ueberfaellig", "erledigt", "alle"];

/**
 * Aufgaben: der Chef sieht alle (Filter offen/überfällig/je Person/je
 * Projekt), ein Mitarbeiter die ihm zugewiesenen und selbst angelegten.
 * Kennzahlen oben sind zugleich Filter (wie bei Angeboten/Rechnungen).
 */
export default function Aufgaben() {
  const { profil, istChef } = useSitzung();
  const [params, setParams] = useSearchParams();
  const { data: aufgaben = [], isLoading } = useAufgaben();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [gewaehlt, setGewaehlt] = useState<AufgabeMitInfo | null>(null);
  const [neu, setNeu] = useState(false);
  const heute = isoTag();

  const status = (STATUS_FILTER.find((s) => s === params.get("filter")) ?? "offen") as AufgabenFilter;
  const person = params.get("person");
  const projekt = params.get("projekt");
  const setzen = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const z = zaehlen(aufgaben, heute);
  const liste = useMemo(() => sortieren(filtern(aufgaben, { status, person, projekt }, heute), heute), [aufgaben, status, person, projekt, heute]);
  // Projekte, zu denen es Aufgaben gibt
  const projekte = [...new Map(aufgaben.filter((a) => a.projekte).map((a) => [a.projekt_id!, a.projekte!])).entries()];
  const offenJe = (id: string) => aufgaben.filter((a) => a.status !== "erledigt" && a.zustaendig.includes(id)).length;
  const leute = istChef ? mitarbeiter : mitarbeiter.filter((m) => m.id === profil?.id);

  const kachel = (s: AufgabenFilter, titel: string, wert: number, warn = false) => (
    <button type="button" onClick={() => setzen("filter", s === "offen" ? null : s)} aria-pressed={status === s}
      className={cn("rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50",
        status === s && "border-primary ring-1 ring-primary", warn && wert > 0 && "border-status-rot bg-status-rot/30")}>
      <span className="block text-xs font-medium text-muted-foreground">{titel}</span>
      <span className={cn("zahl block text-xl font-bold", warn && wert > 0 && "text-status-rot-fg")}>{wert}</span>
    </button>
  );
  const chip = (an: boolean) => cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted");

  return (
    <Seite titel="Aufgaben" untertitel={istChef ? "Alle Aufgaben im Betrieb" : "Meine und von mir angelegte"}
      aktionen={<Button onClick={() => setNeu(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Aufgabe</Button>}>
      <div className="grid grid-cols-4 gap-2">
        {kachel("offen", "Offen", z.offen)}
        {kachel("ueberfaellig", "Überfällig", z.ueberfaellig, true)}
        {kachel("erledigt", "Erledigt", z.erledigt)}
        {kachel("alle", "Alle", aufgaben.length)}
      </div>

      {istChef && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Person">
          <button type="button" className={chip(!person)} onClick={() => setzen("person", null)}>Alle</button>
          {leute.map((m) => (
            <button key={m.id} type="button" className={cn(chip(person === m.id), "pl-1.5")} aria-pressed={person === m.id}
              onClick={() => setzen("person", person === m.id ? null : m.id)}>
              <Avatar profil={m} className="h-7 w-7 text-[11px]" /> {m.vorname}
              {offenJe(m.id) > 0 && <span className="zahl text-xs text-muted-foreground">{offenJe(m.id)}</span>}
            </button>
          ))}
          <button type="button" className={chip(person === "-")} onClick={() => setzen("person", person === "-" ? null : "-")}>Niemand zugeteilt</button>
        </div>
      )}

      {projekte.length > 0 && (
        <select aria-label="Projekt" value={projekt ?? ""} onChange={(e) => setzen("projekt", e.target.value || null)}
          className="h-11 w-full rounded-md border border-input bg-background px-2 text-base sm:w-80 md:[@media(pointer:fine)]:text-sm">
          <option value="">Alle Projekte</option>
          {projekte.map(([id, p]) => <option key={id} value={id}>{p.nummer} {p.name}</option>)}
        </select>
      )}

      {!isLoading && liste.length === 0 ? (
        <Leer icon={ListTodo} text={status === "ueberfaellig" ? "Nichts überfällig." : status === "erledigt" ? "In den letzten 90 Tagen nichts erledigt." : "Keine offenen Aufgaben."}>
          <Button onClick={() => setNeu(true)} className="gap-2"><Plus className="h-4 w-4" /> Aufgabe anlegen</Button>
        </Leer>
      ) : (
        <AufgabenListe aufgaben={liste} onWahl={setGewaehlt} />
      )}

      <AufgabeDetail aufgabe={gewaehlt} onOpenChange={(o) => !o && setGewaehlt(null)} />
      <AufgabeDialog open={neu} onOpenChange={setNeu} />
    </Seite>
  );
}
