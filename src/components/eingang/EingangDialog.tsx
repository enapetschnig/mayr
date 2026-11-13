import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ExternalLink, FileText, Loader2, Plus, RotateCcw, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel, StatusPille } from "@/components/Bausteine";
import { ProjektWahl } from "@/components/ProjektWahl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { dezimalLesen, euro, isoTag } from "@/lib/format";
import { belegLesen } from "@/lib/ki";
import { ibanPruefen } from "@/lib/sepa";
import { BELEG_STATUS, FREIGABE_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BUCKET, dateiAdresse, eingangDateiHochladen, eingangLoeschen, eingangSpeichern, freigabeSetzen, type EingangMitAnteilen, type Hochgeladen,
} from "./eingangDaten";
import {
  ablauf, anteileAusPositionen, aufteilungFehler, bruttoAusNetto, KATEGORIEN, nettoAusBrutto, zuZahlen, type AnteilEntwurf, type PositionEntwurf,
} from "./eingangLogik";
import { EingangPositionen } from "./EingangPositionen";
import { LieferscheinAbgleich } from "./LieferscheinAbgleich";
import { supabase } from "@/integrations/supabase/client";
import { KATEGORIE_ARTEN, useKategorien, useLetzteEingangKategorien } from "@/components/buchhaltung/buchhaltungDaten";
import { eingangVorschlag, letzteKategorien } from "@/components/buchhaltung/buchhaltungLogik";
import { KategorieWahl } from "@/components/buchhaltung/KategorieTeile";

const UST_SAETZE = ["20", "13", "10", "0"];

type Kopf = {
  lieferant: string; nummer: string; datum: string; faellig_am: string; netto: string; brutto: string; ust_satz: string;
  kategorie: string; kategorie_id: string | null; betrieb: boolean; bezahlt: boolean; bezahlt_am: string; notiz: string; reverse_charge: boolean;
  iban: string; skonto_prozent: string; skonto_bis: string; ls_nummern: string;
};

const kopfAus = (r: EingangMitAnteilen | null, heute: string): Kopf => ({
  lieferant: r?.lieferant ?? "",
  nummer: r?.nummer ?? "",
  datum: r?.datum ?? heute,
  faellig_am: r?.faellig_am ?? "",
  netto: r ? zahlFeld(r.netto) : "",
  brutto: r ? zahlFeld(r.brutto) : "",
  ust_satz: r ? String(Number(r.ust_satz)) : "20",
  kategorie: r?.kategorie ?? "material",
  kategorie_id: r?.kategorie_id ?? null,
  betrieb: r?.betrieb ?? false,
  bezahlt: !!r?.bezahlt_am,
  bezahlt_am: r?.bezahlt_am ?? heute,
  notiz: r?.notiz ?? "",
  reverse_charge: r?.reverse_charge ?? false,
  iban: r?.iban ?? "",
  skonto_prozent: r?.skonto_prozent != null ? zahlFeld(r.skonto_prozent) : "",
  skonto_bis: r?.skonto_bis ?? "",
  ls_nummern: (r?.lieferschein_nummern ?? []).join(", "),
});

const positionenAus = (r: EingangMitAnteilen | null): PositionEntwurf[] =>
  [...(r?.eingang_positionen ?? [])].sort((a, b) => a.pos - b.pos).map((p) => ({
    schluessel: p.id, artikelnummer: p.artikelnummer ?? "", bezeichnung: p.bezeichnung, menge: p.menge == null ? "" : zahlFeld(p.menge),
    einheit: p.einheit ?? "", einzelpreis: p.einzelpreis == null ? "" : zahlFeld(p.einzelpreis), gesamt: zahlFeld(p.gesamt),
    lieferschein_nr: p.lieferschein_nr ?? "", projekt_id: p.projekt_id ?? "",
  }));

const anteileAus = (r: EingangMitAnteilen | null): AnteilEntwurf[] =>
  (r?.eingang_anteile ?? []).map((a) => ({
    id: a.id, schluessel: a.id, projekt_id: a.projekt_id, betrag: zahlFeld(a.betrag), text: a.text ?? "", rechnung_id: a.rechnung_id,
  }));

const fmt = (n: number) => zahlFeld(Math.round(n * 100) / 100);

