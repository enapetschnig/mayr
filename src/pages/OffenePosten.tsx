import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BellRing, ChevronRight, HandCoins, Loader2, Search, Wallet, X } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Kennzahl, Leer, StatusPille } from "@/components/Bausteine";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIstPc } from "@/components/AppLayout";
import { mahnungPdf } from "@/components/op/mahnen";
import { mahnungAnlegen, useOffenePosten, type OpBeleg } from "@/components/op/opDaten";
import { mahnFristAbgelaufen, mahnVorschlag, offenBetrag, STUFE_TEXT, verzugTage, type Stufe } from "@/components/op/opLogik";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { ZahlungDialog } from "@/components/op/ZahlungDialog";
import { passtSuche } from "@/components/regie/regieLogik";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, isoTag } from "@/lib/format";
import { mahnGesamt } from "@/lib/mahnPdf";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { BELEG_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "mahnen" | "ueberfaellig" | "alle";

const passt = (z: { tage: number; zuMahnen: boolean }, w: Filter) => (w === "alle" ? true : w === "ueberfaellig" ? z.tage > 0 : z.zuMahnen);

const FILTER: { wert: Filter; text: string }[] = [
  { wert: "mahnen", text: "Zu mahnen" },
  { wert: "ueberfaellig", text: "Überfällig" },
  { wert: "alle", text: "Alle offenen" },
];

const LEER_TEXT: Record<Filter, string> = {
  mahnen: "Nichts zu mahnen — alles bezahlt oder die Frist der letzten Mahnung läuft noch.",
  ueberfaellig: "Keine überfällige Rechnung.",
  alle: "Keine offene Rechnung. Alles bezahlt.",
};

/**
 * /offene-posten — alle offenen Rechnungen (nur Chef): wie viel draußen ist,
 * was überfällig ist, was als Nächstes gemahnt gehört. Zahlung erfassen und
 * mahnen gehen direkt aus der Liste; Antippen öffnet die Rechnung.
 */
export default function OffenePosten() {
  const pc = useIstPc();
  const heute = isoTag();
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  const [params, setParams] = useSearchParams();
  const f = params.get("filter");
  const filter: Filter = f === "ueberfaellig" || f === "alle" ? f : "mahnen";
  const [suche, setSuche] = useState("");
  const [zahlung, setZahlung] = useState<OpBeleg | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);
  const { data: alle = [], isLoading, error, refetch } = useOffenePosten();

  const zeilen = useMemo(() => alle.map((b) => {
    const offen = offenBetrag(b.brutto, b.zahlungen);
    const tage = verzugTage(b.faellig_am, heute);
    const vorschlag = firma ? mahnVorschlag(b, b.zahlungen, b.mahnungen, firma, heute) : null;
    const letzte = b.mahnungen.reduce<OpBeleg["mahnungen"][number] | null>((m, x) => (!m || x.stufe > m.stufe ? x : m), null);
    return { b, offen, tage, vorschlag, letzte, zuMahnen: !!vorschlag && mahnFristAbgelaufen(b.mahnungen, heute) };
  }), [alle, firma, heute]);

  const anzahl = useMemo(() => {
    const r = {} as Record<Filter, number>;
    FILTER.forEach((x) => { r[x.wert] = zeilen.filter((z) => passt(z, x.wert)).length; });
    return r;
  }, [zeilen]);
  const liste = zeilen.filter((z) => passt(z, filter) && passtSuche([z.b.nummer, z.b.empf_name, z.b.projekte?.nummer, z.b.projekte?.name], suche));

  const summeOffen = zeilen.reduce((s, z) => s + z.offen, 0);
  const summeUeber = zeilen.filter((z) => z.tage > 0).reduce((s, z) => s + z.offen, 0);

  const filterSetzen = (w: Filter) => {
    const neu = new URLSearchParams(params);
    if (w === "mahnen") neu.delete("filter");
    else neu.set("filter", w);
    setParams(neu, { replace: true });
  };

  const [mahnFrage, setMahnFrage] = useState<(typeof zeilen)[number] | null>(null);
  const mahnen = async (z: (typeof zeilen)[number]) => {
    if (!z.vorschlag || !firma) return;
    setMahnFrage(null);
    setLaeuft(z.b.id);
    try {
      const m = await mahnungAnlegen(z.b.id, z.vorschlag, heute);
      await neuLaden("op");
      toast.success(`${STUFE_TEXT[m.stufe as Stufe]} zu ${z.b.nummer} erstellt — jetzt schicken`);
      const d = await mahnungPdf(firma, z.b, z.b.zahlungen, m);
      if (pc) setVorschau(d);
      else await pdfTeilenOderLaden(d.blob, d.dateiname);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <Seite titel="Offene Posten" untertitel={isLoading ? undefined : `${alle.length} ${alle.length === 1 ? "Rechnung" : "Rechnungen"} offen`} breit>
      <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
        <Kennzahl titel="Offen" wert={euro(summeOffen)} icon={HandCoins} />
        <Kennzahl titel="Davon überfällig" wert={euro(summeUeber)} className={summeUeber > 0 ? "text-status-rot-fg" : undefined} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTER.map((x) => (
            <button key={x.wert} type="button" onClick={() => filterSetzen(x.wert)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                filter === x.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}>
              {x.text}
              <span className={cn("zahl text-xs", filter === x.wert ? "text-primary" : "text-muted-foreground")}>{anzahl[x.wert] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – Kunde, Rechnung, Projekt …"
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
        <Leer icon={HandCoins} text={`Konnte nicht geladen werden: ${(error as Error).message}`}>
          <Button variant="outline" className="h-11" onClick={() => refetch()}>Nochmal versuchen</Button>
        </Leer>
      ) : liste.length === 0 ? (
        <Leer icon={HandCoins} text={suche.trim() ? "Nichts gefunden." : LEER_TEXT[filter]} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((z) => (
            <li key={z.b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center lg:px-5">
              <Link to={`/belege/${z.b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{z.b.empf_name || "–"}</span>
                    {z.tage > 0 && <StatusPille eintrag={{ ...BELEG_STATUS.ueberfaellig, text: `${z.tage} ${z.tage === 1 ? "Tag" : "Tage"} überfällig` }} />}
                    {z.letzte && <StatusPille eintrag={{ ton: "gelb", text: STUFE_TEXT[z.letzte.stufe as Stufe] }} />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[z.b.nummer, `fällig ${datum(z.b.faellig_am)}`, z.b.projekte ? `${z.b.projekte.nummer} ${z.b.projekte.name}` : null].filter(Boolean).join(" · ")}
                  </p>
                  {z.letzte && z.letzte.frist_bis >= heute && (
                    <p className="text-xs text-muted-foreground">Frist bis {datum(z.letzte.frist_bis)}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="zahl font-semibold">{euro(z.offen)}</p>
                  {z.offen < Number(z.b.brutto) && <p className="zahl text-xs text-muted-foreground">von {euro(Number(z.b.brutto))}</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <Button variant="outline" className="h-11 gap-1.5" onClick={() => setZahlung(z.b)} disabled={!!laeuft}>
                  <Wallet className="h-4 w-4" /> Zahlung
                </Button>
                {z.zuMahnen && z.vorschlag ? (
                  <Button className="h-11 gap-1.5" onClick={() => setMahnFrage(z)} disabled={!!laeuft}>
                    {laeuft === z.b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                    {z.vorschlag.stufe === 1 ? "Erinnern" : z.vorschlag.stufe === 2 ? "Mahnen" : "Letzte Mahnung"}
                  </Button>
                ) : <span className="hidden sm:block sm:w-[7.5rem]" />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {zahlung && (
        <ZahlungDialog belegId={zahlung.id} nummer={zahlung.nummer} offen={offenBetrag(zahlung.brutto, zahlung.zahlungen)}
          open={!!zahlung} onOpenChange={(o) => { if (!o) setZahlung(null); }} />
      )}
      <AlertDialog open={!!mahnFrage} onOpenChange={(o) => { if (!o) setMahnFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mahnFrage?.vorschlag ? STUFE_TEXT[mahnFrage.vorschlag.stufe] : ""} erstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              {mahnFrage?.vorschlag && `${mahnFrage.b.nummer} · ${mahnFrage.b.empf_name ?? ""} — seit ${mahnFrage.vorschlag.tage} ${mahnFrage.vorschlag.tage === 1 ? "Tag" : "Tagen"} überfällig. Neue Frist: ${datum(mahnFrage.vorschlag.frist_bis)}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mahnFrage?.vorschlag && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt>Offen</dt><dd className="zahl text-right">{euro(mahnFrage.vorschlag.offen)}</dd>
              {mahnFrage.vorschlag.zinsen > 0 && <><dt>Verzugszinsen</dt><dd className="zahl text-right">{euro(mahnFrage.vorschlag.zinsen)}</dd></>}
              {mahnFrage.vorschlag.spesen > 0 && <><dt>Mahnspesen</dt><dd className="zahl text-right">{euro(mahnFrage.vorschlag.spesen)}</dd></>}
              <dt className="font-semibold">Zu zahlen</dt><dd className="zahl text-right font-semibold">{euro(mahnGesamt(mahnFrage.vorschlag))}</dd>
            </dl>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={() => mahnFrage && void mahnen(mahnFrage)}>Erstellen und PDF</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
    </Seite>
  );
}
