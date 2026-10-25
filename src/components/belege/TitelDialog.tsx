import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { RAUM_VORSCHLAEGE } from "@/lib/sprachParser";
import { freierTitelName, type EditorPosition } from "./editor";

/**
 * Raum oder Zwischenüberschrift anlegen. Schnellwahl der üblichen Räume;
 * gibt es den Raum schon, wird durchnummeriert („Kinderzimmer 2“).
 */
export function TitelDialog({
  open, onOpenChange, positionen, onAnlegen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  positionen: EditorPosition[];
  onAnlegen: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(""); }, [open]);

  const anlegen = (n: string) => {
    if (!n.trim()) return;
    onAnlegen(freierTitelName(positionen, n.trim()));
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Raum / Titel"
      beschreibung="Neue Positionen landen danach unter diesem Titel."
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!name.trim()} onClick={() => anlegen(name)}>Anlegen</Button>
        </>
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="titel-name">Name</Label>
        <Input
          id="titel-name"
          className="h-12"
          value={name}
          autoFocus
          placeholder="z. B. Küche, Verteiler, Außenbereich"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") anlegen(name); }}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Schnellwahl</p>
        <div className="flex flex-wrap gap-2">
          {RAUM_VORSCHLAEGE.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => anlegen(r)}
              className="h-11 rounded-full border bg-card px-4 text-sm font-medium transition-colors hover:border-primary/60 active:bg-primary-soft"
            >
              {freierTitelName(positionen, r)}
            </button>
          ))}
        </div>
      </div>
    </FormularDialog>
  );
}
