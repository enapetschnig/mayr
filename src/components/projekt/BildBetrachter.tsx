import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX = 6;
const DOPPEL = 2.5;

type Lage = { s: number; x: number; y: number };
const GRUND: Lage = { s: 1, x: 0, y: 0 };

/**
 * Fotos im Vollbild mit Zoom — ohne Bibliothek:
 * Handy: zwei Finger zoomen, Doppeltipp = 2,5× an der Stelle, mit einem
 * Finger verschieben (gezoomt) bzw. wischen = nächstes/voriges Bild.
 * PC: Mausrad zoomt zur Maus, ziehen verschiebt, Doppelklick, Pfeiltasten,
 * + / − / 0, Esc.
 */
export function BildBetrachter({ bilder, index, onIndex, onSchliessen, fuss }: {
  bilder: { url: string; alt: string }[];
  index: number | null;
  onIndex: (i: number) => void;
  onSchliessen: () => void;
  /** Leiste unten (Wer, wann, Herunterladen, Löschen) */
  fuss?: ReactNode;
}) {
  const offen = index !== null && !!bilder[index];
  const [lage, setLage] = useState<Lage>(GRUND);
  const [wisch, setWisch] = useState(0);
  const flaeche = useRef<HTMLDivElement | null>(null);
  // Die Fläche entsteht erst mit dem Dialog (Portal) — als Zustand, damit das Mausrad sie sicher bekommt
  const [flaecheEl, setFlaecheEl] = useState<HTMLDivElement | null>(null);
  const flaecheRef = useCallback((el: HTMLDivElement | null) => { flaeche.current = el; setFlaecheEl(el); }, []);
  const bild = useRef<HTMLImageElement>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ lage: Lage; abstand: number; mitte: { x: number; y: number }; x: number; y: number; zeit: number; bewegt: boolean } | null>(null);
  const letzterTipp = useRef<{ zeit: number; x: number; y: number } | null>(null);
  const lageRef = useRef(lage);
  lageRef.current = lage;

  // Neues Bild = ungezoomt
  useEffect(() => { setLage(GRUND); setWisch(0); }, [index]);

  /** Verschieben nur so weit, dass das Bild den Rand nicht verlässt */
  const begrenzen = useCallback((l: Lage): Lage => {
    const s = Math.min(MAX, Math.max(1, l.s));
    const b = bild.current;
    if (!b || s === 1) return { s, x: 0, y: 0 };
    const f = flaeche.current?.getBoundingClientRect();
    const rx = Math.max(0, (b.offsetWidth * s - (f?.width ?? 0)) / 2);
    const ry = Math.max(0, (b.offsetHeight * s - (f?.height ?? 0)) / 2);
    return { s, x: Math.min(rx, Math.max(-rx, l.x)), y: Math.min(ry, Math.max(-ry, l.y)) };
  }, []);

  /** Zoom auf `s2` so, dass der Punkt (Bildschirm) an seiner Stelle bleibt */
  const zoomBei = useCallback((l: Lage, s2: number, px: number, py: number): Lage => {
    const f = flaeche.current!.getBoundingClientRect();
    const cx = px - f.left - f.width / 2;
    const cy = py - f.top - f.height / 2;
    const s = Math.min(MAX, Math.max(1, s2));
    const k = s / l.s;
    return begrenzen({ s, x: cx - (cx - l.x) * k, y: cy - (cy - l.y) * k });
  }, [begrenzen]);

  const blaettern = useCallback((r: number) => {
    if (index === null) return;
    const n = index + r;
    if (n >= 0 && n < bilder.length) onIndex(n);
  }, [index, bilder.length, onIndex]);

  const mitteZoom = (faktor: number) => {
    const f = flaeche.current?.getBoundingClientRect();
    if (!f) return;
    setLage((l) => zoomBei(l, l.s * faktor, f.left + f.width / 2, f.top + f.height / 2));
  };

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") blaettern(1);
      else if (e.key === "ArrowLeft") blaettern(-1);
      else if (e.key === "+" || e.key === "=") mitteZoom(1.5);
      else if (e.key === "-") mitteZoom(1 / 1.5);
      else if (e.key === "0") setLage(GRUND);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen, blaettern]);

  // Mausrad: nicht passiv, sonst scrollt die Seite dahinter
  useEffect(() => {
    const el = flaecheEl;
    if (!el) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const faktor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      setLage((l) => zoomBei(l, l.s * faktor, e.clientX, e.clientY));
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, [flaecheEl, zoomBei]);

  const abstandUndMitte = () => {
    const [a, b] = [...zeiger.current.values()];
    return { abstand: Math.hypot(a.x - b.x, a.y - b.y), mitte: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const runter = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const zwei = zeiger.current.size === 2 ? abstandUndMitte() : { abstand: 0, mitte: { x: e.clientX, y: e.clientY } };
    start.current = { lage: lageRef.current, ...zwei, x: e.clientX, y: e.clientY, zeit: Date.now(), bewegt: zeiger.current.size > 1 };
  };

  const bewegen = (e: React.PointerEvent) => {
    if (!zeiger.current.has(e.pointerId) || !start.current) return;
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current;
    if (zeiger.current.size >= 2) {
      const { abstand, mitte } = abstandUndMitte();
      if (!st.abstand) return;
      const l = zoomBei(st.lage, st.lage.s * (abstand / st.abstand), st.mitte.x, st.mitte.y);
      // dazu verschieben, wenn die Finger gemeinsam wandern
      setLage(begrenzen({ ...l, x: l.x + mitte.x - st.mitte.x, y: l.y + mitte.y - st.mitte.y }));
      return;
    }
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.hypot(dx, dy) > 8) st.bewegt = true;
    if (st.lage.s > 1) setLage(begrenzen({ ...st.lage, x: st.lage.x + dx, y: st.lage.y + dy }));
    else setWisch(dx);
  };

  const hoch = (e: React.PointerEvent) => {
    const st = start.current;
    zeiger.current.delete(e.pointerId);
    if (zeiger.current.size === 1) {
      // vom Zwei- zum Einfingerbetrieb: neu ansetzen, sonst springt das Bild
      const [rest] = [...zeiger.current.values()];
      start.current = { lage: lageRef.current, abstand: 0, mitte: rest, x: rest.x, y: rest.y, zeit: Date.now(), bewegt: true };
      return;
    }
    if (zeiger.current.size > 0 || !st) return;
    start.current = null;
    if (st.lage.s === 1 && Math.abs(wisch) > 60) {
      blaettern(wisch < 0 ? 1 : -1);
      setWisch(0);
      return;
    }
    setWisch(0);
    if (st.bewegt || Date.now() - st.zeit > 300) return;
    // Doppeltipp (auch Doppelklick): 2,5× an der Stelle bzw. zurück
    const jetzt = { zeit: Date.now(), x: e.clientX, y: e.clientY };
    const vorher = letzterTipp.current;
    if (vorher && jetzt.zeit - vorher.zeit < 320 && Math.hypot(jetzt.x - vorher.x, jetzt.y - vorher.y) < 30) {
      letzterTipp.current = null;
      setLage((l) => (l.s > 1 ? GRUND : zoomBei(l, DOPPEL, e.clientX, e.clientY)));
    } else {
      letzterTipp.current = jetzt;
    }
  };

  const aktuelles = offen ? bilder[index!] : null;
  const rund = "flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80";

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent vollbild ohneSchliessen className="flex flex-col bg-black text-white" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Foto {index !== null ? index + 1 : ""} von {bilder.length}</DialogTitle>
        {aktuelles && (
          <>
            <div ref={flaecheRef} data-bildflaeche
              className={cn("relative min-h-0 flex-1 touch-none select-none overflow-hidden", lage.s > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
              onPointerDown={runter} onPointerMove={bewegen} onPointerUp={hoch} onPointerCancel={hoch}>
              <img ref={bild} src={aktuelles.url} alt={aktuelles.alt} draggable={false}
                className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                style={{
                  transform: `translate(${lage.x + wisch}px, ${lage.y}px) scale(${lage.s})`,
                  transition: zeiger.current.size ? "none" : "transform 160ms ease-out",
                }} />
              <div className="absolute left-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium">{index! + 1} / {bilder.length}</div>
              <div className="absolute right-2 top-2 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
                <button type="button" className={cn(rund, "hidden sm:flex")} onClick={() => mitteZoom(1 / 1.5)} aria-label="Verkleinern"><Minus className="h-5 w-5" /></button>
                <button type="button" className={cn(rund, "hidden sm:flex")} onClick={() => mitteZoom(1.5)} aria-label="Vergrößern"><Plus className="h-5 w-5" /></button>
                <button type="button" className={rund} onClick={onSchliessen} aria-label="Schließen"><X className="h-5 w-5" /></button>
              </div>
              {index! > 0 && (
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => blaettern(-1)}
                  className={cn(rund, "absolute left-2 top-1/2 -translate-y-1/2")} aria-label="Voriges Foto"><ChevronLeft className="h-6 w-6" /></button>
              )}
              {index! < bilder.length - 1 && (
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => blaettern(1)}
                  className={cn(rund, "absolute right-2 top-1/2 -translate-y-1/2")} aria-label="Nächstes Foto"><ChevronRight className="h-6 w-6" /></button>
              )}
              {lage.s > 1 && (
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setLage(GRUND)}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium">
                  {Math.round(lage.s * 100)} % · zurück
                </button>
              )}
            </div>
            {fuss && <div className="shrink-0 bg-black/80 pb-[env(safe-area-inset-bottom)]">{fuss}</div>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
