import { useMemo, useState } from "react";
import { ChevronRight, ClipboardSignature, Clock, FileText, Inbox, Package, Plus, Receipt } from "lucide-react";
import { AktionsKachel, Karte, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { EingangDialog } from "@/components/eingang/EingangDialog";
import { useEingangsrechnungen, useProjektEingang, type EingangMitAnteilen } from "@/components/eingang/eingangDaten";
import { useIstPc } from "@/components/AppLayout";
import { useProjektZahlen, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, isoTag, stunden } from "@/lib/format";
import { BELEG_STATUS } from "@/lib/types";
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
  const { data: eingang = [] } = useProjektEingang(projekt.id, istChef);
  const { data: eingangAlle = [] } = useEingangsrechnungen(istChef);
  const [eingangOffen, setEingangOffen] = useState<EingangMitAnteilen | "neu" | null>(null);

  // Belege sind Chef-Sache (RLS) — Monteure sehen hier nichts
  if (!istChef) return null;

  const z = zahlen[projekt.id];
  const stundenOffen = Number(z?.stunden_offen ?? 0);
  const regieOffen = Number(z?.regie_offen ?? 0);
  const materialOffen = Number(z?.material_offen_ek ?? 0);
  const eingangOffenSumme = eingang.filter((a) => !a.rechnung_id).reduce((s, a) => s + Number(a.betrag), 0);
  const etwasOffen = stundenOffen > 0 || regieOffen > 0 || materialOffen > 0 || eingangOffenSumme !== 0;
  const rechnungen = belege.filter((b) => b.typ === "rechnung" && b.status !== "storniert" && b.status !== "storno");
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
        {eingangOffenSumme !== 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Dazu Eingangsrechnungen <span className="zahl font-medium text-foreground">{euro(eingangOffenSumme)}</span> Einkauf — beim Übernehmen anhaken, wenn sie der Kunde zahlt.
          </p>
        )}
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

      <Karte
        titel="Eingangsrechnungen"
        ohnePolster
        aktion={(
          <Button variant="outline" className="-my-1 gap-1.5" onClick={() => setEingangOffen("neu")}>
            <Plus className="h-4 w-4" /> Erfassen
          </Button>
        )}
      >
        {eingang.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-muted-foreground lg:px-5">Keine zugeordnet. Rechnungen von Großhändler und Subunternehmern hier erfassen — sie zählen in die Nachkalkulation.</p>
        ) : (
          <ul className="divide-y">
            {eingang.map((a) => {
              const r = eingangAlle.find((x) => x.id === a.eingangsrechnung_id);
              return (
                <li key={a.id}>
                  <button type="button" disabled={!r} onClick={() => r && setEingangOffen(r)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 lg:px-5">
                    <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.text?.trim() || a.eingangsrechnungen?.lieferant}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[a.eingangsrechnungen?.lieferant, a.eingangsrechnungen?.nummer, a.eingangsrechnungen?.datum && datum(a.eingangsrechnungen.datum)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {a.rechnung_id && <StatusPille eintrag={BELEG_STATUS.verrechnet} />}
                    <span className="zahl shrink-0 font-semibold">{euro(Number(a.betrag))}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
            <li className="flex justify-between px-4 py-2.5 text-sm lg:px-5">
              <span className="text-muted-foreground">Summe Einkauf netto</span>
              <span className="zahl font-semibold">{euro(eingang.reduce((s, a) => s + Number(a.betrag), 0))}</span>
            </li>
          </ul>
        )}
      </Karte>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Lädt …</p>
      ) : belege.length ? (
        <BelegListe belege={belege} heute={heute} pc={pc} verrechneteAngebote={verrechnet} mitProjekt={false} />
      ) : (
        <Leer icon={FileText} text="Noch kein Angebot und keine Rechnung zu diesem Projekt." className="rounded-lg border bg-card" />
      )}

      <EingangDialog
        open={eingangOffen !== null}
        onOpenChange={(o) => { if (!o) setEingangOffen(null); }}
        rechnung={eingangOffen === "neu" ? null : eingangOffen}
        lieferanten={[...new Set(eingangAlle.map((r) => r.lieferant.trim()))]}
        projektVorgabe={projekt.id}
      />
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
