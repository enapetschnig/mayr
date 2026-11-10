import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusPille } from "@/components/Bausteine";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { PROJEKT_STATUS, type ProjektStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const HILFE: Record<ProjektStatus, string> = {
  angebot: "noch nicht beauftragt",
  aktiv: "Stunden, Material, Regie buchbar",
  verrechnen: "fertig — nichts mehr buchen",
  abgeschlossen: "verrechnet und erledigt",
};

/**
 * Status als Pille, die man antippt und gleich umstellt — auf der Projektkachel,
 * in der Liste und im Projekt. Der Chef darf alle Stufen, Monteure nur
 * „In Arbeit“ ↔ „Zu verrechnen“. Gebucht wird nur bei „In Arbeit“.
 */
export function ProjektStatusWahl({ projekt, className }: { projekt: { id: string; status: string; nummer?: string }; className?: string }) {
  const { istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const jetzt = projekt.status as ProjektStatus;
  const erlaubt: ProjektStatus[] = istChef ? (Object.keys(PROJEKT_STATUS) as ProjektStatus[]) : jetzt === "abgeschlossen" ? [] : ["aktiv", "verrechnen"];

  const setzen = async (s: ProjektStatus) => {
    const { error } = await supabase.from("projekte").update({ status: s }).eq("id", projekt.id);
    if (error) return toast.error("Nicht geändert", { description: fehlerText(error) });
    toast.success(`${projekt.nummer ? `${projekt.nummer}: ` : ""}${PROJEKT_STATUS[s].text}`, {
      action: { label: "Rückgängig", onClick: () => void supabase.from("projekte").update({ status: jetzt }).eq("id", projekt.id).then(() => neuLaden("projekte")) },
    });
    await neuLaden("projekte");
  };

  if (!erlaubt.length) return <StatusPille eintrag={PROJEKT_STATUS[jetzt]} className={className} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Status: ${PROJEKT_STATUS[jetzt]?.text ?? jetzt} — ändern`} data-status-wahl
          onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
          className={cn("-m-1.5 inline-flex shrink-0 items-center rounded-full p-1.5 hover:bg-muted", className)}>
          <StatusPille eintrag={PROJEKT_STATUS[jetzt] ?? { ton: "grau", text: jetzt }} className="pr-1" />
          <ChevronDown className="-ml-0.5 h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Status ändern</DropdownMenuLabel>
        {erlaubt.map((s) => (
          <DropdownMenuItem key={s} disabled={jetzt === s} onSelect={() => void setzen(s)} className="flex items-center justify-between gap-2 py-2">
            <StatusPille eintrag={PROJEKT_STATUS[s]} />
            <span className="text-xs text-muted-foreground">{HILFE[s]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
