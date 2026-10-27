import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ExternalLink, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
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
import { BELEG_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dateiAdresse, eingangLoeschen, eingangSpeichern, type EingangMitAnteilen } from "./eingangDaten";
import { aufteilungFehler, bruttoAusNetto, KATEGORIEN, nettoAusBrutto, type AnteilEntwurf } from "./eingangLogik";

const UST_SAETZE = ["20", "13", "10", "0"];

type Kopf = {
  lieferant: string; nummer: string; datum: string; faellig_am: string; netto: string; brutto: string; ust_satz: string;
  kategorie: string; betrieb: boolean; bezahlt: boolean; bezahlt_am: string; notiz: string;
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
  betrieb: r?.betrieb ?? false,
  bezahlt: !!r?.bezahlt_am,
  bezahlt_am: r?.bezahlt_am ?? heute,
  notiz: r?.notiz ?? "",
});

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
  const [datei, setDatei] = useState<File | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [basis, setBasis] = useState("");
  const dateiFeld = useRef<HTMLInputElement>(null);

  useBeimOeffnen(open ? rechnung?.id ?? `neu-${projektVorgabe ?? ""}` : null, () => {
    const kopf = kopfAus(rechnung, heute);
    const a = rechnung ? anteileAus(rechnung) : projektVorgabe
      ? [{ id: null, schluessel: crypto.randomUUID(), projekt_id: projektVorgabe, betrag: "", text: "", rechnung_id: null }]
      : [];
    setK(kopf);
    setAnteile(a);
    setDatei(null);
    setBasis(JSON.stringify([kopf, a]));
    setLoeschFrage(false);
  });

  const netto = dezimalLesen(k.netto) ?? 0;
  const satz = dezimalLesen(k.ust_satz) ?? 0;
  const summeAnteile = anteile.reduce((s, a) => s + (dezimalLesen(a.betrag) ?? 0), 0);
  const rest = Math.round((netto - summeAnteile) * 100) / 100;
  const verrechnet = anteile.some((a) => a.rechnung_id);
  const geaendert = !!datei || JSON.stringify([k, anteile]) !== basis;
  const vorschlaege = useMemo(() => {
    const q = k.lieferant.trim().toLowerCase();
    return q ? lieferanten.filter((l) => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 4) : [];
  }, [k.lieferant, lieferanten]);

  const setz = (teil: Partial<Kopf>) => setK((alt) => ({ ...alt, ...teil }));
  // Netto ↔ Brutto: das andere Feld rechnet mit
  const nettoAendern = (v: string) => {
    const n = dezimalLesen(v);
    setz({ netto: v, brutto: n === null ? "" : fmt(bruttoAusNetto(n, satz)) });
  };
  const bruttoAendern = (v: string) => {
    const b = dezimalLesen(v);
    setz({ brutto: v, netto: b === null ? "" : fmt(nettoAusBrutto(b, satz)) });
  };
  const satzAendern = (v: string) => {
    const n = dezimalLesen(k.netto);
    setz({ ust_satz: v, brutto: n === null ? k.brutto : fmt(bruttoAusNetto(n, dezimalLesen(v) ?? 0)) });
  };

  const anteilAendern = (schluessel: string, teil: Partial<AnteilEntwurf>) =>
    setAnteile((alt) => alt.map((a) => (a.schluessel === schluessel ? { ...a, ...teil } : a)));
  const anteilDazu = () => setAnteile((alt) => [...alt, {
    id: null, schluessel: crypto.randomUUID(), projekt_id: "",
    // der erste Anteil bekommt den ganzen Betrag, jeder weitere den Rest
    betrag: rest > 0 ? fmt(rest) : "", text: "", rechnung_id: null,
  }]);

  const speichern = async () => {
    const lieferant = k.lieferant.trim();
    if (!lieferant) return toast.error("Bitte den Lieferanten eintragen.");
    if (dezimalLesen(k.netto) === null) return toast.error("Bitte den Betrag eintragen (netto oder brutto).");
    if (!k.datum) return toast.error("Bitte das Rechnungsdatum eintragen.");
    if (k.faellig_am && k.faellig_am < k.datum) return toast.error("Fällig kann nicht vor dem Rechnungsdatum liegen.");
    // leere, unberührte Zeile (z. B. Vorgabe aus dem Projekt) bekommt den ganzen Betrag
    const liste = anteile.map((a) => (!a.rechnung_id && a.projekt_id && !a.betrag.trim() && anteile.length === 1 ? { ...a, betrag: fmt(netto) } : a));
    const fehler = aufteilungFehler(netto, liste, dezimalLesen);
    if (fehler) return toast.error(fehler);
    const brutto = dezimalLesen(k.brutto) ?? bruttoAusNetto(netto, satz);
    setSpeichert(true);
    try {
      await eingangSpeichern(rechnung?.id ?? null, {
        lieferant,
        nummer: leerNull(k.nummer),
        datum: k.datum,
        faellig_am: k.faellig_am || null,
        netto,
        ust_satz: satz,
        ust: Math.round((brutto - netto) * 100) / 100,
        brutto,
        kategorie: k.kategorie,
        betrieb: k.betrieb,
        bezahlt_am: k.bezahlt ? k.bezahlt_am || heute : null,
        notiz: leerNull(k.notiz),
      }, liste, rechnung?.eingang_anteile ?? [], datei, rechnung?.datei_pfad ?? null);
      await neuLaden("eingang");
      toast.success(rechnung ? "Eingangsrechnung gespeichert" : "Eingangsrechnung erfasst");
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!rechnung) return;
    setSpeichert(true);
    try {
      await eingangLoeschen(rechnung);
      await neuLaden("eingang");
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
      onOpenChange={onOpenChange}
      titel={rechnung ? "Eingangsrechnung" : "Eingangsrechnung erfassen"}
      beschreibung="Rechnung von Großhändler oder Subunternehmer — fotografieren, Betrag eintragen, zuordnen."
      gesperrt={speichert}
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
      {/* Foto oder PDF */}
      <input
        ref={dateiFeld}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setDatei(f); e.target.value = ""; }}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          {datei ? <span className="font-medium">{datei.name}</span>
            : rechnung?.datei_pfad ? <span className="font-medium">{rechnung.datei_name ?? "Beleg"}</span>
              : <span className="text-muted-foreground">Noch kein Foto oder PDF</span>}
        </div>
        {datei && (
          <Button variant="ghost" size="icon" aria-label="Datei verwerfen" onClick={() => setDatei(null)}><X className="h-4 w-4" /></Button>
        )}
        {!datei && rechnung?.datei_pfad && (
          <Button variant="outline" className="gap-1.5" onClick={ansehen}><ExternalLink className="h-4 w-4" /> Ansehen</Button>
        )}
        <Button variant={rechnung?.datei_pfad || datei ? "outline" : "default"} className="gap-1.5" onClick={() => dateiFeld.current?.click()}>
          <Camera className="h-4 w-4" /> {rechnung?.datei_pfad || datei ? "Ersetzen" : "Foto oder PDF"}
        </Button>
      </div>

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
        <Feld id="e-kat" label="Art">
          <Select value={k.kategorie} onValueChange={(v) => setz({ kategorie: v })}>
            <SelectTrigger id="e-kat" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{KATEGORIEN.map((x) => <SelectItem key={x.wert} value={x.wert}>{x.text}</SelectItem>)}</SelectContent>
          </Select>
        </Feld>
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

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <Label htmlFor="e-bezahlt" className="cursor-pointer">
          <span className="block text-sm font-medium">Bezahlt</span>
          <span className="block text-xs font-normal text-muted-foreground">{k.bezahlt ? "Datum der Zahlung rechts" : "Noch offen"}</span>
        </Label>
        <div className="flex items-center gap-2">
          {k.bezahlt && <Input type="date" aria-label="Bezahlt am" className="h-11 w-40" value={k.bezahlt_am} onChange={(e) => setz({ bezahlt_am: e.target.value })} />}
          <Switch id="e-bezahlt" checked={k.bezahlt} onCheckedChange={(v) => setz({ bezahlt: v })} />
        </div>
      </div>

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
