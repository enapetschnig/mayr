import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Das PDF, wie es der Kunde bekommt — läuft beim Schreiben mit. `stand`
 * ändert sich bei jeder Eingabe; erzeugt wird erst, wenn eine Weile Ruhe ist.
 * Die Seiten zeichnet pdf.js auf Canvas (geht auch am Handy, wo ein
 * eingebettetes PDF nur die erste Seite oder gar nichts zeigt).
 */
export function LiveVorschau({ stand, erzeugen, className }: {
  stand: string;
  erzeugen: () => Promise<Blob | null>;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [seiten, setSeiten] = useState(0);
  const erzeugenRef = useRef(erzeugen);
  erzeugenRef.current = erzeugen;
  const breite = useBreite(box);

  useEffect(() => {
    if (!breite) return;
    let ab = false;
    const t = window.setTimeout(async () => {
      setLaeuft(true);
      try {
        const blob = await erzeugenRef.current();
        if (ab || !blob || !box.current) return;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const leinwaende: HTMLCanvasElement[] = [];
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i++) {
          const seite = await doc.getPage(i);
          const v1 = seite.getViewport({ scale: 1 });
          const vp = seite.getViewport({ scale: (breite / v1.width) * dpr });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          c.style.width = "100%";
          c.className = "block rounded-sm bg-white shadow-[0_0_0_1px_hsl(var(--border))]";
          await seite.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          leinwaende.push(c);
        }
        void doc.destroy();
        if (ab || !box.current) return;
        // Erst tauschen, wenn alles gezeichnet ist — sonst flackert es beim Tippen
        box.current.replaceChildren(...leinwaende);
        setSeiten(leinwaende.length);
        setFehler(null);
      } catch (e) {
        if (!ab) setFehler(e instanceof Error ? e.message : "Vorschau ging nicht");
      } finally {
        if (!ab) setLaeuft(false);
      }
    }, seiten ? 700 : 50);
    return () => { ab = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stand, breite]);

  return (
    <div className={cn("relative", className)} data-live-vorschau>
      {laeuft && (
        <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> aktualisiert
        </span>
      )}
      {fehler && <p className="mb-2 rounded-md bg-status-rot px-3 py-2 text-sm text-status-rot-fg">{fehler}</p>}
      {!seiten && !fehler && <div className="flex aspect-[1/1.414] items-center justify-center rounded-sm border bg-white text-sm text-muted-foreground">PDF wird erstellt …</div>}
      <div ref={box} className="space-y-3" />
    </div>
  );
}

function useBreite(ref: React.RefObject<HTMLElement>) {
  const [b, setB] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      // Erst bei spürbarer Änderung neu zeichnen
      setB((alt) => (Math.abs(alt - w) > 24 ? w : alt));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return b;
}
