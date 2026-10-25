import { Construction } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";

/** PLATZHALTER — wird von Bauteil A (Material & Lager) ersetzt. */
export default function Platzhalter() {
  return (
    <Seite titel="Lager">
      <Leer icon={Construction} text="Dieser Bereich wird gerade gebaut." />
    </Seite>
  );
}
