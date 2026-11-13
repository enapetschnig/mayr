import { lazy, Suspense, useState } from "react";
import { FileText, Image as BildIcon, Loader2, PencilRuler, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { istBild, istPdf, useDateiOeffnen, useProjektDateien } from "@/components/projekt/FotosTab";
import { useIstPc } from "@/components/AppLayout";
import { useSitzung } from "@/hooks/useSitzung";
import { datum } from "@/lib/format";
import { cn } from "@/lib/utils";

const PdfAnsicht = lazy(() => import("@/components/projekt/PdfAnsicht"));
const PdfVollbild = lazy(() => import("@/components/projekt/PdfAnsicht").then((m) => ({ default: m.PdfVollbild })));

/**
 * „Planung“ oben in der Projektübersicht: PV-Plan, Stringplan, Dachbelegung.
 * Am PC steht das gewählte PDF gleich eingebettet da, am Handy öffnet ein
 * Tipp das Vollbild. Abgelegt wird wie ein Dokument (`dateien.planung`).
 */
export function PlanungBereich({ projektId }: { projektId: string }) {
  const pc = useIstPc();
  const { istChef } = useSitzung();
  const { data } = useProjektDateien(projektId);
  const { bild, setBild, pdf, setPdf, oeffnen } = useDateiOeffnen();
  const [hochladen, setHochladen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const plaene = (data?.liste ?? []).filter((d) => d.planung);
  const urls = data?.urls ?? {};
  const aktiv = plaene.find((d) => d.id === gewaehlt) ?? plaene[0];
  const bilder = plaene.filter(istBild);

  if (!data) return null;

  // Leer: nur das Büro sieht den Hinweis — dem Monteur steht er nur im Weg
  if (plaene.length === 0) {
    if (!istChef) return null;
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-card p-3">
        <PencilRuler className="h-5 w-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Planung</span>
          <span className="text-muted-foreground"> — noch kein Plan. PV-Plan, Stringplan, Dachbelegung hier ablegen.</span>
        </p>
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setHochladen(true)}><Plus className="h-4 w-4" /> Plan ablegen</Button>
        <FotoDialog open={hochladen} onOpenChange={setHochladen} projektId={projektId} planung />
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-3 sm:p-4" aria-label="Planung">
      <div className="mb-2 flex items-center gap-2">
        <PencilRuler className="h-5 w-5 text-primary" />
        <h2 className="flex-1 text-sm font-semibold">Planung <span className="font-normal text-muted-foreground">({plaene.length})</span></h2>
        <Button variant="ghost" className="h-11 gap-1.5 text-primary" onClick={() => setHochladen(true)}><Plus className="h-4 w-4" /> Plan</Button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {plaene.map((d) => (
          <li key={d.id}>
            <button type="button"
              onClick={() => (pc && istPdf(d) ? setGewaehlt(d.id) : oeffnen(d, urls, bilder))}
              className={cn("flex min-h-11 max-w-[18rem] items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
                pc && istPdf(d) && aktiv?.id === d.id ? "border-primary bg-primary-soft text-primary" : "hover:border-primary/50")}>
              {istBild(d) ? <BildIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span className="min-w-0">
                <span className="block truncate font-medium">{d.beschreibung || d.name}</span>
                <span className="block text-xs text-muted-foreground">{datum(d.created_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Am PC das gewählte PDF gleich eingebettet */}
      {pc && aktiv && istPdf(aktiv) && urls[aktiv.pfad] && (
        <Suspense fallback={<div className="mt-3 flex h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> lädt …</div>}>
          <PdfAnsicht key={aktiv.id} url={urls[aktiv.pfad]} name={aktiv.name} className="mt-3"
            onVollbild={() => setPdf({ url: urls[aktiv.pfad], name: aktiv.name })} />
        </Suspense>
      )}

      <BildBetrachter bilder={(bild?.liste ?? []).map((d) => ({ url: urls[d.pfad] ?? "", alt: d.beschreibung || d.name }))}
        index={bild?.index ?? null} onIndex={(index) => setBild((b) => (b ? { ...b, index } : b))} onSchliessen={() => setBild(null)} />
      {pdf && <Suspense fallback={null}><PdfVollbild datei={pdf} onSchliessen={() => setPdf(null)} /></Suspense>}
      <FotoDialog open={hochladen} onOpenChange={setHochladen} projektId={projektId} planung />
    </section>
  );
}
