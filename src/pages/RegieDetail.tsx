import { Construction } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";

/** PLATZHALTER — wird von Bauteil C (Regieberichte) ersetzt. */
export default function Platzhalter() {
  return (
    <Seite titel="Regiebericht">
      <Leer icon={Construction} text="Dieser Bereich wird gerade gebaut." />
    </Seite>
  );
}
