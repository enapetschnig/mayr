import { useState } from "react";
import { Camera, Clock, FolderPlus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { MaterialDialog } from "@/components/dialoge/MaterialDialog";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";

/**
 * Die schnellsten Wege der App ganz oben — Vorbild Schrettl.
 *
 * Auf der Baustelle, mit einer Hand am Handy: Foto machen, Stunden
 * eintragen, Material buchen. Jeder Weg ist ein Tipp plus Projektwahl —
 * statt Startseite → Projekte → Projekt suchen → Reiter → Hochladen.
 */
export default function SchnellErfassung() {
  const [offen, setOffen] = useState<null | "foto" | "zeit" | "material" | "projekt">(null);
  const zu = (o: boolean) => { if (!o) setOffen(null); };

  return (
    <>
      <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-3 sm:p-4">
        <p className="mb-3 text-sm font-semibold">Schnell festhalten</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button
            size="lg"
            className="col-span-2 sm:col-span-1 h-auto flex-col gap-1.5 py-5 text-base shadow-sm"
            onClick={() => setOffen("foto")}
          >
            <Camera className="h-8 w-8" />
            <span className="text-base font-semibold">+ Foto</span>
          </Button>
          <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4 bg-background" onClick={() => setOffen("zeit")}>
            <Clock className="h-6 w-6 text-primary" />
            <span className="font-semibold">+ Stunden</span>
          </Button>
          <Button size="lg" variant="outline" className="h-auto flex-col gap-1.5 py-4 bg-background" onClick={() => setOffen("material")}>
            <Package className="h-6 w-6 text-primary" />
            <span className="font-semibold">+ Material</span>
          </Button>
          <Button size="lg" variant="outline" className="col-span-2 sm:col-span-1 h-auto flex-row sm:flex-col gap-2 py-3 sm:py-4 bg-background" onClick={() => setOffen("projekt")}>
            <FolderPlus className="h-6 w-6 text-primary" />
            <span className="font-semibold">+ Projekt</span>
          </Button>
        </div>
      </div>

      <FotoDialog open={offen === "foto"} onOpenChange={zu} />
      <ZeitDialog open={offen === "zeit"} onOpenChange={zu} />
      <MaterialDialog open={offen === "material"} onOpenChange={zu} />
      <ProjektDialog open={offen === "projekt"} onOpenChange={zu} />
    </>
  );
}
