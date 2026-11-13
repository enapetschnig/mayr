import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2, Minus, Plus, X } from "lucide-react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Dok = pdfjs.PDFDocumentProxy;

/**
 * Ein PDF (Planung, Datenblatt …) direkt in der App: pdf.js zeichnet Seite
 * für Seite auf Canvas — eingebettete PDFs zeigen am Handy oft nur die erste
 * Seite oder gar nichts. Blättern, Zoom (+/−, Strg+Mausrad), Vollbild,
 * Herunterladen bzw. am Handy Teilen. Wird per React.lazy geladen.
 */
export default function PdfAnsicht({ url, name, vollbild = false, onVollbild, onSchliessen, className }: {
  url: string;
  name: string;
  /** im Vollbild-Dialog: Kopfleiste mit Schließen, Seite füllt die Höhe */
  vollbild?: boolean;
  /** eingebettet: Knopf „Vollbild“ */
  onVollbild?: () => void;
  onSchliessen?: () => void;
  className?: string;
}) {
  const [dok, setDok] = useState<Dok | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [seite, setSeite] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [zeichnet, setZeichnet] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const breite = useBreite(box);

  useEffect(() => {
    let ab = false;
    let geladen: Dok | null = null;
    setDok(null); setFehler(null); setSeite(1); setZoom(1);
    pdfjs.getDocument({ url }).promise
      .then((d) => { geladen = d; if (ab) void d.destroy(); else setDok(d); })
      .catch((e: unknown) => { if (!ab) setFehler(e instanceof Error ? e.message : "PDF ließ sich nicht öffnen"); });
    return () => { ab = true; if (geladen) void geladen.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!dok || !breite || !leinwand.current) return;
    let ab = false;
    let aufgabe: ReturnType<pdfjs.PDFPageProxy["render"]> | null = null;
    setZeichnet(true);
    (async () => {
      const p = await dok.getPage(seite);
      if (ab || !leinwand.current) return;
      const v1 = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Vollbild: ganze Seite sichtbar (Breite oder Höhe), eingebettet: Breite
      const hoehe = vollbild ? (box.current?.clientHeight ?? 0) - 16 : 0;
      const passend = hoehe > 0 ? Math.min((breite - 16) / v1.width, hoehe / v1.height) : breite / v1.width;
      const vp = p.getViewport({ scale: passend * zoom * dpr });
      const c = leinwand.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      aufgabe = p.render({ canvasContext: c.getContext("2d")!, viewport: vp });
      await aufgabe.promise;
    })()
      .catch((e: unknown) => { if (!ab && (e as Error)?.name !== "RenderingCancelledException") setFehler((e as Error).message); })
      .finally(() => { if (!ab) setZeichnet(false); });
    return () => { ab = true; aufgabe?.cancel(); };
  }, [dok, seite, zoom, breite, vollbild]);

  // Pfeiltasten blättern (nur im Vollbild — eingebettet gehören sie der Seite)
  useEffect(() => {
    if (!vollbild || !dok) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") setSeite((s) => Math.min(dok.numPages, s + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setSeite((s) => Math.max(1, s - 1));
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(5, z * 1.25));
      else if (e.key === "-") setZoom((z) => Math.max(0.5, z / 1.25));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [vollbild, dok]);

  // Strg+Mausrad (und Zwei-Finger-Zoom am Touchpad) zoomt das PDF statt der Seite
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const rad = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(0.5, z * Math.exp(-e.deltaY * 0.01))));
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  const laden = async () => {
    setLaedt(true);
    try {
      const blob = await (await fetch(url)).blob();
      await pdfTeilenOderLaden(blob, name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
    } finally {
      setLaedt(false);
    }
  };

  const n = dok?.numPages ?? 0;
  const knopf = cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md disabled:opacity-40",
    vollbild ? "hover:bg-white/10" : "hover:bg-muted");

  return (
    <div className={cn("flex min-h-0 flex-col", vollbild ? "h-full bg-black text-white" : "rounded-lg border bg-card", className)}>
      <div className={cn("flex items-center gap-1 px-1", vollbild ? "border-b border-white/10 bg-black pt-[env(safe-area-inset-top)]" : "border-b")}>
        <p className="min-w-0 flex-1 truncate px-2 text-sm font-medium" title={name}>{name}</p>
        <button type="button" className={knopf} disabled={seite <= 1} onClick={() => setSeite((s) => s - 1)} aria-label="Vorige Seite"><ChevronLeft className="h-5 w-5" /></button>
        <span className="zahl min-w-12 text-center text-xs">{n ? `${seite} / ${n}` : "…"}</span>
        <button type="button" className={knopf} disabled={seite >= n} onClick={() => setSeite((s) => s + 1)} aria-label="Nächste Seite"><ChevronRight className="h-5 w-5" /></button>
        <button type="button" className={cn(knopf, "hidden sm:flex")} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} aria-label="Verkleinern"><Minus className="h-4 w-4" /></button>
        <button type="button" className={knopf} onClick={() => setZoom((z) => Math.min(5, z * 1.25))} aria-label="Vergrößern"><Plus className="h-4 w-4" /></button>
        <button type="button" className={knopf} onClick={laden} disabled={laedt} aria-label="Herunterladen oder teilen">
          {laedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
        {onVollbild && <button type="button" className={knopf} onClick={onVollbild} aria-label="Vollbild"><Maximize2 className="h-4 w-4" /></button>}
        {onSchliessen && <button type="button" className={knopf} onClick={onSchliessen} aria-label="Schließen"><X className="h-5 w-5" /></button>}
      </div>
      <div ref={box} className={cn("relative min-h-0 flex-1 overflow-auto", vollbild ? "p-2" : "max-h-[75vh] bg-muted/40 p-2")}>
        {fehler && <p className="m-2 rounded-md bg-status-rot px-3 py-2 text-sm text-status-rot-fg">{fehler}</p>}
        {!dok && !fehler && <div className="flex h-60 items-center justify-center text-sm opacity-70"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> PDF wird geladen …</div>}
        {zeichnet && dok && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin opacity-60" />}
        <canvas ref={leinwand} className={cn("mx-auto block bg-white shadow-[0_0_0_1px_hsl(var(--border))]", !dok && "hidden")} />
      </div>
    </div>
  );
}

/** PDF im Vollbild — am Handy der Normalfall, am PC per Knopf */
export function PdfVollbild({ datei, onSchliessen }: { datei: { url: string; name: string } | null; onSchliessen: () => void }) {
  return (
    <Dialog open={!!datei} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent vollbild ohneSchliessen className="flex flex-col bg-black" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{datei?.name ?? "PDF"}</DialogTitle>
        {datei && <PdfAnsicht url={datei.url} name={datei.name} vollbild onSchliessen={onSchliessen} className="flex-1" />}
      </DialogContent>
    </Dialog>
  );
}

function useBreite(ref: React.RefObject<HTMLElement>) {
  const [b, setB] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      setB((alt) => (Math.abs(alt - w) > 24 ? w : alt));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return b;
}