/**
 * Eingangsrechnung erfassen und zuordnen — ein Formular: oben Foto/PDF und
 * Beträge, darunter „Wohin gehört sie?“ (ein Projekt, aufgeteilt, oder Betrieb).
 * `projektVorgabe`: aus dem Projekt geöffnet → gleich diesem Projekt zuordnen.
 */
export function EingangDialog({
  open, onOpenChange, rechnung, lieferanten, projektVorgabe,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = neu */
  rechnung: EingangMitAnteilen | null;
  /** bisherige Lieferanten als Vorschlag */
  lieferanten: string[];
  projektVorgabe?: string;
}) {
  const neuLaden = useNeuLaden();
  const heute = isoTag();
  const [k, setK] = useState<Kopf>(kopfAus(null, heute));
  const [anteile, setAnteile] = useState<AnteilEntwurf[]>([]);
  const [positionen, setPositionen] = useState<PositionEntwurf[]>([]);
  const [datei, setDatei] = useState<File | null>(null);
  // für die KI schon hochgeladen (neue Rechnung: unter der vorab vergebenen ID)
  const [hochgeladen, setHochgeladen] = useState<Hochgeladen | null>(null);
  const [neueId, setNeueId] = useState(() => crypto.randomUUID());
  const [kiLaeuft, setKiLaeuft] = useState(false);
  const [kiHinweis, setKiHinweis] = useState<string | null>(null);
  const [ablehnen, setAblehnen] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [basis, setBasis] = useState("");
  const dateiFeld = useRef<HTMLInputElement>(null);

  useBeimOeffnen(open ? rechnung?.id ?? `neu-${projektVorgabe ?? ""}` : null, () => {
    const kopf = kopfAus(rechnung, heute);
    const a = rechnung ? anteileAus(rechnung) : projektVorgabe
      ? [{ id: null, schluessel: crypto.randomUUID(), projekt_id: projektVorgabe, betrag: "", text: "", rechnung_id: null }]
      : [];
    const p = positionenAus(rechnung);
    setK(kopf);
    setAnteile(a);
    setPositionen(p);
    setDatei(null);
    setHochgeladen(null);
    setNeueId(crypto.randomUUID());
    setKiHinweis(null);
    setAblehnen(null);
    setBasis(JSON.stringify([kopf, a, p]));
    setLoeschFrage(false);
  });

  const netto = dezimalLesen(k.netto) ?? 0;
  const satz = dezimalLesen(k.ust_satz) ?? 0;
  const summeAnteile = anteile.reduce((s, a) => s + (dezimalLesen(a.betrag) ?? 0), 0);
  const rest = Math.round((netto - summeAnteile) * 100) / 100;
  const verrechnet = anteile.some((a) => a.rechnung_id);
  const geaendert = !!datei || !!hochgeladen || JSON.stringify([k, anteile, positionen]) !== basis;
  const status = rechnung ? ablauf(rechnung) : null;
  const ibanText = k.iban.trim();
  const ibanOk = !ibanText || !!ibanPruefen(ibanText);
  const { data: alleKat = [] } = useKategorien(open);
  const { data: letzte = [] } = useLetzteEingangKategorien(open);
  const kategorien = useMemo(() => alleKat.filter((x) => x.richtung === "eingang"), [alleKat]);
  // Vorschlag, solange keine Kategorie gewählt ist: was beim Lieferanten zuletzt galt, sonst Stichworte (auch aus den KI-Positionen)
  const katVorschlag = useMemo(() => (k.kategorie_id ? null
    : eingangVorschlag(k.lieferant, positionen.map((p) => p.bezeichnung), letzteKategorien(letzte), kategorien)), [k.kategorie_id, k.lieferant, positionen, letzte, kategorien]);
  const katId = k.kategorie_id ?? katVorschlag;
  const kat = kategorien.find((x) => x.id === katId);
  const vorschlaege = useMemo(() => {
    const q = k.lieferant.trim().toLowerCase();
    return q ? lieferanten.filter((l) => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 4) : [];
  }, [k.lieferant, lieferanten]);

  const setz = (teil: Partial<Kopf>) => setK((alt) => ({ ...alt, ...teil }));
  // Netto ↔ Brutto: das andere Feld rechnet mit
  const nettoAendern = (v: string) => {
    const n = dezimalLesen(v);
    setz({ netto: v, brutto: n === null ? "" : fmt(bruttoAusNetto(n, k.reverse_charge ? 0 : satz)) });
  };
  const bruttoAendern = (v: string) => {
    const b = dezimalLesen(v);
    setz({ brutto: v, netto: b === null ? "" : fmt(nettoAusBrutto(b, k.reverse_charge ? 0 : satz)) });
  };
  const satzAendern = (v: string) => {
    const n = dezimalLesen(k.netto);
    setz({ ust_satz: v, brutto: n === null ? k.brutto : fmt(bruttoAusNetto(n, k.reverse_charge ? 0 : dezimalLesen(v) ?? 0)) });
  };
  // Bauleistung vom Subunternehmer: die Rechnung ist netto, die Steuer entsteht erst in der Buchhaltung
  const reverseChargeAendern = (an: boolean) => {
    const n = dezimalLesen(k.netto);
    setz({ reverse_charge: an, ust_satz: an && !satz ? "20" : k.ust_satz, brutto: n === null ? k.brutto : fmt(bruttoAusNetto(n, an ? 0 : satz)) });
  };

  const anteilAendern = (schluessel: string, teil: Partial<AnteilEntwurf>) =>
    setAnteile((alt) => alt.map((a) => (a.schluessel === schluessel ? { ...a, ...teil } : a)));
  const anteilDazu = () => setAnteile((alt) => [...alt, {
    id: null, schluessel: crypto.randomUUID(), projekt_id: "",
    // der erste Anteil bekommt den ganzen Betrag, jeder weitere den Rest
    betrag: rest > 0 ? fmt(rest) : "", text: "", rechnung_id: null,
  }]);

  /** Speichert; gibt die ID zurück (null = nicht gespeichert, Meldung schon gezeigt) */
  const sichern = async (): Promise<string | null> => {
    const lieferant = k.lieferant.trim();
    if (!lieferant) { toast.error("Bitte den Lieferanten eintragen."); return null; }
    if (dezimalLesen(k.netto) === null) { toast.error("Bitte den Betrag eintragen (netto oder brutto)."); return null; }
    if (!k.datum) { toast.error("Bitte das Rechnungsdatum eintragen."); return null; }
    if (k.faellig_am && k.faellig_am < k.datum) { toast.error("Fällig kann nicht vor dem Rechnungsdatum liegen."); return null; }
    if (!ibanOk) { toast.error("Die IBAN stimmt nicht — bitte prüfen."); return null; }
    const skonto = dezimalLesen(k.skonto_prozent);
    if (skonto != null && (skonto < 0 || skonto >= 100)) { toast.error("Skonto zwischen 0 und 100 %."); return null; }
    // leere, unberührte Zeile (z. B. Vorgabe aus dem Projekt) bekommt den ganzen Betrag
    const liste = anteile.map((a) => (!a.rechnung_id && a.projekt_id && !a.betrag.trim() && anteile.length === 1 ? { ...a, betrag: fmt(netto) } : a));
    const fehler = aufteilungFehler(netto, liste, dezimalLesen);
    if (fehler) { toast.error(fehler); return null; }
    const brutto = dezimalLesen(k.brutto) ?? bruttoAusNetto(netto, satz);
    setSpeichert(true);
    try {
      const id = await eingangSpeichern(rechnung?.id ?? null, {
        lieferant,
        nummer: leerNull(k.nummer),
        datum: k.datum,
        faellig_am: k.faellig_am || null,
        netto,
        ust_satz: satz,
        ust: Math.round((brutto - netto) * 100) / 100,
        brutto,
        // die Kategorie bestimmt die Art für die Buchhaltung; ohne Kategorie bleibt die gewählte Art
        kategorie: kat?.art ?? k.kategorie,
        kategorie_id: kat?.id ?? null,
        reverse_charge: k.reverse_charge,
        betrieb: k.betrieb,
        bezahlt_am: k.bezahlt ? k.bezahlt_am || heute : null,
        notiz: leerNull(k.notiz),
        iban: ibanPruefen(ibanText),
        skonto_prozent: skonto || null,
        skonto_bis: skonto ? k.skonto_bis || null : null,
        lieferschein_nummern: k.ls_nummern.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean),
      }, liste, rechnung?.eingang_anteile ?? [], hochgeladen ?? datei, rechnung?.datei_pfad ?? null, positionen, neueId);
      await neuLaden("eingang", "buchhaltung");
      return id;
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
      return null;
    } finally {
      setSpeichert(false);
    }
  };
  const speichern = async () => {
    if (!(await sichern())) return;
    toast.success(rechnung ? "Eingangsrechnung gespeichert" : "Eingangsrechnung erfasst");
    onOpenChange(false);
  };
  /** Freigeben/ablehnen — ungespeicherte Änderungen gehen vorher mit */
  const freigabe = async (wert: "offen" | "freigegeben" | "abgelehnt", grund: string | null = null) => {
    const id = geaendert ? await sichern() : rechnung?.id;
    if (!id) return;
    setSpeichert(true);
    try {
      await freigabeSetzen(id, wert, grund);
      await neuLaden("eingang", "buchhaltung");
      toast.success(wert === "freigegeben" ? "Zur Überweisung freigegeben" : wert === "abgelehnt" ? "Abgelehnt" : "Wieder zu prüfen");
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht geändert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  /** Foto/PDF von der KI lesen lassen und die Felder füllen */
  const kiLesen = async () => {
    setKiLaeuft(true);
    setKiHinweis(null);
    try {
      let pfad = hochgeladen?.pfad ?? null;
      if (datei) {
        const h = await eingangDateiHochladen(rechnung?.id ?? neueId, datei);
        setHochgeladen(h);
        setDatei(null);
        pfad = h.pfad;
      }
      pfad ??= rechnung?.datei_pfad ?? null;
      if (!pfad) return;
      const b = await belegLesen(BUCKET, pfad);
      const teil: Partial<Kopf> = {};
      if (b.lieferant) teil.lieferant = b.lieferant;
      if (b.nummer) teil.nummer = b.nummer;
      if (b.datum) teil.datum = b.datum;
      if (b.faellig_am) teil.faellig_am = b.faellig_am;
      if (b.ust_satz != null && UST_SAETZE.includes(String(b.ust_satz))) teil.ust_satz = String(b.ust_satz);
      if (b.netto != null) teil.netto = fmt(b.netto);
      if (b.brutto != null) teil.brutto = fmt(b.brutto);
      else if (b.netto != null) teil.brutto = fmt(bruttoAusNetto(b.netto, b.ust_satz ?? satz));
      if (b.iban) teil.iban = b.iban;
      if (b.skonto_prozent != null) { teil.skonto_prozent = zahlFeld(b.skonto_prozent); teil.skonto_bis = b.skonto_bis ?? ""; }
      if (b.lieferschein_nummern.length) teil.ls_nummern = b.lieferschein_nummern.join(", ");
      setz(teil);
      if (b.positionen.length) {
        setPositionen(b.positionen.map((p) => ({
          schluessel: crypto.randomUUID(), artikelnummer: p.artikelnummer ?? "", bezeichnung: p.bezeichnung,
          menge: p.menge == null ? "" : zahlFeld(p.menge), einheit: p.einheit ?? "", einzelpreis: p.einzelpreis == null ? "" : zahlFeld(p.einzelpreis),
          gesamt: p.gesamt != null ? zahlFeld(p.gesamt) : p.menge != null && p.einzelpreis != null ? fmt(p.menge * p.einzelpreis) : "",
          lieferschein_nr: p.lieferschein_nr ?? "", projekt_id: "",
        })));
      }
      setKiHinweis([
        b.art === "lieferschein" ? "Das sieht nach einem Lieferschein aus, nicht nach einer Rechnung." : null,
        `${b.positionen.length} Positionen gelesen — bitte Beträge kurz prüfen.`,
        b.hinweis,
      ].filter(Boolean).join(" "));
    } catch (e) {
      toast.error("KI hat den Beleg nicht gelesen", { description: (e as Error).message });
    } finally {
      setKiLaeuft(false);
    }
  };
  /** Dialog zu, ohne zu speichern: vorab hochgeladenes Foto wieder weg */
  const schliessen = (o: boolean) => {
    if (!o && hochgeladen) void supabase.storage.from(BUCKET).remove([hochgeladen.pfad]);
    onOpenChange(o);
  };
  const anteileAusZeilen = () => {
    const neu = anteileAusPositionen(positionen.map((p) => ({ gesamt: dezimalLesen(p.gesamt) ?? 0, projekt_id: p.projekt_id || null })));
    setAnteile(neu.map((a) => ({ id: null, schluessel: crypto.randomUUID(), projekt_id: a.projekt_id, betrag: fmt(a.betrag), text: "laut Positionen", rechnung_id: null })));
    const rest = Math.round((netto - neu.reduce((s, a) => s + a.betrag, 0)) * 100) / 100;
    if (Math.abs(rest) >= 0.005) setz({ betrieb: true });
    toast.success(`Auf ${neu.length} ${neu.length === 1 ? "Projekt" : "Projekte"} aufgeteilt${Math.abs(rest) >= 0.005 ? ` · Rest ${euro(rest)} beim Betrieb` : ""}`);
  };

  const loeschen = async () => {
    if (!rechnung) return;
    setSpeichert(true);
    try {
      await eingangLoeschen(rechnung);
      await neuLaden("eingang", "buchhaltung");
      toast.success("Eingangsrechnung gelöscht");
      setLoeschFrage(false);
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gelöscht", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  const ansehen = async () => {
    if (!rechnung?.datei_pfad) return;
    // Fenster sofort öffnen — sonst blockt Safari das Popup nach dem await
    const fenster = window.open("", "_blank");
    try {
      const url = await dateiAdresse(rechnung.datei_pfad);
      if (fenster) fenster.location.href = url;
      else window.location.href = url;
    } catch (e) {
      fenster?.close();
      toast.error("Datei nicht geöffnet", { description: (e as Error).message });
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={schliessen}
      titel={rechnung ? "Eingangsrechnung" : "Eingangsrechnung erfassen"}
      beschreibung="Rechnung von Großhändler oder Subunternehmer — fotografieren, Betrag eintragen, zuordnen."
      gesperrt={speichert || kiLaeuft}
      ungespeichert={geaendert}
      fuss={(
        <>
          {rechnung && !verrechnet && (
            <Button variant="ghost" className="h-12 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)} disabled={speichert}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      )}
    >
      {/* Ablauf: prüfen → freigeben → überweisen */}
      {rechnung && status && (
        <section className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPille eintrag={FREIGABE_STATUS[status]} />
            <span className="text-sm text-muted-foreground">
              {status === "pruefen" && "Stimmen Menge und Preis? Dann freigeben."}
              {status === "freigegeben" && (() => { const z = zuZahlen(rechnung, heute); return z.skonto ? `${euro(z.betrag)} überweisen — mit Skonto bis ${z.bis?.split("-").reverse().join(".")}` : `${euro(z.betrag)} überweisen`; })()}
              {status === "ueberwiesen" && `am ${rechnung.bezahlt_am?.split("-").reverse().join(".")}`}
              {status === "abgelehnt" && (rechnung.abgelehnt_grund || "ohne Grund")}
            </span>
          </div>
          {status !== "ueberwiesen" && ablehnen === null && (
            <div className="flex flex-wrap gap-2">
              {status !== "freigegeben" && (
                <Button className="h-11 gap-1.5" disabled={speichert} onClick={() => void freigabe("freigegeben")}>
                  <ThumbsUp className="h-4 w-4" /> {geaendert ? "Speichern und freigeben" : "Freigeben"}
                </Button>
              )}
              {status !== "abgelehnt" && (
                <Button variant="outline" className="h-11 gap-1.5" disabled={speichert} onClick={() => setAblehnen("")}>
                  <ThumbsDown className="h-4 w-4" /> Ablehnen
                </Button>
              )}
              {status !== "pruefen" && (
                <Button variant="ghost" className="h-11 gap-1.5" disabled={speichert} onClick={() => void freigabe("offen")}>
                  <RotateCcw className="h-4 w-4" /> Zurück auf prüfen
                </Button>
              )}
            </div>
          )}
          {ablehnen !== null && (
            <div className="space-y-2">
              <Input autoFocus className="h-11" placeholder="Grund, z. B. Menge stimmt nicht mit dem Lieferschein" value={ablehnen} onChange={(e) => setAblehnen(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="destructive" className="h-11" disabled={speichert || !ablehnen.trim()} onClick={() => void freigabe("abgelehnt", ablehnen.trim())}>Ablehnen</Button>
                <Button variant="ghost" className="h-11" onClick={() => setAblehnen(null)}>Abbrechen</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Foto oder PDF */}
      <input
        ref={dateiFeld}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (hochgeladen) void supabase.storage.from(BUCKET).remove([hochgeladen.pfad]);
            setHochgeladen(null);
            setDatei(f);
          }
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          {datei ? <span className="font-medium">{datei.name}</span>
            : hochgeladen ? <span className="font-medium">{hochgeladen.name}</span>
            : rechnung?.datei_pfad ? <span className="font-medium">{rechnung.datei_name ?? "Beleg"}</span>
              : <span className="text-muted-foreground">Noch kein Foto oder PDF</span>}
        </div>
        {(datei || hochgeladen) && (
          <Button variant="ghost" size="icon" aria-label="Datei verwerfen" onClick={() => {
            if (hochgeladen) void supabase.storage.from(BUCKET).remove([hochgeladen.pfad]);
            setDatei(null);
            setHochgeladen(null);
          }}><X className="h-4 w-4" /></Button>
        )}
        {!datei && !hochgeladen && rechnung?.datei_pfad && (
          <Button variant="outline" className="gap-1.5" onClick={ansehen}><ExternalLink className="h-4 w-4" /> Ansehen</Button>
        )}
        <Button variant={rechnung?.datei_pfad || datei || hochgeladen ? "outline" : "default"} className="gap-1.5" onClick={() => dateiFeld.current?.click()}>
          <Camera className="h-4 w-4" /> {rechnung?.datei_pfad || datei || hochgeladen ? "Ersetzen" : "Foto oder PDF"}
        </Button>
        {(datei || hochgeladen || rechnung?.datei_pfad) && (
          <Button className="gap-1.5" disabled={kiLaeuft || speichert} onClick={() => void kiLesen()}>
            {kiLaeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Mit KI ausfüllen
          </Button>
        )}
      </div>
      {kiLaeuft && <p className="-mt-1 px-1 text-sm text-muted-foreground">Die KI liest den Beleg — dauert ein paar Sekunden …</p>}
      {kiHinweis && <p className="-mt-1 rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">{kiHinweis}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id="e-lieferant" label="Lieferant" className="sm:col-span-2">
          <Input id="e-lieferant" className="h-11" value={k.lieferant} autoComplete="off" placeholder="z. B. Großhandel, Subunternehmer"
            onChange={(e) => setz({ lieferant: e.target.value })} />
          {vorschlaege.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {vorschlaege.map((l) => (
                <button key={l} type="button" onClick={() => setz({ lieferant: l })}
                  className="min-h-9 rounded-full border bg-card px-3 text-sm hover:border-primary/50">{l}</button>
              ))}
            </div>
          )}
        </Feld>
        <Feld id="e-nummer" label={<>Rechnungsnummer<Zusatz>(des Lieferanten)</Zusatz></>}>
          <Input id="e-nummer" className="h-11" value={k.nummer} onChange={(e) => setz({ nummer: e.target.value })} />
        </Feld>
        {kategorien.length ? (
          <Feld id="e-kat" label={<>Kategorie{!k.kategorie_id && katVorschlag ? <Zusatz>(Vorschlag)</Zusatz> : null}</>}
            hinweis={kat?.art ? `Buchhaltung: ${KATEGORIE_ARTEN.find((a) => a.wert === kat.art)?.text ?? kat.art}` : null}>
            <KategorieWahl id="e-kat" kategorien={kategorien} wert={katId} onChange={(id) => setz({ kategorie_id: id })} />
          </Feld>
        ) : (
          <Feld id="e-kat" label="Art">
            <Select value={k.kategorie} onValueChange={(v) => setz({ kategorie: v })}>
              <SelectTrigger id="e-kat" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{KATEGORIEN.map((x) => <SelectItem key={x.wert} value={x.wert}>{x.text}</SelectItem>)}</SelectContent>
            </Select>
          </Feld>
        )}
        <Feld id="e-datum" label="Rechnungsdatum">
          <Input id="e-datum" type="date" className="h-11" value={k.datum} onChange={(e) => setz({ datum: e.target.value })} />
        </Feld>
        <Feld id="e-faellig" label={<>Fällig am<Zusatz>(optional)</Zusatz></>}>
          <Input id="e-faellig" type="date" className="h-11" value={k.faellig_am} onChange={(e) => setz({ faellig_am: e.target.value })} />
        </Feld>
      </div>

      <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-2">
        <Feld id="e-netto" label="Netto €">
          <Input id="e-netto" className="zahl h-11 text-right" inputMode="decimal" value={k.netto} onChange={(e) => nettoAendern(e.target.value)} />
        </Feld>
        <Feld id="e-brutto" label="Brutto €">
          <Input id="e-brutto" className="zahl h-11 text-right" inputMode="decimal" value={k.brutto} onChange={(e) => bruttoAendern(e.target.value)} />
        </Feld>
        <Feld id="e-ust" label="USt %">
          <Select value={k.ust_satz} onValueChange={satzAendern}>
            <SelectTrigger id="e-ust" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{UST_SAETZE.map((x) => <SelectItem key={x} value={x}>{x} %</SelectItem>)}</SelectContent>
          </Select>
        </Feld>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_10rem]">
        <Feld id="e-iban" label={<>IBAN des Lieferanten<Zusatz>(für die Überweisung)</Zusatz></>}>
          <Input id="e-iban" className={cn("h-11 font-mono", !ibanOk && "border-destructive")} value={k.iban} autoComplete="off"
            placeholder="AT.. .... .... .... ...." onChange={(e) => setz({ iban: e.target.value.toUpperCase() })} />
        </Feld>
        <Feld id="e-skonto" label="Skonto %">
          <Input id="e-skonto" className="zahl h-11 text-right" inputMode="decimal" value={k.skonto_prozent} onChange={(e) => setz({ skonto_prozent: e.target.value })} />
        </Feld>
        <Feld id="e-skonto-bis" label="Skonto bis">
          <Input id="e-skonto-bis" type="date" className="h-11" value={k.skonto_bis} disabled={!dezimalLesen(k.skonto_prozent)} onChange={(e) => setz({ skonto_bis: e.target.value })} />
        </Feld>
      </div>
      {!ibanOk && <p className="-mt-1 px-1 text-sm text-destructive">Die IBAN stimmt nicht (Prüfziffer).</p>}

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <Label htmlFor="e-rc" className="cursor-pointer">
          <span className="block text-sm font-medium">Reverse Charge</span>
          <span className="block text-xs font-normal text-muted-foreground">Bauleistung vom Subunternehmer, Rechnung ohne USt</span>
        </Label>
        <Switch id="e-rc" checked={k.reverse_charge} onCheckedChange={reverseChargeAendern} />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <Label htmlFor="e-bezahlt" className="cursor-pointer">
          <span className="block text-sm font-medium">Bezahlt</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {k.bezahlt ? "Datum der Zahlung rechts" : rechnung && status === "pruefen" ? "Erst prüfen und freigeben" : rechnung && status === "abgelehnt" ? "Abgelehnt — wird nicht bezahlt" : "Noch offen"}
          </span>
        </Label>
        <div className="flex items-center gap-2">
          {k.bezahlt && <Input type="date" aria-label="Bezahlt am" className="h-11 w-40" value={k.bezahlt_am} onChange={(e) => setz({ bezahlt_am: e.target.value })} />}
          <Switch id="e-bezahlt" checked={k.bezahlt} onCheckedChange={(v) => setz({ bezahlt: v })} disabled={!!rechnung && status !== "freigegeben" && status !== "ueberwiesen"} />
        </div>
      </div>

      <EingangPositionen positionen={positionen} setPositionen={setPositionen} onAnteile={anteileAusZeilen} anteileGesperrt={verrechnet} />
      <Feld id="e-ls" label={<>Lieferscheine laut Rechnung<Zusatz>(Nummern, mit Komma)</Zusatz></>}>
        <Input id="e-ls" className="h-11" value={k.ls_nummern} placeholder="z. B. LS-4711, LS-4718" onChange={(e) => setz({ ls_nummern: e.target.value })} />
      </Feld>
      <LieferscheinAbgleich rechnungId={rechnung?.id ?? null} lieferant={k.lieferant} positionen={positionen}
        nummern={k.ls_nummern.split(/[,;\s]+/).filter(Boolean)}
        onProjekte={(z) => setPositionen((alt) => alt.map((p) => (z[p.schluessel] ? { ...p, projekt_id: z[p.schluessel] } : p)))} />

      {/* Zuordnung */}
      <section className="space-y-2">
        <Gruppentitel>Wohin gehört die Rechnung?</Gruppentitel>
        {anteile.length === 0 && (
          <p className="text-sm text-muted-foreground">Auf ein Projekt buchen — oder aufteilen, wenn sie mehrere Baustellen betrifft.</p>
        )}
        {anteile.map((a, i) => {
          const fest = !!a.rechnung_id;
          return (
            <div key={a.schluessel} className={cn("space-y-2 rounded-lg border bg-card p-3", fest && "bg-muted/40")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Projekt {anteile.length > 1 ? i + 1 : ""}</span>
                {fest ? <StatusPille eintrag={BELEG_STATUS.verrechnet} /> : (
                  <Button variant="ghost" size="icon" aria-label="Anteil entfernen" onClick={() => setAnteile((alt) => alt.filter((x) => x.schluessel !== a.schluessel))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {fest ? (
                <p className="text-sm">An den Kunden weiterverrechnet — bleibt, wie es ist.</p>
              ) : (
                <ProjektWahl wert={a.projekt_id} onChange={(id) => anteilAendern(a.schluessel, { projekt_id: id })} mitAbgeschlossenen />
              )}
              <div className="grid grid-cols-[8rem_1fr] gap-2">
                <Input aria-label="Betrag netto" placeholder="netto €" className="zahl h-11 text-right" inputMode="decimal" disabled={fest}
                  value={a.betrag} onChange={(e) => anteilAendern(a.schluessel, { betrag: e.target.value })} />
                <Input aria-label="Text" placeholder="Text (optional, z. B. Kabel Küche)" className="h-11" disabled={fest}
                  value={a.text} onChange={(e) => anteilAendern(a.schluessel, { text: e.target.value })} />
              </div>
            </div>
          );
        })}
        <Button variant="outline" className="w-full gap-1.5" onClick={anteilDazu}>
          <Plus className="h-4 w-4" /> {anteile.length ? "Weiteres Projekt (aufteilen)" : "Projekt zuordnen"}
        </Button>
        {netto !== 0 && anteile.length > 0 && (
          <p className={cn("px-1 text-sm", Math.abs(rest) >= 0.005 && rest < 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
            Auf Projekte verteilt <span className="zahl font-medium text-foreground">{euro(summeAnteile)}</span>
            {Math.abs(rest) >= 0.005 && <> · Rest <span className="zahl font-medium">{euro(rest)}</span></>}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <Label htmlFor="e-betrieb" className="cursor-pointer">
            <span className="block text-sm font-medium">{anteile.length ? "Rest gehört dem Betrieb" : "Gehört dem Betrieb"}</span>
            <span className="block text-xs font-normal text-muted-foreground">Lager, Werkzeug, Fahrzeug, Büro — keinem Projekt</span>
          </Label>
          <Switch id="e-betrieb" checked={k.betrieb} onCheckedChange={(v) => setz({ betrieb: v })} />
        </div>
      </section>

      <Feld id="e-notiz" label={<>Notiz<Zusatz>(optional)</Zusatz></>}>
        <Textarea id="e-notiz" rows={2} value={k.notiz} onChange={(e) => setz({ notiz: e.target.value })} />
      </Feld>

      <AlertDialog open={loeschFrage} onOpenChange={setLoeschFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eingangsrechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {rechnung?.lieferant}{rechnung?.nummer ? ` ${rechnung.nummer}` : ""} samt Foto/PDF und Zuordnung. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschen} disabled={speichert}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}
