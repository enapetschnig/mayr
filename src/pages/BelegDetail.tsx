import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";
import { BelegEditor } from "@/components/belege/BelegEditor";
import { useBeleg } from "@/components/belege/daten";
import { empfaengerAusKunde, kopfNeu, neueId, type BelegTyp } from "@/components/belege/editor";
import { useKunden, useProjekt } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";

/**
 * /belege/neu?typ=angebot|rechnung[&projekt=<id>][&sprache=1][&import=1]
 * /belege/:id
 *
 * Neu: Startwerte aus Firma (Texte), Projekt und dessen Kunde. Gespeichert
 * wird erst mit dem ersten „Speichern“ — dann wechselt die Adresse auf die ID.
 */
export default function BelegDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (id) return <VorhandenerBeleg id={id} />;
  return <NeuerBeleg key={params.toString()} params={params} />;
}

function Laedt({ titel }: { titel: string }) {
  return (
    <Seite titel={titel}>
      <p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p>
    </Seite>
  );
}

function VorhandenerBeleg({ id }: { id: string }) {
  const { data, isLoading, error } = useBeleg(id);
  if (isLoading) return <Laedt titel="Beleg" />;
  if (error) {
    return (
      <Seite titel="Beleg">
        <Leer icon={AlertTriangle} text={`Der Beleg konnte nicht geladen werden: ${(error as Error).message}`} />
      </Seite>
    );
  }
  if (!data) {
    return (
      <Seite titel="Beleg" zurueckPfad="/belege">
        <Leer icon={FileText} text="Diesen Beleg gibt es nicht (mehr).">
          <Button asChild className="h-11"><Link to="/belege">Zu Angebote &amp; Rechnungen</Link></Button>
        </Leer>
      </Seite>
    );
  }
  return <BelegEditor id={id} daten={data} />;
}

function NeuerBeleg({ params }: { params: URLSearchParams }) {
  const { firma, laden } = useSitzung();
  const typ: BelegTyp = params.get("typ") === "rechnung" ? "rechnung" : "angebot";
  const projektId = params.get("projekt") || undefined;
  const { data: projekt, isLoading: projektLaedt } = useProjekt(projektId);
  const { data: kunden, isLoading: kundenLaedt } = useKunden();
  const [id] = useState(neueId);

  if (laden || (projektId && projektLaedt) || kundenLaedt) return <Laedt titel={typ === "angebot" ? "Neues Angebot" : "Neue Rechnung"} />;

  const kopf = kopfNeu(typ, firma, isoTag());
  if (projekt) {
    kopf.projekt_id = projekt.id;
    kopf.betreff = projekt.name;
    const kunde = kunden?.find((k) => k.id === projekt.kunde_id) ?? null;
    if (kunde) Object.assign(kopf, empfaengerAusKunde(kunde));
  }

  return (
    <BelegEditor
      id={id}
      daten={null}
      startKopf={kopf}
      autoSprache={params.get("sprache") === "1"}
      autoImport={typ === "rechnung" && !!projekt && params.get("import") === "1"}
    />
  );
}
