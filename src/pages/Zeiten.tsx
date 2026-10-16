import { useState } from "react";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { ZeitenListe, useZeiten } from "@/components/Buchungslisten";
import { Kennzahl } from "@/components/Bausteine";
import { isoTag, stunden } from "@/lib/format";

function monatsGrenzen(versatz: number) {
  const d = new Date();
  const a = new Date(d.getFullYear(), d.getMonth() + versatz, 1);
  const e = new Date(d.getFullYear(), d.getMonth() + versatz + 1, 0);
  return { von: isoTag(a), bis: isoTag(e), text: a.toLocaleDateString("de-AT", { month: "long", year: "numeric" }) };
}

/** Meine Stunden — Erfassen oben, Monatsliste darunter. */
export default function Zeiten() {
  const [offen, setOffen] = useState(false);
  const [versatz, setVersatz] = useState(0);
  const m = monatsGrenzen(versatz);
  const { data: zeiten = [] } = useZeiten({ nurEigene: true, von: m.von, bis: m.bis });
  const summe = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const tage = new Set(zeiten.map((z) => z.datum)).size;
  const heute = zeiten.filter((z) => z.datum === isoTag()).reduce((s, z) => s + Number(z.stunden), 0);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Zeiterfassung" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-4xl">
        <Button size="lg" className="w-full h-auto py-5 text-base gap-3" onClick={() => setOffen(true)}>
          <Clock className="h-6 w-6" /> Stunden erfassen
        </Button>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setVersatz(versatz - 1)} aria-label="Vormonat"><ChevronLeft className="h-5 w-5" /></Button>
          <h2 className="text-lg font-bold capitalize">{m.text}</h2>
          <Button variant="ghost" size="icon" onClick={() => setVersatz(versatz + 1)} disabled={versatz >= 0} aria-label="Nächster Monat"><ChevronRight className="h-5 w-5" /></Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Kennzahl titel="Monat" wert={stunden(summe)} />
          <Kennzahl titel="Arbeitstage" wert={String(tage)} />
          <Kennzahl titel={versatz === 0 ? "Heute" : "Ø pro Tag"} wert={stunden(versatz === 0 ? heute : tage ? summe / tage : 0)} />
        </div>

        <ZeitenListe filter={{ nurEigene: true, von: m.von, bis: m.bis }} mitProjekt />
      </main>
      <ZeitDialog open={offen} onOpenChange={setOffen} />
    </div>
  );
}
