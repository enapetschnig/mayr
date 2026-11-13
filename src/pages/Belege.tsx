import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, LayoutTemplate, Plus, Receipt, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seite } from "@/components/PageHeader";
import { AktionsKachel, Kennzahl, Leer } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { BelegListe } from "@/components/belege/BelegListe";
import { VorlagenDialog } from "@/components/belege/VorlagenDialog";
import { listenStatus, useBelege, verrechneteAngeboteAus, type BelegListenEintrag } from "@/components/belege/daten";
import { euro, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

type Typ = "angebot" | "rechnung";
type Filter = { wert: string; text: string; passt: (status: string, b: BelegListenEintrag, heute: string) => boolean };

/** Nachfassen: offen und nicht mehr gültig — oder in den nächsten 7 Tagen abgelaufen */
const nachfassen = (status: string, b: BelegListenEintrag, heute: string) =>
  status === "offen" && !!b.gueltig_bis && b.gueltig_bis <= tagePlus(heute, 7);
const tagePlus = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const FILTER: Record<Typ, Filter[]> = {
  angebot: [
    { wert: "alle", text: "Alle", passt: () => true },
    { wert: "offen", text: "Ohne Antwort", passt: (s) => s === "offen" },
    { wert: "nachfassen", text: "Nachfassen", passt: nachfassen },
    { wert: "angenommen", text: "Angenommen", passt: (s) => s === "angenommen" },
    { wert: "entwurf", text: "Entwürfe", passt: (s) => s === "entwurf" },
    { wert: "verrechnet", text: "In Rechnung", passt: (s) => s === "verrechnet" },
    { wert: "abgelehnt", text: "Abgelehnt", passt: (s) => s === "abgelehnt" },
  ],
  rechnung: [
    { wert: "alle", text: "Alle", passt: () => true },
    { wert: "offen", text: "Offen", passt: (s) => s === "offen" || s === "ueberfaellig" },
    { wert: "ueberfaellig", text: "Überfällig", passt: (s) => s === "ueberfaellig" },
    { wert: "entwurf", text: "Entwürfe", passt: (s) => s === "entwurf" },
    { wert: "bezahlt", text: "Bezahlt", passt: (s) => s === "bezahlt" },
    { wert: "storniert", text: "Storniert", passt: (s) => s === "storniert" || s === "storno" },
  ],
};

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Alte Adressen `/belege?typ=…&filter=…` (Lesezeichen, Startseite) auf die neuen Seiten */
export function BelegeWeiter() {
  const [params] = useSearchParams();
  const f = params.get("filter");
  const typ = params.get("typ") === "angebot" || f === "angebote" ? "angebot" : "rechnung";
  const neu = new URLSearchParams();
  if (f && f !== "angebote") neu.set("filter", f);
  else if (f === "angebote") neu.set("filter", "offen");
  if (params.get("q")) neu.set("q", params.get("q")!);
  return <Navigate to={`/${typ === "angebot" ? "angebote" : "rechnungen"}${neu.toString() ? `?${neu}` : ""}`} replace />;
}

/**
 * Angebote oder Rechnungen — zwei eigene Seiten, weil die Frage dahinter eine
 * andere ist: „Wem muss ich nachtelefonieren?“ und „Wer hat noch nicht bezahlt?“.
 * Filter in der Adresse (`?filter=offen&q=huber`), die Startseite verlinkt direkt.
 */
export default function Belege({ typ }: { typ: Typ }) {
  const pc = useIstPc();
  const navigate = useNavigate();
  const [vorlagenOffen, setVorlagenOffen] = useState(false);
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const { data: alle = [], isLoading, error } = useBelege();
  const angebot = typ === "angebot";
  const filterListe = FILTER[typ];
  const filter = filterListe.find((f) => f.wert === params.get("filter")) ?? filterListe[0];
  const suche = params.get("q") ?? "";

  const setzen = (werte: Record<string, string | null>) => {
    const neu = new URLSearchParams(params);
    Object.entries(werte).forEach(([k, v]) => (v ? neu.set(k, v) : neu.delete(k)));
    setParams(neu, { replace: true });
  };

  const verrechnet = useMemo(() => verrechneteAngeboteAus(alle), [alle]);
  const belege = useMemo(() => alle.filter((b) => b.typ === typ), [alle, typ]);
  const mitStatus = useMemo(() => belege.map((b) => ({ b, s: listenStatus(b, heute, verrechnet) })), [belege, heute, verrechnet]);

  const liste = useMemo(() => {
    const woerter = normal(suche).split(/\s+/).filter(Boolean);
    return mitStatus.filter(({ b, s }) => {
      if (!filter.passt(s, b, heute)) return false;
      if (!woerter.length) return true;
      const text = normal([b.nummer, b.empf_name, b.betreff, b.projekte?.nummer, b.projekte?.name].filter(Boolean).join(" "));
      return woerter.every((w) => text.includes(w));
    }).map(({ b }) => b);
  }, [mitStatus, filter, suche, heute]);

  const anzahl = (f: Filter) => mitStatus.filter(({ b, s }) => f.passt(s, b, heute)).length;
  const summe = (f: (s: string, b: BelegListenEintrag) => boolean, feld: "netto" | "brutto") =>
    mitStatus.filter(({ b, s }) => f(s, b)).reduce((x, { b }) => x + Number(b[feld]), 0);
  const zaehlen = (f: (s: string, b: BelegListenEintrag) => boolean) => mitStatus.filter(({ b, s }) => f(s, b)).length;
  const n = (k: number, eins: string, viele: string) => `${k} ${k === 1 ? eins : viele}`;
  const jahr = heute.slice(0, 4);

  // Kennzahlen = Abkürzungen in den Filter
  const kacheln = angebot
    ? [
      { titel: "Ohne Antwort", icon: FileText, wert: euro(summe((s) => s === "offen", "netto")), unter: `${n(zaehlen((s) => s === "offen"), "Angebot", "Angebote")} · netto`, filter: "offen" },
      { titel: "Nachfassen", icon: CalendarClock, wert: String(zaehlen((s, b) => nachfassen(s, b, heute))), unter: "läuft ab oder abgelaufen", filter: "nachfassen" },
      { titel: "Angenommen", icon: CheckCircle2, wert: euro(summe((s) => s === "angenommen", "netto")), unter: "noch nicht in Rechnung · netto", filter: "angenommen" },
      { titel: "Entwürfe", icon: FileText, wert: String(zaehlen((s) => s === "entwurf")), unter: "noch nicht fertig", filter: "entwurf" },
    ]
    : [
      { titel: "Offen", icon: Receipt, wert: euro(summe((s) => s === "offen" || s === "ueberfaellig", "brutto")), unter: n(zaehlen((s) => s === "offen" || s === "ueberfaellig"), "Rechnung", "Rechnungen"), filter: "offen" },
      { titel: "Überfällig", icon: AlertTriangle, wert: euro(summe((s) => s === "ueberfaellig", "brutto")), unter: zaehlen((s) => s === "ueberfaellig") ? `${n(zaehlen((s) => s === "ueberfaellig"), "Rechnung", "Rechnungen")} — mahnen` : "nichts überfällig", filter: "ueberfaellig" },
      { titel: "Entwürfe", icon: FileText, wert: String(zaehlen((s) => s === "entwurf")), unter: "noch nicht fertig", filter: "entwurf" },
      { titel: `Bezahlt ${jahr}`, icon: CheckCircle2, wert: euro(summe((s, b) => s === "bezahlt" && (b.bezahlt_am ?? b.datum).startsWith(jahr), "brutto")), unter: "brutto", filter: "bezahlt" },
    ];

  // Es zählen nur fertige: keine Entwürfe, kein Storno, keine abgelehnten Angebote
  const zaehlt = (b: BelegListenEintrag) => (angebot ? b.status === "offen" || b.status === "angenommen" : b.status === "offen" || b.status === "bezahlt");
  const listenSumme = liste.filter(zaehlt).reduce((x, b) => x + Number(angebot ? b.netto : b.brutto), 0);
  const gefiltert = filter.wert !== "alle" || !!suche;
  const pfad = angebot ? "/belege/neu?typ=angebot" : "/belege/neu?typ=rechnung";

  const neuKnoepfe = pc ? (
    angebot ? (
      <>
        <Button variant="outline" className="h-10" onClick={() => setVorlagenOffen(true)}><LayoutTemplate className="h-4 w-4" /> Aus Vorlage</Button>
        <Button asChild variant="outline" className="h-10"><Link to="/belege/neu?typ=angebot&ki=1"><Sparkles className="h-4 w-4" /> Angebot mit KI</Link></Button>
        <Button asChild className="h-10"><Link to={pfad}><Plus className="h-4 w-4" /> Neues Angebot</Link></Button>
      </>
    ) : <Button asChild className="h-10"><Link to={pfad}><Plus className="h-4 w-4" /> Neue Rechnung</Link></Button>
  ) : undefined;

  return (
    <Seite titel={angebot ? "Angebote" : "Rechnungen"} untertitel={`${belege.length} ${angebot ? (belege.length === 1 ? "Angebot" : "Angebote") : (belege.length === 1 ? "Rechnung" : "Rechnungen")}`}
      aktionen={neuKnoepfe} breit={pc}>
      {!pc && (
        angebot ? (
          <div className="grid grid-cols-2 gap-2.5">
            <AktionsKachel icon={FileText} titel="Neues Angebot" to={pfad} ton="primaer" className="col-span-2" />
            <AktionsKachel icon={LayoutTemplate} titel="Aus Vorlage" unter="PV, Speicher, Wallbox …" onClick={() => setVorlagenOffen(true)} />
            <AktionsKachel icon={Sparkles} titel="Mit KI" unter="„PV-Anlage 9 kWp“" to="/belege/neu?typ=angebot&ki=1" />
          </div>
        ) : <AktionsKachel icon={Receipt} titel="Neue Rechnung" to={pfad} ton="primaer" />
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5">
        {kacheln.map((k) => {
          const aktiv = filter.wert === k.filter;
          return (
            <button key={k.titel} type="button" onClick={() => setzen({ filter: aktiv ? null : k.filter })} aria-pressed={aktiv}
              className={cn("rounded-lg text-left [&>div]:h-full [&>div]:transition-colors hover:[&>div]:border-primary/50", aktiv && "[&>div]:border-primary [&>div]:bg-primary-soft")}>
              {pc ? <Kennzahl titel={k.titel} icon={k.icon} wert={k.wert} unter={k.unter} /> : (
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground"><k.icon className="h-3.5 w-3.5 shrink-0" />{k.titel}</p>
                  <p className="zahl mt-0.5 text-base font-bold leading-tight">{k.wert}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{k.unter}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
        <div className="relative lg:w-80 lg:shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={suche} onChange={(e) => setzen({ q: e.target.value || null })} placeholder="Nummer, Kunde, Betreff, Projekt …"
            className="h-11 pl-9 pr-10 text-base lg:text-sm" aria-label="Suchen" />
          {suche && (
            <button type="button" onClick={() => setzen({ q: null })} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground" aria-label="Suche leeren">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0" role="group" aria-label="Status">
          {filterListe.map((f) => {
            const k = anzahl(f);
            if (k === 0 && f.wert !== "alle" && f.wert !== filter.wert) return null;
            return (
              <button key={f.wert} type="button" onClick={() => setzen({ filter: f.wert === "alle" ? null : f.wert })} aria-pressed={filter.wert === f.wert}
                className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  filter.wert === f.wert ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                {f.text} <span className="zahl text-xs opacity-70">{k}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <Leer icon={AlertTriangle} text={`Konnte nicht geladen werden: ${(error as Error).message}`} />
      ) : isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p>
      ) : !liste.length ? (
        <Leer icon={angebot ? FileText : Receipt} text={gefiltert ? "Nichts gefunden — Filter ändern oder zurücksetzen." : angebot ? "Noch keine Angebote." : "Noch keine Rechnungen."}>
          {gefiltert
            ? <Button variant="outline" className="h-11" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Filter zurücksetzen</Button>
            : <Button asChild className="h-11"><Link to={pfad}><Plus className="h-4 w-4" /> {angebot ? "Erstes Angebot schreiben" : "Erste Rechnung schreiben"}</Link></Button>}
        </Leer>
      ) : (
        <div className="space-y-2">
          <BelegListe belege={liste} heute={heute} pc={pc} verrechneteAngebote={verrechnet} />
          <p className="px-1 text-right text-xs text-muted-foreground">
            {liste.length} {angebot ? (liste.length === 1 ? "Angebot" : "Angebote") : (liste.length === 1 ? "Rechnung" : "Rechnungen")}
            {listenSumme > 0 && <> · <span className="zahl font-semibold text-foreground">{euro(listenSumme)}</span> {angebot ? "netto" : "brutto"} (ohne Entwürfe{angebot ? ", Abgelehnte" : ", Storno"})</>}
          </p>
        </div>
      )}
      {angebot && (
        <VorlagenDialog open={vorlagenOffen} onOpenChange={setVorlagenOffen} knopfText="Neues Angebot daraus"
          onWahl={(w) => navigate(`/belege/neu?typ=angebot&vorlage=${w.vorlage.id}${w.nachgezogen ? "" : "&preise=vorlage"}`)} />
      )}
    </Seite>
  );
}
