import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Strichcode lesen — Kamera am Handy, Code eintippen als Rückfall.
 *
 * SCHNITTSTELLE (bleibt stabil, andere Module bauen darauf):
 *   open / onOpenChange  wie jeder Dialog
 *   onCode(code)         jeder gelesene Code (EAN-13/8, Code 128 …), getrimmt
 *   dauerhaft            true = nach einem Treffer weiterscannen (Serienscan),
 *                        false = nach dem ersten Code schließen
 *   titel                Überschrift, z. B. „Material ausfassen“
 *
 * Platzhalter-Fassung: nur Eintippen. Die Kamera-Erkennung kommt aus dem
 * Lager-/Scanner-Modul (components/scanner/).
 */
export function ScanDialog({
  open,
  onOpenChange,
  onCode,
  dauerhaft = false,
  titel = "Strichcode scannen",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCode: (code: string) => void;
  dauerhaft?: boolean;
  titel?: string;
}) {
  const [code, setCode] = useState("");
  const senden = () => {
    const c = code.trim();
    if (!c) return;
    onCode(c);
    setCode("");
    if (!dauerhaft) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{titel}</DialogTitle>
        <DialogDescription>Code eintippen</DialogDescription>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" className="h-12 text-lg"
            onKeyDown={(e) => e.key === "Enter" && senden()} autoFocus />
          <Button onClick={senden} className="h-12 gap-2"><Keyboard className="h-4 w-4" />OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
