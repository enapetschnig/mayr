import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel, Kennzahl } from "@/components/Bausteine";
import { useVerzoegert } from "@/components/material/ArtikelSuche";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNeuLaden } from "@/hooks/useDaten";
import {
  artikelZeilen, ekBerechnen, hochladen, pakete, type ArtikelZeile, type ImportArtikel, type RabattEinstellung,
  type UploadErgebnis,
} from "@/lib/artikelImport";
import {
  CSV_FELDER, TRENNZEICHEN_TEXT, csvArtikelStueckweise, dezimalLesen, spaltenZuordnen,
  type CsvAuswertung, type CsvFeld, type Trennzeichen, type Zuordnung,
} from "@/lib/csvImport";
import { ZEICHENSATZ_TEXT, pause, type Zeichensatz } from "@/lib/datanorm";
import { zahl } from "@/lib/format";
import { TON_KLASSE } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Feld, useBeimOeffnen, Zusatz, zahlFeld } from "./Felder";
import { ImportFehler, importLesen, rabattgruppenAus, type Gelesen, type LeseOptionen, type RohDatei } from "./importLesen";
import { fehlerText, useLieferanten } from "./stammDaten";

type Schritt = "wahl" | "lesen" | "vorschau" | "import" | "fertig";

const KEINE = "_keine";
const AUTO = "auto";
const TRENNER: Record<string, Trennzeichen> = { strichpunkt: ";", beistrich: ",", tabulator: "\t" };
const DATEIART_TEXT: Record<string, string> = { artikel: "Artikel", preise: "Preise", warengruppen: "Warengruppen", rabatt: "Rabattgruppen" };

// Preise je Einheit mit bis zu vier Kommastellen — ein Kabelbinder um
// 0,0189 € soll in der Vorschau nicht als 0,02 € erscheinen.
const PREIS = new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const preis = (n: number | null | undefined) => (n == null ? "–" : PREIS.format(n));

/** Prozentfeld lesen: leer = kein Rabatt, ungültig = NaN (wird vor dem Import gemeldet) */
const prozent = (t: string): number | null => {
  if (!t.trim()) return null;
  const n = dezimalLesen(t);
  return n !== null && n >= 0 && n <= 100 ? n : NaN;
};

// ── Rabatte je Lieferant merken (nur dieses Gerät — reiner Komfort) ──────
type Gemerkt = { gruppen: Record<string, string>; pauschal: string };
const merkSchluessel = (l: string) => `artikelimport.rabatte.${l.trim().toLowerCase()}`;

function gemerkteRabatte(lieferant: string): Gemerkt | null {
  if (!lieferant.trim()) return null;
  try {
    const w = JSON.parse(localStorage.getItem(merkSchluessel(lieferant)) ?? "null");
    if (!w || typeof w !== "object") return null;
    const g: Gemerkt = { gruppen: w.gruppen ?? {}, pauschal: w.pauschal ?? "" };
    return Object.keys(g.gruppen).length || g.pauschal ? g : null;
  } catch {
    return null;
  }
}

function rabatteMerken(lieferant: string, g: Gemerkt) {
  const gruppen = Object.fromEntries(Object.entries(g.gruppen).filter(([, t]) => t.trim()));
  if (!Object.keys(gruppen).length && !g.pauschal.trim()) return;
  try {
    localStorage.setItem(merkSchluessel(lieferant), JSON.stringify({ gruppen, pauschal: g.pauschal.trim() }));
  } catch {
    /* privates Fenster o. ä. — dann eben nicht */
  }
}

interface Bericht extends UploadErgebnis {
  lieferant: string;
  quelle: "datanorm" | "csv";
  doppelt: number;
  ohneNummer: number;
  ohneBezeichnung: number;
  geloescht: number;
  ohnePreis: number;
  preiseOhneArtikel: number;
  angehalten: boolean;
}

