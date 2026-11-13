import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { Karte, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { datum, isoTag, zahl } from "@/lib/format";
import { AnlageDialog } from "./AnlageDialog";
import { anlageText, useAnlagen } from "./anlagenDaten";
import { faelligkeit } from "./pruefLogik";
import { mitPvDaten, PvLinks, PvStuecke } from "@/components/kontakte/AnlagePv";

/** Anlagen eines Kunden in der Kundenansicht — mit „Neue Anlage“ für genau diesen Kunden */
export function KundeAnlagen({ kundeId }: { kundeId: string }) {
  const navigate = useNavigate();
  const heute = isoTag();
  const { data: alle = [] } = useAnlagen();
  const [neu, setNeu] = useState(false);
  const anlagen = alle.filter((a) => a.kunde_id === kundeId);
  return (
    <Karte
      titel={`Anlagen${anlagen.length ? ` · ${zahl(anlagen.length)}` : ""}`}
      aktion={<Button variant="outline" className="h-10 gap-1.5" onClick={() => setNeu(true)}><Plus className="h-4 w-4" /> Neue Anlage</Button>}
      ohnePolster
    >
      {anlagen.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Keine Anlagen — PV-Anlage mit Speicher und Überwachung, Verteiler, E-Check oder Blitzschutz hier anlegen.</p>
      ) : (
        <ul className="divide-y border-t">
          {anlagen.map((a) => {
            const f = faelligkeit(a.aktiv ? a.naechste_pruefung : null, heute);
            return (
              <li key={a.id}>
                <Link to={`/anlagen/${a.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.bezeichnung}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[anlageText(a), a.aktiv && a.naechste_pruefung ? `nächste ${datum(a.naechste_pruefung)}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {a.aktiv && f.stufe !== "spaeter" && f.stufe !== "keine" && <StatusPille eintrag={f.eintrag} />}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                {mitPvDaten(a) && (
                  <div className="space-y-2 px-4 pb-3 lg:px-5">
                    <PvStuecke anlage={a} />
                    <PvLinks anlage={a} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AnlageDialog open={neu} onOpenChange={setNeu} anlage={null} kundeId={kundeId} onGespeichert={(a) => navigate(`/anlagen/${a.id}`)} />
    </Karte>
  );
}
