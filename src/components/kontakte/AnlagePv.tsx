import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, LineChart, PencilRuler, Sun } from "lucide-react";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useAnlagen, type Anlage } from "@/components/anlagen/anlagenDaten";
import { datum, zahl } from "@/lib/format";
import { einspeisungText, hatPv, linkSauber, pvKurz, UEBERWACHUNG, type Ueberwachung } from "./kontaktLogik";

/** Hat die Anlage PV-Daten, die man zeigen kann? */
export const mitPvDaten = (a: Anlage) =>
  hatPv(a) || pvKurz(a).length > 0 || !!linkSauber(a.ueberwachung_link) || !!linkSauber(a.planung_link);

/** Knöpfe „Anlagenüberwachung“ (mit Hersteller) und „PV-Planung“ — öffnen den Link in einem neuen Tab */
export function PvLinks({ anlage }: { anlage: Anlage }) {
  const ueber = linkSauber(anlage.ueberwachung_link);
  const plan = linkSauber(anlage.planung_link);
  if (!ueber && !plan) return null;
  const anbieter = anlage.ueberwachung ? UEBERWACHUNG[anlage.ueberwachung as Ueberwachung]?.text : null;
  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      {ueber && (
        <Button asChild variant="outline" className="h-11 justify-start">
          <a href={ueber} target="_blank" rel="noopener noreferrer">
            <LineChart className="h-4 w-4" />
            <span className="truncate">Überwachung{anbieter && anlage.ueberwachung !== "sonstige" ? ` · ${anbieter}` : ""}</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground sm:ml-1" />
          </a>
        </Button>
      )}
      {plan && (
        <Button asChild variant="outline" className="h-11 justify-start">
          <a href={plan} target="_blank" rel="noopener noreferrer">
            <PencilRuler className="h-4 w-4" />PV-Planung
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground sm:ml-1" />
          </a>
        </Button>
      )}
    </div>
  );
}

/** Eckdaten als kleine Stücke: „9,8 kWp“ „Speicher 10 kWh“ … */
export function PvStuecke({ anlage }: { anlage: Anlage }) {
  const t = pvKurz(anlage);
  if (!t.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {t.map((x) => <span key={x} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium">{x}</span>)}
    </div>
  );
}

/** Alle PV-Angaben einer Anlage — für die Anlagenseite */
export function PvDetails({ anlage }: { anlage: Anlage }) {
  const zeilen: [string, ReactNode][] = [
    ["Leistung", Number(anlage.pv_kwp) > 0 ? `${zahl(Number(anlage.pv_kwp))} kWp` : null],
    ["Module", anlage.module_anzahl && anlage.module_typ ? `${zahl(anlage.module_anzahl)} × ${anlage.module_typ}`
      : anlage.module_anzahl ? `${zahl(anlage.module_anzahl)} Stück` : anlage.module_typ],
    ["Wechselrichter", anlage.wechselrichter],
    ["Speicher", [Number(anlage.speicher_kwh) > 0 ? `${zahl(Number(anlage.speicher_kwh))} kWh` : null, anlage.speicher_typ].filter(Boolean).join(" · ") || null],
    ["Einspeisung", einspeisungText(anlage) ? `begrenzt auf ${einspeisungText(anlage)}` : null],
    ["Wallbox", anlage.wallbox],
    ["Überschuss", anlage.ueberschuss == null ? null : anlage.ueberschuss ? ["Ja", anlage.ueberschuss_wie].filter(Boolean).join(" · ") : "Nein"],
    ["In Betrieb seit", anlage.inbetriebnahme ? datum(anlage.inbetriebnahme) : null],
    ["Zählpunkt", anlage.zaehlpunkt ? <span className="break-all font-mono text-xs">{anlage.zaehlpunkt}</span> : null],
  ];
  const da = zeilen.filter(([, w]) => w);
  return (
    <div className="space-y-3">
      {da.length > 0 && (
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          {da.map(([t, w]) => (
            <div key={t} className="contents"><dt className="text-muted-foreground">{t}</dt><dd className="min-w-0">{w}</dd></div>
          ))}
        </dl>
      )}
      <PvLinks anlage={anlage} />
    </div>
  );
}

/**
 * PV-Anlage(n) des Kunden im Projekt — der Monteur sieht auf der Baustelle
 * auf einen Blick, was dort steht, und kommt mit einem Tipp in die
 * Anlagenüberwachung. Ohne PV-Daten zeigt sie nichts.
 */
export function ProjektAnlage({ kundeId }: { kundeId: string | null | undefined }) {
  const { data: alle = [] } = useAnlagen();
  if (!kundeId) return null;
  const anlagen = alle.filter((a) => a.kunde_id === kundeId && a.aktiv && mitPvDaten(a));
  if (!anlagen.length) return null;
  return (
    <Karte titel={anlagen.length === 1 ? "Anlage des Kunden" : `Anlagen des Kunden · ${anlagen.length}`}>
      <ul className="space-y-4">
        {anlagen.map((a) => (
          <li key={a.id} className="space-y-2">
            <Link to={`/anlagen/${a.id}`} className="flex min-h-11 items-center gap-2 font-medium hover:text-primary">
              <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{a.bezeichnung}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            <PvStuecke anlage={a} />
            {(a.wechselrichter || a.speicher_typ) && (
              <p className="text-xs text-muted-foreground">{[a.wechselrichter, a.speicher_typ].filter(Boolean).join(" · ")}</p>
            )}
            <PvLinks anlage={a} />
          </li>
        ))}
      </ul>
    </Karte>
  );
}
