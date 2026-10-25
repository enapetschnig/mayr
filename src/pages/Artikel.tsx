import { Construction } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";

/** PLATZHALTER — wird von Bauteil B (Artikel & Leistungen) ersetzt. */
export default function Platzhalter() {
  return (
    <Seite titel="Artikel">
      <Leer icon={Construction} text="Dieser Bereich wird gerade gebaut." />
    </Seite>
  );
}
