import type { ProjektMitKunde } from "@/hooks/useDaten";

/**
 * PLATZHALTER — wird von Bauteil A (Material & Lager) ersetzt.
 * Schnittstelle bleibt: wird in der Projektansicht (pages/ProjektDetail.tsx)
 * als eigener Bereich eingebettet.
 */
export function ProjektMaterial({ projekt }: { projekt: ProjektMitKunde }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">Wird gerade gebaut ({projekt.nummer}).</p>;
}
