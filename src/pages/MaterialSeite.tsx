import { useState } from "react";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { MaterialDialog } from "@/components/dialoge/MaterialDialog";
import { MaterialListe } from "@/components/Buchungslisten";
import { ProjektWahl } from "@/components/ProjektWahl";

/** Alle eigenen Materialbuchungen, wahlweise auf ein Projekt gefiltert. */
export default function MaterialSeite() {
  const [offen, setOffen] = useState(false);
  const [projektId, setProjektId] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Material" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-4xl">
        <Button size="lg" className="w-full h-auto py-5 text-base gap-3" onClick={() => setOffen(true)}>
          <Package className="h-6 w-6" /> Material buchen
        </Button>
        <div className="flex gap-2 items-center">
          <div className="flex-1"><ProjektWahl wert={projektId} onChange={(id) => setProjektId(id)} leerText="Alle Projekte" mitAbgeschlossenen /></div>
          {projektId && <Button variant="ghost" onClick={() => setProjektId("")}>Alle</Button>}
        </div>
        <MaterialListe filter={projektId ? { projektId } : { nurEigene: true }} mitProjekt={!projektId} />
      </main>
      <MaterialDialog open={offen} onOpenChange={setOffen} projektId={projektId || undefined} />
    </div>
  );
}
