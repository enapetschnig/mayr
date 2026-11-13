import { Avatar } from "@/components/Bausteine";
import type { Profil, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Eine oder mehrere Personen antippen — Chips mit Kürzel. Ein Team-Chip
 * wählt alle Mitglieder auf einmal (noch einmal tippen: wieder ab).
 * Für Aufgaben (zuständig) und Stunden für mehrere buchen.
 */
export function PersonenWahl({
  personen, teams = [], gewaehlt, onChange, ich, einzeln = false, label = "Personen",
}: {
  personen: Pick<Profil, "id" | "vorname" | "nachname" | "farbe">[];
  teams?: Pick<Team, "id" | "name" | "mitglieder">[];
  gewaehlt: string[];
  onChange: (ids: string[]) => void;
  ich?: string;
  /** nur eine Person (Bearbeiten einer Buchung) */
  einzeln?: boolean;
  label?: string;
}) {
  const ids = new Set(personen.map((p) => p.id));
  const umschalten = (id: string) => onChange(einzeln ? [id] : gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]);
  const teamGanz = (t: Pick<Team, "mitglieder">) => {
    const m = t.mitglieder.filter((x) => ids.has(x));
    return m.length > 0 && m.every((x) => gewaehlt.includes(x));
  };
  const teamUmschalten = (t: Pick<Team, "mitglieder">) => {
    const m = t.mitglieder.filter((x) => ids.has(x));
    onChange(teamGanz(t) ? gewaehlt.filter((x) => !m.includes(x)) : [...new Set([...gewaehlt, ...m])]);
  };
  const chip = (an: boolean) => cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted");
  const sichtbareTeams = einzeln ? [] : teams.filter((t) => t.mitglieder.filter((x) => ids.has(x)).length > 1);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {sichtbareTeams.map((t) => (
        <button key={t.id} type="button" className={chip(teamGanz(t))} aria-pressed={teamGanz(t)} onClick={() => teamUmschalten(t)}>
          Team {t.name}
        </button>
      ))}
      {personen.map((p) => {
        const an = gewaehlt.includes(p.id);
        return (
          <button key={p.id} type="button" className={cn(chip(an), "pl-1.5")} aria-pressed={an} onClick={() => umschalten(p.id)}>
            <Avatar profil={p} className="h-7 w-7 text-[11px]" />
            {p.vorname || p.nachname}{p.id === ich ? " (ich)" : ""}
          </button>
        );
      })}
    </div>
  );
}
