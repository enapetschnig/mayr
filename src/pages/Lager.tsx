import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown, ChevronRight, ClipboardCheck, Download, History, Loader2, Package, PackagePlus, Plus, Search, Truck, Warehouse,
} from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Abschnitt, AktionsKachel, Kennzahl, Leer, StatusPille } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LagerortDialog } from "@/components/material/LagerortDialog";
import {
  artikelInfo, fehlerText, lagerVorzeichen, mengeText, nachVorgang, runden3, useAlleLagerorte, useLagerArtikel,
  useLagerbestand, useLetzteBuchungen, useMaterialLive, zeitpunktText, type ArtikelLager,
} from "@/components/material/materialDaten";
import { useMitarbeiter } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { csvHerunterladen } from "@/lib/abfrage";
import { euro, isoTag, zahl } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import { BUCHUNGS_ART, KATEGORIEN_ARTIKEL, name, type BuchungsArt, type Lagerort } from "@/lib/types";
import { cn } from "@/lib/utils";

type LagerZeile = {
  artikel: ArtikelLager;
  /** Summe über alle aktiven Lagerorte */
  gesamt: number;
  jeOrt: Map<string, number>;
  /** Mindestbestand − Bestand; > 0 heißt nachbestellen */
  fehlt: number;
  suchtext: string;
};

const SEITE = 150;

/**
 * Lager: Bestand je Artikel über alle Lagerorte (View lagerbestand),
 * was nachzubestellen ist und was zuletzt gebucht wurde. Der Chef bucht von
 * hier Wareneingang und Inventur (über den Scanner) und verwaltet die
 * Lagerorte; Monteure sehen nur.
 */
