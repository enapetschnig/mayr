import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban, Calculator, Check, Clock, Copy, Download, FileText, FolderInput, LockOpen, Mic, MoreVertical, Package, PenLine, Percent, Plus,
  Receipt, RotateCcw, Rows3, Save, ThumbsDown, ThumbsUp, Trash2, Undo2, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Seite } from "@/components/PageHeader";
import { StatusBadge } from "@/components/Bausteine";
import { FormularDialog } from "@/components/FormularDialog";
import { useIstPc } from "@/components/AppLayout";
import { useNeuLaden, useProjekt } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { archivieren, archivLaden } from "@/lib/belegArchiv";
import { belegPdfErstellen } from "@/lib/belegPdf";
import { datum, euro, isoTag, zahl } from "@/lib/format";
import { pdfDateiname, pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { lohnarten as lohnartenFuer, rohertrag, umProzent } from "@/lib/kalkulation";
import { stundensatzFuer } from "@/lib/preise";
import { belegStatus, TON_KLASSE, type Artikel, type Beleg, type Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArbeitszeitDialog } from "./ArbeitszeitDialog";
import { ArtikelDialog } from "./ArtikelDialog";
import { BelegKopf, BelegTexte } from "./BelegKopf";
import { belegLaden, useBelegKurz, useFolgeRechnungen, useLeistungsKatalog, useNachfolger, type BelegMitPositionen } from "./daten";
import {
  artikelPosition, fertigHinweise, hinzufuegen, kopfAusBeleg, leerePosition, leistungPosition, leistungWeniger, mengeVon,
  ohneBetrag, ohneUstFuer, positionAusDb, preisText, preisVon, quellenIds, summen, titelMitNamen, titelPosition, zahlText,
  type EditorPosition, type KatalogLeistung, type Kopf,
} from "./editor";
import { ImportDialog, type ImportErgebnis } from "./ImportDialog";
import { LeistungDialog } from "./LeistungDialog";
import { PositionDialog } from "./PositionDialog";
import { PositionenEditor } from "./PositionenEditor";
import {
  belegKopieren, belegLoeschen, belegSpeichern, fertigstellen, inRechnungUmwandeln, projektAktivieren, projektLoeschen,
  projektNurFuerBeleg, projektZurueckAufAngebot, StandVeraltet, statusSetzen, stornieren,
} from "./speichern";
import { sicherungLesen, sicherungLoeschen, sicherungSchreiben, sicherungsSchluessel, type Sicherung } from "./sicherung";
import { SpracheDialog, type SprachUebernahme } from "./SpracheDialog";
import { TitelDialog } from "./TitelDialog";
import { useVerlassenSchutz } from "./useVerlassenSchutz";
import { VerlassenDialog } from "./VerlassenSchutz";

/** Stand des Editors als Text — ungleich dem gespeicherten Stand = ungespeichert */
const schnappschuss = (k: Kopf, p: EditorPosition[]) => JSON.stringify([k, p]);
const DETAIL = (id: string) => ["belege", "detail", id];
const NACH_AENDERUNG = ["belege", "projekte", "projekt_zahlen", "zeiten", "material", "regieberichte"];

type Frage = "fertig" | "storno" | "entsperren" | null;
type Dialog = "arbeitszeit" | "leistung" | "artikel" | "sprache" | "import" | null;
type Icon = ComponentType<{ className?: string }>;

/**
 * Angebot oder Rechnung bearbeiten und abwickeln. Ein neuer Beleg entsteht
 * erst beim ersten Speichern (Angebot ohne Projekt → Projekt wird angelegt).
 * Fertige Rechnungen sind nur noch zum Lesen, Bezahlen und Stornieren da.
 */
export function BelegEditor({
  id, daten, startKopf, autoSprache = false, autoImport = false,
}: {
  id: string;
  /** null = neuer Beleg, noch nicht in der Datenbank */
  daten: BelegMitPositionen | null;
  startKopf?: Kopf;
  autoSprache?: boolean;
  autoImport?: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const neuLaden = useNeuLaden();
  const pc = useIstPc();
  const { firma } = useSitzung();
  const heute = isoTag();

  // ── Zustand ──
  const [start] = useState(() => {
    const k = daten ? kopfAusBeleg(daten.beleg) : startKopf!;
    const p = daten ? daten.positionen.map(positionAusDb) : [];
    return { k, p, s: schnappschuss(k, p) };
  });
  const [neu, setNeu] = useState(!daten);
  const [beleg, setBeleg] = useState<Beleg | null>(daten?.beleg ?? null);
  const [kopf, setKopf] = useState<Kopf>(start.k);
  const [positionen, setPositionen] = useState<EditorPosition[]>(start.p);
  const [basis, setBasis] = useState(start.s);
  const dbIds = useRef(new Set(start.p.map((p) => p.id)));
  const [aktiverTitel, setAktiverTitel] = useState<string | null>(() => [...start.p].reverse().find((p) => p.art === "titel")?.id ?? null);
  const [entsperrt, setEntsperrt] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [frage, setFrage] = useState<Frage>(null);
  const [bezahltAm, setBezahltAm] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState<{ projektMoeglich: boolean; projektAuch: boolean } | null>(null);
  const [vorschau, setVorschau] = useState<{ url: string; blob: Blob; dateiname: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(autoSprache ? "sprache" : autoImport ? "import" : null);
  const [titelOffen, setTitelOffen] = useState(false);
  const [freie, setFreie] = useState<EditorPosition | null>(null);
  /** Buchungen, die beim letzten Speichern schon an einer anderen Rechnung hingen */
  const [konflikte, setKonflikte] = useState(0);

  const aktuell = useMemo(() => schnappschuss(kopf, positionen), [kopf, positionen]);
  const dirty = aktuell !== basis;
  const aktuellRef = useRef(aktuell);
  aktuellRef.current = aktuell;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const status = beleg?.status ?? "entwurf";
  const anzeigeStatus = beleg ? belegStatus(beleg, heute) : "entwurf";
  const istAngebot = kopf.typ === "angebot";
  const istStorno = status === "storno";
  const typText = istAngebot ? "Angebot" : istStorno ? "Stornorechnung" : "Rechnung";
  const entwurf = status === "entwurf";
  const bearbeitbar = entwurf || (istAngebot && status === "offen" && entsperrt);

  const projektAbfrage = useProjekt(kopf.projekt_id ?? undefined);
  const projekt = projektAbfrage.data;
  const stundensatz = stundensatzFuer(projekt, firma);
  const { data: katalog = [], isLoading: katalogLaedt } = useLeistungsKatalog();
  const { data: folge = [] } = useFolgeRechnungen(id, !neu && istAngebot);
  const { data: angebot } = useBelegKurz(istAngebot ? null : kopf.angebot_id);
  // Storno: die Stornorechnung zeigt auf die Rechnung, die sie aufhebt
  const stornoQuelle = useBelegKurz(beleg?.storno_von ?? null);
  const { data: nachfolger } = useNachfolger(id, !neu && status === "storniert");
  const stornoBeleg = nachfolger?.storno ?? null;
  const korrekturBeleg = nachfolger?.korrektur ?? null;
  // Korrektur: die Rechnung, die sie ersetzt
  const ersetztQuelle = useBelegKurz(beleg?.korrektur_von ?? null);

  const ohneUst = ohneUstFuer(kopf, firma);
  const s = useMemo(() => summen(positionen, kopf.ust_satz, ohneUst), [positionen, kopf.ust_satz, ohneUst]);
  const belegt = useMemo(() => quellenIds(positionen), [positionen]);
  const anzahl = positionen.filter((p) => !ohneBetrag(p)).length;
  const titelName = positionen.find((p) => p.id === aktiverTitel && p.art === "titel")?.bezeichnung ?? null;

  const schutz = useVerlassenSchutz(dirty);

  // ── Sicherung im Gerät — gegen Zurück-Geste, Absturz, leeren Akku ──
  const schluessel = sicherungsSchluessel(id, neu, kopf.typ);
  const [gefunden, setGefunden] = useState<{ s: Sicherung; schluessel: string } | null>(() => {
    const k = sicherungsSchluessel(id, !daten, start.k.typ);
    const s = sicherungLesen(k);
    if (!s) return null;
    // Nur für Entwürfe — schon gespeichert oder inzwischen fertig: weg damit
    if ((daten && daten.beleg.status !== "entwurf") || schnappschuss(s.kopf, s.positionen) === start.s) {
      sicherungLoeschen(k);
      return null;
    }
    return { s, schluessel: k };
  });
  useEffect(() => {
    if (gefunden || !bearbeitbar) return; // erst entscheiden: wiederherstellen oder verwerfen
    if (dirty) sicherungSchreiben(schluessel, { zeit: new Date().toISOString(), basis, kopf, positionen });
    else sicherungLoeschen(schluessel);
  }, [kopf, positionen, dirty, basis, bearbeitbar, gefunden, schluessel]);

  const wiederherstellen = () => {
    if (!gefunden) return;
    const { s } = gefunden;
    setKopf({ ...s.kopf, typ: kopf.typ });
    setPositionen(s.positionen);
    setAktiverTitel([...s.positionen].reverse().find((p) => p.art === "titel")?.id ?? null);
    setGefunden(null);
    toast.success("Wiederhergestellt — zum Behalten speichern.");
  };
  const sicherungVerwerfen = () => {
    if (gefunden) sicherungLoeschen(gefunden.schluessel);
    setGefunden(null);
  };

  // ── Gespeicherten Stand übernehmen ──
  const anwenden = useCallback((d: BelegMitPositionen) => {
    const k = kopfAusBeleg(d.beleg);
    const p = d.positionen.map(positionAusDb);
    setBeleg(d.beleg);
    setKopf(k);
    setPositionen(p);
    setBasis(schnappschuss(k, p));
    dbIds.current = new Set(p.map((x) => x.id));
    setNeu(false);
  }, []);

  // Neu geladen (Fenster wieder im Vordergrund, Aktion anderswo) — übernehmen,
  // solange hier nichts ungespeichert ist
  const letzteDaten = useRef(daten);
  useEffect(() => {
    if (!daten || daten === letzteDaten.current) return;
    letzteDaten.current = daten;
    if (!dirtyRef.current) anwenden(daten);
  }, [daten, anwenden]);

  const neuHolen = async () => {
    const d = await belegLaden(id);
    if (d) {
      letzteDaten.current = d;
      qc.setQueryData(DETAIL(id), d);
      anwenden(d);
    }
    void neuLaden(...NACH_AENDERUNG);
    return d;
  };

  // Doppelklick: `laeuft` kommt erst mit dem nächsten Render an — die Sperre sofort
  const sperre = useRef(false);
  const gesperrt = async (fn: () => Promise<void>) => {
    if (sperre.current) return;
    sperre.current = true;
    try {
      await fn();
    } finally {
      sperre.current = false;
    }
  };
  const ausfuehren = async (was: string, fn: () => Promise<void>) => {
    if (laeuft || sperre.current) return;
    sperre.current = true;
    setLaeuft(was);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      sperre.current = false;
      setLaeuft(null);
    }
  };

  /**
   * Anderswo gespeichert: den neuen Stand laden, die eigenen Änderungen als
   * Sicherung anbieten — wiederherstellen und speichern ersetzt dann bewusst.
   */
  const standVeraltet = async () => {
    const meine: Sicherung = { zeit: new Date().toISOString(), basis, kopf, positionen };
    const d = await belegLaden(id).catch(() => null);
    if (!d) {
      toast.error("Beleg nicht gefunden — wurde er inzwischen gelöscht?");
      return;
    }
    const nochOffen = d.beleg.status === "entwurf" || (d.beleg.typ === "angebot" && d.beleg.status === "offen" && entsperrt);
    if (nochOffen) {
      sicherungSchreiben(schluessel, meine);
      setGefunden({ s: meine, schluessel });
    } else {
      sicherungLoeschen(schluessel);
    }
    letzteDaten.current = d;
    qc.setQueryData(DETAIL(id), d);
    anwenden(d);
    toast.error("Inzwischen woanders gespeichert — anderes Gerät oder Fenster.", {
      description: nochOffen
        ? "Der neue Stand ist geladen. Deine Änderungen kannst du oben wiederherstellen."
        : "Der Beleg ist inzwischen fertig — deine Änderungen ließen sich nicht mehr speichern.",
      duration: 12_000,
    });
  };

  // ── Speichern ──
  const speichernIntern = async ({ leise = false, weiterleiten = true }: { leise?: boolean; weiterleiten?: boolean } = {}): Promise<boolean> => {
    if (!kopf.datum) {
      toast.error("Bitte ein Datum eintragen.");
      return false;
    }
    if (istAngebot && !kopf.projekt_id && !kopf.empf_name.trim() && !kopf.betreff.trim()) {
      toast.error("Bitte zuerst Kunde oder Betreff eintragen — daraus wird das Projekt angelegt.");
      return false;
    }
    const vorher = aktuellRef.current;
    const warNeu = neu;
    const merk: { projekt: string | null } = { projekt: null };
    setLaeuft("speichern");
    try {
      const geloescht = [...dbIds.current].filter((x) => !positionen.some((p) => p.id === x));
      const erg = await belegSpeichern({
        id, neu: warNeu, kopf, positionen, geloescht, firma, stand: warNeu ? null : beleg?.updated_at ?? null,
        onProjektAngelegt: (pid) => { merk.projekt = pid; },
      });
      const d: BelegMitPositionen = { beleg: erg.beleg, positionen: erg.positionen };
      if (warNeu) sicherungLoeschen(sicherungsSchluessel(id, true, kopf.typ));
      letzteDaten.current = d;
      qc.setQueryData(DETAIL(id), d);
      if (aktuellRef.current === vorher) {
        anwenden(d);
      } else {
        // Während des Speicherns weitergetippt — das bleibt ungespeichert
        setBeleg(erg.beleg);
        setNeu(false);
        dbIds.current = new Set(erg.positionen.map((p) => p.id));
        setKopf((k) => ({ ...k, projekt_id: erg.beleg.projekt_id }));
        setBasis("");
      }
      setEntsperrt(false);
      setKonflikte(erg.konflikte);
      if (erg.konflikte > 0) {
        toast.warning(
          `${erg.konflikte} ${erg.konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — bitte die übernommenen Positionen prüfen.`,
          { duration: 10_000 },
        );
      } else if (!leise) {
        toast.success(warNeu ? (merk.projekt ? `${typText} und Projekt angelegt` : `${typText} angelegt`) : "Gespeichert");
      }
      void neuLaden(...NACH_AENDERUNG);
      if (warNeu && weiterleiten) navigate(`/belege/${id}`, { replace: true });
      return true;
    } catch (e) {
      if (merk.projekt) setKopf((k) => ({ ...k, projekt_id: merk.projekt }));
      if (e instanceof StandVeraltet) await standVeraltet();
      else toast.error((e as Error).message);
      return false;
    } finally {
      setLaeuft(null);
    }
  };
  const speichern = () => { if (!laeuft) void gesperrt(async () => { await speichernIntern(); }); };

  // Strg+S (Mac: Cmd+S) speichert — statt „Seite speichern unter …“ des Browsers.
  // Nicht, solange ein Dialog offen ist: dessen Eingabe steckt noch nicht im Beleg.
  const tasteSpeichern = useRef(() => {});
  tasteSpeichern.current = () => {
    if (bearbeitbar && !laeuft && (dirty || neu) && !document.querySelector('[role="dialog"], [role="alertdialog"]')) speichern();
  };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        tasteSpeichern.current();
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  // ── Fertigstellen ──
  const warnungen = fertigHinweise(kopf, positionen, s.brutto, firma, heute);

  const fertigFragen = () => {
    if (!anzahl) { toast.error("Zuerst mindestens eine Position mit Betrag hinzufügen."); return; }
    if (!kopf.empf_name.trim()) { toast.error("Bitte zuerst den Empfänger (Kunde) eintragen."); return; }
    setFrage("fertig");
  };
  const fertigAusfuehren = () => gesperrt(async () => {
    setFrage(null);
    const warNeu = neu;
    if (dirty || neu) {
      const ok = await speichernIntern({ leise: true, weiterleiten: false });
      if (!ok) return;
    }
    setLaeuft("fertig");
    try {
      const nr = await fertigstellen(id);
      const d = await neuHolen();
      toast.success(`${typText} ${nr} ist fertig.`);
      if (d) void archivAnlegen(d, { ersetzt: await ersetztFuerPdf() }).catch(() => toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen."));
      if (warNeu) navigate(`/belege/${id}`, { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  });

  // ── Status ──
  const angenommen = () => ausfuehren("status", async () => {
    await statusSetzen(id, "angenommen");
    const aktiviert = await projektAktivieren(kopf.projekt_id);
    await neuHolen();
    toast.success(aktiviert ? "Angebot angenommen — das Projekt steht jetzt auf „In Arbeit“." : "Angebot angenommen");
  });
  const abgelehnt = () => ausfuehren("status", async () => {
    await statusSetzen(id, "abgelehnt");
    await neuHolen();
    toast.success("Angebot als abgelehnt markiert");
  });
  const wiederOffen = () => ausfuehren("status", async () => {
    const warAngenommen = istAngebot && status === "angenommen";
    await statusSetzen(id, "offen");
    const zurueck = warAngenommen && (await projektZurueckAufAngebot(kopf.projekt_id, id).catch(() => false));
    await neuHolen();
    if (zurueck) toast.success("Wieder offen — das Projekt steht wieder auf „Angebot“.");
  });
  const bezahltSetzen = (am: string) => ausfuehren("status", async () => {
    setBezahltAm(null);
    await statusSetzen(id, "bezahlt", am || heute);
    await neuHolen();
    toast.success("Als bezahlt markiert");
  });
  const stornoAusfuehren = () => ausfuehren("storno", async () => {
    setFrage(null);
    const rechnungNr = beleg?.nummer ?? null;
    const stornoId = await stornieren(id);
    await neuHolen();
    const d = await belegLaden(stornoId).catch(() => null);
    if (d) void archivAnlegen(d, { stornoZu: rechnungNr }).catch(() => toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen."));
    toast.success(`Stornorechnung ${d?.beleg.nummer ?? ""} angelegt — schick sie dem Kunden. Stunden, Material und Regieberichte sind wieder frei.`, {
      action: { label: "Öffnen", onClick: () => navigate(`/belege/${stornoId}`) },
    });
  });

  // ── Neue Belege aus diesem ──
  const frisch = async () => {
    if (dirtyRef.current) throw new Error("Bitte zuerst speichern.");
    const d = await belegLaden(id);
    if (!d) throw new Error("Beleg nicht gefunden.");
    return d;
  };
  const umwandeln = () => ausfuehren("kopieren", async () => {
    const d = await frisch();
    const neueId = await inRechnungUmwandeln(d.beleg, d.positionen, firma, heute);
    void neuLaden(...NACH_AENDERUNG);
    toast.success("Rechnung aus dem Angebot angelegt — prüfen, Leistungszeitraum eintragen, fertigstellen.");
    navigate(`/belege/${neueId}`);
  });
  const kopieren = (mitHerkunft: boolean) => ausfuehren("kopieren", async () => {
    const d = await frisch();
    const { id: neueId, konflikte, schonDa } = await belegKopieren({ quelle: d.beleg, positionen: d.positionen, typ: kopf.typ, firma, heute, mitHerkunft });
    void neuLaden(...NACH_AENDERUNG);
    if (schonDa) toast.info("Die Korrektur gibt es schon — hier ist sie.");
    else if (konflikte) toast.warning(`${konflikte} ${konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — bitte prüfen.`);
    else if (mitHerkunft) toast.success("Korrektur angelegt — Stunden und Material hängen jetzt an diesem Entwurf.");
    else if (!istAngebot && d.positionen.some((p) => p.quelle)) {
      // Eine Kopie bindet keine Stunden — sonst stünden sie in zwei Rechnungen
      toast.warning("Kopie angelegt — ohne Verbindung zu Stunden und Material des Projekts. Nichts doppelt verrechnen.", { duration: 10_000 });
    } else toast.success("Kopie angelegt");
    navigate(`/belege/${neueId}`);
  });
  const korrekturOeffnen = () => (korrekturBeleg ? navigate(`/belege/${korrekturBeleg.id}`) : kopieren(true));

  // ── Löschen ──
  const verwerfen = () => {
    sicherungLoeschen(schluessel);
    setBasis(aktuellRef.current);
    if (window.history.length > 1) navigate(-1);
    else navigate("/belege");
  };
  const loeschenFragen = () => ausfuehren("pruefen", async () => {
    const inRechnung = istAngebot ? folge.find((f) => f.status !== "entwurf") : undefined;
    if (inRechnung) {
      toast.error(`Das Angebot steckt in Rechnung ${inRechnung.nummer ?? ""} und bleibt als Nachweis erhalten.`);
      return;
    }
    let moeglich = false;
    if (istAngebot && beleg?.projekt_id) moeglich = await projektNurFuerBeleg(beleg.projekt_id, id).catch(() => false);
    setLoeschen({ projektMoeglich: moeglich, projektAuch: moeglich });
  });
  const loeschenAusfuehren = () => ausfuehren("loeschen", async () => {
    const projektAuch = loeschen?.projektAuch && beleg?.projekt_id ? beleg.projekt_id : null;
    setLoeschen(null);
    await belegLoeschen(id);
    sicherungLoeschen(schluessel);
    if (projektAuch) await projektLoeschen(projektAuch);
    setBasis(aktuellRef.current);
    toast.success(`${entwurf ? "Entwurf" : typText} gelöscht${projektAuch ? " — das Projekt auch" : ""}`);
    navigate("/belege", { replace: true });
    void neuLaden(...NACH_AENDERUNG);
  });

  // ── PDF ──
  // Gleich nach dem Öffnen kann das Projekt noch laden — sonst fehlt es im PDF
  const projektFuerPdf = async () => {
    const p = kopf.projekt_id ? projekt ?? (await projektAbfrage.refetch()).data ?? null : null;
    return p ? { nummer: p.nummer, name: p.name, strasse: p.strasse, plz: p.plz, ort: p.ort } : null;
  };

  /** Stornorechnung: Nummer der Rechnung, die sie aufhebt */
  const stornoZuFuerPdf = async () => {
    if (!beleg?.storno_von) return null;
    return (stornoQuelle.data ?? (await stornoQuelle.refetch()).data)?.nummer ?? null;
  };
  /** Korrektur: Nummer der stornierten Rechnung, die sie ersetzt */
  const ersetztFuerPdf = async () => {
    if (!beleg?.korrektur_von) return null;
    return (ersetztQuelle.data ?? (await ersetztQuelle.refetch()).data)?.nummer ?? null;
  };

  /**
   * Fertige Rechnung (oder neue Stornorechnung) ablegen — aus dem Stand in der
   * Datenbank (Nummer und Fälligkeit setzt erst das Fertigstellen)
   */
  const archivAnlegen = async (d: BelegMitPositionen, verweise: { stornoZu?: string | null; ersetzt?: string | null } = {}) => {
    if (!firma || d.beleg.typ !== "rechnung" || d.beleg.status === "entwurf") return;
    const { blob } = await belegPdfErstellen({
      beleg: d.beleg,
      positionen: d.positionen.map((p) => ({
        art: p.art, bezeichnung: p.bezeichnung, langtext: p.langtext, menge: Number(p.menge), einheit: p.einheit, einzelpreis: Number(p.einzelpreis),
      })),
      firma,
      projekt: await projektFuerPdf(),
      ...verweise,
    });
    if (!(await archivieren(d.beleg.id, blob))) toast.warning("PDF nicht abgelegt — das passiert beim nächsten Öffnen.");
  };

  const pdf = () => ausfuehren("pdf", async () => {
    if (!firma) throw new Error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    if (!entwurf && dirty) throw new Error("Bitte zuerst speichern.");
    // Fertige Rechnung: das abgelegte Original. Fehlt es (vor dem Archiv
    // fertiggestellt, Ablegen gescheitert), jetzt erzeugen und ablegen.
    const original = !istAngebot && !!beleg?.nummer && (status === "offen" || status === "bezahlt" || status === "storno");
    const archiv = original ? await archivLaden(id) : null;
    if (archiv) {
      const datei = { blob: new Blob([archiv], { type: "application/pdf" }), dateiname: pdfDateiname(typText, beleg?.nummer, beleg?.empf_name) };
      if (pc) setVorschau({ url: URL.createObjectURL(datei.blob), ...datei });
      else await pdfTeilenOderLaden(datei.blob, datei.dateiname);
      return;
    }
    const { blob, dateiname } = await belegPdfErstellen({
      beleg: {
        typ: kopf.typ,
        nummer: beleg?.nummer ?? null,
        status,
        datum: kopf.datum,
        leistung_von: kopf.leistung_von || null,
        leistung_bis: kopf.leistung_bis || null,
        gueltig_bis: kopf.gueltig_bis || null,
        faellig_am: kopf.faellig_am || null,
        betreff: kopf.betreff.trim() || null,
        einleitung: kopf.einleitung.trim() || null,
        schlusstext: kopf.schlusstext.trim() || null,
        ust_satz: kopf.ust_satz,
        reverse_charge: kopf.reverse_charge,
        kv_verbindlich: kopf.kv_verbindlich,
        empf_name: kopf.empf_name.trim() || null,
        empf_zusatz: kopf.empf_zusatz.trim() || null,
        empf_strasse: kopf.empf_strasse.trim() || null,
        empf_plz: kopf.empf_plz.trim() || null,
        empf_ort: kopf.empf_ort.trim() || null,
        empf_uid: kopf.empf_uid.trim() || null,
      },
      positionen: positionen.map((p) => ({
        art: p.art, bezeichnung: p.bezeichnung, langtext: p.langtext, menge: mengeVon(p), einheit: p.einheit, einzelpreis: preisVon(p),
      })),
      firma,
      projekt: await projektFuerPdf(),
      stornoZu: await stornoZuFuerPdf(),
      ersetzt: await ersetztFuerPdf(),
    });
    if (original) void archivieren(id, blob);
    if (pc) setVorschau({ url: URL.createObjectURL(blob), blob, dateiname });
    else await pdfTeilenOderLaden(blob, dateiname);
  });
  const vorschauSchliessen = () => {
    if (vorschau) URL.revokeObjectURL(vorschau.url);
    setVorschau(null);
  };

  // ── Positionen hinzufügen ──
  const kopfAendern = (w: Partial<Kopf>) => setKopf((k) => ({ ...k, ...w }));
  const leistungPlus = (l: KatalogLeistung) =>
    setPositionen((alt) => hinzufuegen(alt, leistungPosition(l, firma, stundensatz), aktiverTitel).liste);
  const leistungMinus = (l: KatalogLeistung) => setPositionen((alt) => leistungWeniger(alt, aktiverTitel, l.id));
  const artikelPlus = (a: Artikel) => setPositionen((alt) => hinzufuegen(alt, artikelPosition(a, firma), aktiverTitel).liste);
  const titelAnlegen = (name: string) => {
    const t = titelPosition(name);
    setPositionen((alt) => [...alt, t]);
    setAktiverTitel(t.id);
  };
  const arbeitszeitHinzufuegen = (neue: EditorPosition[]) =>
    setPositionen((alt) => neue.reduce((liste, p) => hinzufuegen(liste, p, aktiverTitel).liste, alt));
  // Alle Preise um ± % — Aufschlag oder Rabatt aufs ganze Angebot (Zeilen ohne Betrag bleiben)
  const preiseUmProzent = (prozent: number) =>
    setPositionen((alt) => alt.map((p) => (ohneBetrag(p) ? p : { ...p, einzelpreis: preisText(umProzent(preisVon(p), prozent)) })));
  const freieHinzufuegen = (p: EditorPosition) => {
    setPositionen((alt) => hinzufuegen(alt, p, aktiverTitel).liste);
    setFreie(null);
  };

  const spracheUebernehmen = (posten: SprachUebernahme[]) => {
    let liste = positionen;
    let zuletzt = aktiverTitel;
    let ohnePreis = 0;
    posten.forEach((p) => {
      let ziel = aktiverTitel;
      if (p.raum) {
        const t = titelMitNamen(liste, p.raum);
        if (t) ziel = t.id;
        else {
          const neuerTitel = titelPosition(p.raum);
          liste = [...liste, neuerTitel];
          ziel = neuerTitel.id;
        }
        zuletzt = ziel;
      }
      const pos = p.leistung
        ? leistungPosition(p.leistung, firma, stundensatz, p.menge)
        : leerePosition("leistung", { bezeichnung: p.text, menge: zahlText(p.menge), einheit: p.einheit || "Stk" });
      if (!p.leistung) ohnePreis += 1;
      liste = hinzufuegen(liste, pos, ziel).liste;
    });
    setPositionen(liste);
    setAktiverTitel(zuletzt);
    toast.success(
      `${posten.length} ${posten.length === 1 ? "Position" : "Positionen"} übernommen${ohnePreis ? ` — ${ohnePreis} ohne Preis, bitte eintragen` : ""}`,
    );
  };

  const importUebernehmen = (e: ImportErgebnis) => {
    setPositionen((alt) => [...alt, ...e.positionen]);
    setKopf((k) => ({
      ...k,
      leistung_von: k.leistung_von || e.von || "",
      leistung_bis: k.leistung_bis || e.bis || "",
      angebot_id: k.angebot_id ?? e.angebotId,
    }));
    const letzterTitel = [...e.positionen].reverse().find((p) => p.art === "titel");
    if (letzterTitel) setAktiverTitel(letzterTitel.id);
    const n = e.positionen.filter((p) => !ohneBetrag(p)).length;
    toast.success(n
      ? `${n} ${n === 1 ? "Position" : "Positionen"} übernommen — Speichern markiert Stunden und Material als verrechnet.`
      : "Als abgegolten übernommen — Speichern markiert Stunden und Material als verrechnet.");
  };

  // ── Kopfzeile ──
  // Mit Nummer steht die Nummer oben (kurz genug fürs Handy), die Art darunter
  const titel = neu ? (istAngebot ? "Neues Angebot" : "Neue Rechnung") : beleg?.nummer ?? `${typText} – Entwurf`;
  const untertitel = (
    <span className="flex min-w-0 items-center gap-1.5">
      {!neu && <StatusBadge status={anzeigeStatus} className="px-1.5 py-0 text-[11px]" />}
      <span className="truncate">
        {[beleg?.nummer ? typText : null, kopf.empf_name || projekt?.name || (istAngebot ? "Kunde wählen, Leistungen antippen" : "Kunde und Projekt wählen")]
          .filter(Boolean).join(" · ")}
      </span>
    </span>
  );

  const menue = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Weitere Aktionen" disabled={!!laeuft}>
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {entwurf && !pc && (
          <MenuePunkt icon={Check} onClick={fertigFragen}>Fertigstellen</MenuePunkt>
        )}
        {istAngebot && status === "offen" && !entsperrt && (
          <MenuePunkt icon={LockOpen} onClick={() => setFrage("entsperren")}>Angebot ändern</MenuePunkt>
        )}
        {istAngebot && (status === "offen" || status === "angenommen") && (
          <MenuePunkt icon={Receipt} onClick={umwandeln}>In Rechnung umwandeln</MenuePunkt>
        )}
        {istAngebot && (status === "angenommen" || status === "abgelehnt") && (
          <MenuePunkt icon={Undo2} onClick={wiederOffen}>Wieder auf „offen“</MenuePunkt>
        )}
        {!istAngebot && status === "bezahlt" && (
          <MenuePunkt icon={Undo2} onClick={wiederOffen}>Doch nicht bezahlt</MenuePunkt>
        )}
        {!istAngebot && status === "storniert" && (
          <MenuePunkt icon={RotateCcw} onClick={korrekturOeffnen}>{korrekturBeleg ? "Korrektur öffnen" : "Korrektur anlegen"}</MenuePunkt>
        )}
        {!neu && !istStorno && <MenuePunkt icon={Copy} onClick={() => kopieren(false)}>Kopieren (neuer Entwurf)</MenuePunkt>}
        <MenuePunkt icon={Download} onClick={pdf}>{pc ? "PDF ansehen" : "PDF teilen / laden"}</MenuePunkt>
        {!istAngebot && (status === "offen" || status === "bezahlt") && (
          <>
            <DropdownMenuSeparator />
            <MenuePunkt icon={Ban} onClick={() => setFrage("storno")} gefahr>Stornieren</MenuePunkt>
          </>
        )}
        {(entwurf || istAngebot) && (
          <>
            <DropdownMenuSeparator />
            <MenuePunkt icon={Trash2} onClick={neu ? verwerfen : loeschenFragen} gefahr>{neu ? "Verwerfen" : entwurf ? "Entwurf löschen" : "Angebot löschen"}</MenuePunkt>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const aktionen = pc ? (
    <>
      <Button variant="outline" className="h-10" onClick={pdf} disabled={!!laeuft}>
        <FileText className="h-4 w-4" /> {laeuft === "pdf" ? "PDF …" : "PDF"}
      </Button>
      {bearbeitbar && (
        <Button variant={entwurf ? "outline" : "default"} className="h-10" onClick={speichern} disabled={!!laeuft || (!dirty && !neu)}>
          <Save className="h-4 w-4" /> {laeuft === "speichern" ? "Speichert …" : dirty || neu ? "Speichern" : "Gespeichert"}
        </Button>
      )}
      {entwurf && (
        <Button className="h-10" onClick={fertigFragen} disabled={!!laeuft}>
          <Check className="h-4 w-4" /> Fertigstellen
        </Button>
      )}
      {menue}
    </>
  ) : (
    <>
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={pdf} disabled={!!laeuft} aria-label="PDF">
        <FileText className="h-5 w-5" />
      </Button>
      {menue}
    </>
  );

  // ── Status-Karte (fertige Belege) ──
  const ueberfaelligTage = anzeigeStatus === "ueberfaellig" && beleg?.faellig_am
    ? Math.round((Date.parse(heute) - Date.parse(beleg.faellig_am)) / 86_400_000)
    : 0;
  const statusText = (() => {
    if (!beleg) return "";
    if (istAngebot) {
      if (status === "offen") {
        const abgelaufen = beleg.gueltig_bis && beleg.gueltig_bis < heute;
        return `Wartet auf Antwort${beleg.gueltig_bis ? ` · gültig bis ${datum(beleg.gueltig_bis)}${abgelaufen ? " (abgelaufen)" : ""}` : ""}`;
      }
      if (status === "angenommen") return folge.length ? "" : "Jetzt in eine Rechnung umwandeln — oder später „Rechnung aus dem Projekt“.";
      if (status === "abgelehnt") return "Bleibt zur Ansicht erhalten. Für ein neues Angebot: Menü → Kopieren.";
      return "";
    }
    if (anzeigeStatus === "ueberfaellig") return `Seit ${ueberfaelligTage} ${ueberfaelligTage === 1 ? "Tag" : "Tagen"} überfällig (fällig am ${datum(beleg.faellig_am)})`;
    if (status === "offen") return beleg.faellig_am ? `Fällig am ${datum(beleg.faellig_am)}` : "Offen";
    if (status === "bezahlt") return beleg.bezahlt_am ? `Bezahlt am ${datum(beleg.bezahlt_am)}` : "Bezahlt";
    if (status === "storniert") {
      return korrekturBeleg
        ? "Storniert — die Korrektur ersetzt sie."
        : "Storniert — Stunden, Material und Regieberichte sind wieder frei. Für die neue Rechnung „Korrektur anlegen“.";
    }
    if (istStorno) return "Hebt die Rechnung in voller Höhe auf — schick sie dem Kunden.";
    return "";
  })();

  const statusKnoepfe: { text: string; icon: Icon; onClick: () => void; primaer?: boolean }[] = !beleg || entwurf ? [] : istAngebot
    ? status === "offen"
      ? [
        { text: "PDF", icon: FileText, onClick: pdf, primaer: true },
        { text: "Angenommen", icon: ThumbsUp, onClick: angenommen },
        { text: "Abgelehnt", icon: ThumbsDown, onClick: abgelehnt },
      ]
      : status === "angenommen"
        ? [
          ...(folge.some((f) => f.status !== "storniert") ? [] : [{ text: "In Rechnung umwandeln", icon: Receipt, onClick: umwandeln, primaer: true }]),
          { text: "PDF", icon: FileText, onClick: pdf },
        ]
        : [{ text: "PDF", icon: FileText, onClick: pdf }, { text: "Wieder offen", icon: Undo2, onClick: wiederOffen }]
    : status === "offen"
      ? [
        { text: pc ? "PDF" : "PDF teilen", icon: FileText, onClick: pdf, primaer: true },
        { text: "Bezahlt", icon: Wallet, onClick: () => setBezahltAm(heute) },
      ]
      : status === "storniert"
        ? [
          { text: korrekturBeleg ? "Korrektur öffnen" : "Korrektur anlegen", icon: RotateCcw, onClick: korrekturOeffnen, primaer: true },
          ...(stornoBeleg ? [{ text: "Stornorechnung", icon: Receipt, onClick: () => navigate(`/belege/${stornoBeleg.id}`) }] : []),
          { text: "PDF", icon: FileText, onClick: pdf },
        ]
        : istStorno
          ? [{ text: pc ? "PDF" : "PDF teilen", icon: FileText, onClick: pdf, primaer: true }]
          : [{ text: "PDF", icon: FileText, onClick: pdf }];
  const nebenAnzahl = statusKnoepfe.filter((k) => !k.primaer).length;

  const statusKarte = beleg && !entwurf && (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge status={anzeigeStatus} />
        <p className="min-w-0 text-sm text-muted-foreground">{statusText}</p>
      </div>
      {folge.length > 0 && (
        <p className="mt-2 text-sm">
          In Rechnung übernommen:{" "}
          {folge.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ", "}
              <Link to={`/belege/${f.id}`} className="font-medium text-primary hover:underline">{f.nummer ?? "Entwurf"}</Link>
              {f.status === "storniert" && " (storniert)"}
            </span>
          ))}
        </p>
      )}
      {stornoBeleg && (
        <p className="mt-2 text-sm">
          Aufgehoben durch{" "}
          <Link to={`/belege/${stornoBeleg.id}`} className="font-medium text-primary hover:underline">Stornorechnung {stornoBeleg.nummer}</Link>
        </p>
      )}
      {korrekturBeleg && (
        <p className="mt-2 text-sm">
          Ersetzt durch{" "}
          <Link to={`/belege/${korrekturBeleg.id}`} className="font-medium text-primary hover:underline">
            {korrekturBeleg.nummer ? `Rechnung ${korrekturBeleg.nummer}` : "den Korrektur-Entwurf"}
          </Link>
        </p>
      )}
      {istStorno && stornoQuelle.data && (
        <p className="mt-2 text-sm">
          Storno zu{" "}
          <Link to={`/belege/${stornoQuelle.data.id}`} className="font-medium text-primary hover:underline">Rechnung {stornoQuelle.data.nummer}</Link>
        </p>
      )}
      {entsperrt && (
        <p className={cn("mt-3 rounded-md px-3 py-2 text-sm", TON_KLASSE.gelb)}>
          Du änderst ein fertiges Angebot — die Nummer {beleg.nummer} bleibt. Wurde es schon verschickt, besser „Kopieren“ und neu schicken.
        </p>
      )}
      {statusKnoepfe.length > 0 && !entsperrt && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {statusKnoepfe.map((k, i) => (
            <Button
              key={k.text}
              variant={k.primaer ? "default" : "outline"}
              className={cn("h-11", (k.primaer || (nebenAnzahl % 2 === 1 && i === statusKnoepfe.length - 1)) && "col-span-2")}
              onClick={k.onClick}
              disabled={!!laeuft}
            >
              <k.icon className="h-4 w-4" /> {k.text}
            </Button>
          ))}
        </div>
      )}
    </section>
  );

  // ── Hinzufügen ──
  const hinzuKnoepfe: { key: string; text: string; icon: Icon; onClick: () => void; primaer?: boolean; aus?: boolean }[] = [
    ...(!istAngebot ? [{ key: "import", text: kopf.projekt_id ? "Aus dem Projekt übernehmen" : "Aus dem Projekt (erst Projekt wählen)", icon: FolderInput, onClick: () => setDialog("import"), primaer: true, aus: !kopf.projekt_id }] : []),
    { key: "leistung", text: istAngebot ? "Leistung hinzufügen" : "Leistung", icon: Plus, onClick: () => setDialog("leistung"), primaer: istAngebot },
    { key: "sprache", text: "Diktieren", icon: Mic, onClick: () => setDialog("sprache") },
    { key: "arbeitszeit", text: "Arbeitszeit", icon: Clock, onClick: () => setDialog("arbeitszeit") },
    { key: "titel", text: "Raum / Titel", icon: Rows3, onClick: () => setTitelOffen(true) },
    { key: "artikel", text: "Artikel", icon: Package, onClick: () => setDialog("artikel") },
    { key: "frei", text: "Freie Position", icon: PenLine, onClick: () => setFreie(leerePosition("leistung")) },
  ];
  const nebenKnoepfe = hinzuKnoepfe.filter((k) => !k.primaer);

  const hinzufuegenLeiste = bearbeitbar && (
    pc ? (
      <div className="flex flex-wrap items-center gap-2">
        {hinzuKnoepfe.map((k) => (
          <Button key={k.key} variant={k.primaer ? "default" : "outline"} className="h-10" onClick={k.onClick} disabled={k.aus}>
            <k.icon className="h-4 w-4" /> {k.text}
          </Button>
        ))}
        {titelName && <span className="ml-auto text-xs text-muted-foreground">Neue Positionen landen unter „{titelName}“</span>}
      </div>
    ) : (
      <div className="space-y-2">
        {hinzuKnoepfe.filter((k) => k.primaer).map((k) => (
          <Button key={k.key} className="h-12 w-full text-base" onClick={k.onClick} disabled={k.aus}>
            <k.icon className="h-5 w-5" /> {k.text}
          </Button>
        ))}
        <div className={cn("grid gap-2", nebenKnoepfe.length === 5 ? "grid-cols-5" : nebenKnoepfe.length === 6 ? "grid-cols-3" : "grid-cols-4")}>
          {nebenKnoepfe.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={k.onClick}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-card px-1 text-center text-[11px] font-medium leading-tight transition-colors hover:border-primary/50 active:bg-muted/40"
            >
              <k.icon className="h-5 w-5 text-primary" />
              {k.text}
            </button>
          ))}
        </div>
        {titelName && <p className="px-1 text-xs text-muted-foreground">Neue Positionen landen unter „{titelName}“ — anderen Raum oben antippen.</p>}
      </div>
    )
  );

  // ── Kalkulation (nur intern) ──
  const kalk = useMemo(() => {
    let minuten = 0;
    let ek = 0;
    positionen.forEach((p) => {
      if (ohneBetrag(p)) return;
      const m = mengeVon(p);
      if (p.minuten != null) minuten += Number(p.minuten) * m;
      else if (p.art === "arbeit" && p.einheit === "h") minuten += m * 60;
      if (p.ek_preis != null) ek += Number(p.ek_preis) * m;
    });
    return { stunden: minuten / 60, ek };
  }, [positionen]);

  return (
    <Seite titel={titel} untertitel={untertitel} aktionen={aktionen} breit={pc}>
      {statusKarte}

      {gefunden && bearbeitbar && (
        <section className={cn("rounded-lg border p-4", TON_KLASSE.gelb)}>
          <p className="font-semibold">Nicht gespeicherte Änderungen gefunden</p>
          <p className="mt-1 text-sm">
            {[
              `vom ${new Date(gefunden.s.zeit).toLocaleDateString("de-AT")} um ${new Date(gefunden.s.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`,
              gefunden.s.kopf.empf_name || gefunden.s.kopf.betreff || "ohne Empfänger",
              ((n) => `${n} ${n === 1 ? "Position" : "Positionen"}`)(gefunden.s.positionen.filter((p) => !ohneBetrag(p)).length),
            ].join(" · ")}
          </p>
          {!neu && gefunden.s.basis !== basis && (
            <p className="mt-1 text-xs">Der Beleg wurde seitdem anderswo gespeichert — Wiederherstellen ersetzt das beim nächsten Speichern.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-11" onClick={wiederherstellen}><RotateCcw className="h-4 w-4" /> Wiederherstellen</Button>
            <Button variant="outline" className="h-11 bg-card" onClick={sicherungVerwerfen}>Verwerfen</Button>
          </div>
        </section>
      )}

      <BelegKopf kopf={kopf} aendern={kopfAendern} bearbeitbar={bearbeitbar} firma={firma} pc={pc} startOffen={neu && !kopf.empf_name} />
      {(angebot || ersetztQuelle.data) && (
        <p className="-mt-2 px-1 text-sm text-muted-foreground">
          {angebot && <>Aus <Link to={`/belege/${angebot.id}`} className="font-medium text-primary hover:underline">Angebot {angebot.nummer ?? "(Entwurf)"}</Link></>}
          {angebot && ersetztQuelle.data && " · "}
          {ersetztQuelle.data && (
            <>Ersetzt <Link to={`/belege/${ersetztQuelle.data.id}`} className="font-medium text-primary hover:underline">Rechnung {ersetztQuelle.data.nummer}</Link></>
          )}
        </p>
      )}

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-[0.9375rem] font-semibold">Positionen</h2>
          {anzahl > 0 && <span className="text-xs text-muted-foreground">{anzahl} {anzahl === 1 ? "Position" : "Positionen"}</span>}
        </div>
        <PositionenEditor
          positionen={positionen}
          setPositionen={setPositionen}
          bearbeitbar={bearbeitbar}
          pc={pc}
          aktiverTitel={aktiverTitel}
          setAktiverTitel={setAktiverTitel}
          stundensatz={stundensatz}
        />
        {hinzufuegenLeiste}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <BelegTexte kopf={kopf} aendern={kopfAendern} bearbeitbar={bearbeitbar} pc={pc} />
        <Summen netto={s.netto} ust={s.ust} brutto={s.brutto} ustSatz={kopf.ust_satz} ohneUst={ohneUst} firma={firma} kalk={kalk}
          onProzent={bearbeitbar && anzahl > 0 ? preiseUmProzent : undefined} />
      </div>

      {entwurf && !pc && (
        <Button variant="outline" className="h-12 w-full" onClick={fertigFragen} disabled={!!laeuft}>
          <Check className="h-4 w-4" /> Fertigstellen — Nummer vergeben
        </Button>
      )}

      {bearbeitbar && !pc && (
        <>
          <div className="h-16" aria-hidden />
          <div
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-3 pt-2.5 sm:px-4"
            style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="zahl text-lg font-bold leading-tight">{euro(s.brutto)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {ohneUst ? "ohne USt" : `netto ${euro(s.netto)}`}
                  {dirty && <span className="font-medium text-foreground"> · nicht gespeichert</span>}
                </p>
              </div>
              <Button className="h-12 min-w-36" onClick={speichern} disabled={!!laeuft || (!dirty && !neu)}>
                <Save className="h-4 w-4" /> {laeuft === "speichern" ? "Speichert …" : dirty || neu ? "Speichern" : "Gespeichert"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Dialoge ── */}
      <LeistungDialog
        open={dialog === "leistung"}
        onOpenChange={(o) => setDialog(o ? "leistung" : null)}
        katalog={katalog}
        laedt={katalogLaedt}
        positionen={positionen}
        titelId={aktiverTitel}
        onTitelWahl={setAktiverTitel}
        onNeuerTitel={() => setTitelOffen(true)}
        onPlus={leistungPlus}
        onMinus={leistungMinus}
        firma={firma}
        stundensatz={stundensatz}
      />
      <ArtikelDialog open={dialog === "artikel"} onOpenChange={(o) => setDialog(o ? "artikel" : null)} ziel={titelName} onArtikel={artikelPlus} />
      <ArbeitszeitDialog
        open={dialog === "arbeitszeit"}
        onOpenChange={(o) => setDialog(o ? "arbeitszeit" : null)}
        lohnarten={lohnartenFuer(firma, stundensatz)}
        onUebernehmen={arbeitszeitHinzufuegen}
      />
      <TitelDialog open={titelOffen} onOpenChange={setTitelOffen} positionen={positionen} onAnlegen={titelAnlegen} />
      <SpracheDialog
        open={dialog === "sprache"}
        onOpenChange={(o) => setDialog(o ? "sprache" : null)}
        katalog={katalog}
        autoStart
        onUebernehmen={spracheUebernehmen}
      />
      {kopf.projekt_id && (
        <ImportDialog
          open={dialog === "import"}
          onOpenChange={(o) => setDialog(o ? "import" : null)}
          projektId={kopf.projekt_id}
          belegId={neu ? null : id}
          belegt={belegt}
          angebotId={kopf.angebot_id}
          stundensatzStart={stundensatz}
          firma={firma}
          vorhandeneTitel={positionen.some((p) => p.art === "titel")}
          onUebernehmen={importUebernehmen}
        />
      )}
      <PositionDialog position={freie} neu stundensatz={stundensatz} onOpenChange={(o) => { if (!o) setFreie(null); }} onUebernehmen={freieHinzufuegen} />

      <AlertDialog open={frage === "fertig"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{typText} fertigstellen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-sm text-muted-foreground">
                <p>
                  {istAngebot
                    ? "Das Angebot bekommt die nächste Angebotsnummer. Danach als PDF schicken — ändern geht weiterhin."
                    : "Die Rechnung bekommt die nächste Rechnungsnummer und ist danach festgeschrieben. Ändern geht dann nur noch über Storno."}
                </p>
                <p className="font-medium text-foreground">
                  <span className="zahl">{euro(ohneUst ? s.netto : s.brutto)}</span> {ohneUst ? "netto" : "brutto"} · {anzahl} {anzahl === 1 ? "Position" : "Positionen"} · an {kopf.empf_name}
                </p>
                {[
                  ...(konflikte > 0 && !dirty
                    ? [`${konflikte} ${konflikte === 1 ? "Buchung steckt" : "Buchungen stecken"} schon in einer anderen Rechnung — doppelt verrechnet?`]
                    : []),
                  ...warnungen,
                ].map((w) => (
                  <p key={w} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium", TON_KLASSE.gelb)}>{w}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={fertigAusfuehren}>Fertigstellen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage === "storno"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung {beleg?.nummer} stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Es entsteht eine Stornorechnung mit eigener Nummer, die diese Rechnung in voller Höhe aufhebt — die
              schickst du dem Kunden{status === "bezahlt" ? "; der bezahlte Betrag steht darauf als Gutschrift" : ""}. Die Rechnung selbst bleibt
              unverändert erhalten. Stunden, Material und Regieberichte sind danach wieder frei — für die neue
              Rechnung „Korrektur anlegen“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={stornoAusfuehren}>Stornieren</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={frage === "entsperren"} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fertiges Angebot ändern?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Nummer {beleg?.nummer} bleibt. Wurde das Angebot schon verschickt, ist „Kopieren“ meist besser —
              dann hat der Kunde nicht zwei verschiedene Fassungen mit derselben Nummer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={() => { setEntsperrt(true); setFrage(null); }}>Ändern</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bezahltAm != null} onOpenChange={(o) => { if (!o) setBezahltAm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Als bezahlt markieren</AlertDialogTitle>
            <AlertDialogDescription>Wann ist das Geld eingegangen?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bezahlt-am">Zahlungseingang</Label>
            <Input id="bezahlt-am" type="date" className="h-12" value={bezahltAm ?? ""} onChange={(e) => setBezahltAm(e.target.value)} />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={() => bezahltSetzen(bezahltAm ?? heute)} disabled={!bezahltAm}>Bezahlt</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!loeschen} onOpenChange={(o) => { if (!o) setLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{entwurf ? "Entwurf" : typText} löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {!istAngebot
                ? "Der Entwurf wird gelöscht. Übernommene Stunden, Material und Regieberichte sind danach wieder frei."
                : folge.length
                  ? `Das Angebot wird endgültig gelöscht — der Rechnungsentwurf daraus verliert den Verweis.`
                  : "Das Angebot wird endgültig gelöscht."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {loeschen?.projektMoeglich && projekt && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={loeschen.projektAuch}
                onCheckedChange={(v) => setLoeschen((l) => (l ? { ...l, projektAuch: !!v } : l))}
                className="mt-0.5 h-5 w-5"
              />
              <span>
                Projekt <span className="zahl font-medium">{projekt.nummer}</span> „{projekt.name}“ auch löschen
                <span className="block text-xs text-muted-foreground">Wurde für dieses Angebot angelegt, sonst hängt nichts daran.</span>
              </span>
            </label>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschenAusfuehren}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VerlassenDialog
        offen={!!schutz.ziel}
        onAbbrechen={schutz.abbrechen}
        onVerwerfen={() => { sicherungLoeschen(schluessel); schutz.weiter(); }}
        onSpeichern={async () => {
          const ziel = schutz.ziel;
          const ok = await speichernIntern({ weiterleiten: false });
          if (ok) schutz.weiter(ziel);
          else schutz.abbrechen();
        }}
        speichertGerade={laeuft === "speichern"}
      />

      <FormularDialog
        open={!!vorschau}
        onOpenChange={(o) => { if (!o) vorschauSchliessen(); }}
        titel={vorschau?.dateiname ?? "PDF"}
        breite="breit"
        fuellend
        fuss={vorschau && (
          <>
            <Button variant="outline" className="h-12" onClick={vorschauSchliessen}>Schließen</Button>
            <Button className="h-12" onClick={() => void pdfTeilenOderLaden(vorschau.blob, vorschau.dateiname)}>
              <Download className="h-4 w-4" /> Herunterladen
            </Button>
          </>
        )}
      >
        {vorschau && <iframe src={vorschau.url} title="PDF-Vorschau" className="min-h-0 w-full flex-1 rounded-md border bg-muted" />}
      </FormularDialog>
    </Seite>
  );
}

function MenuePunkt({ icon: I, onClick, children, gefahr }: { icon: Icon; onClick: () => void; children: React.ReactNode; gefahr?: boolean }) {
  return (
    <DropdownMenuItem className={cn("h-11 gap-2", gefahr && "text-destructive focus:text-destructive")} onClick={onClick}>
      <I className="h-4 w-4" /> {children}
    </DropdownMenuItem>
  );
}

function Summen({
  netto, ust, brutto, ustSatz, ohneUst, firma, kalk, onProzent,
}: {
  netto: number;
  ust: number;
  brutto: number;
  ustSatz: number;
  ohneUst: boolean;
  firma: Firma | null;
  kalk: { stunden: number; ek: number };
  /** Alle Preise um ± % ändern (nur bearbeitbar) */
  onProzent?: (prozent: number) => void;
}) {
  const [prozentOffen, setProzentOffen] = useState(false);
  const [prozent, setProzent] = useState("");
  const r = rohertrag(netto, kalk.ek, kalk.stunden);
  const p = Number(prozent.replace(",", "."));
  const prozentOk = prozent.trim() !== "" && Number.isFinite(p) && p !== 0 && p > -100 && p <= 1000;
  const mitKalk = kalk.stunden > 0 || kalk.ek > 0;

  return (
    <section className="rounded-lg border bg-card p-4">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Summe netto</dt>
          <dd className="zahl">{euro(netto)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {ohneUst ? (firma?.kleinunternehmer ? "Kleinunternehmer — keine USt" : "Reverse Charge — keine USt") : `USt ${zahl(ustSatz)} %`}
          </dt>
          <dd className="zahl">{euro(ust)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold">
          <dt>Gesamt</dt>
          <dd className="zahl">{euro(brutto)}</dd>
        </div>
      </dl>

      {(mitKalk || onProzent) && (
        <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" /> Kalkulation <span className="font-normal normal-case tracking-normal">— nur für dich, nicht auf dem PDF</span>
          </p>
          {mitKalk && (
            <dl className="space-y-1">
              {kalk.stunden > 0 && (
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Arbeitszeit</dt><dd className="zahl">{zahl(Math.round(kalk.stunden * 10) / 10)} h</dd></div>
              )}
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Material-Einkauf</dt><dd className="zahl">{euro(kalk.ek)}</dd></div>
              <div className="flex justify-between gap-3 font-medium">
                <dt>Bleibt nach Material</dt>
                <dd className="zahl">{euro(r.bleibt)}{r.anteil != null && <span className="ml-1 font-normal text-muted-foreground">({Math.round(r.anteil * 100)} %)</span>}</dd>
              </div>
              {r.jeStunde != null && (
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">je Arbeitsstunde</dt><dd className="zahl">{euro(r.jeStunde)}</dd></div>
              )}
            </dl>
          )}
          {onProzent && (
            <Button variant="outline" className="mt-1 w-full gap-1.5" onClick={() => { setProzent(""); setProzentOffen(true); }}>
              <Percent className="h-4 w-4" /> Alle Preise ändern (Aufschlag / Rabatt)
            </Button>
          )}
        </div>
      )}

      {onProzent && (
        <AlertDialog open={prozentOffen} onOpenChange={setProzentOffen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alle Preise ändern</AlertDialogTitle>
              <AlertDialogDescription>Plus für Aufschlag, Minus für Rabatt — gilt für jeden Einzelpreis in diesem Beleg.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[-5, -3, 3, 5, 10].map((x) => (
                  <Button key={x} variant={p === x ? "default" : "outline"} className="min-w-16" onClick={() => setProzent(String(x))}>
                    {x > 0 ? `+${x}` : x} %
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="preis-prozent" className="shrink-0">Prozent</Label>
                <Input id="preis-prozent" inputMode="decimal" className="zahl h-11 w-28 text-right" placeholder="z. B. 8 oder -3"
                  value={prozent} onChange={(e) => setProzent(e.target.value)} />
              </div>
              {prozentOk && (
                <p className="text-sm text-muted-foreground">
                  Netto danach etwa <span className="zahl font-medium text-foreground">{euro(umProzent(netto, p))}</span> statt {euro(netto)}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
              <Button className="h-11" disabled={!prozentOk} onClick={() => { onProzent(p); setProzentOffen(false); }}>
                {prozentOk ? `Preise ${p > 0 ? "+" : ""}${zahl(p)} %` : "Ändern"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
