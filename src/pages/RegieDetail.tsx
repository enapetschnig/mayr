import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ClipboardX, Loader2 } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { RegieAnsicht } from "@/components/regie/RegieAnsicht";
import { RegieEditor } from "@/components/regie/RegieEditor";
import { useRegiebericht } from "@/components/regie/regieDaten";

/**
 * /regie/neu und /regie/:id. App.tsx baut die Seite je id neu auf
 * (key), der Editor startet also immer frisch.
 * Entwurf → Editor, unterschrieben → feste Ansicht.
 */
export default function RegieDetail() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useRegiebericht(id);

  if (id && isLoading) {
    return (
      <Seite titel="Regiebericht">
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </Seite>
    );
  }
  if (id && error) {
    return (
      <Seite titel="Regiebericht">
        <Leer icon={AlertTriangle} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      </Seite>
    );
  }
  if (id && !data) {
    return (
      <Seite titel="Regiebericht" zurueckPfad="/regie">
        <Leer icon={ClipboardX} text="Diesen Regiebericht gibt es nicht (mehr).">
          <Button asChild variant="outline" className="h-11"><Link to="/regie">Zu den Regieberichten</Link></Button>
        </Leer>
      </Seite>
    );
  }
  if (data?.status === "unterschrieben") return <RegieAnsicht voll={data} />;
  return <RegieEditor voll={data ?? null} />;
}
