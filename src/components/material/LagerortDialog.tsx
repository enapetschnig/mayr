import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Truck, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { name, type Lagerort } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fehlerText } from "./materialDaten";

type Art = "lager" | "fahrzeug";

/**
 * Lagerort anlegen oder ändern (nur Chef — RLS sperrt den Rest).
 * Ein Fahrzeug gehört einem Mitarbeiter: dessen Scanner schlägt beim
 * Ausfassen automatisch „seinen“ Bus vor. Gelöscht wird nie — Buchungen
 * hängen dran —, nur stillgelegt.
 */
export function LagerortDialog({
  open, onOpenChange, ort, reihenfolgeNeu, artikelMitBestand,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = neu */
  ort: Lagerort | null;
  reihenfolgeNeu: number;
  /** wie viele Artikel dort laut App noch liegen (Warnung beim Stilllegen) */
  artikelMitBestand: number;
}) {
  const neuLaden = useNeuLaden();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [bezeichnung, setBezeichnung] = useState("");
  const [art, setArt] = useState<Art>("lager");
  const [userId, setUserId] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [stilllegenFrage, setStilllegenFrage] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBezeichnung(ort?.name ?? "");
    setArt(ort?.art === "fahrzeug" ? "fahrzeug" : "lager");
    setUserId(ort?.user_id ?? "");
    setStilllegenFrage(false);
  }, [open, ort]);

  const speichern = async (aktiv = ort?.aktiv ?? true) => {
    const n = bezeichnung.trim();
    if (!n) return toast.error("Bitte einen Namen eingeben.");
    setSpeichert(true);
    const daten = { name: n, art, user_id: art === "fahrzeug" && userId ? userId : null, aktiv };
    const { error } = ort
      ? await supabase.from("lagerorte").update(daten).eq("id", ort.id)
      : await supabase.from("lagerorte").insert({ ...daten, reihenfolge: reihenfolgeNeu });
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(!ort ? "Lagerort angelegt" : aktiv !== ort.aktiv ? (aktiv ? "Wieder in Betrieb" : "Stillgelegt") : "Gespeichert", { description: n });
    await neuLaden("lagerorte", "lager", "material");
    onOpenChange(false);
  };

  const fahrer = mitarbeiter.find((m) => m.id === userId);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={ort ? "Lagerort bearbeiten" : "Neuer Lagerort"}
      gesperrt={speichert}
      fuss={
        <>
          {ort && (
            ort.aktiv ? (
              <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" disabled={speichert}
                onClick={() => (artikelMitBestand > 0 && !stilllegenFrage ? setStilllegenFrage(true) : void speichern(false))}>
                {stilllegenFrage ? "Trotzdem stilllegen" : "Stilllegen"}
              </Button>
            ) : (
              <Button variant="ghost" className="h-11 sm:mr-auto" disabled={speichert} onClick={() => void speichern(true)}>
                Wieder in Betrieb nehmen
              </Button>
            )
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={() => void speichern()} disabled={speichert || !bezeichnung.trim()}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ort ? "Speichern" : "Anlegen"}
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {ort && !ort.aktiv && (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            Stillgelegt — erscheint nicht mehr beim Scannen und zählt nicht zum Bestand.
          </p>
        )}
        {stilllegenFrage && (
          <p className="rounded-md border border-status-gelb bg-status-gelb p-3 text-sm text-status-gelb-fg">
            Dort liegen laut App noch {artikelMitBestand === 1 ? "ein Artikel" : `${artikelMitBestand} Artikel`}. Nach dem
            Stilllegen zählt dieser Bestand nicht mehr mit — besser vorher per Inventur auf 0 setzen.
          </p>
        )}

        <div className="space-y-2">
          <Label>Art</Label>
          <div className="grid grid-cols-2 gap-2">
            {([["lager", "Lager", Warehouse], ["fahrzeug", "Fahrzeug", Truck]] as const).map(([wert, text, Icon]) => (
              <button key={wert} type="button" onClick={() => setArt(wert)} aria-pressed={art === wert}
                className={cn("flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors",
                  art === wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                <Icon className="h-4 w-4" /> {text}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lo-name">Name</Label>
          <Input id="lo-name" className="h-12" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
            placeholder={art === "fahrzeug" ? "z. B. Bus 3 · Stefan" : "z. B. Hauptlager"} autoFocus={!ort} />
        </div>

        {art === "fahrzeug" && (
          <div className="space-y-2">
            <Label htmlFor="lo-fahrer">Wer fährt den Bus?</Label>
            <Select value={userId || "niemand"} onValueChange={(v) => setUserId(v === "niemand" ? "" : v)}>
              <SelectTrigger id="lo-fahrer" className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="niemand">Niemandem zugeteilt</SelectItem>
                {mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{name(m)}</SelectItem>)}
                {userId && !fahrer && <SelectItem value={userId}>Nicht mehr aktiv</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Beim Ausfassen und Zurückgeben schlägt die App diesem Mitarbeiter seinen Bus vor.
            </p>
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
