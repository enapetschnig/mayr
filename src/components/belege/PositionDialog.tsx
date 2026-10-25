import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormularDialog } from "@/components/FormularDialog";
import { euro, zahl } from "@/lib/format";
import { EINHEITEN } from "@/lib/types";
import { ART_NAME, positionGesamt, type EditorPosition, type PositionsArt } from "./editor";

const ARTEN_WAEHLBAR: PositionsArt[] = ["leistung", "artikel", "arbeit", "material", "pauschale", "text"];

/** Eine Position ganz bearbeiten (oder frei anlegen): Texte, Menge, Einheit, Preis. */
export function PositionDialog({
  position, onOpenChange, onUebernehmen, onLoeschen, neu = false,
}: {
  position: EditorPosition | null;
  onOpenChange: (o: boolean) => void;
  onUebernehmen: (p: EditorPosition) => void;
  onLoeschen?: (id: string) => void;
  /** Freie Position, noch nicht in der Liste */
  neu?: boolean;
}) {
  const [p, setP] = useState<EditorPosition | null>(position);
  useEffect(() => { setP(position); }, [position]);
  if (!p) return null;

  const titel = p.art === "titel";
  const text = p.art === "text";
  const set = (werte: Partial<EditorPosition>) => setP({ ...p, ...werte });
  const einheiten = EINHEITEN.includes(p.einheit) ? EINHEITEN : [p.einheit, ...EINHEITEN];

  return (
    <FormularDialog
      open={!!position}
      onOpenChange={onOpenChange}
      titel={neu ? "Freie Position" : titel ? "Titel bearbeiten" : "Position bearbeiten"}
      beschreibung={neu ? "Text, Menge und Preis selbst eintragen" : titel ? "Raum oder Zwischenüberschrift" : ART_NAME[p.art]}
      fuss={(
        <>
          {!neu && onLoeschen && (
            <Button variant="ghost" className="h-12 text-destructive hover:text-destructive sm:mr-auto" onClick={() => onLoeschen(p.id)}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={neu && !p.bezeichnung.trim()} onClick={() => onUebernehmen(p)}>
            {neu ? "Hinzufügen" : "Übernehmen"}
          </Button>
        </>
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pos-bez">{titel ? "Name" : "Bezeichnung"}</Label>
        <Textarea id="pos-bez" rows={2} value={p.bezeichnung} onChange={(e) => set({ bezeichnung: e.target.value })} className="text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pos-lang">{titel ? "Beschreibung (optional)" : "Langtext (optional, steht klein darunter)"}</Label>
        <Textarea id="pos-lang" rows={4} value={p.langtext} onChange={(e) => set({ langtext: e.target.value })} />
      </div>

      {!titel && !text && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="pos-menge">Menge</Label>
              <Input id="pos-menge" inputMode="decimal" className="h-12 text-right zahl" value={p.menge} onChange={(e) => set({ menge: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Einheit</Label>
              <Select value={p.einheit} onValueChange={(v) => set({ einheit: v })}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{einheiten.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-ep">Einzelpreis netto €</Label>
              <Input id="pos-ep" inputMode="decimal" className="h-12 text-right zahl" value={p.einzelpreis} onChange={(e) => set({ einzelpreis: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Gesamt</Label>
              <div className="feld-berechnet flex h-12 items-center justify-end rounded-md border px-3 font-semibold zahl">{euro(positionGesamt(p))}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Art</Label>
            <Select value={p.art} onValueChange={(v) => set({ art: v as PositionsArt })}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>{ARTEN_WAEHLBAR.map((a) => <SelectItem key={a} value={a}>{ART_NAME[a]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {(p.minuten != null || p.ek_preis != null) && (
            <p className="text-xs text-muted-foreground">
              {p.minuten != null && <>Montagezeit {zahl(p.minuten)} min</>}
              {p.minuten != null && p.ek_preis != null && " · "}
              {p.ek_preis != null && <>Einsatz (EK) {euro(p.ek_preis)} je {p.einheit}</>}
            </p>
          )}
          {p.quelle && (
            <p className="text-xs text-muted-foreground">
              Aus dem Projekt übernommen — löschen gibt die Stunden und das Material wieder frei.
            </p>
          )}
        </>
      )}
    </FormularDialog>
  );
}
