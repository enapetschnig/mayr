import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileText, Plus, Receipt, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Seite } from "@/components/PageHeader";
import { AktionsKachel, Kennzahl, Leer } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { BelegListe } from "@/components/belege/BelegListe";
import { listenStatus, useBelege, verrechneteAngeboteAus, type BelegListenEintrag } from "@/components/belege/daten";
import { euro, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

type Typ = "alle" | "angebot" | "rechnung";

const STATUS_FILTER: { wert: string; text: string; typ?: Typ }[] = [
  { wert: "alle", text: "Alle Status" },
  { wert: "entwurf", text: "Entwürfe" },
  { wert: "offen", text: "Offen" },
  { wert: "ueberfaellig", text: "Überfällig", typ: "rechnung" },
  { wert: "bezahlt", text: "Bezahlt", typ: "rechnung" },
  { wert: "storniert", text: "Storniert", typ: "rechnung" },
  { wert: "angenommen", text: "Angenommen", typ: "angebot" },
  { wert: "abgelehnt", text: "Abgelehnt", typ: "angebot" },
  { wert: "verrechnet", text: "In Rechnung übernommen", typ: "angebot" },
];

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Alle Angebote und Rechnungen. Filter stehen in der Adresse
 * (`?typ=rechnung&filter=offen&q=huber`) — die Startseite verlinkt direkt
 * auf „überfällig“, „offen“, „Entwürfe“ und „Angebote ohne Antwort“.
 */
export default function Belege() {
  const pc = useIstPc();
  const heute = isoTag();
  const [params, setParams] = useSearchParams();
  const { data: belege = [], isLoading, error } = useBelege();

  // Links der Startseite: ?filter=angebote → Angebote ohne Antwort,
  // ?filter=offen|ueberfaellig → Rechnungen
  useEffect(() => {
    const f = params.get("filter");
    if (params.get("typ")) return;
    const typ = f === "angebote" ? "angebot" : f === "offen" || f === "ueberfaellig" ? "rechnung" : null;
    if (!typ) return;
    const neu = new URLSearchParams(params);
    neu.set("typ", typ);
    if (f === "angebote") neu.set("filter", "offen");
    setParams(neu, { replace: true });
  }, [params, setParams]);

  const typ: Typ = params.get("typ") === "angebot" ? "angebot" : params.get("typ") === "rechnung" ? "rechnung" : "alle";
  const filter = STATUS_FILTER.some((s) => s.wert === params.get("filter")) ? params.get("filter")! : "alle";
  const suche = params.get("q") ?? "";

  const setzen = (werte: Record<string, string | null>) => {
    const neu = new URLSearchParams(params);
    Object.entries(werte).forEach(([k, v]) => (v ? neu.set(k, v) : neu.delete(k)));
    setParams(neu, { replace: true });
  };

  const verrechnet = useMemo(() => verrechneteAngeboteAus(belege), [belege]);

  const zahlen = useMemo(() => {
    const offen = belege.filter((b) => b.typ === "rechnung" && b.status === "offen");
    const ueber = offen.filter((b) => b.faellig_am && b.faellig_am < heute);
    const angebote = belege.filter((b) => b.typ === "angebot" && b.status === "offen" && !verrechnet.has(b.id));
    const summe = (l: BelegListenEintrag[], feld: "brutto" | "netto") => l.reduce((s, b) => s + Number(b[feld]), 0);
    return {
      offen: offen.length, offenSumme: summe(offen, "brutto"),
      ueber: ueber.length, ueberSumme: summe(ueber, "brutto"),
      angebote: angebote.length, angeboteSumme: summe(angebote, "netto"),
      entwuerfe: belege.filter((b) => b.status === "entwurf").length,
    };
  }, [belege, heute, verrechnet]);

  const liste = useMemo(() => {
    const woerter = normal(suche).split(/\s+/).filter(Boolean);
    return belege.filter((b) => {
      if (typ !== "alle" && b.typ !== typ) return false;
      const status = listenStatus(b, heute, verrechnet);
      if (filter === "offen" && !(status === "offen" || status === "ueberfaellig")) return false;
      if (filter === "storniert" && !(status === "storniert" || status === "storno")) return false;
      if (filter !== "alle" && filter !== "offen" && filter !== "storniert" && status !== filter) return false;
      if (!woerter.length) return true;
      const text = normal([b.nummer, b.empf_name, b.betreff, b.projekte?.nummer, b.projekte?.name].filter(Boolean).join(" "));
      return woerter.every((w) => text.includes(w));
    });
  }, [belege, typ, filter, suche, heute, verrechnet]);

  // Angebote und Rechnungen getrennt — zusammengezählt sagt die Summe nichts.
  // Es zählen nur fertige: keine Entwürfe, kein Storno, keine abgelehnten Angebote.
  const zaehlt = (b: BelegListenEintrag) =>
    b.typ === "rechnung" ? b.status === "offen" || b.status === "bezahlt" : b.status === "offen" || b.status === "angenommen";
  const summenListe = (["rechnung", "angebot"] as const)
    .map((t) => {
      const l = liste.filter((b) => b.typ === t && zaehlt(b));
      return { typ: t, anzahl: l.length, summe: l.reduce((s, b) => s + Number(b.brutto), 0) };
    })
    .filter((x) => x.anzahl > 0);
  const ohneListe = [
    liste.some((b) => b.status === "entwurf") && "Entwürfe",
    liste.some((b) => b.status === "storniert" || b.status === "storno") && "Storno",
    liste.some((b) => b.status === "abgelehnt") && "abgelehnte Angebote",
  ].filter((x): x is string => !!x);
  const gefiltert = typ !== "alle" || filter !== "alle" || !!suche;

  const neuKnoepfe = pc ? (
    <>
      <Button asChild variant="outline" className="h-10">
        <Link to="/belege/neu?typ=rechnung"><Plus className="h-4 w-4" /> Neue Rechnung</Link>
      </Button>
      <Button asChild className="h-10">
        <Link to="/belege/neu?typ=angebot"><Plus className="h-4 w-4" /> Neues Angebot</Link>
      </Button>
    </>
  ) : undefined;

  const statusOptionen = STATUS_FILTER.filter((s) => !s.typ || typ === "alle" || s.typ === typ);

  const anzahlText = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
  const kacheln = [
    {
      titel: "Offene Rechnungen", kurz: "Offen", icon: Receipt, wert: euro(zahlen.offenSumme),
      unter: anzahlText(zahlen.offen, "Rechnung", "Rechnungen"), unterKurz: anzahlText(zahlen.offen, "Rechnung", "Rechnungen"),
      aktiv: typ === "rechnung" && filter === "offen", onClick: () => setzen({ typ: "rechnung", filter: "offen" }),
    },
    {
      titel: "Überfällig", kurz: "Überfällig", icon: AlertTriangle, wert: euro(zahlen.ueberSumme),
      unter: zahlen.ueber ? `${anzahlText(zahlen.ueber, "Rechnung", "Rechnungen")} — nachfragen` : "nichts überfällig",
      unterKurz: zahlen.ueber ? anzahlText(zahlen.ueber, "Rechnung", "Rechnungen") : "nichts überfällig",
      aktiv: filter === "ueberfaellig", onClick: () => setzen({ typ: "rechnung", filter: "ueberfaellig" }),
    },
    {
      titel: "Angebote ohne Antwort", kurz: "Angebote offen", icon: FileText, wert: euro(zahlen.angeboteSumme),
      unter: `${anzahlText(zahlen.angebote, "Angebot", "Angebote")} · netto`, unterKurz: `${anzahlText(zahlen.angebote, "Angebot", "Angebote")} · netto`,
      aktiv: typ === "angebot" && filter === "offen", onClick: () => setzen({ typ: "angebot", filter: "offen" }),
    },
    {
      titel: "Entwürfe", kurz: "Entwürfe", icon: FileText, wert: String(zahlen.entwuerfe),
      unter: "noch nicht fertiggestellt", unterKurz: "nicht fertig",
      aktiv: filter === "entwurf", onClick: () => setzen({ typ: null, filter: "entwurf" }),
    },
  ];

  return (
    <Seite titel="Angebote & Rechnungen" untertitel={`${belege.length} Belege`} aktionen={neuKnoepfe} breit={pc}>
      {!pc && (
        <div className="grid grid-cols-2 gap-2.5">
          <AktionsKachel icon={FileText} titel="Neues Angebot" to="/belege/neu?typ=angebot" ton="primaer" />
          <AktionsKachel icon={Receipt} titel="Neue Rechnung" to="/belege/neu?typ=rechnung" />
        </div>
      )}

      {/* Kennzahlen = Abkürzungen in den Filter. Am Handy kompakt, damit die Liste nicht nach unten rutscht. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5">
        {kacheln.map((k) => (
          <button
            key={k.titel}
            type="button"
            onClick={k.onClick}
            aria-pressed={k.aktiv}
            className={cn(
              "rounded-lg text-left [&>div]:h-full [&>div]:transition-colors hover:[&>div]:border-primary/50",
              k.aktiv && "[&>div]:border-primary [&>div]:bg-primary-soft",
            )}
          >
            {pc ? (
              <Kennzahl titel={k.titel} icon={k.icon} wert={k.wert} unter={k.unter} />
            ) : (
              <div className="rounded-lg border bg-card px-3 py-2.5">
                <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground"><k.icon className="h-3.5 w-3.5 shrink-0" />{k.kurz}</p>
                <p className="zahl mt-0.5 text-base font-bold leading-tight">{k.wert}</p>
                <p className="truncate text-[11px] text-muted-foreground">{k.unterKurz}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={suche}
            onChange={(e) => setzen({ q: e.target.value || null })}
            placeholder="Nummer, Kunde, Betreff …"
            className="h-11 pl-9 pr-10 text-base lg:text-sm"
            aria-label="Suchen"
          />
          {suche && (
            <button type="button" onClick={() => setzen({ q: null })} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground" aria-label="Suche leeren">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Art">
          {([["alle", "Alle"], ["angebot", "Angebote"], ["rechnung", "Rechnungen"]] as [Typ, string][]).map(([t, text]) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                const passt = STATUS_FILTER.find((s) => s.wert === filter);
                setzen({ typ: t === "alle" ? null : t, filter: passt?.typ && t !== "alle" && passt.typ !== t ? null : params.get("filter") });
              }}
              className={cn(
                "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                typ === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
              )}
              aria-pressed={typ === t}
            >
              {text}
            </button>
          ))}
        </div>
        <Select value={filter} onValueChange={(v) => setzen({ filter: v === "alle" ? null : v })}>
          <SelectTrigger className="h-11 lg:w-56" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusOptionen.map((s) => <SelectItem key={s.wert} value={s.wert}>{s.text}</SelectItem>)}
          </SelectContent>
        </Select>
        {gefiltert && (
          <Button variant="ghost" className="h-11 text-muted-foreground lg:ml-auto" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {error ? (
        <Leer icon={AlertTriangle} text={`Belege konnten nicht geladen werden: ${(error as Error).message}`} />
      ) : isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p>
      ) : !liste.length ? (
        <Leer icon={FileText} text={gefiltert ? "Nichts gefunden — Filter ändern oder zurücksetzen." : "Noch keine Angebote oder Rechnungen."}>
          {!gefiltert && (
            <Button asChild className="h-11"><Link to="/belege/neu?typ=angebot"><Plus className="h-4 w-4" /> Erstes Angebot schreiben</Link></Button>
          )}
        </Leer>
      ) : (
        <div className="space-y-2">
          <BelegListe belege={liste} heute={heute} pc={pc} verrechneteAngebote={verrechnet} />
          <p className="px-1 text-right text-xs text-muted-foreground">
            {liste.length} {liste.length === 1 ? "Beleg" : "Belege"}
            {summenListe.map((x) => (
              <span key={x.typ}>
                {" · "}{x.typ === "rechnung" ? "Rechnungen" : "Angebote"} <span className="zahl font-semibold text-foreground">{euro(x.summe)}</span>
              </span>
            ))}
            {summenListe.length > 0 && " brutto"}
            {summenListe.length > 0 && ohneListe.length > 0 && ` (ohne ${ohneListe.join(", ").replace(/, ([^,]*)$/, " und $1")})`}
          </p>
        </div>
      )}
    </Seite>
  );
}
