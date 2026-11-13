import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Download, Inbox, Loader2, Paperclip, Plus, Search, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { EingangDialog } from "@/components/eingang/EingangDialog";
import { ueberwiesen, useEingangsrechnungen, type EingangMitAnteilen } from "@/components/eingang/eingangDaten";
import { ablauf, kategorieText, zahlung, zuordnung, zuZahlen } from "@/components/eingang/eingangLogik";
import { Checkbox } from "@/components/ui/checkbox";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { ibanPruefen, sepaXml } from "@/lib/sepa";
import { passtSuche } from "@/components/regie/regieLogik";
import { datum, euro, isoTag } from "@/lib/format";
import { EINGANG_STATUS, FREIGABE_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useKategorien } from "@/components/buchhaltung/buchhaltungDaten";

type Filter = "alle" | "pruefen" | "freigegeben" | "ueberwiesen" | "abgelehnt" | "zuzuordnen";

/** Der Ablauf von links nach rechts: prüfen → freigeben → überweisen */
const FILTER: { wert: Filter; text: string }[] = [
  { wert: "pruefen", text: "Zu prüfen" },
  { wert: "freigegeben", text: "Zu überweisen" },
  { wert: "ueberwiesen", text: "Überwiesen" },
  { wert: "abgelehnt", text: "Abgelehnt" },
  { wert: "zuzuordnen", text: "Zuzuordnen" },
  { wert: "alle", text: "Alle" },
];

const LEER_TEXT: Record<Filter, string> = {
  alle: "Noch keine Eingangsrechnung. Rechnung vom Großhändler fotografieren, „Mit KI ausfüllen“, Projekt wählen — fertig.",
  pruefen: "Nichts zu prüfen.",
  freigegeben: "Nichts zu überweisen.",
  ueberwiesen: "Noch nichts überwiesen.",
  abgelehnt: "Keine abgelehnten Rechnungen.",
  zuzuordnen: "Alles zugeordnet.",
};

const passt = (r: EingangMitAnteilen, f: Filter) =>
  f === "alle" ? true
    : f === "zuzuordnen" ? zuordnung(r, r.eingang_anteile) !== "zugeordnet"
      : ablauf(r) === f;

