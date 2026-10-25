import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjekte, type ProjektMitKunde } from "@/hooks/useDaten";

/**
 * Auswahl eines Projekts — mit Projektnummer vorn, damit man am Handy auch
 * bei zwei „Huber“-Baustellen sofort die richtige trifft.
 * Standard: nur laufende Projekte (In Arbeit, Angebot, Zu verrechnen).
 */
export function ProjektWahl({
  wert,
  onChange,
  id,
  leerText = "Projekt wählen",
  mitAbgeschlossenen = false,
}: {
  wert: string;
  onChange: (id: string, projekt?: ProjektMitKunde) => void;
  id?: string;
  leerText?: string;
  mitAbgeschlossenen?: boolean;
}) {
  const { data: projekte = [] } = useProjekte();
  const liste = projekte.filter((p) => mitAbgeschlossenen || p.status !== "abgeschlossen" || p.id === wert);

  return (
    <Select value={wert} onValueChange={(v) => onChange(v, projekte.find((p) => p.id === v))}>
      <SelectTrigger id={id} className="h-12 text-left">
        <SelectValue placeholder={liste.length ? leerText : "Noch kein Projekt angelegt"} />
      </SelectTrigger>
      <SelectContent>
        {liste.map((p) => (
          <SelectItem key={p.id} value={p.id} className="py-2.5">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-xs text-muted-foreground shrink-0">{p.nummer}</span>
              <span className="truncate font-medium">{p.name}</span>
              {(p.kunden?.name || p.ort) && (
                <span className="text-xs text-muted-foreground truncate">· {p.kunden?.name ?? p.ort}</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
