import type { ProjektMitKunde } from "@/hooks/useDaten";

/**
 * PLATZHALTER — wird von Bauteil D (Angebote & Rechnungen) ersetzt.
 * Schnittstelle bleibt: wird in der Projektansicht (pages/ProjektDetail.tsx)
 * als eigener Bereich eingebettet.
 */
export function ProjektBelege({ projekt }: { projekt: ProjektMitKunde }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">Wird gerade gebaut ({projekt.nummer}).</p>;
}
