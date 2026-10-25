import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, UserRound } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { KundeDialog } from "@/components/stamm/KundeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKunden } from "@/hooks/useDaten";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Alle Wörter müssen vorkommen — Name, Ort, Straße, Nummer, UID */
export function kundePasst(k: Pick<Kunde, "name" | "ort" | "strasse" | "nummer" | "uid">, suche: string): boolean {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = [k.name, k.ort, k.strasse, `k${k.nummer}`, k.uid].filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

/**
 * Kunde wählen oder gleich vor Ort neu anlegen — ein Feld, kein Umweg über
 * die Kundenliste. Beides als Vollbild: am Handy hat die Liste neben der
 * Tastatur sonst keinen Platz, und „Neuer Kunde“ ist dasselbe Formular wie
 * in der Kundenliste (mit Prüfung der E-Mail und Hinweis auf Doppelte).
 */
export function KundeWahl({
  wert,
  onChange,
  className,
}: {
  wert: string | null | undefined;
  onChange: (kunde: Kunde | null) => void;
  className?: string;
}) {
  const { data: kunden = [] } = useKunden();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  /** Name für „Neuer Kunde“ — null: Formular zu */
  const [neuName, setNeuName] = useState<string | null>(null);
  const gewaehlt = kunden.find((k) => k.id === wert);

  const treffer = useMemo(() => kunden.filter((k) => kundePasst(k, suche)).slice(0, 50), [kunden, suche]);

  const waehlen = (k: Kunde | null) => {
    onChange(k);
    setOffen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setSuche(""); setOffen(true); }}
        className={cn("flex h-12 w-full items-center gap-3 rounded-md border bg-background px-3 text-left transition-colors hover:bg-muted/50", className)}
      >
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !gewaehlt && "text-muted-foreground")}>
          {gewaehlt ? <>{gewaehlt.name}{gewaehlt.ort && <span className="text-muted-foreground"> · {gewaehlt.ort}</span>}</> : "Kunde wählen oder neu anlegen"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <FormularDialog
        open={offen}
        onOpenChange={setOffen}
        titel="Kunde wählen"
        fuss={wert ? <Button variant="outline" className="h-11" onClick={() => waehlen(null)}>Keinen Kunden zuordnen</Button> : undefined}
      >
        <div className="max-w-xl space-y-3">
          <Button variant="secondary" className="h-12 w-full justify-start gap-2"
            onClick={() => { setOffen(false); setNeuName(suche.trim()); }}>
            <Plus className="h-4 w-4" /> Neuer Kunde{suche.trim() && <span className="truncate">: „{suche.trim()}“</span>}
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name, Ort oder UID suchen" className="h-12 pl-9"
              inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Kunden suchen" autoFocus />
          </div>
          <div className="divide-y rounded-lg border bg-card">
            {treffer.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Kein Kunde gefunden</p>}
            {treffer.map((k) => (
              <button key={k.id} type="button" onClick={() => waehlen(k)}
                className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60", k.id === wert && "bg-primary-soft")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">K{k.nummer}</span>
              </button>
            ))}
          </div>
        </div>
      </FormularDialog>

      <KundeDialog open={neuName !== null} onOpenChange={(o) => { if (!o) setNeuName(null); }} kunde={null}
        vorgabeName={neuName ?? ""} onGespeichert={(k) => onChange(k)} />
    </>
  );
}
