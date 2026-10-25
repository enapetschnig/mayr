import { useMemo } from "react";
import { ClipboardSignature, Clock, FileText, Package, Receipt } from "lucide-react";
import { AktionsKachel, Leer } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useProjektZahlen, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, isoTag, stunden } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BelegListe } from "./BelegListe";
import { useBelege, verrechneteAngeboteAus } from "./daten";

/**
 * Angebote und Rechnungen eines Projekts — eingebettet in die Projektansicht.
 * Oben, was noch nicht verrechnet ist; darunter „Rechnung aus dem Projekt“
 * (öffnet gleich den Übernahme-Assistenten) und die Belege des Projekts.
 */
export function ProjektBelege({ projekt }: { projekt: ProjektMitKunde }) {
  const { istChef } = useSitzung();
  const pc = useIstPc();
  const heute = isoTag();
  const { data: belege = [], isLoading } = useBelege(projekt.id, istChef);
  const { data: zahlen = {} } = useProjektZahlen();
  const verrechnet = useMemo(() => verrechneteAngeboteAus(belege), [belege]);

  // Belege sind Chef-Sache (RLS) — Monteure sehen hier nichts
  if (!istChef) return null;

  const z = zahlen[projekt.id];
  const stundenOffen = Number(z?.stunden_offen ?? 0);
  const regieOffen = Number(z?.regie_offen ?? 0);
  const materialOffen = Number(z?.material_offen_ek ?? 0);
  const etwasOffen = stundenOffen > 0 || regieOffen > 0 || materialOffen > 0;
  const rechnungen = belege.filter((b) => b.typ === "rechnung" && b.status !== "storniert");
  const verrechnetSumme = rechnungen.filter((b) => b.status !== "entwurf").reduce((s, b) => s + Number(b.netto), 0);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-[0.9375rem] font-semibold">Noch nicht verrechnet</h3>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Wert icon={Clock} titel="Stunden" wert={stunden(stundenOffen)} aktiv={stundenOffen > 0} />
          <Wert icon={ClipboardSignature} titel="Regieberichte" wert={String(regieOffen)} unter="unterschrieben" aktiv={regieOffen > 0} />
          <Wert icon={Package} titel="Material" wert={euro(materialOffen)} unter="Einkauf" aktiv={materialOffen > 0} />
        </dl>
        {(!etwasOffen || verrechnetSumme > 0) && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {!etwasOffen && "Alles verrechnet — oder noch nichts gebucht. "}
            {verrechnetSumme > 0 && <>Schon verrechnet: <span className="zahl font-medium text-foreground">{euro(verrechnetSumme)}</span> netto</>}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <AktionsKachel
          icon={Receipt}
          titel="Rechnung aus dem Projekt"
          unter={etwasOffen ? "Alles Offene übernehmen" : "Assistent zeigt alles Offene"}
          to={`/belege/neu?typ=rechnung&projekt=${projekt.id}&import=1`}
          ton="primaer"
        />
        <AktionsKachel icon={FileText} titel="Angebot" unter="Leistungen antippen oder diktieren" to={`/belege/neu?typ=angebot&projekt=${projekt.id}`} />
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Lädt …</p>
      ) : belege.length ? (
        <BelegListe belege={belege} heute={heute} pc={pc} verrechneteAngebote={verrechnet} mitProjekt={false} />
      ) : (
        <Leer icon={FileText} text="Noch kein Angebot und keine Rechnung zu diesem Projekt." className="rounded-lg border bg-card" />
      )}
    </div>
  );
}

function Wert({ icon: I, titel, wert, unter, aktiv }: { icon: typeof Clock; titel: string; wert: string; unter?: string; aktiv: boolean }) {
  return (
    <div className={cn("rounded-md px-1 py-2", aktiv ? "bg-primary-soft" : "bg-muted/50")}>
      <dt className="flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
        <I className="h-3.5 w-3.5" /> {titel}
      </dt>
      <dd className={cn("zahl mt-0.5 text-base font-bold", !aktiv && "text-muted-foreground")}>{wert}</dd>
      {unter && <dd className="text-[11px] text-muted-foreground">{unter}</dd>}
    </div>
  );
}
