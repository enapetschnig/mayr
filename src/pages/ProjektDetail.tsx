import { Construction } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";

/** PLATZHALTER — wird im Hauptstrang neu geschrieben. */
export default function Platzhalter() {
  return (
    <Seite titel="Projekt">
      <Leer icon={Construction} text="Dieser Bereich wird gerade gebaut." />
    </Seite>
  );
}
