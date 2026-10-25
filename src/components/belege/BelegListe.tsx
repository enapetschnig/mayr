import { useNavigate } from "react-router-dom";
import { FileText, Receipt } from "lucide-react";
import { ListenZeile, StatusBadge } from "@/components/Bausteine";
import { datum, euro } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listenStatus, type BelegListenEintrag } from "./daten";

const typName = (typ: string) => (typ === "rechnung" ? "Rechnung" : "Angebot");

/** Rechts unter dem Betrag: wann fällig / wie lange gültig / wann bezahlt */
function terminText(b: BelegListenEintrag, status: string): string | null {
  if (status === "entwurf") return null;
  if (b.typ === "rechnung") {
    if (status === "bezahlt") return b.bezahlt_am ? `bezahlt ${datum(b.bezahlt_am)}` : null;
    if (status === "offen" || status === "ueberfaellig") return b.faellig_am ? `fällig ${datum(b.faellig_am)}` : null;
    return null;
  }
  return status === "offen" && b.gueltig_bis ? `gültig bis ${datum(b.gueltig_bis)}` : null;
}

/**
 * Angebote und Rechnungen — am Handy Karten, am PC eine Tabelle.
 * `mitProjekt = false` in der Projektansicht (dort ist das Projekt klar).
 */
export function BelegListe({
  belege, heute, pc, verrechneteAngebote, mitProjekt = true,
}: {
  belege: BelegListenEintrag[];
  heute: string;
  pc: boolean;
  verrechneteAngebote: Set<string>;
  mitProjekt?: boolean;
}) {
  const navigate = useNavigate();

  if (pc) {
    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="py-2.5 pl-4 text-left font-medium">Nummer</th>
              <th className="py-2.5 pr-3 text-left font-medium">Datum</th>
              <th className="py-2.5 pr-3 text-left font-medium">Empfänger · Betreff</th>
              {mitProjekt && <th className="py-2.5 pr-3 text-left font-medium">Projekt</th>}
              <th className="py-2.5 pr-3 text-left font-medium">Termin</th>
              <th className="py-2.5 pr-3 text-left font-medium">Status</th>
              <th className="py-2.5 pr-4 text-right font-medium">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {belege.map((b) => {
              const status = listenStatus(b, heute, verrechneteAngebote);
              const Icon = b.typ === "rechnung" ? Receipt : FileText;
              return (
                <tr
                  key={b.id}
                  className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  onClick={() => navigate(`/belege/${b.id}`)}
                >
                  <td className="py-2.5 pl-4">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={typName(b.typ)} />
                      <span className={cn("zahl font-medium", !b.nummer && "text-muted-foreground")}>{b.nummer ?? `${typName(b.typ)} (Entwurf)`}</span>
                    </span>
                  </td>
                  <td className="zahl py-2.5 pr-3 text-muted-foreground">{datum(b.datum)}</td>
                  <td className="max-w-[22rem] py-2.5 pr-3">
                    <p className="truncate font-medium">{b.empf_name || "Ohne Empfänger"}</p>
                    {b.betreff && <p className="truncate text-xs text-muted-foreground">{b.betreff}</p>}
                  </td>
                  {mitProjekt && (
                    <td className="max-w-[14rem] py-2.5 pr-3">
                      {b.projekte ? (
                        <p className="truncate text-muted-foreground"><span className="zahl">{b.projekte.nummer}</span> {b.projekte.name}</p>
                      ) : <span className="text-muted-foreground">–</span>}
                    </td>
                  )}
                  <td className="zahl py-2.5 pr-3 text-xs text-muted-foreground">{terminText(b, status) ?? ""}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={status} /></td>
                  <td className={cn("zahl py-2.5 pr-4 text-right font-semibold", status === "storniert" && "text-muted-foreground line-through")}>{euro(b.brutto)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {belege.map((b) => {
        const status = listenStatus(b, heute, verrechneteAngebote);
        const termin = terminText(b, status);
        const Icon = b.typ === "rechnung" ? Receipt : FileText;
        return (
          <ListenZeile key={b.id} to={`/belege/${b.id}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={typName(b.typ)} />
              <span className={cn("zahl truncate text-sm font-semibold", !b.nummer && "text-muted-foreground")}>
                {b.nummer ?? `${typName(b.typ)} (Entwurf)`}
              </span>
              <StatusBadge status={status} className="ml-auto" />
            </div>
            <p className="mt-1 truncate font-medium">{b.empf_name || "Ohne Empfänger"}</p>
            {(b.betreff || (mitProjekt && b.projekte)) && (
              <p className="truncate text-xs text-muted-foreground">
                {[b.betreff, mitProjekt && b.projekte ? `${b.projekte.nummer}` : null].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span className="zahl">{datum(b.datum)}{termin ? ` · ${termin}` : ""}</span>
              <span className={cn("zahl text-sm font-semibold text-foreground", status === "storniert" && "text-muted-foreground line-through")}>{euro(b.brutto)}</span>
            </div>
          </ListenZeile>
        );
      })}
    </div>
  );
}
