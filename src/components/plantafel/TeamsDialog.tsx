import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useTeams } from "@/hooks/useDaten";
import { GESCHAEFTSFUEHRUNG, gruppeVon } from "@/lib/terminplaner";
import { TEAM_FARBEN, name, type Team } from "@/lib/types";
import { cn } from "@/lib/utils";

type Entwurf = Pick<Team, "name" | "farbe" | "leiter_id" | "mitglieder" | "fahrzeug_id"> & { id: string | null; schluessel: string };

/**
 * Teams pflegen: Name, Farbe, wer dabei ist, welcher Bus. Eine Person kann
 * in mehreren Teams stehen — eingeteilt wird trotzdem flexibel je Einsatz.
 */
export function TeamsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const neuLaden = useNeuLaden();
  const { data: teams = [] } = useTeams();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const [liste, setListe] = useState<Entwurf[]>([]);
  const [basis, setBasis] = useState("");
  const [speichert, setSpeichert] = useState(false);
  /** Gruppe im Terminplaner je Person (für Leute ohne Team: Büro, Geschäftsführung …) */
  const [gruppen, setGruppen] = useState<Record<string, string>>({});
  const [gruppenBasis, setGruppenBasis] = useState("");
  const busse = fahrzeuge.filter((f) => f.art === "bus" || f.art === "pkw");

  useBeimOeffnen(open ? "offen" : null, () => {
    const l = teams.map((t) => ({ id: t.id, schluessel: t.id, name: t.name, farbe: t.farbe, leiter_id: t.leiter_id, mitglieder: t.mitglieder, fahrzeug_id: t.fahrzeug_id }));
    setListe(l);
    setBasis(JSON.stringify(l));
    const g = Object.fromEntries(mitarbeiter.map((m) => [m.id, m.gruppe ?? ""]));
    setGruppen(g);
    setGruppenBasis(JSON.stringify(g));
  });

  const aendern = (k: string, teil: Partial<Entwurf>) => setListe((l) => l.map((t) => (t.schluessel === k ? { ...t, ...teil } : t)));
  const freieFarbe = Object.keys(TEAM_FARBEN).find((f) => !liste.some((t) => t.farbe === f)) ?? "blau";

  const speichern = async () => {
    if (liste.some((t) => !t.name.trim())) return toast.error("Jedes Team braucht einen Namen.");
    setSpeichert(true);
    try {
      const weg = teams.filter((t) => !liste.some((x) => x.id === t.id)).map((t) => t.id);
      if (weg.length) {
        // nur ausblenden: alte Einsätze behalten ihr Team
        const { error } = await supabase.from("teams").update({ aktiv: false }).in("id", weg);
        if (error) throw error;
      }
      if (liste.length) {
        const { error } = await supabase.from("teams").upsert(liste.map((t, i) => ({
          id: t.id ?? crypto.randomUUID(), name: t.name.trim(), farbe: t.farbe,
          leiter_id: t.leiter_id && t.mitglieder.includes(t.leiter_id) ? t.leiter_id : t.mitglieder[0] ?? null,
          mitglieder: t.mitglieder, fahrzeug_id: t.fahrzeug_id, aktiv: true, reihenfolge: i,
        })), { onConflict: "id" });
        if (error) throw error;
      }
      for (const m of mitarbeiter) {
        const neu = gruppen[m.id]?.trim() || null;
        if (neu === (m.gruppe ?? null)) continue;
        const { error } = await supabase.from("profiles").update({ gruppe: neu }).eq("id", m.id);
        if (error) throw error;
      }
      await neuLaden("teams", "mitarbeiter");
      toast.success("Teams gespeichert");
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Teams" beschreibung="Wer arbeitet meistens zusammen, mit welchem Bus? Auf der Plantafel zieht ein Team seine Leute und seinen Bus mit."
      gesperrt={speichert} ungespeichert={JSON.stringify(liste) !== basis || JSON.stringify(gruppen) !== gruppenBasis}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-32" onClick={speichern} disabled={speichert}>{speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern</Button>
        </>
      )}>
      <div className="max-w-3xl space-y-3">
        {liste.map((t) => (
          <div key={t.schluessel} className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Teamname" className="h-11 flex-1 font-semibold" value={t.name} onChange={(e) => aendern(t.schluessel, { name: e.target.value })} placeholder="z. B. Team Max" />
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Team entfernen" onClick={() => setListe((l) => l.filter((x) => x.schluessel !== t.schluessel))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Farbe">
              {Object.entries(TEAM_FARBEN).map(([k, f]) => (
                <button key={k} type="button" role="radio" aria-checked={t.farbe === k} aria-label={f.text} onClick={() => aendern(t.schluessel, { farbe: k })}
                  className={cn("flex h-9 w-9 items-center justify-center rounded-full border", t.farbe === k && "ring-2 ring-primary ring-offset-2")}>
                  <span className={cn("h-5 w-5 rounded-full", f.punkt)} />
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Leute</Label>
              <div className="flex flex-wrap gap-1.5">
                {mitarbeiter.map((m) => {
                  const an = t.mitglieder.includes(m.id);
                  return (
                    <button key={m.id} type="button" aria-pressed={an}
                      onClick={() => aendern(t.schluessel, { mitglieder: an ? t.mitglieder.filter((x) => x !== m.id) : [...t.mitglieder, m.id] })}
                      className={cn("flex h-10 items-center gap-1.5 rounded-full border pl-1 pr-3 text-sm", an ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>
                      <Avatar profil={m} className={cn("h-7 w-7 text-[10px]", !an && "opacity-50")} />{m.vorname || m.nachname}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Bus</Label>
                <Select value={t.fahrzeug_id ?? "_"} onValueChange={(v) => aendern(t.schluessel, { fahrzeug_id: v === "_" ? null : v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">Kein fester Bus</SelectItem>
                    {busse.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}{f.kennzeichen ? ` · ${f.kennzeichen}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Partieführer</Label>
                <Select value={t.leiter_id && t.mitglieder.includes(t.leiter_id) ? t.leiter_id : "_"} onValueChange={(v) => aendern(t.schluessel, { leiter_id: v === "_" ? null : v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">Der Erste in der Liste</SelectItem>
                    {mitarbeiter.filter((m) => t.mitglieder.includes(m.id)).map((m) => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
        <Button variant="outline" className="h-12 w-full gap-1.5" onClick={() => setListe((l) => [...l, {
          id: null, schluessel: crypto.randomUUID(), name: "", farbe: freieFarbe, leiter_id: null, mitglieder: [], fahrzeug_id: null,
        }])}>
          <Plus className="h-4 w-4" /> Team dazu
        </Button>

        <section className="space-y-2 rounded-lg border bg-card p-3" aria-label="Gruppen im Terminplaner">
          <div>
            <p className="font-semibold">Gruppen im Terminplaner</p>
            <p className="text-sm text-muted-foreground">Spalten der Ansicht „Mitarbeiter“. Ohne Eintrag zählt das Team; wer in keinem steht, kommt als Chef in „{GESCHAEFTSFUEHRUNG}“, sonst in „Ohne Team“.</p>
          </div>
          <datalist id="tp-gruppen"><option value={GESCHAEFTSFUEHRUNG} /><option value="Büro" /><option value="Lager" /></datalist>
          <div className="grid gap-2 sm:grid-cols-2">
            {mitarbeiter.map((m) => {
              const teamsJetzt = liste.filter((t) => t.id).map((t) => ({ id: t.id!, name: t.name, mitglieder: t.mitglieder }));
              const auto = gruppeVon({ ...m, gruppe: null }, teamsJetzt).titel;
              return (
                <label key={m.id} className="flex items-center gap-2">
                  <Avatar profil={m} className="h-7 w-7 shrink-0 text-[10px]" />
                  <span className="w-28 shrink-0 truncate text-sm">{name(m)}</span>
                  <Input list="tp-gruppen" className="h-11 min-w-0 flex-1" value={gruppen[m.id] ?? ""} placeholder={auto} aria-label={`Gruppe von ${name(m)}`}
                    onChange={(e) => setGruppen((g) => ({ ...g, [m.id]: e.target.value }))} />
                </label>
              );
            })}
          </div>
        </section>
      </div>
    </FormularDialog>
  );
}
