import { Lock, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjekte, type ProjektMitRollen } from "@/hooks/useDaten";

/** Auswahl eines aktiven Projekts — mit Kennzeichnung "für alle" / "nur ich". */
export function ProjektWahl({
  wert,
  onChange,
  id,
  leerText = "Projekt wählen",
  mitAbgeschlossenen = false,
}: {
  wert: string;
  onChange: (id: string, projekt?: ProjektMitRollen) => void;
  id?: string;
  leerText?: string;
  mitAbgeschlossenen?: boolean;
}) {
  const { data: projekte = [] } = useProjekte();
  const liste = projekte.filter((p) => mitAbgeschlossenen || p.status === "aktiv" || p.id === wert);

  return (
    <Select value={wert} onValueChange={(v) => onChange(v, projekte.find((p) => p.id === v))}>
      <SelectTrigger id={id} className="h-11">
        <SelectValue placeholder={liste.length ? leerText : "Noch kein Projekt angelegt"} />
      </SelectTrigger>
      <SelectContent>
        {liste.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-2">
              {p.sichtbarkeit === "gemeinsam"
                ? <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                : <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="truncate">{p.name}</span>
              {p.ort && <span className="text-xs text-muted-foreground">· {p.ort}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