/** /eingang — Eingangsrechnungen (nur Chef), Filter über ?filter= */
export default function Eingang() {
  const pc = useIstPc();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const f = params.get("filter");
  const filter: Filter = FILTER.some((x) => x.wert === f) ? f as Filter : f === "unbezahlt" ? "freigegeben" : "pruefen";
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  /** Zu überweisen: abgewählte bleiben stehen */
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [markiert, setMarkiert] = useState(false);
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<EingangMitAnteilen | "neu" | null>(null);
  const { data: alle = [], isLoading, error, refetch } = useEingangsrechnungen();
  const { data: kategorien = [] } = useKategorien();
  const katName = (r: EingangMitAnteilen) => kategorien.find((k) => k.id === r.kategorie_id)?.name ?? kategorieText(r.kategorie);

  const filterSetzen = (w: Filter) => {
    const neu = new URLSearchParams(params);
    if (w === "pruefen") neu.delete("filter");
    else neu.set("filter", w);
    setParams(neu, { replace: true });
  };

  const anzahl = useMemo(() => {
    const z = {} as Record<Filter, number>;
    FILTER.forEach((x) => { z[x.wert] = alle.filter((r) => passt(r, x.wert)).length; });
    return z;
  }, [alle]);

  const liste = useMemo(() => alle.filter((r) => passt(r, filter) && passtSuche([
    r.lieferant, r.nummer, r.notiz, katName(r), ...r.eingang_anteile.flatMap((a) => [a.text, a.projekte?.nummer, a.projekte?.name]),
  ], suche)).sort((a, b) => (filter === "freigegeben" ? (zuZahlen(a, heute).bis ?? a.faellig_am ?? "9").localeCompare(zuZahlen(b, heute).bis ?? b.faellig_am ?? "9") : 0)),
  [alle, filter, suche, heute]);

  const lieferanten = useMemo(() => [...new Set(alle.map((r) => r.lieferant.trim()))].sort((a, b) => a.localeCompare(b, "de")), [alle]);
  const summe = liste.reduce((s, r) => s + Number(r.brutto), 0);

  // ── Überweisen ──
  const ueberweisen = filter === "freigegeben";
  const gewaehlt = ueberweisen ? liste.filter((r) => !abgewaehlt.has(r.id)) : [];
  const zahlSumme = gewaehlt.reduce((s, r) => s + zuZahlen(r, heute).betrag, 0);
  const skontoSumme = gewaehlt.reduce((s, r) => s + zuZahlen(r, heute).skonto, 0);
  const ohneIban = gewaehlt.filter((r) => !ibanPruefen(r.iban));
  const eigeneIban = ibanPruefen(firma?.iban);
  const sepaLaden = () => {
    if (!eigeneIban || !firma) { toast.error("Eigene IBAN fehlt", { description: "In den Einstellungen unter Bank eintragen." }); return; }
    const mit = gewaehlt.filter((r) => ibanPruefen(r.iban));
    if (!mit.length) return;
    const datei = sepaXml({ name: firma.name, iban: eigeneIban, bic: firma.bic }, mit.map((r) => ({
      id: r.id, empfaenger: r.lieferant, iban: ibanPruefen(r.iban)!, betrag: zuZahlen(r, heute).betrag,
      zweck: [r.nummer ? `Rechnung ${r.nummer}` : "Rechnung", r.datum.split("-").reverse().join("."), zuZahlen(r, heute).skonto ? "abzgl. Skonto" : ""].filter(Boolean).join(" "),
    })), heute);
    const url = URL.createObjectURL(new Blob([datei], { type: "application/xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ueberweisungen-${heute}.xml`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`SEPA-Datei mit ${mit.length} ${mit.length === 1 ? "Überweisung" : "Überweisungen"}`, { description: "Im Online-Banking hochladen und dort unterschreiben." });
  };
  const alsUeberwiesen = async () => {
    setMarkiert(true);
    try {
      await ueberwiesen(gewaehlt.map((r) => r.id), heute);
      await neuLaden("eingang");
      toast.success(`${gewaehlt.length} als überwiesen markiert`);
      setAbgewaehlt(new Set());
    } catch (e) {
      toast.error("Nicht markiert", { description: (e as Error).message });
    } finally {
      setMarkiert(false);
    }
  };

  return (
    <Seite
      titel="Eingangsrechnungen"
      untertitel={isLoading ? undefined : `${alle.length} ${alle.length === 1 ? "Rechnung" : "Rechnungen"}`}
      breit
      aktionen={
        <Button className="h-11 gap-1.5 px-3 sm:px-4" onClick={() => setOffen("neu")}>
          <Plus className="h-4 w-4" />{pc ? "Rechnung erfassen" : "Neu"}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button
              key={x.wert}
              type="button"
              onClick={() => filterSetzen(x.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {x.text}
              <span className={cn("zahl text-xs", filter === x.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[x.wert] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Lieferant, Nummer, Projekt …"
            className="h-11 pl-9 pr-10" inputMode="search" enterKeyHint="search" autoComplete="off" />
          {suche && (
            <button type="button" onClick={() => setSuche("")} aria-label="Suche leeren"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <Leer icon={Inbox} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      ) : liste.length === 0 ? (
        <Leer icon={Inbox} text={suche.trim() ? "Nichts gefunden." : LEER_TEXT[filter]}>
          {!suche.trim() && (filter === "alle" || filter === "pruefen") && (
            <Button className="h-11 gap-1.5" onClick={() => setOffen("neu")}><Plus className="h-4 w-4" /> Rechnung erfassen</Button>
          )}
        </Leer>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y rounded-lg border bg-card">
            {liste.map((r) => {
              const z = zuordnung(r, r.eingang_anteile);
              const zahl = zahlung(r, heute);
              const schritt = ablauf(r);
              const zz = zuZahlen(r, heute);
              const projekte = r.eingang_anteile.map((a) => a.projekte ? `${a.projekte.nummer} ${a.projekte.name}` : "").filter(Boolean);
              const wohin = [...projekte, ...(r.betrieb ? ["Betrieb"] : [])].join(" · ");
              return (
                <li key={r.id} className="flex items-center">
                  {ueberweisen && (
                    <Checkbox className="ml-4 h-5 w-5 shrink-0" checked={!abgewaehlt.has(r.id)} aria-label={`${r.lieferant} überweisen`}
                      onCheckedChange={(c) => setAbgewaehlt((alt) => { const n = new Set(alt); if (c) n.delete(r.id); else n.add(r.id); return n; })} />
                  )}
                  <button type="button" onClick={() => setOffen(r)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:px-5">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{r.lieferant}</span>
                        <StatusPille eintrag={FREIGABE_STATUS[schritt]} />
                        {z !== "zugeordnet" && <StatusPille eintrag={EINGANG_STATUS[z]} />}
                        {zahl === "ueberfaellig" && schritt !== "abgelehnt" && <StatusPille eintrag={EINGANG_STATUS.ueberfaellig} />}
                        {ueberweisen && !ibanPruefen(r.iban) && <StatusPille eintrag={{ ton: "gelb", text: "IBAN fehlt" }} />}
                      </div>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {r.datei_pfad && <Paperclip className="h-3 w-3 shrink-0" aria-label="mit Beleg" />}
                        {[r.nummer, datum(r.datum), katName(r)].filter(Boolean).join(" · ")}
                      </p>
                      {wohin && <p className="truncate text-xs">{wohin}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="zahl font-semibold">{euro(ueberweisen ? zz.betrag : Number(r.brutto))}</p>
                      <p className="zahl text-xs text-muted-foreground">
                        {ueberweisen && zz.skonto ? `${euro(zz.skonto)} Skonto bis ${datum(zz.bis!)}` : `${euro(Number(r.netto))} netto`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
          {ueberweisen ? (
            <section className="sticky bottom-3 space-y-2 rounded-lg border bg-card p-3 lg:static">
              <p className="text-sm">
                <span className="font-semibold">{gewaehlt.length} {gewaehlt.length === 1 ? "Überweisung" : "Überweisungen"}</span> ·{" "}
                <span className="zahl font-semibold">{euro(zahlSumme)}</span>
                {skontoSumme > 0 && <span className="text-muted-foreground"> · spart {euro(skontoSumme)} Skonto</span>}
              </p>
              {ohneIban.length > 0 && <p className="text-xs text-muted-foreground">{ohneIban.length} ohne gültige IBAN — kommen nicht in die SEPA-Datei.</p>}
              {!eigeneIban && <p className="text-xs text-muted-foreground">Für die SEPA-Datei die eigene IBAN in den Einstellungen eintragen.</p>}
              <div className="flex flex-wrap gap-2">
                <Button className="h-11 gap-1.5" disabled={!eigeneIban || gewaehlt.length === ohneIban.length} onClick={sepaLaden}>
                  <Download className="h-4 w-4" /> SEPA-Datei fürs Banking
                </Button>
                <Button variant="outline" className="h-11 gap-1.5" disabled={!gewaehlt.length || markiert} onClick={() => void alsUeberwiesen()}>
                  {markiert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Als überwiesen markieren
                </Button>
              </div>
            </section>
          ) : (
            <p className="px-1 text-right text-xs text-muted-foreground">
              {liste.length} {liste.length === 1 ? "Rechnung" : "Rechnungen"} · <span className="zahl font-semibold text-foreground">{euro(summe)}</span> brutto
            </p>
          )}
        </div>
      )}

      <EingangDialog
        open={offen !== null}
        onOpenChange={(o) => { if (!o) setOffen(null); }}
        rechnung={offen === "neu" ? null : offen}
        lieferanten={lieferanten}
      />
    </Seite>
  );
}