/**
 * Artikel aus Datanorm (4/5, auch mehrere Dateien eines Lieferanten) oder
 * CSV übernehmen: Datei wählen → Vorschau mit Lieferant und Rabatten →
 * Pakete à 500 per Upsert (Lieferant + Artikelnummer) → Ergebnis.
 * Nur für den Chef (RLS: ändern dürfen nur Chefs).
 */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const neuLaden = useNeuLaden();
  const { data: lieferanten = [] } = useLieferanten();
  const dateiFeld = useRef<HTMLInputElement>(null);

  const [schritt, setSchritt] = useState<Schritt>("wahl");
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const [rohDateien, setRohDateien] = useState<RohDatei[]>([]);
  const [leseAnteil, setLeseAnteil] = useState(0);
  const [gelesen, setGelesen] = useState<Gelesen | null>(null);
  const [zeichensatzWahl, setZeichensatzWahl] = useState<string>(AUTO);
  const [trennerWahl, setTrennerWahl] = useState<string>(AUTO);

  // CSV: Zuordnung und Auswertung ändern sich mit der Spaltenwahl
  const [kopf, setKopf] = useState(0);
  const [zuordnung, setZuordnung] = useState<Zuordnung>({});
  const [auswertung, setAuswertung] = useState<CsvAuswertung | null>(null);
  const [rechnet, setRechnet] = useState(false);

  const [lieferant, setLieferant] = useState("");
  const [pauschalText, setPauschalText] = useState("");
  const [gruppenTexte, setGruppenTexte] = useState<Record<string, string>>({});
  const [nettoVorziehen, setNettoVorziehen] = useState(true);

  const [upload, setUpload] = useState({ erledigt: 0, gesamt: 0 });
  const [bericht, setBericht] = useState<Bericht | null>(null);

  // Jeder Lesevorgang bekommt eine Nummer — Ergebnisse eines abgebrochenen Laufs fallen weg
  const leseLauf = useRef(0);
  const auswertLauf = useRef(0);
  const anhalten = useRef(false);

  const zuruecksetzen = () => {
    leseLauf.current++;
    auswertLauf.current++;
    setSchritt("wahl");
    setFehler(null);
    setRohDateien([]);
    setGelesen(null);
    setZeichensatzWahl(AUTO);
    setTrennerWahl(AUTO);
    setAuswertung(null);
    setRechnet(false);
    setLieferant("");
    setPauschalText("");
    setGruppenTexte({});
    setNettoVorziehen(true);
    setBericht(null);
  };

  useBeimOeffnen(open ? "offen" : null, zuruecksetzen);
  // Geschlossen: ein noch laufendes Lesen verwirft sein Ergebnis
  useEffect(() => {
    if (!open) leseLauf.current++;
  }, [open]);

  // ── Lesen ─────────────────────────────────────────────────────────────
  /** `wahl`: Zeichensatz/Trennzeichen (AUTO oder fest) — gilt erst, wenn das Lesen geklappt hat */
  const lesen = async (dateien: RohDatei[], wahl: { zs: string; tz: string }, ersterLauf: boolean) => {
    const lauf = ++leseLauf.current;
    setSchritt("lesen");
    setLeseAnteil(0);
    setFehler(null);
    const opt: LeseOptionen = {
      zeichensatz: wahl.zs === AUTO ? undefined : (wahl.zs as Zeichensatz),
      trennzeichen: wahl.tz === AUTO ? undefined : TRENNER[wahl.tz],
      fortschritt: (a) => {
        if (leseLauf.current === lauf) setLeseAnteil(a);
      },
    };
    try {
      const g = await importLesen(dateien, opt);
      if (leseLauf.current !== lauf) return;
      setGelesen(g);
      setZeichensatzWahl(wahl.zs);
      setTrennerWahl(wahl.tz);
      if (g.art === "csv") {
        auswertLauf.current++;
        setKopf(g.kopf);
        setZuordnung(g.zuordnung);
        setAuswertung(g.auswertung);
        setRechnet(false);
      }
      if (ersterLauf && g.art === "datanorm") {
        setLieferant(g.ergebnis.firma.slice(0, 80));
        const vor: Record<string, string> = {};
        for (const r of g.ergebnis.rabattgruppen) if (r.rabatt > 0) vor[r.code] = zahlFeld(r.rabatt);
        setGruppenTexte(vor);
      }
      setSchritt("vorschau");
    } catch (e) {
      if (leseLauf.current !== lauf) return;
      setFehler(e instanceof ImportFehler ? e.message : `Die Datei ließ sich nicht lesen (${e instanceof Error ? e.message : String(e)}).`);
      setSchritt(ersterLauf ? "wahl" : "vorschau");
    }
  };

  const dateienWaehlen = async (liste: File[]) => {
    if (!liste.length) return;
    const lauf = ++leseLauf.current;
    setSchritt("lesen");
    setLeseAnteil(0);
    try {
      const dateien = await Promise.all(liste.map(async (f) => ({ name: f.name, daten: new Uint8Array(await f.arrayBuffer()) })));
      if (leseLauf.current !== lauf) return;
      setRohDateien(dateien);
      await lesen(dateien, { zs: AUTO, tz: AUTO }, true);
    } catch (e) {
      if (leseLauf.current !== lauf) return;
      setFehler(`Die Datei ließ sich nicht öffnen (${e instanceof Error ? e.message : String(e)}).`);
      setSchritt("wahl");
    }
  };

  const neuLesen = (zs: string, tz: string) => void lesen(rohDateien, { zs, tz }, false);

  // ── CSV: Spalten und Kopfzeile ─────────────────────────────────────────
  const neuAuswerten = async (k: number, zu: Zuordnung) => {
    if (gelesen?.art !== "csv") return;
    setKopf(k);
    setZuordnung(zu);
    const lauf = ++auswertLauf.current;
    setRechnet(true);
    const a = await csvArtikelStueckweise(gelesen.zeilen, k, zu, () => auswertLauf.current !== lauf);
    if (a && auswertLauf.current === lauf) {
      setAuswertung(a);
      setRechnet(false);
    }
  };

  const spalteSetzen = (feld: CsvFeld, wert: string) => {
    const zu = { ...zuordnung };
    if (wert === KEINE) delete zu[feld];
    else zu[feld] = Number(wert);
    void neuAuswerten(kopf, zu);
  };

  const kopfSetzen = (wert: string) => {
    if (gelesen?.art !== "csv") return;
    const k = Number(wert);
    void neuAuswerten(k, spaltenZuordnen(gelesen.zeilen[k] ?? []));
  };

  // ── Abgeleitet ───────────────────────────────────────────────────────
  const artikel: ImportArtikel[] = useMemo(
    () => (gelesen?.art === "datanorm" ? gelesen.artikel : auswertung?.artikel ?? []),
    [gelesen, auswertung],
  );

  const statistik = useMemo(() => {
    let mitEan = 0;
    let mitListe = 0;
    let mitNetto = 0;
    let beides = 0;
    let ohnePreis = 0;
    for (const a of artikel) {
      if (a.ean) mitEan++;
      if (a.listenpreis != null) mitListe++;
      if (a.netto != null) mitNetto++;
      if (a.listenpreis != null && a.netto != null) beides++;
      if (a.listenpreis == null && a.netto == null) ohnePreis++;
    }
    return { mitEan, mitListe, mitNetto, beides, ohnePreis };
  }, [artikel]);

  const gruppen = useMemo(
    () => rabattgruppenAus(artikel, gelesen?.art === "datanorm" ? gelesen.ergebnis.rabattgruppen : []),
    [artikel, gelesen],
  );

  const rabatt: RabattEinstellung = useMemo(() => ({
    gruppen: Object.fromEntries(gruppen.map((g) => [g.code, prozent(gruppenTexte[g.code] ?? "")])),
    pauschal: prozent(pauschalText),
    nettoVorziehen,
  }), [gruppen, gruppenTexte, pauschalText, nettoVorziehen]);

  const ungueltig = [
    ...(Number.isNaN(rabatt.pauschal) ? ["Rabatt für alle"] : []),
    ...gruppen.filter((g) => Number.isNaN(rabatt.gruppen[g.code])).map((g) => `Gruppe ${g.code}`),
  ];
  const rabattGesetzt = rabatt.pauschal != null || Object.values(rabatt.gruppen).some((v) => v != null);

  const lieferantQ = useVerzoegert(lieferant.trim(), 400);
  const { data: vorhanden } = useQuery({
    queryKey: ["artikel", "lieferant-anzahl", lieferantQ],
    enabled: open && schritt === "vorschau" && !!lieferantQ,
    queryFn: async () => {
      const { count, error } = await supabase.from("artikel").select("id", { count: "exact", head: true }).eq("lieferant", lieferantQ);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const aehnlich = lieferanten.find((x) => x !== lieferant.trim() && x.toLowerCase() === lieferant.trim().toLowerCase());
  const gemerkt = useMemo(() => (schritt === "vorschau" ? gemerkteRabatte(lieferantQ) : null), [lieferantQ, schritt]);
  const gemerktAnders = !!gemerkt && (
    gemerkt.pauschal !== pauschalText.trim()
    || Object.entries(gemerkt.gruppen).some(([k, t]) => (gruppenTexte[k] ?? "").trim() !== t)
  );

  const csvPflichtFehlt = gelesen?.art === "csv" && (zuordnung.artikelnummer === undefined || zuordnung.bezeichnung === undefined);

  // ── Importieren ──────────────────────────────────────────────────────
  const speichernPaket = async (paket: ArtikelZeile[]) => {
    const { data, error } = await supabase.from("artikel")
      .upsert(paket, { onConflict: "lieferant,artikelnummer" })
      .select("created_at, updated_at");
    if (error) throw new Error(fehlerText(error));
    // Neu angelegt: beide Zeitstempel aus derselben Transaktion; aktualisiert: updated_at ist neuer
    const neu = (data ?? []).filter((z) => z.created_at === z.updated_at).length;
    return { neu, aktualisiert: (data?.length ?? 0) - neu };
  };

  const importieren = async () => {
    if (!gelesen) return;
    const l = lieferant.trim();
    if (!l) return toast.error("Bitte den Lieferanten eintragen.");
    if (ungueltig.length) return toast.error("Rabatt bitte als Zahl von 0 bis 100 eingeben.", { description: ungueltig.join(", ") });
    if (csvPflichtFehlt) return toast.error("Bitte Artikelnummer und Bezeichnung einer Spalte zuordnen.");
    if (!artikel.length) return toast.error("Keine Artikel zum Importieren.");

    const quelle = gelesen.art === "datanorm" ? "datanorm" : "csv";
    anhalten.current = false;
    setUpload({ erledigt: 0, gesamt: artikel.length });
    setSchritt("import");
    await pause(); // erst den Fortschritt zeigen, dann rechnen

    const { zeilen, doppelt, ohneNummer, ohneBezeichnung } = artikelZeilen(artikel, { lieferant: l, quelle, rabatt });
    setUpload({ erledigt: 0, gesamt: zeilen.length });
    const erg = await hochladen(pakete(zeilen, 500), speichernPaket, {
      parallel: 2,
      fortschritt: (n) => setUpload({ erledigt: n, gesamt: zeilen.length }),
      abbrechen: () => anhalten.current,
    });

    const dn = gelesen.art === "datanorm" ? gelesen.ergebnis : null;
    const csv = gelesen.art === "csv" ? auswertung : null;
    setBericht({
      ...erg,
      lieferant: l,
      quelle,
      doppelt,
      ohneNummer: ohneNummer + (csv?.ohneNummer ?? 0),
      ohneBezeichnung: ohneBezeichnung + (csv?.ohneBezeichnung ?? 0) + (dn?.ohneText ?? 0),
      geloescht: dn?.geloescht ?? 0,
      ohnePreis: dn?.ohnePreis ?? statistik.ohnePreis,
      preiseOhneArtikel: dn?.preiseOhneArtikel ?? 0,
      angehalten: anhalten.current,
    });
    setSchritt("fertig");
    if (erg.neu + erg.aktualisiert > 0) {
      rabatteMerken(l, { gruppen: gruppenTexte, pauschal: pauschalText });
      await neuLaden("artikel", "leistungen", "lager");
    }
  };

  // ── Oberfläche ───────────────────────────────────────────────────────
  const dateiNamen = rohDateien.map((d) => d.name).join(", ");
  const formatText = gelesen?.art === "datanorm"
    ? gelesen.ergebnis.version ? `Datanorm ${gelesen.ergebnis.version}` : "Datanorm"
    : "CSV-Liste";

  const fuss = (() => {
    switch (schritt) {
      case "wahl":
        return <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>;
      case "lesen":
        return (
          <Button variant="outline" className="h-11" onClick={() => { leseLauf.current++; setSchritt(gelesen ? "vorschau" : "wahl"); }}>
            Abbrechen
          </Button>
        );
      case "vorschau":
        return (
          <>
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button className="h-11 min-w-48" onClick={importieren} disabled={rechnet || !artikel.length}>
              <Upload className="h-4 w-4" /> {zahl(artikel.length)} Artikel importieren
            </Button>
          </>
        );
      case "import":
        return (
          <Button variant="outline" className="h-11" onClick={() => { anhalten.current = true; }} disabled={anhalten.current}>
            Anhalten
          </Button>
        );
      case "fertig":
        return (
          <>
            <Button variant="outline" className="h-11" onClick={zuruecksetzen}>Weitere Datei importieren</Button>
            <Button className="h-11 min-w-40" onClick={() => onOpenChange(false)}>Fertig</Button>
          </>
        );
    }
  })();

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Artikel importieren"
      beschreibung={schritt === "vorschau" ? `${formatText} · ${dateiNamen}` : schritt === "wahl" ? "Datanorm 4 und 5 oder CSV-Liste" : dateiNamen || undefined}
      gesperrt={schritt === "import"}
      fuss={fuss}
    >
      <input ref={dateiFeld} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => {
          const liste = [...(e.target.files ?? [])];
          e.target.value = ""; // dieselbe Datei darf noch einmal gewählt werden
          void dateienWaehlen(liste);
        }} />

      {schritt === "wahl" && (
        <div className="mx-auto max-w-2xl space-y-5">
          {fehler && <Hinweis ton="rot" icon={AlertTriangle}>{fehler}</Hinweis>}
          <button
            type="button"
            onClick={() => dateiFeld.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setZiehen(true); }}
            onDragLeave={() => setZiehen(false)}
            onDrop={(e) => {
              e.preventDefault();
              setZiehen(false);
              void dateienWaehlen([...e.dataTransfer.files]);
            }}
            className={cn(
              "flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-card px-4 py-10 text-center transition-colors",
              ziehen ? "border-primary bg-primary-soft" : "hover:border-primary/50",
            )}
          >
            <FileUp className="h-9 w-9 text-muted-foreground" />
            <span className="text-base font-semibold">Datei wählen</span>
            <span className="text-sm text-muted-foreground">
              Datanorm (.001, .dat, .txt) oder CSV mit Kopfzeile<span className="hidden lg:inline"> — oder hierher ziehen</span>
            </span>
          </button>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Die Datanorm-Datei bekommst du von deinem Großhändler (Sonepar, Rexel, Schrack …), meist im Webshop unter Service/Download.</p>
            <p>Mehrere Datanorm-Dateien eines Lieferanten (Artikel, Preise, Rabatte, Warengruppen) gemeinsam wählen — die Preise werden den Artikeln zugeordnet.</p>
            <p>Schon vorhandene Artikel (gleicher Lieferant, gleiche Artikelnummer) werden aktualisiert, nicht doppelt angelegt. Kategorie, VK und Lager-Einstellungen bleiben.</p>
          </div>
        </div>
      )}

      {schritt === "lesen" && (
        <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-medium">Datei wird gelesen …</p>
          <Progress value={leseAnteil * 100} className="h-2" />
          <p className="zahl text-sm text-muted-foreground">{Math.round(leseAnteil * 100)} %</p>
          <p className="text-xs text-muted-foreground">Große Dateien brauchen etwas. Die App bleibt dabei bedienbar.</p>
        </div>
      )}

      {schritt === "vorschau" && gelesen && (
        <div className="mx-auto max-w-5xl space-y-7">
          {fehler && <Hinweis ton="rot" icon={AlertTriangle}>{fehler}</Hinweis>}

          {/* Was steht in der Datei? */}
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-lg font-semibold">{formatText}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="zahl font-semibold text-foreground">{rechnet ? "…" : zahl(artikel.length)}</span> Artikel
                </p>
              </div>
              <Button variant="outline" className="h-11 shrink-0" onClick={zuruecksetzen}>Andere Datei</Button>
            </div>
            {gelesen.art === "datanorm" && (
              <div className="space-y-0.5 text-sm text-muted-foreground">
                {gelesen.ergebnis.dateien.map((d, i) => (
                  <p key={i} className="truncate">
                    {d.name || "Datei"} · {d.art ? DATEIART_TEXT[d.art] : "unbekannt"} · <span className="zahl">{zahl(d.saetze)}</span> Sätze
                  </p>
                ))}
                {gelesen.ergebnis.vorlauf && <p className="truncate text-xs">{gelesen.ergebnis.vorlauf}</p>}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Zahl titel="mit EAN" wert={statistik.mitEan} />
              <Zahl titel="mit Listenpreis" wert={statistik.mitListe} />
              <Zahl titel="mit Nettopreis" wert={statistik.mitNetto} />
              <Zahl titel="ohne Preis" wert={statistik.ohnePreis} />
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              <Feld id="imp-zs" label="Zeichensatz"
                hinweis={zeichensatzWahl === AUTO ? `erkannt: ${ZEICHENSATZ_TEXT[gelesen.zeichensatz]} — Umlaute falsch (z. B. „Ã¼“ statt „ü“)? Hier umstellen.` : undefined}>
                <Select value={zeichensatzWahl} onValueChange={(v) => neuLesen(v, trennerWahl)}>
                  <SelectTrigger id="imp-zs" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>Automatisch</SelectItem>
                    {(Object.keys(ZEICHENSATZ_TEXT) as Zeichensatz[]).map((z) => <SelectItem key={z} value={z}>{ZEICHENSATZ_TEXT[z]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Feld>
              {gelesen.art === "csv" && (
                <Feld id="imp-tz" label="Trennzeichen" hinweis={trennerWahl === AUTO ? `erkannt: ${TRENNZEICHEN_TEXT[gelesen.trennzeichen]}` : undefined}>
                  <Select value={trennerWahl} onValueChange={(v) => neuLesen(zeichensatzWahl, v)}>
                    <SelectTrigger id="imp-tz" className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>Automatisch</SelectItem>
                      {Object.entries(TRENNER).map(([k, t]) => <SelectItem key={k} value={k}>{TRENNZEICHEN_TEXT[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Feld>
              )}
            </div>
            {gelesen.art === "datanorm" && <DatanormHinweise g={gelesen} />}
          </section>

          {gelesen.art === "csv" && (
            <Spaltenwahl zeilen={gelesen.zeilen} kopf={kopf} kopfErkannt={gelesen.kopfErkannt} zuordnung={zuordnung}
              auswertung={auswertung} onKopf={kopfSetzen} onSpalte={spalteSetzen} />
          )}

          {/* Lieferant: zusammen mit der Artikelnummer der Schlüssel für spätere Importe */}
          <section className="space-y-3">
            <Gruppentitel className="px-0 pb-0">Lieferant</Gruppentitel>
            <Feld id="imp-lief" label="Lieferant"
              hinweis={!lieferantQ ? "Unter diesem Namen landen die Artikel. Beim nächsten Import denselben Namen nehmen — dann wird aktualisiert statt doppelt angelegt."
                : vorhanden ? `${zahl(vorhanden)} Artikel von „${lieferantQ}“ sind schon im Stamm. Gleiche Artikelnummern werden aktualisiert.`
                  : vorhanden === 0 ? "Neuer Lieferant — alle Artikel werden neu angelegt." : null}>
              <Input id="imp-lief" className="h-12 sm:max-w-md" list="imp-lieferanten" value={lieferant} maxLength={80}
                onChange={(e) => setLieferant(e.target.value)} placeholder="z. B. Sonepar" autoComplete="off" />
              <datalist id="imp-lieferanten">{lieferanten.map((l) => <option key={l} value={l} />)}</datalist>
            </Feld>
            {aehnlich && (
              <Hinweis ton="gelb" icon={Info}>
                Es gibt schon „{aehnlich}“ (andere Schreibweise).{" "}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setLieferant(aehnlich)}>Diesen Namen nehmen</button>
              </Hinweis>
            )}
          </section>

          {/* Rabatt: EK = Liste − Rabatt */}
          <section className="space-y-3">
            <Gruppentitel className="px-0 pb-0">Rabatt</Gruppentitel>
            <p className="text-sm text-muted-foreground">
              EK = Listenpreis − Rabatt.
              {statistik.mitNetto > 0
                ? " Wo die Datei einen Nettopreis hat, gilt der."
                : " Ohne Rabatt bleibt der EK leer und der Listenpreis gilt als VK; 0 % heißt EK = Listenpreis."}
              {gelesen.art === "csv" && " Stehen deine Einkaufspreise in einer eigenen Spalte, ordne sie oben als „EK / Nettopreis“ zu."}
            </p>
            <Feld id="imp-pauschal" label="Rabatt für alle Artikel" hinweis={gruppen.length ? "gilt, wo die Rabattgruppe keinen eigenen Rabatt hat" : undefined}>
              <ProzentFeld id="imp-pauschal" wert={pauschalText} onChange={setPauschalText} className="w-32" />
            </Feld>
            {gruppen.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Rabatt je Rabattgruppe<Zusatz>({zahl(gruppen.length)})</Zusatz></p>
                <ul className="grid max-h-[26rem] gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3">
                  {gruppen.map((g) => (
                    <li key={g.code} className="flex items-center gap-3 rounded-lg border bg-card py-1.5 pl-3 pr-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm">{g.code}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.name && `${g.name} · `}<span className="zahl">{zahl(g.anzahl)}</span> Artikel
                        </p>
                      </div>
                      <ProzentFeld wert={gruppenTexte[g.code] ?? ""} label={`Rabatt Gruppe ${g.code}`} className="w-24 shrink-0"
                        onChange={(t) => setGruppenTexte((alt) => ({ ...alt, [g.code]: t }))} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gemerkt && gemerktAnders && (
              <Button variant="outline" className="h-11"
                onClick={() => {
                  setGruppenTexte((alt) => ({ ...alt, ...gemerkt.gruppen }));
                  setPauschalText(gemerkt.pauschal);
                }}>
                Rabatte vom letzten Import übernehmen
              </Button>
            )}
            {statistik.beides > 0 && rabattGesetzt && (
              <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2">
                <span>
                  <span className="block text-sm font-medium">Nettopreise aus der Datei vorziehen</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="zahl">{zahl(statistik.beides)}</span> Artikel haben Listen- und Nettopreis. Aus: EK = Liste − Rabatt.
                  </span>
                </span>
                <Switch checked={nettoVorziehen} onCheckedChange={setNettoVorziehen} />
              </label>
            )}
          </section>

          <Vorschau artikel={artikel} rabatt={rabatt} mitNetto={statistik.mitNetto > 0} mitGruppe={gruppen.length > 0} rechnet={rechnet} />
        </div>
      )}

      {schritt === "import" && (
        <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-medium">{anhalten.current ? "Wird angehalten …" : "Artikel werden gespeichert …"}</p>
          <Progress value={upload.gesamt ? (upload.erledigt / upload.gesamt) * 100 : 0} className="h-2" />
          <p className="zahl text-sm text-muted-foreground">{zahl(upload.erledigt)} von {zahl(upload.gesamt)}</p>
          <p className="text-xs text-muted-foreground">Bitte das Fenster offen lassen, bis alles gespeichert ist.</p>
        </div>
      )}

      {schritt === "fertig" && bericht && <Ergebnis b={bericht} />}
    </FormularDialog>
  );
}

// ── Bausteine ──────────────────────────────────────────────────────────

function Hinweis({ ton, icon: I, children }: { ton: "rot" | "gelb" | "grau"; icon: typeof Info; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm", TON_KLASSE[ton])}>
      <I className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Zahl({ titel, wert }: { titel: string; wert: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{titel}</dt>
      <dd className="zahl font-semibold">{zahl(wert)}</dd>
    </div>
  );
}

function ProzentFeld({ id, wert, onChange, label, className }: {
  id?: string; wert: string; onChange: (t: string) => void; label?: string; className?: string;
}) {
  const ok = prozent(wert);
  return (
    <div className={cn("relative", className)}>
      <Input id={id} value={wert} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label={label}
        aria-invalid={Number.isNaN(ok)} className={cn("zahl h-11 pr-8 text-right", Number.isNaN(ok) && "border-destructive")} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
    </div>
  );
}

function DatanormHinweise({ g }: { g: Extract<Gelesen, { art: "datanorm" }> }) {
  const e = g.ergebnis;
  const zeilen = [
    e.geloescht > 0 && `${zahl(e.geloescht)} Artikel sind in der Datei als gelöscht gekennzeichnet — die werden nicht übernommen.`,
    e.ohneText > 0 && `${zahl(e.ohneText)} Artikel ohne Bezeichnung werden übersprungen.`,
    e.preiseOhneArtikel > 0 && `${zahl(e.preiseOhneArtikel)} Preise passen zu keinem Artikel in der Auswahl.`,
    !e.dateien.some((d) => d.art === "preise") && e.ohnePreis > g.artikel.length / 2
      && "Viele Artikel ohne Preis — gibt es eine eigene Preisdatei (z. B. DATPREIS)? Dann beide zusammen wählen.",
    g.uebergangen.length > 0 && `Übergangen (keine Datanorm-Datei): ${g.uebergangen.join(", ")}`,
  ].filter(Boolean) as string[];
  if (!zeilen.length) return null;
  return (
    <Hinweis ton="grau" icon={Info}>
      <ul className="space-y-0.5">{zeilen.map((z) => <li key={z}>{z}</li>)}</ul>
    </Hinweis>
  );
}

/** CSV: Kopfzeile und Spalten zuordnen, mit Beispielwert aus der Datei */
function Spaltenwahl({ zeilen, kopf, kopfErkannt, zuordnung, auswertung, onKopf, onSpalte }: {
  zeilen: string[][];
  kopf: number;
  kopfErkannt: boolean;
  zuordnung: Zuordnung;
  auswertung: CsvAuswertung | null;
  onKopf: (wert: string) => void;
  onSpalte: (feld: CsvFeld, wert: string) => void;
}) {
  const probe = zeilen.slice(kopf, kopf + 21);
  const spalten = Math.max(0, ...probe.map((z) => z.length));
  const kopfZeile = zeilen[kopf] ?? [];
  const beispiel = (i: number | undefined) => {
    if (i === undefined) return null;
    const w = probe.slice(1).map((z) => (z[i] ?? "").trim()).find(Boolean);
    return w ? `z. B. ${w.length > 40 ? `${w.slice(0, 40)}…` : w}` : "in den ersten Zeilen leer";
  };
  const fehlt = zuordnung.artikelnummer === undefined || zuordnung.bezeichnung === undefined;
  const uebersprungen = (auswertung?.ohneNummer ?? 0) + (auswertung?.ohneBezeichnung ?? 0);
  // Hat die automatische Zuordnung geklappt, reicht eine Zusammenfassung — die 13 Felder klappen erst auf Wunsch auf
  const [offen, setOffen] = useState(!kopfErkannt || fehlt);
  const spaltenText = (i: number) => (kopfZeile[i] ?? "").trim() || `Spalte ${i + 1}`;
  const zugeordnet = CSV_FELDER.filter((f) => zuordnung[f.feld] !== undefined);

  if (!offen && !fehlt) {
    return (
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <Gruppentitel className="px-0 pb-0">Spalten zuordnen</Gruppentitel>
          <Button variant="outline" className="h-11" onClick={() => setOffen(true)}>Ändern</Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {zugeordnet.map((f) => (
            <div key={f.feld} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{f.text}</dt>
              <dd className="truncate">{spaltenText(zuordnung[f.feld]!)}</dd>
            </div>
          ))}
        </dl>
        {uebersprungen > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="zahl">{zahl(uebersprungen)}</span> Zeilen ohne Artikelnummer oder Bezeichnung werden übersprungen.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <Gruppentitel className="px-0 pb-0">Spalten zuordnen</Gruppentitel>
      {!kopfErkannt && (
        <Hinweis ton="gelb" icon={AlertTriangle}>
          Keine Überschriften erkannt. Bitte die Spalten zuordnen — oder stimmt das Trennzeichen oben nicht?
        </Hinweis>
      )}
      {fehlt && (
        <Hinweis ton="rot" icon={AlertTriangle}>Artikelnummer und Bezeichnung brauchen eine Spalte.</Hinweis>
      )}
      {!fehlt && uebersprungen > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="zahl">{zahl(uebersprungen)}</span> Zeilen ohne Artikelnummer oder Bezeichnung werden übersprungen.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Feld id="imp-kopf" label="Überschriften in Zeile">
          <Select value={String(kopf)} onValueChange={onKopf}>
            <SelectTrigger id="imp-kopf" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {zeilen.slice(0, 15).map((z, i) => (
                <SelectItem key={i} value={String(i)}>
                  {`Zeile ${i + 1}: ${z.filter((x) => x.trim()).slice(0, 3).join(" | ").slice(0, 40) || "(leer)"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Feld>
        {CSV_FELDER.map((f) => {
          const i = zuordnung[f.feld];
          return (
            <Feld key={f.feld} id={`imp-sp-${f.feld}`}
              label={<>{f.text}{f.pflicht && <span className="text-destructive"> *</span>}</>}
              hinweis={i !== undefined ? beispiel(i) : f.hinweis}>
              <Select value={i === undefined ? KEINE : String(i)} onValueChange={(v) => onSpalte(f.feld, v)}>
                <SelectTrigger id={`imp-sp-${f.feld}`} className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEINE}>— nicht zuordnen —</SelectItem>
                  {Array.from({ length: spalten }, (_, s) => {
                    const name = (kopfZeile[s] ?? "").trim();
                    return (
                      <SelectItem key={s} value={String(s)}>
                        {`Spalte ${s + 1}${name ? `: ${name.length > 30 ? `${name.slice(0, 30)}…` : name}` : ""}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Feld>
          );
        })}
      </div>
    </section>
  );
}

/** Die ersten 20 Artikel so, wie sie gespeichert werden — EK mit den Rabatten von oben */
function Vorschau({ artikel, rabatt, mitNetto, mitGruppe, rechnet }: {
  artikel: ImportArtikel[]; rabatt: RabattEinstellung; mitNetto: boolean; mitGruppe: boolean; rechnet: boolean;
}) {
  const liste = artikel.slice(0, 20);
  return (
    <section className={cn("space-y-2", rechnet && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3">
        <Gruppentitel className="px-0 pb-0">Vorschau</Gruppentitel>
        {liste.length > 0 && (
          <span className="text-xs text-muted-foreground">
            die ersten <span className="zahl">{zahl(liste.length)}</span> von <span className="zahl">{zahl(artikel.length)}</span>
          </span>
        )}
      </div>
      {liste.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Noch keine Artikel erkannt.</p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border bg-card sm:hidden">
            {liste.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{a.bezeichnung}</p>
                  <p className="truncate text-xs text-muted-foreground">{[a.artikelnummer, a.ean].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="zahl text-sm font-semibold">{preis(ekBerechnen(a, rabatt))}</p>
                  <p className="text-xs text-muted-foreground">EK je {a.einheit}</p>
                  {a.listenpreis != null && <p className="zahl text-xs text-muted-foreground">Liste {preis(a.listenpreis)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Art.-Nr.</th>
                  <th className="px-3 py-2 font-medium">Bezeichnung</th>
                  <th className="px-3 py-2 font-medium">Einheit</th>
                  <th className="px-3 py-2 font-medium">EAN</th>
                  {mitGruppe && <th className="px-3 py-2 font-medium">Rabattgr.</th>}
                  <th className="px-3 py-2 text-right font-medium">Liste €</th>
                  {mitNetto && <th className="px-3 py-2 text-right font-medium">Netto €</th>}
                  <th className="px-3 py-2 text-right font-medium">EK €</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {liste.map((a, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{a.artikelnummer}</td>
                    <td className="min-w-[16rem] px-3 py-2">{a.bezeichnung}</td>
                    <td className="px-3 py-2">{a.einheit}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.ean || "–"}</td>
                    {mitGruppe && <td className="px-3 py-2 font-mono text-xs">{a.rabattgruppe || "–"}</td>}
                    <td className="zahl px-3 py-2 text-right">{preis(a.listenpreis)}</td>
                    {mitNetto && <td className="zahl px-3 py-2 text-right">{preis(a.netto)}</td>}
                    <td className="zahl px-3 py-2 text-right font-semibold">{preis(ekBerechnen(a, rabatt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Ergebnis({ b }: { b: Bericht }) {
  const gruende = [
    b.ohneNummer > 0 && `${zahl(b.ohneNummer)} ohne Artikelnummer`,
    b.ohneBezeichnung > 0 && `${zahl(b.ohneBezeichnung)} ohne Bezeichnung`,
    b.geloescht > 0 && `${zahl(b.geloescht)} in der Datei als gelöscht gekennzeichnet`,
    b.doppelt > 0 && `${zahl(b.doppelt)} doppelte Artikelnummern in der Datei — die letzte Zeile zählt`,
    b.fehler > 0 && `${zahl(b.fehler)} nicht gespeichert: ${b.meldungen.join(" · ")}`,
    b.offen > 0 && `${zahl(b.offen)} nicht mehr übertragen (${b.angehalten ? "angehalten" : "abgebrochen nach wiederholten Fehlern"}) — Datei einfach noch einmal importieren`,
  ].filter(Boolean) as string[];
  const uebersprungen = b.ohneNummer + b.ohneBezeichnung + b.geloescht + b.doppelt + b.fehler + b.offen;
  const ok = !b.fehler && !b.offen;
  const infos = [
    b.ohnePreis > 0 && `${zahl(b.ohnePreis)} Artikel ohne Preis übernommen — EK und VK bei Bedarf nachtragen.`,
    b.preiseOhneArtikel > 0 && `${zahl(b.preiseOhneArtikel)} Preise ohne passenden Artikel übergangen.`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 className="h-7 w-7 shrink-0 text-status-gruen-fg" /> : <AlertTriangle className="h-7 w-7 shrink-0 text-status-gelb-fg" />}
        <div>
          <p className="text-lg font-semibold">{ok ? "Import fertig" : b.angehalten ? "Import angehalten" : "Import mit Fehlern beendet"}</p>
          <p className="text-sm text-muted-foreground">Lieferant „{b.lieferant}“ · {b.quelle === "datanorm" ? "Datanorm" : "CSV"}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Kennzahl titel="Neu" wert={zahl(b.neu)} />
        <Kennzahl titel="Aktualisiert" wert={zahl(b.aktualisiert)} />
        <Kennzahl titel="Übersprungen" wert={zahl(uebersprungen)} />
      </div>
      {gruende.length > 0 && (
        <section className="space-y-2">
          <Gruppentitel className="px-0 pb-0">Übersprungen</Gruppentitel>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {gruende.map((g) => <li key={g} className="px-3 py-2.5">{g}</li>)}
          </ul>
        </section>
      )}
      {infos.length > 0 && (
        <Hinweis ton="grau" icon={Info}>
          <ul className="space-y-0.5">{infos.map((z) => <li key={z}>{z}</li>)}</ul>
        </Hinweis>
      )}
      <p className="text-sm text-muted-foreground">
        VK leer = EK + Aufschlag aus den Einstellungen. Kategorie und Lagerartikel bei Bedarf im Artikel setzen.
      </p>
    </div>
  );
}
