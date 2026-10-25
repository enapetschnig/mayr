import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Loader2, Plus, Search, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

type NeuerKunde = Pick<Kunde, "name" | "strasse" | "plz" | "ort" | "telefon" | "email">;
const LEER: NeuerKunde = { name: "", strasse: "", plz: "", ort: "", telefon: "", email: "" };

/** Formularfelder eines Kunden — im Dialog „Neuer Kunde“ und auf der Kundenseite. */
export function KundeFelder({ wert, onChange }: { wert: NeuerKunde; onChange: (k: NeuerKunde) => void }) {
  const feld = (k: keyof NeuerKunde, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`k-${k}`}>{label}</Label>
      <Input id={`k-${k}`} className="h-11" value={wert[k] ?? ""} onChange={(e) => onChange({ ...wert, [k]: e.target.value })} {...props} />
    </div>
  );
  return (
    <div className="grid gap-3">
      {feld("name", "Name / Firma", { placeholder: "z. B. Familie Huber", autoFocus: true })}
      {feld("strasse", "Straße")}
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        {feld("plz", "PLZ", { inputMode: "numeric" })}
        {feld("ort", "Ort")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {feld("telefon", "Telefon", { inputMode: "tel", type: "tel" })}
        {feld("email", "E-Mail", { inputMode: "email", type: "email" })}
      </div>
    </div>
  );
}

/**
 * Kunde wählen oder gleich vor Ort neu anlegen. Ein Feld, ein Dialog —
 * kein Umweg über die Kundenliste.
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
  const neuLaden = useNeuLaden();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [neu, setNeu] = useState<NeuerKunde | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const gewaehlt = kunden.find((k) => k.id === wert);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return kunden.slice(0, 50);
    return kunden.filter((k) => `${k.name} ${k.ort ?? ""} ${k.strasse ?? ""} ${k.nummer}`.toLowerCase().includes(q)).slice(0, 50);
  }, [kunden, suche]);

  const anlegen = async () => {
    if (!neu?.name.trim()) return toast.error("Bitte einen Namen eingeben");
    setSpeichert(true);
    const { data, error } = await supabase.from("kunden").insert({
      name: neu.name.trim(),
      strasse: neu.strasse?.trim() || null,
      plz: neu.plz?.trim() || null,
      ort: neu.ort?.trim() || null,
      telefon: neu.telefon?.trim() || null,
      email: neu.email?.trim() || null,
    }).select().single();
    setSpeichert(false);
    if (error) return toast.error(error.message);
    await neuLaden("kunden");
    onChange(data);
    setNeu(null);
    setOffen(false);
    toast.success("Kunde angelegt");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setSuche(""); setNeu(null); setOffen(true); }}
        className={cn("flex h-12 w-full items-center gap-3 rounded-md border bg-background px-3 text-left transition-colors hover:bg-muted/50", className)}
      >
        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !gewaehlt && "text-muted-foreground")}>
          {gewaehlt ? <>{gewaehlt.name}{gewaehlt.ort && <span className="text-muted-foreground"> · {gewaehlt.ort}</span>}</> : "Kunde wählen oder neu anlegen"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogTitle>{neu ? "Neuer Kunde" : "Kunde wählen"}</DialogTitle>
          <DialogDescription className="sr-only">Kunde suchen oder neu anlegen</DialogDescription>
          {neu ? (
            <div className="space-y-4">
              <KundeFelder wert={neu} onChange={setNeu} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setNeu(null)} disabled={speichert}>Zurück</Button>
                <Button onClick={anlegen} disabled={speichert} className="gap-2">
                  {speichert && <Loader2 className="h-4 w-4 animate-spin" />}Anlegen
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Button variant="secondary" className="w-full h-12 gap-2 justify-start" onClick={() => setNeu({ ...LEER, name: suche })}>
                <Plus className="h-4 w-4" /> Neuer Kunde{suche.trim() && <span className="truncate">: „{suche.trim()}“</span>}
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name oder Ort suchen" className="h-11 pl-9" autoFocus />
              </div>
              <div className="divide-y rounded-xl border">
                {treffer.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Kein Kunde gefunden</p>}
                {treffer.map((k) => (
                  <button key={k.id} type="button" onClick={() => { onChange(k); setOffen(false); }}
                    className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60", k.id === wert && "bg-primary/5")}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{[k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">K{k.nummer}</span>
                  </button>
                ))}
              </div>
              {wert && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { onChange(null); setOffen(false); }}>Keinen Kunden zuordnen</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