export default function Lager() {
  const pc = useIstPc();
  const { istChef } = useSitzung();
  const { data: bestand = [], isLoading: laedtBestand, error: bestandFehler } = useLagerbestand();
  const { data: lagerArtikel = [], isLoading: laedtArtikel } = useLagerArtikel();
  const { data: alleOrte = [] } = useAlleLagerorte();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  useMaterialLive();

  const orte = useMemo(() => alleOrte.filter((o) => o.aktiv), [alleOrte]);
  const [ortFilter, setOrtFilter] = useState("alle");
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState("alle");
  const [nurNachbestellen, setNurNachbestellen] = useState(false);
  const [auf, setAuf] = useState<string | null>(null);
  const [zeigen, setZeigen] = useState(SEITE);
  const [anzahl, setAnzahl] = useState(30);
  const [ortDialog, setOrtDialog] = useState<{ ort: Lagerort | null } | null>(null);

  const filterOrt = ortFilter !== "alle" && orte.some((o) => o.id === ortFilter) ? ortFilter : null;
  const { data: letzte = [], isFetching: letzteLaedt } = useLetzteBuchungen(filterOrt, anzahl);

  const zeilen = useMemo<LagerZeile[]>(() => {
    const aktiv = new Set(orte.map((o) => o.id));
    const karte = new Map<string, LagerZeile>();
    const holen = (a: ArtikelLager) => {
      let z = karte.get(a.id);
      if (!z) {
        const suchtext = [a.bezeichnung, a.hersteller, a.hersteller_nr, a.artikelnummer, a.ean, a.kategorie]
          .filter(Boolean).join(" ").toLowerCase();
        z = { artikel: a, gesamt: 0, jeOrt: new Map(), fehlt: 0, suchtext };
        karte.set(a.id, z);
      }
      return z;
    };
    lagerArtikel.forEach(holen);
    bestand.forEach((b) => {
      if (!b.artikel || !aktiv.has(b.lagerort_id)) return;
      const z = holen(b.artikel);
      z.jeOrt.set(b.lagerort_id, runden3((z.jeOrt.get(b.lagerort_id) ?? 0) + b.bestand));
      z.gesamt = runden3(z.gesamt + b.bestand);
    });
    karte.forEach((z) => {
      const min = z.artikel.mindestbestand;
      z.fehlt = min != null ? runden3(Number(min) - z.gesamt) : 0;
    });
    return [...karte.values()].sort((a, b) => a.artikel.bezeichnung.localeCompare(b.artikel.bezeichnung, "de"));
  }, [bestand, lagerArtikel, orte]);

  const nachbestellen = zeilen.filter((z) => z.fehlt > 0);
  const mitBestand = zeilen.filter((z) => z.gesamt > 0).length;
  const lagerwert = runden2(zeilen.reduce((s, z) => s + Math.max(0, z.gesamt) * Number(z.artikel.ek_preis ?? 0), 0));

  // Artikel mit Bestand je Lagerort (auch stillgelegte — Warnung beim Stilllegen)
  const artikelJeOrt = useMemo(() => {
    const m = new Map<string, number>();
    bestand.forEach((b) => { if (b.bestand) m.set(b.lagerort_id, (m.get(b.lagerort_id) ?? 0) + 1); });
    return m;
  }, [bestand]);

  const worte = suche.toLowerCase().split(/\s+/).filter(Boolean);
  const sichtbar = zeilen.filter((z) => {
    if (nurNachbestellen) {
      if (!(z.fehlt > 0)) return false;
    } else if (filterOrt) {
      if (!z.jeOrt.get(filterOrt)) return false;
    } else if (!z.gesamt && !z.artikel.lagerartikel && z.artikel.mindestbestand == null) {
      return false;
    }
    if (kategorie === "ohne" ? !!z.artikel.kategorie : kategorie !== "alle" && z.artikel.kategorie !== kategorie) return false;
    return worte.every((w) => z.suchtext.includes(w));
  });
  const kategorien = useMemo(() => {
    const da = new Set(zeilen.map((z) => z.artikel.kategorie).filter((k): k is string => !!k));
    return [...KATEGORIEN_ARTIKEL.filter((k) => da.has(k)), ...[...da].filter((k) => !KATEGORIEN_ARTIKEL.includes(k)).sort()];
  }, [zeilen]);

  // Artikelnummer und Menge vorne: so nehmen Großhändler-Webshops (Sonepar: CSV-Upload
  // „Artikel und Menge“) die Datei an. Bestellt wird bis zum Mindestbestand, ganze Einheiten.
  const bestelllisteLaden = () => csvHerunterladen(`bestellliste-${isoTag()}.csv`, [
    ["Artikelnummer", "Menge", "Einheit", "Bezeichnung", "Hersteller", "Hersteller-Nr.", "EAN", "Lieferant", "Bestand", "Mindestbestand"],
    ...nachbestellen.map(({ artikel: a, fehlt, gesamt }) => [
      a.artikelnummer, Math.ceil(fehlt), a.einheit, a.bezeichnung, a.hersteller, a.hersteller_nr, a.ean, a.lieferant, gesamt, a.mindestbestand,
    ]),
  ]);

  const gruppen = nachVorgang(letzte);
  const laedt = laedtBestand || laedtArtikel;
  const ortName = orte.find((o) => o.id === filterOrt)?.name;
  const lagerParam = filterOrt ? `&lager=${filterOrt}` : "";
  const reihenfolgeNeu = alleOrte.reduce((m, o) => Math.max(m, o.reihenfolge), 0) + 1;
  const mengeAnzeige = (z: LagerZeile) => (filterOrt && !nurNachbestellen ? z.jeOrt.get(filterOrt) ?? 0 : z.gesamt);

  const filterKnopf = (aktiv: boolean) => cn(
    "h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
    aktiv ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
  );

  let liste;
  if (laedt) {
    liste = (
      <p className="flex items-center justify-center gap-2 rounded-lg border bg-card py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Bestand wird geladen …
      </p>
    );
  } else if (bestandFehler) {
    liste = <p className="rounded-lg border bg-card py-10 text-center text-sm text-destructive">Bestand nicht geladen: {fehlerText(bestandFehler)}</p>;
  } else if (!sichtbar.length) {
    liste = (
      <div className="rounded-lg border bg-card">
        <Leer icon={Package} text={
          zeilen.length ? "Nichts gefunden — Filter oder Suche ändern." : "Noch nichts am Lager. Der Chef bucht Lieferungen über „Wareneingang“."
        } />
      </div>
    );
  } else if (pc) {
    liste = (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2.5 pl-4 pr-2 font-medium">Artikel</th>
              {orte.map((o) => (
                <th key={o.id} className={cn("px-2 text-right font-medium", filterOrt === o.id && "text-primary")}>{o.name}</th>
              ))}
              <th className="px-2 text-right font-medium">Gesamt</th>
              <th className="px-2 text-right font-medium">Mindest</th>
              {istChef && <th className="px-2 pr-4 text-right font-medium">Wert (EK)</th>}
            </tr>
          </thead>
          <tbody>
            {sichtbar.slice(0, zeigen).map((z) => {
              const a = z.artikel;
              return (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/40">
                  <td className="py-2.5 pl-4 pr-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{a.bezeichnung}</span>
                      {z.fehlt > 0 && <StatusPille eintrag={{ ton: "gelb", text: `Nachbestellen · ${zahl(z.fehlt)}` }} />}
                    </div>
                    <p className="text-xs text-muted-foreground">{artikelInfo(a) || a.kategorie}</p>
                  </td>
                  {orte.map((o) => {
                    const b = z.jeOrt.get(o.id) ?? 0;
                    return (
                      <td key={o.id} className={cn("zahl px-2 text-right", !b && "text-muted-foreground", b < 0 && "text-destructive",
                        filterOrt === o.id && "bg-primary-soft font-semibold")}>
                        {b ? zahl(b) : "–"}
                      </td>
                    );
                  })}
                  <td className={cn("zahl whitespace-nowrap px-2 text-right font-semibold", z.gesamt < 0 && "text-destructive")}>
                    {mengeText(z.gesamt, a.einheit)}
                  </td>
                  <td className="zahl px-2 text-right text-muted-foreground">{a.mindestbestand != null ? zahl(a.mindestbestand) : "–"}</td>
                  {istChef && (
                    <td className="zahl whitespace-nowrap px-2 pr-4 text-right">
                      {a.ek_preis != null && z.gesamt > 0 ? euro(runden2(z.gesamt * Number(a.ek_preis))) : "–"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } else {
    liste = (
      <div className="divide-y rounded-lg border bg-card">
        {sichtbar.slice(0, zeigen).map((z) => {
          const a = z.artikel;
          const offen = auf === a.id;
          const menge = mengeAnzeige(z);
          return (
            <div key={a.id}>
              <button type="button" onClick={() => setAuf(offen ? null : a.id)} aria-expanded={offen}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors active:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium leading-snug">{a.bezeichnung}</p>
                  <p className="truncate text-xs text-muted-foreground">{artikelInfo(a) || a.kategorie}</p>
                  {z.fehlt > 0 && (
                    <StatusPille className="mt-1" eintrag={{ ton: "gelb", text: `Nachbestellen · ${zahl(z.fehlt)} fehlen` }} />
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("zahl whitespace-nowrap font-semibold", menge < 0 && "text-destructive")}>{mengeText(menge, a.einheit)}</p>
                  {/* Mindestbestand gilt für alle Lagerorte zusammen — nur neben der Summe zeigen */}
                  {a.mindestbestand != null && menge === z.gesamt && (!filterOrt || nurNachbestellen) && (
                    <p className="whitespace-nowrap text-xs text-muted-foreground">min. <span className="zahl">{zahl(a.mindestbestand)}</span></p>
                  )}
                </div>
                <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
              </button>
              {offen && (
                <ul className="divide-y border-t bg-muted/30 px-3">
                  {orte.map((o) => {
                    const b = z.jeOrt.get(o.id) ?? 0;
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className={cn("min-w-0 truncate", filterOrt === o.id && "font-semibold")}>{o.name}</span>
                        <span className={cn("zahl shrink-0", !b && "text-muted-foreground", b < 0 && "text-destructive")}>
                          {b ? mengeText(b, a.einheit) : "–"}
                        </span>
                      </li>
                    );
                  })}
                  {istChef && a.ek_preis != null && z.gesamt > 0 && (
                    <li className="flex items-center justify-between gap-3 py-2 text-sm text-muted-foreground">
                      <span>Wert (EK)</span>
                      <span className="zahl">{euro(runden2(z.gesamt * Number(a.ek_preis)))}</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Seite titel="Lager" untertitel={ortName ? `Bestand · ${ortName}` : "Bestand über alle Lagerorte"} breit>
      {istChef && (
        <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
          <AktionsKachel icon={PackagePlus} titel="Wareneingang" unter="Lieferung einbuchen" to={`/scan?modus=zugang${lagerParam}`} />
          <AktionsKachel icon={ClipboardCheck} titel="Inventur" unter="Zählen, korrigieren" to={`/scan?modus=korrektur${lagerParam}`} />
        </div>
      )}

      <div className={cn("grid gap-3", istChef ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2")}>
        <Kennzahl titel="Artikel mit Bestand" wert={zahl(mitBestand)} icon={Package} />
        <Kennzahl titel="Nachbestellen" wert={zahl(nachbestellen.length)} unter={nachbestellen.length ? "unter Mindestbestand" : "alles da"} />
        {istChef && <Kennzahl titel="Lagerwert (EK)" wert={euro(lagerwert)} className="col-span-2 lg:col-span-1" />}
      </div>

      <div className="space-y-3">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" className={filterKnopf(!filterOrt)} onClick={() => setOrtFilter("alle")}>Alle Lagerorte</button>
          {orte.map((o) => (
            <button key={o.id} type="button" className={filterKnopf(filterOrt === o.id)} onClick={() => { setOrtFilter(o.id); setZeigen(SEITE); }}>
              {o.name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={suche} onChange={(e) => { setSuche(e.target.value); setZeigen(SEITE); }} placeholder="Artikel, Hersteller, Nummer, EAN …"
              className="h-11 pl-9" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Im Lager suchen" />
          </div>
          <div className="flex gap-2">
            <Select value={kategorie} onValueChange={(v) => { setKategorie(v); setZeigen(SEITE); }}>
              <SelectTrigger className="h-11 min-w-0 flex-1 sm:w-56" aria-label="Kategorie"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Kategorien</SelectItem>
                {kategorien.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                <SelectItem value="ohne">Ohne Kategorie</SelectItem>
              </SelectContent>
            </Select>
            <button type="button" className={filterKnopf(nurNachbestellen)} aria-pressed={nurNachbestellen}
              onClick={() => { setNurNachbestellen((n) => !n); setZeigen(SEITE); }}>
              Nachbestellen{nachbestellen.length ? ` · ${nachbestellen.length}` : ""}
            </button>
          </div>
        </div>
      </div>

      <section className="space-y-2.5">
        {istChef && nurNachbestellen && nachbestellen.length > 0 && (
          <Button variant="outline" className="h-11 w-full gap-2 sm:w-auto" onClick={bestelllisteLaden}>
            <Download className="h-4 w-4" /> Bestellliste als CSV · {nachbestellen.length} Artikel
          </Button>
        )}
        {liste}
        {sichtbar.length > zeigen && (
          <Button variant="outline" className="h-11 w-full" onClick={() => setZeigen((n) => n + SEITE)}>
            Weitere {Math.min(SEITE, sichtbar.length - zeigen)} von {sichtbar.length - zeigen} zeigen
          </Button>
        )}
      </section>

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <Abschnitt titel={ortName ? `Zuletzt gebucht · ${ortName}` : "Zuletzt gebucht"}>
          {!gruppen.length ? (
            <div className="rounded-lg border bg-card">
              <Leer icon={History} text={letzteLaedt ? "Wird geladen …" : "Noch keine Buchungen."} />
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {gruppen.map((g) => {
                const b0 = g.buchungen[0];
                return (
                  <div key={g.schluessel} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {BUCHUNGS_ART[b0.art as BuchungsArt] ?? b0.art}
                          {b0.projekte && (
                            <> · <Link to={`/projekte/${b0.projekte.id}`} className="font-medium text-primary hover:underline">
                              {b0.projekte.nummer} {b0.projekte.name}
                            </Link></>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {name(b0.profiles)} · {zeitpunktText(b0.created_at)}{b0.lagerorte?.name ? ` · ${b0.lagerorte.name}` : ""}
                        </p>
                        {b0.notiz && <p className="truncate text-xs text-muted-foreground">„{b0.notiz}“</p>}
                      </div>
                      <span className="zahl shrink-0 text-xs text-muted-foreground">{g.buchungen.length} Pos.</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {g.buchungen.map((b) => {
                        const delta = lagerVorzeichen(b.art) * Number(b.menge);
                        return (
                          <li key={b.id} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate">{b.artikel?.bezeichnung ?? b.bezeichnung}</span>
                            <span className="zahl shrink-0 whitespace-nowrap font-medium">
                              {delta < 0 ? "−" : "+"}{zahl(Math.abs(delta))}{" "}
                              <span className="font-normal text-muted-foreground">{b.artikel?.einheit ?? b.einheit ?? "Stk"}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          {letzte.length >= anzahl && (
            <Button variant="outline" className="h-11 w-full" disabled={letzteLaedt} onClick={() => setAnzahl((n) => n + 30)}>
              {letzteLaedt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ältere laden
            </Button>
          )}
        </Abschnitt>

        {istChef && (
          <Abschnitt
            titel="Lagerorte"
            aktion={
              <Button variant="outline" className="h-11" onClick={() => setOrtDialog({ ort: null })}>
                <Plus className="mr-1.5 h-4 w-4" /> Neuer Lagerort
              </Button>
            }
          >
            <div className="divide-y rounded-lg border bg-card">
              {!alleOrte.length && <Leer icon={Warehouse} text="Noch kein Lagerort angelegt." />}
              {alleOrte.map((o) => {
                const fahrer = mitarbeiter.find((m) => m.id === o.user_id);
                const art = o.art === "fahrzeug"
                  ? `Fahrzeug · ${fahrer ? name(fahrer) : o.user_id ? "Fahrer nicht mehr aktiv" : "niemandem zugeteilt"}`
                  : "Lager";
                const n = artikelJeOrt.get(o.id) ?? 0;
                return (
                  <button key={o.id} type="button" onClick={() => setOrtDialog({ ort: o })}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      {o.art === "fahrzeug" ? <Truck className="h-5 w-5" /> : <Warehouse className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate font-medium", !o.aktiv && "text-muted-foreground")}>{o.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{art} · {n === 1 ? "1 Artikel" : `${n} Artikel`}</p>
                    </div>
                    {!o.aktiv && <StatusPille eintrag={{ ton: "grau", text: "Stillgelegt" }} />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </Abschnitt>
        )}
      </div>

      <LagerortDialog
        open={!!ortDialog}
        onOpenChange={(o) => { if (!o) setOrtDialog(null); }}
        ort={ortDialog?.ort ?? null}
        reihenfolgeNeu={reihenfolgeNeu}
        artikelMitBestand={ortDialog?.ort ? artikelJeOrt.get(ortDialog.ort.id) ?? 0 : 0}
      />
    </Seite>
  );
}
