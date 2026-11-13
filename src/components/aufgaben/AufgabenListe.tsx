import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, StatusPille } from "@/components/Bausteine";
import { fehlerText } from "@/components/stamm/stammDaten";
import type { AufgabeMitInfo } from "@/components/aufgaben/aufgabenDaten";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { anzeigeStatus, faelligText, istErledigt, PRIORITAET } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";
import { AUFGABE_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Aufgaben als Liste: links der Haken zum Abhaken (ein Tipp, wieder ein
 * Tipp = offen), Mitte Titel und Fälligkeit, rechts die Zuständigen.
 */
export function AufgabenListe({
  aufgaben, onWahl, mitPersonen = true, mitProjekt = true,
}: {
  aufgaben: AufgabeMitInfo[];
  onWahl: (a: AufgabeMitInfo) => void;
  mitPersonen?: boolean;
  mitProjekt?: boolean;
}) {
  const neuLaden = useNeuLaden();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const heute = isoTag();

  const abhaken = async (a: AufgabeMitInfo) => {
    setLaeuft(a.id);
    const neu = istErledigt(a) ? "offen" : "erledigt";
    const { data, error } = await supabase.from("aufgaben").update({ status: neu }).eq("id", a.id).select("id");
    setLaeuft(null);
    if (error) return toast.error("Nicht geändert", { description: fehlerText(error) });
    if (!data?.length) return toast.error("Nicht geändert — die Aufgabe ist dir nicht zugewiesen.");
    if (neu === "erledigt") toast.success(`Erledigt: ${a.titel}`, a.wiederholung ? { description: "Die nächste Runde ist angelegt." } : undefined);
    await neuLaden("aufgaben");
  };

  return (
    <ul className="divide-y rounded-lg border bg-card" data-aufgaben>
      {aufgaben.map((a) => {
        const st = anzeigeStatus(a, heute);
        const fertig = istErledigt(a);
        const leute = mitarbeiter.filter((m) => a.zustaendig.includes(m.id));
        return (
          <li key={a.id} className="flex items-center gap-1 pr-2" data-aufgabe={a.titel}>
            <button type="button" onClick={() => void abhaken(a)} disabled={laeuft === a.id}
              aria-label={fertig ? `${a.titel}: wieder öffnen` : `${a.titel}: erledigt`}
              className="flex h-14 w-12 shrink-0 items-center justify-center">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                fertig ? "border-status-gruen-fg bg-status-gruen text-status-gruen-fg" : "border-muted-foreground/50 hover:border-primary",
                laeuft === a.id && "animate-pulse")}>
                {fertig && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
            <button type="button" onClick={() => onWahl(a)} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", fertig && "text-muted-foreground line-through")}>{a.titel}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {st === "ueberfaellig" && <StatusPille eintrag={AUFGABE_STATUS.ueberfaellig} />}
                  {st === "in_arbeit" && <StatusPille eintrag={AUFGABE_STATUS.in_arbeit} />}
                  {a.prioritaet === "hoch" && !fertig && <StatusPille eintrag={PRIORITAET.hoch} />}
                  <span className={cn(st === "ueberfaellig" && "font-medium text-status-rot-fg")}>{fertig ? "erledigt" : faelligText(a.faellig_am, heute)}</span>
                  {a.wiederholung && <Repeat className="h-3 w-3" aria-label="wiederkehrend" />}
                  {mitProjekt && a.projekte && <span className="truncate">· {a.projekte.nummer} {a.projekte.name}</span>}
                  {mitProjekt && !a.projekte && a.kunden && <span className="truncate">· {a.kunden.name}</span>}
                </span>
              </span>
              {mitPersonen && leute.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5">
                  {leute.slice(0, 3).map((m) => <Avatar key={m.id} profil={m} className="h-7 w-7 border-2 border-card text-[10px]" />)}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
