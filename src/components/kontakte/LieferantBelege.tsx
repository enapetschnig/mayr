import { Link } from "react-router-dom";
import { ChevronRight, ClipboardList, FileText, Truck } from "lucide-react";
import { Karte, Kennzahl, StatusPille } from "@/components/Bausteine";
import { datum, euro, zahl } from "@/lib/format";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLieferantBelege } from "./kontaktDaten";
import { belegPille, belegSummen, type LieferantBeleg } from "./kontaktLogik";

const ART = {
  rechnung: { text: "Rechnung", icon: FileText, pfad: (b: LieferantBeleg) => `/eingang?filter=alle&offen=${b.id}` },
  lieferschein: { text: "Lieferschein", icon: Truck, pfad: (b: LieferantBeleg) => `/lieferscheine?offen=${b.id}` },
  bestellung: { text: "Bestellung", icon: ClipboardList, pfad: (b: LieferantBeleg) => `/bestellungen/${b.id}` },
} as const;

/**
 * Belege eines Lieferanten: Eingangsrechnungen, Lieferscheine, Bestellungen —
 * gefunden über Name und weitere Schreibweisen, mit Summen und Öffnen.
 */
export function LieferantBelege({ kontakt, istChef }: { kontakt: Kunde; istChef: boolean }) {
  const { data: belege = [], isLoading } = useLieferantBelege(kontakt.id, true);
  const s = belegSummen(belege);
  const namen = [kontakt.name, ...(kontakt.namen ?? [])];

  return (
    <Karte titel={`Belege${belege.length ? ` · ${zahl(belege.length)}` : ""}`} ohnePolster>
      {isLoading ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Lädt…</p>
      ) : belege.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">
          Keine Belege unter „{namen.join("“, „")}“. Heißt der Lieferant auf Rechnungen anders, die Schreibweise unter „Bearbeiten“ ergänzen.
        </p>
      ) : (
        <>
          {istChef && (
            <div className={cn("grid grid-cols-2 gap-2 px-4 pb-3 lg:px-5", s.bestellungen > 0 && "sm:grid-cols-3")}>
              <Kennzahl titel="Rechnungen" wert={euro(s.rechnungenSumme)} unter={`${zahl(s.rechnungen)} Rechnung${s.rechnungen === 1 ? "" : "en"}, brutto`} />
              <Kennzahl titel="Nicht überwiesen" wert={euro(s.offenSumme)} unter={s.offen ? `${zahl(s.offen)} Rechnung${s.offen === 1 ? "" : "en"}` : "alles bezahlt"} />
              {s.bestellungen > 0 && <Kennzahl titel="Bestellt" wert={euro(s.bestellungenSumme)} unter={`${zahl(s.bestellungen)} Bestellung${s.bestellungen === 1 ? "" : "en"} netto`} />}
            </div>
          )}
          <ul className="divide-y border-t">
            {belege.map((b) => {
              const art = ART[b.quelle as keyof typeof ART] ?? ART.rechnung;
              const I = art.icon;
              return (
                <li key={`${b.quelle}-${b.id}`}>
                  <Link to={art.pfad(b)} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5">
                    <I className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {art.text} {b.nummer ?? <span className="font-normal text-muted-foreground">ohne Nummer</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{[datum(b.datum), b.projekt].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {b.betrag != null && <span className="zahl text-sm font-semibold">{euro(b.betrag)}</span>}
                      <StatusPille eintrag={belegPille(b)} />
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Karte>
  );
}
