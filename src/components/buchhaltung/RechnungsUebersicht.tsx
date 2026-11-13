import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2, Search, Sparkles, X } from "lucide-react";
import { Karte, Kennzahl, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { passtSuche } from "@/components/regie/regieLogik";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { alsText, csvHerunterladen } from "@/lib/abfrage";
import { datum, euro } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import type { StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { kategorieSetzen } from "./buchhaltungDaten";
import { nachKategorie, type Kategorie, type Richtung } from "./buchhaltungLogik";
import { KategorieBalken, KategorieWahl } from "./KategorieTeile";

/** Eine Zeile, egal ob Ausgang oder Eingang */
export type UebersichtZeile = {
  id: string;
  datum: string;
  nummer: string | null;
  name: string;
  unter: string | null;
  netto: number;
  ust: number;
  brutto: number;
  /** noch offen (brutto); 0 = erledigt */
  offen: number;
  status: StatusEintrag;
  /** bezahlt / erledigt für den Filter */
  erledigt: boolean;
  kategorie_id: string | null;
  vorschlag: string | null;
  zusatz?: StatusEintrag | null;
  datei: boolean;
};

type StatusFilter = "alle" | "offen" | "erledigt";

/**
 * Liste je Zeitraum mit Summen, Kategorien (Balken = Filter) und Status.
 * Kategorie direkt in der Zeile ändern; Zeile antippen öffnet die Rechnung,
 * das Symbol daneben das Original.
 */
export function RechnungsUebersicht({
  richtung, zeilen, kategorien, laedt, fehler, zeitraumText, onOeffnen, onDatei, onKategorien, kopf,
}: {
  richtung: Richtung;
  zeilen: UebersichtZeile[];
  kategorien: Kategorie[];
  laedt: boolean;
  fehler: unknown;
  zeitraumText: string;
  onOeffnen: (id: string) => void;
  onDatei: (id: string) => Promise<void>;
  onKategorien: () => void;
  kopf?: ReactNode;
}) {
  const pc = useIstPc();
  const neuLaden = useNeuLaden();
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  // undefined = alle Kategorien, null = ohne Kategorie
  const [katFilter, setKatFilter] = useState<string | null | undefined>(undefined);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const katVon = useMemo(() => new Map(kategorien.map((k) => [k.id, k])), [kategorien]);
  const eingang = richtung === "eingang";

  const summenJe = useMemo(() => nachKategorie(zeilen, kategorien), [zeilen, kategorien]);
  const liste = zeilen.filter((z) =>
    (statusFilter === "alle" || (statusFilter === "erledigt") === z.erledigt)
    && (katFilter === undefined || (katFilter === null ? !z.kategorie_id || !katVon.has(z.kategorie_id) : z.kategorie_id === katFilter))
    && passtSuche([z.nummer, z.name, z.unter, z.kategorie_id ? katVon.get(z.kategorie_id)?.name : null], suche));
  const summe = (l: UebersichtZeile[], f: "netto" | "ust" | "brutto" | "offen") => runden2(l.reduce((s, z) => s + Number(z[f]), 0));
  const mitVorschlag = zeilen.filter((z) => !z.kategorie_id && z.vorschlag && katVon.has(z.vorschlag));

  const setzen = async (ids: string[], kategorieId: string | null) => {
    setLaeuft(ids.length > 1 ? "alle" : ids[0]);
    try {
      await kategorieSetzen(richtung, ids, kategorieId ? katVon.get(kategorieId) ?? null : null);
      await neuLaden("buchhaltung", eingang ? "eingang" : "belege");
    } catch (e) {
      toast.error("Kategorie nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };
  const vorschlaegeUebernehmen = async () => {
    const je = new Map<string, string[]>();
    mitVorschlag.forEach((z) => je.set(z.vorschlag!, [...(je.get(z.vorschlag!) ?? []), z.id]));
    for (const [k, ids] of je) await setzen(ids, k);
    toast.success(`${mitVorschlag.length} ${mitVorschlag.length === 1 ? "Rechnung" : "Rechnungen"} eingeordnet`);
  };
  const datei = async (id: string) => {
    setLaeuft(`datei-${id}`);
    try { await onDatei(id); } finally { setLaeuft(null); }
  };
  const csv = () => csvHerunterladen(`${eingang ? "eingangsrechnungen" : "ausgangsrechnungen"}-${zeitraumText.replace(/\s+/g, "-").toLowerCase()}.csv`, [
    ["Datum", "Nummer", eingang ? "Lieferant" : "Kunde", "Kategorie", "Netto", "USt", "Brutto", "Offen", "Status"],
    ...liste.map((z) => [datum(z.datum), alsText(z.nummer), alsText(z.name), z.kategorie_id ? katVon.get(z.kategorie_id)?.name ?? "" : "", z.netto, z.ust, z.brutto, z.offen, z.status.text]),
  ]);

  const kategorieFeld = (z: UebersichtZeile) => (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <KategorieWahl klein kategorien={kategorien} wert={z.kategorie_id && katVon.has(z.kategorie_id) ? z.kategorie_id : null} vorschlag={z.vorschlag}
        onChange={(k) => void setzen([z.id], k)} className={cn("w-full", laeuft === z.id && "opacity-60")} />
    </div>
  );
  const dateiKnopf = (z: UebersichtZeile) => (
    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={!z.datei || !!laeuft}
      aria-label={eingang ? "Foto oder PDF ansehen" : "Original-PDF ansehen"} title={z.datei ? "Original ansehen" : "Kein Original"}
      onClick={(e) => { e.stopPropagation(); void datei(z.id); }}>
      {laeuft === `datei-${z.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kennzahl titel="Netto" wert={euro(summe(zeilen, "netto"))} unter={`${zeilen.length} ${zeilen.length === 1 ? "Rechnung" : "Rechnungen"}`} />
        <Kennzahl titel={eingang ? "Vorsteuer" : "USt"} wert={euro(summe(zeilen, "ust"))} />
        <Kennzahl titel="Brutto" wert={euro(summe(zeilen, "brutto"))} />
        <Kennzahl titel={eingang ? "Noch zu zahlen" : "Noch offen"} wert={euro(summe(zeilen, "offen"))}
          unter={`${eingang ? "bezahlt" : "bezahlt"} ${euro(runden2(summe(zeilen, "brutto") - summe(zeilen, "offen")))}`} />
      </div>

      {kopf}

      <Karte titel={`Nach Kategorie · ${zeitraumText}`} aktion={(
        <Button variant="ghost" className="-my-2 h-11 text-sm" onClick={onKategorien}>Kategorien pflegen</Button>
      )}>
        {zeilen.length ? <KategorieBalken summen={summenJe} aktiv={katFilter} onWahl={setKatFilter} />
          : <p className="text-sm text-muted-foreground">Keine Rechnungen in diesem Zeitraum.</p>}
        {mitVorschlag.length > 0 && (
          <Button variant="outline" className="mt-3 h-11 gap-1.5" disabled={!!laeuft} onClick={() => void vorschlaegeUebernehmen()}>
            {laeuft === "alle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mitVorschlag.length} {mitVorschlag.length === 1 ? "Vorschlag" : "Vorschläge"} übernehmen
          </Button>
        )}
      </Karte>

      <div className="flex flex-wrap items-center gap-2">
        {(["alle", "offen", "erledigt"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setStatusFilter(f)}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              statusFilter === f ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
            {f === "alle" ? "Alle" : f === "offen" ? "Offen" : eingang ? "Bezahlt" : "Bezahlt"}
            <span className="zahl text-xs text-muted-foreground">{f === "alle" ? zeilen.length : zeilen.filter((z) => (f === "erledigt") === z.erledigt).length}</span>
          </button>
        ))}
        {katFilter !== undefined && (
          <button type="button" onClick={() => setKatFilter(undefined)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3.5 text-sm font-medium text-primary">
            {katFilter === null ? "Ohne Kategorie" : katVon.get(katFilter)?.name} <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="relative min-w-0 flex-1 basis-56 lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={eingang ? "Suchen – Lieferant, Nummer …" : "Suchen – Kunde, Nummer, Projekt …"}
            className="h-11 pl-9" inputMode="search" autoComplete="off" />
        </div>
        <Button variant="outline" className="h-11 gap-1.5" disabled={!liste.length} onClick={csv}><Download className="h-4 w-4" /> CSV</Button>
      </div>

      {laedt ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : fehler ? (
        <Leer icon={FileText} text={`Konnte nicht geladen werden: ${(fehler as Error).message}`} />
      ) : !liste.length ? (
        <Leer icon={FileText} text={zeilen.length ? "Nichts gefunden." : `Im Zeitraum ${zeitraumText} gibt es keine ${eingang ? "Eingangsrechnungen" : "fertigen Rechnungen"}.`} />
      ) : pc ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="py-2.5 pl-4 text-left font-medium">Datum</th>
                <th className="py-2.5 pr-3 text-left font-medium">Nummer</th>
                <th className="py-2.5 pr-3 text-left font-medium">{eingang ? "Lieferant" : "Kunde"}</th>
                <th className="w-56 py-2.5 pr-3 text-left font-medium">Kategorie</th>
                <th className="py-2.5 pr-3 text-right font-medium">Netto</th>
                <th className="py-2.5 pr-3 text-right font-medium">Brutto</th>
                <th className="py-2.5 pr-3 text-left font-medium">Status</th>
                <th className="w-12 py-2.5 pr-2" />
              </tr>
            </thead>
            <tbody>
              {liste.map((z) => (
                <tr key={z.id} tabIndex={0} onClick={() => onOeffnen(z.id)} onKeyDown={(e) => { if (e.key === "Enter") onOeffnen(z.id); }}
                  className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none">
                  <td className="whitespace-nowrap py-1.5 pl-4 tabular-nums">{datum(z.datum)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-xs">{z.nummer ?? "–"}</td>
                  <td className="max-w-[22rem] py-1.5 pr-3">
                    <p className="truncate font-medium">{z.name}</p>
                    {z.unter && <p className="truncate text-xs text-muted-foreground">{z.unter}</p>}
                  </td>
                  <td className="py-1.5 pr-3">{kategorieFeld(z)}</td>
                  <td className="zahl py-1.5 pr-3 text-right">{euro(z.netto)}</td>
                  <td className="zahl py-1.5 pr-3 text-right font-medium">{euro(z.brutto)}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1"><StatusPille eintrag={z.status} />{z.zusatz && <StatusPille eintrag={z.zusatz} />}</div>
                  </td>
                  <td className="py-1.5 pr-2">{dateiKnopf(z)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/40 text-sm">
              <tr>
                <td colSpan={4} className="py-2.5 pl-4 text-muted-foreground">{liste.length} {liste.length === 1 ? "Rechnung" : "Rechnungen"}{liste.length !== zeilen.length ? " (gefiltert)" : ""}</td>
                <td className="zahl py-2.5 pr-3 text-right font-medium">{euro(summe(liste, "netto"))}</td>
                <td className="zahl py-2.5 pr-3 text-right font-semibold">{euro(summe(liste, "brutto"))}</td>
                <td colSpan={2} className="zahl py-2.5 pr-3 text-muted-foreground">offen {euro(summe(liste, "offen"))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((z) => (
            <li key={z.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOeffnen(z.id)}>
                  <p className="truncate font-medium">{z.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[z.nummer, datum(z.datum), z.unter].filter(Boolean).join(" · ")}</p>
                  <div className="mt-1 flex flex-wrap gap-1"><StatusPille eintrag={z.status} />{z.zusatz && <StatusPille eintrag={z.zusatz} />}</div>
                </button>
                <div className="shrink-0 text-right">
                  <p className="zahl font-semibold">{euro(z.brutto)}</p>
                  <p className="zahl text-xs text-muted-foreground">netto {euro(z.netto)}</p>
                </div>
                {dateiKnopf(z)}
              </div>
              {kategorieFeld(z)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
