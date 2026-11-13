import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileUp, History, Loader2, Plus, Search, Wallet } from "lucide-react";
import { Kennzahl, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZahlungDialog } from "@/components/op/ZahlungDialog";
import { STUFE_TEXT, type Stufe } from "@/components/op/opLogik";
import { passtSuche } from "@/components/regie/regieLogik";
import { useNeuLaden } from "@/hooks/useDaten";
import { datum, euro, isoTag } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import { BELEG_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AltrechnungenErfassen } from "./AltrechnungenErfassen";
import { ZAHL_STATUS } from "./AusgangListe";
import { useAltrechnungen, type AltZeile } from "./buchhaltungDaten";
import { zahlStatus } from "./buchhaltungLogik";

/**
 * Altrechnungen aus dem bisherigen Programm: erfassen (Tabelle oder CSV),
 * offene ausbuchen — bezahlt, teilbezahlt oder uneinbringlich. Sie stehen
 * auch in Offene Posten, beim Mahnen und beim Kunden.
 */
export function Altrechnungen() {
  const heute = isoTag();
  const neuLaden = useNeuLaden();
  const { data = [], isLoading } = useAltrechnungen();
  const [nurOffen, setNurOffen] = useState(true);
  const [suche, setSuche] = useState("");
  const [erfassen, setErfassen] = useState<"tabelle" | "csv" | null>(null);
  const [ausbuchen, setAusbuchen] = useState<AltZeile | null>(null);

  const zeilen = useMemo(() => data.map((b) => {
    const z = zahlStatus(b, b.zahlungen);
    const tage = (z.status === "offen" || z.status === "teilbezahlt") && b.faellig_am && b.faellig_am < heute
      ? Math.round((Date.parse(heute) - Date.parse(b.faellig_am)) / 86_400_000) : 0;
    const stufe = b.mahnungen.reduce((m, x) => Math.max(m, x.stufe), 0);
    return { b, z, tage, stufe };
  }), [data, heute]);
  const liste = zeilen.filter((x) => (!nurOffen || x.z.offen > 0) && passtSuche([x.b.nummer, x.b.empf_name], suche));
  const summe = (f: "offen" | "ausgebucht" | "bezahlt") => runden2(zeilen.reduce((s, x) => s + x.z[f], 0));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kennzahl titel="Altrechnungen" wert={String(data.length)} icon={History} />
        <Kennzahl titel="Noch offen" wert={euro(summe("offen"))} unter={`${zeilen.filter((x) => x.z.offen > 0).length} Rechnungen`} />
        <Kennzahl titel="Bezahlt" wert={euro(summe("bezahlt"))} />
        <Kennzahl titel="Ausgebucht" wert={euro(summe("ausgebucht"))} unter="uneinbringlich, Kulanz" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="h-11 gap-1.5" onClick={() => setErfassen("tabelle")}><Plus className="h-4 w-4" /> Altrechnungen erfassen</Button>
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setErfassen("csv")}><FileUp className="h-4 w-4" /> CSV importieren</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Rechnungen aus dem bisherigen Programm — mit ihrer alten Nummer, ohne Positionen. Sie stehen in Offene Posten, beim Mahnen und beim
        Kunden, aber nie in der Übergabe an die Kanzlei (dort sind sie schon verbucht).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {[true, false].map((o) => (
          <button key={String(o)} type="button" onClick={() => setNurOffen(o)}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              nurOffen === o ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
            {o ? "Offen" : "Alle"}
            <span className="zahl text-xs text-muted-foreground">{o ? zeilen.filter((x) => x.z.offen > 0).length : zeilen.length}</span>
          </button>
        ))}
        <div className="relative min-w-0 flex-1 basis-56 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Kunde, Nummer …" className="h-11 pl-9" inputMode="search" autoComplete="off" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !liste.length ? (
        <Leer icon={History} text={data.length ? (suche ? "Nichts gefunden." : "Keine offene Altrechnung.") : "Noch keine Altrechnungen erfasst."} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map(({ b, z, tage, stufe }) => (
            <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center lg:px-5">
              <Link to={`/belege/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{b.empf_name || "–"}</span>
                    <StatusPille eintrag={tage > 0 ? { ...BELEG_STATUS.ueberfaellig, text: `${tage} ${tage === 1 ? "Tag" : "Tage"} überfällig` } : ZAHL_STATUS[z.status]} />
                    {stufe > 0 && z.offen > 0 && <StatusPille eintrag={{ ton: "gelb", text: STUFE_TEXT[stufe as Stufe] }} />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[b.nummer, datum(b.datum), b.faellig_am ? `fällig ${datum(b.faellig_am)}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="zahl font-semibold">{euro(z.offen > 0 ? z.offen : Number(b.brutto))}</p>
                  {z.offen > 0 && z.offen < Number(b.brutto) && <p className="zahl text-xs text-muted-foreground">von {euro(Number(b.brutto))}</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
              {z.offen > 0 && (
                <Button variant="outline" className="h-11 gap-1.5 sm:w-36" onClick={() => setAusbuchen(b)}>
                  <Wallet className="h-4 w-4" /> Ausbuchen
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AltrechnungenErfassen art={erfassen} onClose={() => setErfassen(null)} />
      {ausbuchen && (
        <ZahlungDialog belegId={ausbuchen.id} nummer={ausbuchen.nummer} offen={zahlStatus(ausbuchen, ausbuchen.zahlungen).offen}
          open={!!ausbuchen} onOpenChange={(o) => { if (!o) setAusbuchen(null); }} onGespeichert={() => void neuLaden("buchhaltung")} />
      )}
    </div>
  );
}
