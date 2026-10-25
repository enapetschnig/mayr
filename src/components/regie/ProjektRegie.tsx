import { Link } from "react-router-dom";
import { ClipboardSignature, Loader2, Plus } from "lucide-react";
import { Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { stunden } from "@/lib/format";
import { RegieListe } from "./RegieListe";
import { stundenSumme, useRegieberichte } from "./regieDaten";

/**
 * Ordner „Regie“ im Projekt: die Regieberichte dieses Projekts und der
 * Knopf für einen neuen — das Projekt ist dort schon gewählt.
 */
export function ProjektRegie({ projekt }: { projekt: ProjektMitKunde }) {
  const { data: liste = [], isLoading, error } = useRegieberichte(projekt.id);
  const neu = `/regie/neu?projekt=${projekt.id}`;
  const offen = liste.filter((r) => r.status === "unterschrieben" && !r.rechnung_id).length;
  const entwuerfe = liste.filter((r) => r.status === "entwurf").length;
  const summe = liste.reduce((s, r) => s + stundenSumme(r), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          {liste.length === 0 ? "Noch keine Regieberichte" : (
            <>
              {liste.length} {liste.length === 1 ? "Bericht" : "Berichte"} · <span className="zahl font-semibold text-foreground">{stunden(summe)}</span>
              {entwuerfe > 0 && <> · {entwuerfe} {entwuerfe === 1 ? "Entwurf" : "Entwürfe"}</>}
              {offen > 0 && <> · {offen} nicht verrechnet</>}
            </>
          )}
        </p>
        {projekt.status !== "abgeschlossen" && liste.length > 0 && (
          <Button asChild className="h-11 shrink-0 gap-1.5">
            <Link to={neu}><Plus className="h-4 w-4" /> Neuer Regiebericht</Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">Konnte nicht geladen werden: {(error as Error).message}</p>
      ) : liste.length === 0 ? (
        <Leer icon={ClipboardSignature} text="Arbeiten, Stunden der Partie und Material festhalten und gleich vom Kunden unterschreiben lassen.">
          {projekt.status !== "abgeschlossen" && (
            <Button asChild className="h-11 gap-1.5">
              <Link to={neu}><Plus className="h-4 w-4" /> Neuer Regiebericht</Link>
            </Button>
          )}
        </Leer>
      ) : (
        <RegieListe eintraege={liste} mitProjekt={false} />
      )}
    </div>
  );
}
