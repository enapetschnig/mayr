import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Package, Plus, ScanBarcode, Search, SearchX, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useVerzoegert } from "@/components/material/ArtikelSuche";
import { ScanDialog } from "@/components/scanner/ScanDialog";
import { artikelZuCode } from "@/components/scanner/artikelZuCode";
import { ArtikelDialog } from "@/components/stamm/ArtikelDialog";
import { ImportDialog } from "@/components/stamm/ImportDialog";
import { fehlerText, useBestandSummen, useLieferanten } from "@/components/stamm/stammDaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, zahl } from "@/lib/format";
import { artikelVk } from "@/lib/preise";
import { codeVarianten, normalisieren } from "@/lib/strichcode";
import { KATEGORIEN_ARTIKEL, type Artikel, type StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRO_SEITE = 50;
/** Die Suche liefert die besten Treffer, nicht alle — mehr liest am Handy niemand durch. */
const SUCHE_MAX = 200;

const INAKTIV: StatusEintrag = { ton: "grau", text: "Inaktiv" };
const NACHBESTELLEN: StatusEintrag = { ton: "gelb", text: "Nachbestellen" };

type DialogZustand = { artikel: Artikel | null; vorgabe?: Partial<Artikel> };

/**
 * Artikelstamm: suchen (alle Wörter, Strichcode, Nummer), filtern, pflegen.
 * Ohne Suchtext eine normale, seitenweise Liste nach Bezeichnung.
 * Handy: Karten. PC: Tabelle über die volle Breite.
 */
export default function ArtikelSeite() {
  const { firma, istChef } = useSitzung();
  const pc = useIstPc();
  const [text, setText] = useState("");
  const q = useVerzoegert(text.trim(), 300);
  const [kategorie, setKategorie] = useState("alle");
  const [lieferant, setLieferant] = useState("alle");
  const [nurLager, setNurLager] = useState(false);
  const [inaktive, setInaktive] = useState(false);
  const [seite, setSeite] = useState(0);
  // Auswahl bleibt beim Schließen stehen, damit der Dialog nicht mitten in der Animation umspringt
  const [auswahl, setAuswahl] = useState<DialogZustand>({ artikel: null });
  const [dialogOffen, setDialogOffen] = useState(false);
  const setDialog = (z: DialogZustand) => {
    setAuswahl(z);
    setDialogOffen(true);
  };
  const [importOffen, setImportOffen] = useState(false);
  const [scanOffen, setScanOffen] = useState(false);
  const { data: lieferanten = [] } = useLieferanten();
  const { data: bestaende = {} } = useBestandSummen();

  // Die Suchfunktion der Datenbank kennt nur aktive Artikel — inaktive sucht die Liste.
  const sucheAktiv = q.length > 0 && !inaktive;

  // Anderer Filter → zurück auf Seite 1, noch im selben Render (sonst würde kurz Seite 3 des neuen Filters geladen)
  const filter = [q, kategorie, lieferant, nurLager, inaktive].join("|");
  const [filterVorher, setFilterVorher] = useState(filter);
  if (filter !== filterVorher) {
    setFilterVorher(filter);
    setSeite(0);
  }

  const { data: anzahlAktiv } = useQuery({
    queryKey: ["artikel", "anzahl"],
    queryFn: async () => {
      const { count, error } = await supabase.from("artikel").select("id", { count: "exact", head: true }).eq("aktiv", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const suche = useQuery({
    queryKey: ["artikel", "suche", q, SUCHE_MAX],
    enabled: sucheAktiv,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("artikel_suchen", { p_q: q, p_anzahl: SUCHE_MAX });
      if (error) throw error;
      return (data ?? []) as Artikel[];
    },
    placeholderData: (vorher) => vorher,
  });

  const liste = useQuery({
    queryKey: ["artikel", "liste", kategorie, lieferant, nurLager, inaktive, inaktive ? q : "", seite],
    enabled: !sucheAktiv,
    queryFn: async () => {
      let abfrage = supabase.from("artikel").select("*", { count: "exact" }).eq("aktiv", !inaktive);
      if (kategorie === "ohne") abfrage = abfrage.is("kategorie", null);
      else if (kategorie !== "alle") abfrage = abfrage.eq("kategorie", kategorie);
      if (lieferant !== "alle") abfrage = abfrage.eq("lieferant", lieferant);
      if (nurLager) abfrage = abfrage.eq("lagerartikel", true);
      if (inaktive && q) abfrage = abfrage.ilike("bezeichnung", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const von = seite * PRO_SEITE;
      const { data, error, count } = await abfrage.order("bezeichnung").order("id").range(von, von + PRO_SEITE - 1);
      if (error) throw error;
      return { artikel: (data ?? []) as Artikel[], gesamt: count ?? 0 };
    },
    placeholderData: (vorher) => vorher,
  });

  // Suchtreffer werden hier gefiltert und geblättert
  const treffer = (suche.data ?? []).filter((a) =>
    (kategorie === "alle" || (kategorie === "ohne" ? !a.kategorie : a.kategorie === kategorie))
    && (lieferant === "alle" || a.lieferant === lieferant)
    && (!nurLager || a.lagerartikel));
  const zeilen = sucheAktiv ? treffer.slice(seite * PRO_SEITE, (seite + 1) * PRO_SEITE) : liste.data?.artikel ?? [];
  const gesamt = sucheAktiv ? treffer.length : liste.data?.gesamt ?? 0;
  const laedt = sucheAktiv ? suche.isLoading : liste.isLoading;
  const holt = sucheAktiv ? suche.isFetching : liste.isFetching;
  const gekappt = sucheAktiv && (suche.data?.length ?? 0) >= SUCHE_MAX;
  const gefiltert = !!q || kategorie !== "alle" || lieferant !== "alle" || nurLager || inaktive;

  const blaettern = (richtung: number) => {
    setSeite((s) => Math.max(0, s + richtung));
    window.scrollTo({ top: 0 });
  };

  // Gescannter Code: Artikel öffnen — oder anbieten, ihn anzulegen. Alle
  // Schreibweisen wie beim Buchen (GS1-Etikett, GTIN-14, UPC-A), sonst lädt
  // ein Karton-Etikett zum doppelten Anlegen ein.
  // Nichts zurückgeben: einen Text würde der Scanner als Rückmeldung anzeigen
  const gescannt = async (code: string) => {
    let a: Artikel | null = null;
    try {
      const t = await artikelZuCode(code);
      if (t) {
        const { data, error } = await supabase.from("artikel").select("*").eq("id", t.artikel_id).maybeSingle();
        if (error) throw error;
        a = data;
      } else {
        // Inaktive kennt der Scanner nicht — im Stamm sollen sie trotzdem auftauchen
        const varianten = codeVarianten(code);
        const { data, error } = await supabase.from("artikel").select("*").in("ean", varianten).order("created_at").limit(1);
        if (error) throw error;
        a = data?.[0] ?? null;
      }
    } catch (e) {
      toast.error("Suche fehlgeschlagen", { description: fehlerText(e as { code?: string; message?: string }) });
      return;
    }
    if (a) {
      setDialog({ artikel: a });
      return;
    }
    const ean = normalisieren(code);
    setText(ean);
    toast("Kein Artikel mit diesem Code", {
      duration: 6000,
      action: { label: "Neu anlegen", onClick: () => setDialog({ artikel: null, vorgabe: { ean } }) },
    });
  };

  const pillen = (a: Artikel) => {
    const bestand = bestaende[a.id] ?? 0;
    return (
      <>
        {!a.aktiv && <StatusPille eintrag={INAKTIV} />}
        {a.lagerartikel && a.mindestbestand != null && bestand < Number(a.mindestbestand) && <StatusPille eintrag={NACHBESTELLEN} />}
      </>
    );
  };
  const bestandText = (a: Artikel) => {
    const b = bestaende[a.id] ?? 0;
    return a.lagerartikel || b !== 0 ? zahl(b) : "–";
  };

  return (
    <Seite
      titel="Artikel"
      untertitel={anzahlAktiv != null ? `${zahl(anzahlAktiv)} aktive Artikel` : undefined}
      breit
      aktionen={
        <>
          {istChef && (
            <Button variant="outline" className="h-11 px-3" onClick={() => setImportOffen(true)} aria-label="Datanorm- oder CSV-Import">
              <Upload className="h-4 w-4" /><span className="hidden sm:inline">Import</span>
            </Button>
          )}
          <Button className="h-11 px-3" onClick={() => setDialog({ artikel: null })} aria-label="Neuer Artikel">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Neuer Artikel</span>
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Suchen – Name, Nummer, Hersteller, EAN …"
              className="h-12 pl-9 pr-9 text-base" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Artikel suchen" />
            {holt && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" className="h-12 w-12 shrink-0 px-0" onClick={() => setScanOffen(true)} aria-label="Strichcode scannen">
            <ScanBarcode className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={kategorie} onValueChange={setKategorie}>
            <SelectTrigger className="h-11 sm:w-56" aria-label="Kategorie"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Kategorien</SelectItem>
              {KATEGORIEN_ARTIKEL.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              <SelectItem value="ohne">Ohne Kategorie</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lieferant} onValueChange={setLieferant}>
            <SelectTrigger className="h-11 sm:w-52" aria-label="Lieferant"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Lieferanten</SelectItem>
              {lieferanten.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Umschalter aktiv={nurLager} onClick={() => setNurLager((v) => !v)}>Nur Lagerartikel</Umschalter>
          {istChef && <Umschalter aktiv={inaktive} onClick={() => setInaktive((v) => !v)}>Inaktive</Umschalter>}
        </div>

        {!laedt && (
          <p className="px-1 text-sm text-muted-foreground">
            <span className="zahl">{zahl(gesamt)}</span> {sucheAktiv ? "Treffer" : "Artikel"}
            {inaktive && " · inaktiv"}
            {gekappt && ` · die ${SUCHE_MAX} besten — Suche genauer eingrenzen`}
          </p>
        )}
      </div>

      {laedt ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
      ) : zeilen.length === 0 ? (
        gefiltert ? (
          <Leer icon={SearchX} text={q ? `Nichts gefunden für „${q}“` : "Kein Artikel passt zu diesem Filter."}>
            {q && !inaktive && (
              <Button variant="outline" className="h-11" onClick={() => setDialog({ artikel: null, vorgabe: { bezeichnung: q } })}>
                <Plus className="h-4 w-4" /> „{q}“ als neuen Artikel anlegen
              </Button>
            )}
          </Leer>
        ) : (
          <Leer icon={Package} text="Noch keine Artikel. Lege einen an oder importiere die Datanorm-Datei deines Großhändlers.">
            <div className="flex flex-wrap justify-center gap-2">
              {istChef && <Button variant="outline" className="h-11" onClick={() => setImportOffen(true)}><Upload className="h-4 w-4" /> Importieren</Button>}
              <Button className="h-11" onClick={() => setDialog({ artikel: null })}><Plus className="h-4 w-4" /> Neuer Artikel</Button>
            </div>
          </Leer>
        )
      ) : pc ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Bezeichnung</th>
                <th className="px-3 py-2.5 font-medium">Hersteller · Nr.</th>
                <th className="px-3 py-2.5 font-medium">EAN</th>
                <th className="px-3 py-2.5 font-medium">Einheit</th>
                {istChef && <th className="px-3 py-2.5 text-right font-medium">EK</th>}
                {istChef && <th className="px-3 py-2.5 text-right font-medium">VK</th>}
                <th className="px-4 py-2.5 text-right font-medium">Bestand</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {zeilen.map((a) => (
                <tr key={a.id} tabIndex={0} onClick={() => setDialog({ artikel: a })}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.repeat) return;
                    // Sonst „klickt“ dieselbe Enter-Taste den Knopf, der im eben geöffneten Dialog den Fokus bekommt
                    e.preventDefault();
                    setDialog({ artikel: a });
                  }}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", !a.aktiv && "text-muted-foreground")}>
                  <td className="max-w-[28rem] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{a.bezeichnung}</span>{pillen(a)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{[a.lieferant, a.artikelnummer].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{a.hersteller || "–"}</div>
                    {a.hersteller_nr && <div className="font-mono text-xs text-muted-foreground">{a.hersteller_nr}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{a.ean || "–"}</td>
                  <td className="px-3 py-2.5">{a.einheit}</td>
                  {istChef && <td className="zahl px-3 py-2.5 text-right">{a.ek_preis != null ? euro(a.ek_preis) : "–"}</td>}
                  {istChef && (
                    <td className="zahl px-3 py-2.5 text-right font-medium text-foreground">
                      {euro(artikelVk(a, firma))}{a.vk_preis != null && <span className="ml-1 text-xs font-normal text-muted-foreground">fest</span>}
                    </td>
                  )}
                  <td className="zahl px-4 py-2.5 text-right">{bestandText(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {zeilen.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setDialog({ artikel: a })}
                className="flex h-full w-full items-start gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/50 active:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className={cn("line-clamp-2 font-medium leading-snug", !a.aktiv && "text-muted-foreground")}>{a.bezeichnung}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[a.hersteller, a.hersteller_nr].filter(Boolean).join(" · ") || [a.lieferant, a.artikelnummer].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {a.ean && <span className="font-mono">{a.ean}</span>}
                    {bestandText(a) !== "–" && <span>Bestand <span className="zahl font-semibold text-foreground">{bestandText(a)}</span></span>}
                    {pillen(a)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {istChef && <p className="zahl font-semibold">{euro(artikelVk(a, firma))}</p>}
                  <p className="text-xs text-muted-foreground">{istChef ? `je ${a.einheit}` : a.einheit}</p>
                  {istChef && a.ek_preis != null && <p className="zahl text-xs text-muted-foreground">EK {euro(a.ek_preis)}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {gesamt > PRO_SEITE && !laedt && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="h-11" disabled={seite === 0} onClick={() => blaettern(-1)}>
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <span className="zahl text-sm text-muted-foreground">
            {zahl(seite * PRO_SEITE + 1)}–{zahl(Math.min(gesamt, (seite + 1) * PRO_SEITE))} von {zahl(gesamt)}
          </span>
          <Button variant="outline" className="h-11" disabled={(seite + 1) * PRO_SEITE >= gesamt} onClick={() => blaettern(1)}>
            Weiter <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ArtikelDialog open={dialogOffen} onOpenChange={setDialogOffen} artikel={auswahl.artikel} vorgabe={auswahl.vorgabe} />
      {istChef && <ImportDialog open={importOffen} onOpenChange={setImportOffen} />}
      <ScanDialog open={scanOffen} onOpenChange={setScanOffen} onCode={gescannt} titel="Artikel per Strichcode finden" />
    </Seite>
  );
}

/** Filter zum Antippen (ein/aus) */
function Umschalter({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={aktiv}
      className={cn("h-11 rounded-full border px-4 text-sm font-medium transition-colors",
        aktiv ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
