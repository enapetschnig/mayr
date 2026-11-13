import { Fragment, type ReactNode } from "react";
import { ChevronDown, Ellipsis, Share, SquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Die Zeichen, die man am Handy antippen muss — so gezeichnet, wie sie dort
 * aussehen. „Auf das Teilen-Zeichen tippen" allein hilft niemandem, der das
 * Zeichen nicht kennt (Christoph, 27.09.2026: „auch wie das Symbol
 * ausschaut").
 *
 * In den Anleitungstexten (lib/installieren.ts) stehen dafür Platzhalter wie
 * [teilen]; `mitZeichen()` setzt an ihrer Stelle das Bild ein.
 */
export type Zeichen = "teilen" | "punkte" | "mehr" | "plus";

const ZEICHEN: Record<Zeichen, { bild: ReactNode; name: string }> = {
  teilen: { bild: <Share />, name: "Teilen-Zeichen: Quadrat mit Pfeil nach oben" },
  punkte: { bild: <Ellipsis />, name: "drei Punkte" },
  mehr: { bild: <ChevronDown />, name: "Pfeil nach unten" },
  plus: { bild: <SquarePlus />, name: "Quadrat mit Plus" },
};

export function Bedienzeichen({ art, className }: { art: Zeichen; className?: string }) {
  const z = ZEICHEN[art];
  return (
    <span
      role="img"
      aria-label={z.name}
      data-zeichen={art}
      className={cn(
        "mx-0.5 inline-flex h-[1.6em] min-w-[1.6em] items-center justify-center rounded-md border border-foreground/25 bg-background px-1 align-[-0.4em] text-foreground shadow-sm [&_svg]:h-[1.05em] [&_svg]:w-[1.05em] [&_svg]:stroke-[2.25]",
        className,
      )}
    >
      {z.bild}
    </span>
  );
}

/** Text mit Platzhaltern [teilen] [punkte] [mehr] [plus] → Text mit Bildern. */
export function mitZeichen(text: string): ReactNode {
  const teile = text.split(/\[(teilen|punkte|mehr|plus)\]/);
  return teile.map((t, i) =>
    i % 2 === 1 ? <Bedienzeichen key={i} art={t as Zeichen} /> : <Fragment key={i}>{t}</Fragment>,
  );
}
