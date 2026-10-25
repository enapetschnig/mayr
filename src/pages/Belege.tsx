import { Construction } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";

/** PLATZHALTER — wird von Bauteil D (Angebote & Rechnungen) ersetzt. */
export default function Platzhalter() {
  return (
    <Seite titel="Angebote & Rechnungen">
      <Leer icon={Construction} text="Dieser Bereich wird gerade gebaut." />
    </Seite>
  );
}
