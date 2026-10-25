import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { inhaltsRahmen } from "./regieLogik";

/**
 * Unterschriftsfeld: Finger, Stift oder Maus (Pointer Events), weißer
 * Hintergrund, scharf über devicePixelRatio. Die Striche werden als Punkte
 * gemerkt und bei jeder Größenänderung neu gezeichnet — dreht der Kunde das
 * Handy quer, bleibt die Unterschrift scharf und vollständig.
 *
 * Vorlage: SignaturePad (Sonnenoase) und UnterschriftFeld (ePower-Cockpit).
 */

type Punkt = { x: number; y: number };

export type UnterschriftHandle = {
  leeren: () => void;
  /** PNG, auf die Unterschrift zugeschnitten — null, wenn nichts gezeichnet wurde */
  alsPng: () => Promise<Blob | null>;
};

const TINTE = "#111827";
const STRICH = 2.6;

function strichZeichnen(ctx: CanvasRenderingContext2D, punkte: Punkt[]) {
  if (punkte.length === 0) return;
  if (punkte.length === 1) {
    ctx.beginPath();
    ctx.arc(punkte[0].x, punkte[0].y, STRICH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Durch die Mitten zwischen den Punkten — gibt runde Kurven statt Ecken
  ctx.beginPath();
  ctx.moveTo(punkte[0].x, punkte[0].y);
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1];
    const b = punkte[i];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const letzter = punkte[punkte.length - 1];
  ctx.lineTo(letzter.x, letzter.y);
  ctx.stroke();
}

export const UnterschriftFeld = forwardRef<UnterschriftHandle, {
  onChange?: (hatInhalt: boolean) => void;
  className?: string;
}>(function UnterschriftFeld({ onChange, className }, ref) {
  const huelle = useRef<HTMLDivElement>(null);
  const flaeche = useRef<HTMLCanvasElement>(null);
  const striche = useRef<Punkt[][]>([]);
  const masse = useRef({ w: 0, h: 0, dpr: 1 });
  const aktiv = useRef<{ id: number; letzter: Punkt; mitte: Punkt } | null>(null);
  const [leer, setLeer] = useState(true);
  const melden = useRef(onChange);
  melden.current = onChange;

  const stift = (ctx: CanvasRenderingContext2D) => {
    const { dpr } = masse.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = TINTE;
    ctx.fillStyle = TINTE;
    ctx.lineWidth = STRICH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const allesZeichnen = useCallback(() => {
    const c = flaeche.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    stift(ctx);
    striche.current.forEach((s) => strichZeichnen(ctx, s));
  }, []);

  // Größe an den Platz anpassen (Hoch-/Querformat, Adressleiste)
  useEffect(() => {
    const anpassen = () => {
      const h = huelle.current;
      const c = flaeche.current;
      if (!h || !c) return;
      const r = h.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const hh = Math.max(1, Math.round(r.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const alt = masse.current;
      if (alt.w === w && alt.h === hh && alt.dpr === dpr) return;
      // Passt die Unterschrift nicht mehr hinein (quer → hoch), verkleinern — nie vergrößern
      const alle = striche.current.flat();
      if (alle.length) {
        const maxX = Math.max(...alle.map((p) => p.x));
        const maxY = Math.max(...alle.map((p) => p.y));
        const f = Math.min(1, (w - 12) / Math.max(maxX, 1), (hh - 12) / Math.max(maxY, 1));
        if (f < 1) striche.current = striche.current.map((s) => s.map((p) => ({ x: p.x * f, y: p.y * f })));
      }
      masse.current = { w, h: hh, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${hh}px`;
      allesZeichnen();
    };
    anpassen();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(anpassen) : null;
    if (huelle.current) ro?.observe(huelle.current);
    window.addEventListener("orientationchange", anpassen);
    return () => {
      ro?.disconnect();
      window.removeEventListener("orientationchange", anpassen);
    };
  }, [allesZeichnen]);

  const punkt = (e: { clientX: number; clientY: number }): Punkt => {
    const r = flaeche.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const leerSetzen = (l: boolean) => {
    setLeer(l);
    melden.current?.(!l);
  };

  const unten = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (aktiv.current) return; // zweiter Finger zeichnet nicht mit
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = punkt(e);
    striche.current.push([p]);
    aktiv.current = { id: e.pointerId, letzter: p, mitte: p };
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      stift(ctx);
      strichZeichnen(ctx, [p]);
    }
    if (leer) leerSetzen(false);
  };

  const bewegen = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = aktiv.current;
    if (!a || e.pointerId !== a.id) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    stift(ctx);
    // Zwischenpunkte schneller Striche (Stift) mitnehmen, wo der Browser sie liefert
    const nativ = e.nativeEvent as PointerEvent;
    const ereignisse = nativ.getCoalescedEvents?.() ?? [];
    const punkte = (ereignisse.length ? ereignisse : [nativ]).map(punkt);
    const strich = striche.current[striche.current.length - 1];
    for (const p of punkte) {
      if (Math.hypot(p.x - a.letzter.x, p.y - a.letzter.y) < 0.6) continue;
      const mitte = { x: (a.letzter.x + p.x) / 2, y: (a.letzter.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(a.mitte.x, a.mitte.y);
      ctx.quadraticCurveTo(a.letzter.x, a.letzter.y, mitte.x, mitte.y);
      ctx.stroke();
      strich.push(p);
      a.mitte = mitte;
      a.letzter = p;
    }
  };

  const oben = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = aktiv.current;
    if (!a || e.pointerId !== a.id) return;
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      stift(ctx);
      ctx.beginPath();
      ctx.moveTo(a.mitte.x, a.mitte.y);
      ctx.lineTo(a.letzter.x, a.letzter.y);
      ctx.stroke();
    }
    aktiv.current = null;
  };

  useImperativeHandle(ref, () => ({
    leeren: () => {
      striche.current = [];
      aktiv.current = null;
      allesZeichnen();
      leerSetzen(true);
    },
    alsPng: async () => {
      const c = flaeche.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx || striche.current.length === 0) return null;
      const bild = ctx.getImageData(0, 0, c.width, c.height);
      const rahmen = inhaltsRahmen(bild.data, c.width, c.height);
      if (!rahmen) return null;
      const rand = Math.round(10 * masse.current.dpr);
      const x = Math.max(0, rahmen.x - rand);
      const y = Math.max(0, rahmen.y - rand);
      const w = Math.min(c.width - x, rahmen.breite + 2 * rand);
      const h = Math.min(c.height - y, rahmen.hoehe + 2 * rand);
      // Mehr als 1200 px Breite braucht kein PDF
      const f = Math.min(1, 1200 / w);
      const aus = document.createElement("canvas");
      aus.width = Math.max(1, Math.round(w * f));
      aus.height = Math.max(1, Math.round(h * f));
      const actx = aus.getContext("2d");
      if (!actx) return null;
      actx.fillStyle = "#ffffff";
      actx.fillRect(0, 0, aus.width, aus.height);
      actx.drawImage(c, x, y, w, h, 0, 0, aus.width, aus.height);
      return new Promise<Blob | null>((fertig) => aus.toBlob((b) => fertig(b), "image/png"));
    },
  }));

  return (
    <div ref={huelle} className={cn("relative min-h-[9rem] overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/40 bg-white", className)}>
      <canvas
        ref={flaeche}
        className="absolute inset-0 block cursor-crosshair touch-none select-none"
        aria-label="Unterschriftsfeld"
        onPointerDown={unten}
        onPointerMove={bewegen}
        onPointerUp={oben}
        onPointerCancel={oben}
      />
      {/* Hilfslinie — nur Anzeige, landet nicht im Bild */}
      <div className="pointer-events-none absolute inset-x-5 bottom-[22%] flex items-end gap-2 text-neutral-400">
        <span className="text-xl leading-none">×</span>
        <span className="flex-1 border-b border-dashed border-neutral-300" />
      </div>
      {leer && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-base text-neutral-400">Hier unterschreiben</p>
      )}
    </div>
  );
});
