import { useNavigate } from "react-router-dom";
import { ListenZeile, RegieStatusBadge } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { datum, datumKurz, stunden } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stundenSumme, type RegieListenEintrag } from "./regieDaten";
import { kurzText } from "./regieLogik";

/**
 * Regieberichte als Liste: am Handy Karten, am PC eine Tabelle.
 * `mitProjekt={false}` im Projektordner — dort ist das Projekt klar.
 */
export function RegieListe({ eintraege, mitProjekt = true }: { eintraege: RegieListenEintrag[]; mitProjekt?: boolean }) {
  const pc = useIstPc();
  const navigate = useNavigate();

  if (!pc) {
    return (
      <ul className="space-y-2">
        {eintraege.map((r) => {
          const arbeiten = kurzText(r.arbeiten, 80);
          return (
            <li key={r.id}>
              <ListenZeile to={`/regie/${r.id}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.nummer ?? "—"}</span>
                  <RegieStatusBadge status={r.status} verrechnet={!!r.rechnung_id} />
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{datumKurz(r.datum)}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium">
                    {mitProjekt ? r.projekte?.name ?? "–" : arbeiten || "Ohne Beschreibung"}
                  </p>
                  <span className="zahl shrink-0 text-sm font-semibold">{stunden(stundenSumme(r))}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {mitProjekt
                    ? [r.projekte?.kunden?.name, arbeiten].filter(Boolean).join(" · ") || "—"
                    : r.unterschrift_name ? `Unterschrieben von ${r.unterschrift_name}` : "Noch nicht unterschrieben"}
                </p>
              </ListenZeile>
            </li>
          );
        })}
      </ul>
    );
  }

  // table-fixed: feste Spalten links/rechts, der Rest teilt sich den Platz und kürzt mit „…“ —
  // so drückt die Tabelle die Seite nie breiter als den Bildschirm (1024 px mit Seitenleiste).
  // Unter 1280 px fallen Kunde und Arbeiten als eigene Spalten weg, der Kunde steht dann unterm Projekt.
  const schmalWeg = mitProjekt ? "hidden xl:table-cell" : "";
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="w-[7.5rem] px-4 py-2.5 font-medium">Nummer</th>
            <th className="w-28 px-3 py-2.5 font-medium">Datum</th>
            {mitProjekt && <th className="px-3 py-2.5 font-medium">Projekt</th>}
            {mitProjekt && <th className={cn("px-3 py-2.5 font-medium", schmalWeg)}>Kunde</th>}
            <th className={cn("px-3 py-2.5 font-medium", schmalWeg)}>Arbeiten</th>
            <th className="w-24 px-3 py-2.5 text-right font-medium">Stunden</th>
            <th className="w-40 px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {eintraege.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => navigate(`/regie/${r.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(`/regie/${r.id}`); }}
              tabIndex={0}
            >
              <td className="truncate px-4 py-3 font-mono text-xs">{r.nummer ?? "—"}</td>
              <td className="truncate px-3 py-3">{datum(r.datum)}</td>
              {mitProjekt && (
                <td className="px-3 py-3">
                  <span className="block truncate font-medium">{r.projekte?.name ?? "–"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="font-mono">{r.projekte?.nummer}</span>
                    {r.projekte?.kunden?.name && <span className="xl:hidden"> · {r.projekte.kunden.name}</span>}
                  </span>
                </td>
              )}
              {mitProjekt && (
                <td className={cn("px-3 py-3", schmalWeg)}>
                  <span className="block truncate">{r.projekte?.kunden?.name ?? "–"}</span>
                </td>
              )}
              <td className={cn("px-3 py-3 text-muted-foreground", schmalWeg)}>
                <span className="block truncate">{kurzText(r.arbeiten, 120) || "–"}</span>
              </td>
              <td className="zahl whitespace-nowrap px-3 py-3 text-right font-semibold">{stunden(stundenSumme(r))}</td>
              <td className="px-4 py-3"><RegieStatusBadge status={r.status} verrechnet={!!r.rechnung_id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
