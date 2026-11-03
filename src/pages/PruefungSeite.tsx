import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCheck, ClipboardCheck, Copy, ExternalLink, FileText, Loader2, PenLine, Plus, Receipt, Save, Share2, Trash2, X,
} from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import {
  pruefungLaden, pruefungLoeschen, pruefungSpeichern, pruefungUnterschreiben, rechnungAusPruefungen, usePruefung, type PruefungVoll,
} from "@/components/anlagen/anlagenDaten";
import {
  ERGEBNIS, MESS_FELDER, PRUEF_ART, besichtigungLesen, erderBewerten, ergebnisVorschlag, maengelText, messungAusZeile, messungBewerten,
  messungenLesen, zahlZuText, zeileAusMessung, zeileLeer, zsMax, type Besichtigung, type MessFeld, type MessZeile, type PruefArt,
} from "@/components/anlagen/pruefLogik";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { KundenUnterschrift } from "@/components/regie/KundenUnterschrift";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIstPc } from "@/components/AppLayout";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, isoTag } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { pruefPdfErstellen } from "@/lib/pruefPdf";
import { zeitpunkt } from "@/lib/regiePdf";
import { REGIE_STATUS, TON_KLASSE, name } from "@/lib/types";
import { cn } from "@/lib/utils";
import { neueId } from "@/components/belege/editor";

const NETZE = ["TN-S", "TN-C-S", "TN-C", "TT", "IT"];
const FELD_TEXT: Record<MessFeld, string> = { riso: "RISO MΩ", zs: "Zs Ω", fi_in: "IΔn mA", fi_ia: "IΔ mA", fi_ta: "tA ms" };

type Stand = {
  datum: string; art: PruefArt; netz: string; messgeraet: string; erder: string;
  besichtigung: Besichtigung[]; zeilen: MessZeile[]; ergebnis: string | null; maengel: string; bemerkung: string;
};

function standAus(p: PruefungVoll): Stand {
  return {
    datum: p.datum, art: p.art as PruefArt, netz: p.netz ?? "", messgeraet: p.messgeraet ?? "", erder: zahlZuText(p.erder_ohm == null ? null : Number(p.erder_ohm)),
    besichtigung: besichtigungLesen(p.besichtigung),
    zeilen: messungenLesen(p.messungen).map((m) => zeileAusMessung(m, neueId())),
    ergebnis: p.ergebnis, maengel: p.maengel ?? "", bemerkung: p.bemerkung ?? "",
  };
}

const ohneKeys = (s: Stand) => JSON.stringify({ ...s, zeilen: s.zeilen.filter((z) => !zeileLeer(z)).map(({ key: _k, ...r }) => r) });

/**
 * /pruefungen/:id — Prüfprotokoll. Entwurf: am Handy ausfüllen
 * (Besichtigung antippen, Messwerte je Stromkreis, Ergebnis), dann gibt
 * der Prüfer das Handy dem Kunden zum Unterschreiben. Unterschrieben:
 * festgeschrieben, PDF teilen, (Chef) verrechnen.
 */
export default function PruefungSeite() {
  const { id } = useParams();
  const { data, isLoading, error } = usePruefung(id);
  if (isLoading) return <Seite titel="Prüfprotokoll"><p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p></Seite>;
  if (error || !data) {
    return (
      <Seite titel="Prüfprotokoll" zurueckPfad="/anlagen">
        <Leer icon={ClipboardCheck} text={error ? `Konnte nicht geladen werden: ${(error as Error).message}` : "Dieses Prüfprotokoll gibt es nicht (mehr)."} />
      </Seite>
    );
  }
  return data.status === "unterschrieben" ? <Ansicht p={data} /> : <Editor key={data.id} p={data} />;
}

function usePdf() {
  const pc = useIstPc();
  const { firma } = useSitzung();
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const zeigen = async (holen: () => Promise<PruefungVoll | null>) => {
    if (!firma) return toast.error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    setLaeuft(true);
    try {
      const p = await holen();
      if (!p) return;
      const d = await pruefPdfErstellen(p, firma);
      if (pc) setVorschau(d);
      else await pdfTeilenOderLaden(d.blob, d.dateiname);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  return { pc, zeigen, laeuft, element: <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} /> };
}

// ── Entwurf ausfüllen ────────────────────────────────────────────────

function Editor({ p }: { p: PruefungVoll }) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const pdf = usePdf();
  const a = p.anlagen;
  const [s, setS] = useState<Stand>(() => standAus(p));
  const [basis, setBasis] = useState(() => ohneKeys(standAus(p)));
  const [speichert, setSpeichert] = useState(false);
  const [unterschreiben, setUnterschreiben] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [neuerPunkt, setNeuerPunkt] = useState("");
  const dirty = ohneKeys(s) !== basis;
  const setze = <K extends keyof Stand>(k: K, v: Stand[K]) => setS((x) => ({ ...x, [k]: v }));

  // Ungespeichert und Tab zu → Browser fragt nach
  useEffect(() => {
    if (!dirty) return;
    const warnen = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [dirty]);

  const messungen = useMemo(() => s.zeilen.filter((z) => !zeileLeer(z)).map(messungAusZeile), [s.zeilen]);
  const fiIn = messungen.find((m) => m.fi_in)?.fi_in ?? null;
  const erderFehler = erderBewerten(dezimalLesen(s.erder), fiIn);
  const vorschlag = ergebnisVorschlag(s.besichtigung, messungen, erderFehler);
  const offenePunkte = s.besichtigung.filter((b) => b.ok === null).length;

  const speichern = async (): Promise<boolean> => {
    const erder = s.erder.trim() ? dezimalLesen(s.erder) : null;
    if (s.erder.trim() && erder == null) { toast.error("Erdungswiderstand: bitte eine Zahl."); return false; }
    const kaputt = s.zeilen.find((z) => MESS_FELDER.some((f) => z[f].trim() && dezimalLesen(z[f]) == null));
    if (kaputt) { toast.error(`${kaputt.stromkreis || "Stromkreis"}: ein Messwert ist keine Zahl.`); return false; }
    setSpeichert(true);
    try {
      await pruefungSpeichern(p.id, {
        datum: s.datum, art: s.art, netz: s.netz || null, messgeraet: s.messgeraet.trim() || null, erder_ohm: erder,
        ergebnis: (s.ergebnis as "ok" | "maengel" | "gefahr" | null) ?? null, maengel: s.maengel.trim() || null, bemerkung: s.bemerkung.trim() || null,
        besichtigung: s.besichtigung, messungen,
      });
      setBasis(ohneKeys(s));
      void neuLaden("anlagen");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSpeichert(false);
    }
  };

  const zurUnterschrift = async () => {
    if (!s.ergebnis) return toast.error("Bitte zuerst das Ergebnis wählen.");
    if (s.ergebnis !== "ok" && !s.maengel.trim()) return toast.error("Bei Mängeln bitte die Mängel beschreiben.");
    if (await speichern()) setUnterschreiben(true);
  };

  const unterschrieben = async (unterzeichner: string, png: Blob) => {
    try {
      await pruefungUnterschreiben(p.id, unterzeichner, png);
      await neuLaden("anlagen");
      toast.success(`Prüfprotokoll ${p.nummer ?? ""} unterschrieben`, { description: "Festgeschrieben — die nächste Prüfung ist eingetragen." });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  const loeschenAusfuehren = async () => {
    try {
      await pruefungLoeschen(p.id);
      await neuLaden("anlagen");
      toast.success("Entwurf gelöscht");
      navigate(a ? `/anlagen/${a.id}` : "/anlagen", { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const zeileAendern = (key: string, feld: keyof MessZeile, wert: string) =>
    setze("zeilen", s.zeilen.map((z) => (z.key === key ? { ...z, [feld]: wert } : z)));
  const zeileDazu = () => {
    const letzte = s.zeilen[s.zeilen.length - 1];
    setze("zeilen", [...s.zeilen, zeileAusMessung({ schutz: letzte?.schutz ?? "B16", querschnitt: letzte?.querschnitt ?? "3x1,5", fi_in: dezimalLesen(letzte?.fi_in ?? "") ?? 30 }, neueId())]);
  };

  return (
    <Seite
      titel={`Prüfung ${p.nummer ?? ""}`.trim()}
      untertitel={[a?.bezeichnung, a?.kunden?.name].filter(Boolean).join(" · ")}
      zurueckPfad={a ? `/anlagen/${a.id}` : "/anlagen"}
      aktionen={(
        <>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="PDF-Vorschau" disabled={pdf.laeuft}
            onClick={() => void pdf.zeigen(async () => ((await speichern()) ? pruefungLaden(p.id) : null))}>
            {pdf.laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Entwurf löschen" onClick={() => setLoeschen(true)}>
            <Trash2 className="h-5 w-5" />
          </Button>
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPille eintrag={REGIE_STATUS.entwurf} />
        {a && <Link to={`/anlagen/${a.id}`} className="text-sm text-primary hover:underline">{a.bezeichnung}{a.standort ? ` · ${a.standort}` : ""}</Link>}
      </div>

      <Karte titel="Prüfung">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="pr-datum">Datum</Label>
            <Input id="pr-datum" type="date" className="h-11" value={s.datum} onChange={(e) => setze("datum", e.target.value || isoTag())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-art">Art</Label>
            <Select value={s.art} onValueChange={(v) => setze("art", v as PruefArt)}>
              <SelectTrigger id="pr-art" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRUEF_ART).map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-netz">Netzform</Label>
            <Select value={s.netz || "–"} onValueChange={(v) => setze("netz", v === "–" ? "" : v)}>
              <SelectTrigger id="pr-netz" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="–">–</SelectItem>
                {NETZE.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-geraet">Messgerät</Label>
            <Input id="pr-geraet" className="h-11" value={s.messgeraet} onChange={(e) => setze("messgeraet", e.target.value)} placeholder="z. B. Fluke 1664 FC" />
          </div>
        </div>
      </Karte>

      <Karte
        titel="Besichtigung"
        aktion={offenePunkte > 0 && (
          <Button variant="outline" className="h-10 gap-1.5" onClick={() => setze("besichtigung", s.besichtigung.map((b) => (b.ok === null ? { ...b, ok: true } : b)))}>
            <CheckCheck className="h-4 w-4" /> Rest in Ordnung
          </Button>
        )}
        ohnePolster
      >
        <ul className="divide-y">
          {s.besichtigung.map((b, i) => (
            <li key={`${b.punkt}-${i}`} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center lg:px-5">
              <span className={cn("min-w-0 flex-1 text-sm", b.ok === false && "font-medium text-status-rot-fg")}>{b.punkt}</span>
              <div className="flex shrink-0 gap-1.5">
                {([[true, "OK"], [false, "Mangel"], [null, "–"]] as const).map(([wert, text]) => (
                  <button key={text} type="button"
                    onClick={() => setze("besichtigung", s.besichtigung.map((x, j) => (j === i ? { ...x, ok: wert } : x)))}
                    className={cn("min-h-11 min-w-[4.5rem] rounded-md border px-3 text-sm font-medium transition-colors",
                      b.ok === wert
                        ? wert === true ? "border-transparent bg-status-gruen text-status-gruen-fg" : wert === false ? "border-transparent bg-status-rot text-status-rot-fg" : "border-primary bg-primary-soft text-primary"
                        : "bg-card hover:bg-muted")}>
                    {text}
                  </button>
                ))}
              </div>
            </li>
          ))}
          <li className="flex gap-2 px-4 py-2.5 lg:px-5">
            <Input value={neuerPunkt} onChange={(e) => setNeuerPunkt(e.target.value)} placeholder="Eigenen Prüfpunkt dazu …" className="h-11"
              onKeyDown={(e) => { if (e.key === "Enter" && neuerPunkt.trim()) { setze("besichtigung", [...s.besichtigung, { punkt: neuerPunkt.trim(), ok: null }]); setNeuerPunkt(""); } }} />
            <Button variant="outline" className="h-11 shrink-0" disabled={!neuerPunkt.trim()}
              onClick={() => { setze("besichtigung", [...s.besichtigung, { punkt: neuerPunkt.trim(), ok: null }]); setNeuerPunkt(""); }}>
              <Plus className="h-4 w-4" />
            </Button>
          </li>
        </ul>
      </Karte>

      <Karte titel="Messungen" aktion={<span className="text-xs text-muted-foreground">je Stromkreis</span>}>
        <div className="space-y-3">
          {s.zeilen.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Stromkreis — unten dazugeben.</p>}
          {s.zeilen.map((z, i) => {
            const fehler = messungBewerten(messungAusZeile(z));
            const max = zsMax(z.schutz);
            return (
              <div key={z.key} className={cn("space-y-2 rounded-lg border p-3", fehler.length && "border-status-rot")}>
                <div className="flex items-center gap-2">
                  <span className="zahl w-6 shrink-0 text-sm text-muted-foreground">{i + 1}</span>
                  <Input aria-label="Stromkreis" className="h-11 flex-1" value={z.stromkreis} placeholder="Stromkreis, z. B. Küche Steckdosen"
                    onChange={(e) => zeileAendern(z.key, "stromkreis", e.target.value)} />
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Stromkreis kopieren"
                    onClick={() => { const neu = s.zeilen.slice(); neu.splice(i + 1, 0, { ...z, key: neueId(), stromkreis: "", riso: "", zs: "", fi_ia: "", fi_ta: "" }); setze("zeilen", neu); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label="Stromkreis entfernen"
                    onClick={() => setze("zeilen", s.zeilen.filter((x) => x.key !== z.key))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                  <Feldchen label="Schutz" wert={z.schutz} onChange={(v) => zeileAendern(z.key, "schutz", v)} platz="B16" text />
                  <Feldchen label="Leitung" wert={z.querschnitt} onChange={(v) => zeileAendern(z.key, "querschnitt", v)} platz="3x1,5" text />
                  {MESS_FELDER.map((f) => (
                    <Feldchen key={f} label={f === "zs" && max != null ? `Zs Ω (max ${zahlZuText(max)})` : FELD_TEXT[f]} wert={z[f]}
                      onChange={(v) => zeileAendern(z.key, f, v)} />
                  ))}
                </div>
                {fehler.length > 0 && (
                  <p className="flex items-start gap-1.5 text-sm text-status-rot-fg"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{fehler.join(" · ")}</p>
                )}
              </div>
            );
          })}
          <Button variant="outline" className="h-11 w-full gap-1.5 sm:w-auto" onClick={zeileDazu}><Plus className="h-4 w-4" /> Stromkreis dazu</Button>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Label htmlFor="pr-erder" className="text-sm">Erdungswiderstand Ω <span className="font-normal text-muted-foreground">(optional, TT)</span></Label>
            <Input id="pr-erder" className="zahl h-11 w-28 text-right" inputMode="decimal" value={s.erder} onChange={(e) => setze("erder", e.target.value)} />
            {erderFehler && <span className="text-sm text-status-rot-fg">{erderFehler}</span>}
          </div>
        </div>
      </Karte>

      <Karte titel="Ergebnis">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["ok", "maengel", "gefahr"] as const).map((e) => (
              <button key={e} type="button" onClick={() => setze("ergebnis", e)}
                className={cn("min-h-12 rounded-lg border px-2 text-sm font-semibold transition-colors",
                  s.ergebnis === e ? cn("border-transparent", TON_KLASSE[ERGEBNIS[e].ton]) : "bg-card hover:bg-muted")}>
                {ERGEBNIS[e].text}
              </button>
            ))}
          </div>
          {s.ergebnis && s.ergebnis !== vorschlag && s.ergebnis === "ok" && (
            <p className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", TON_KLASSE.gelb)}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Besichtigung oder Messung zeigt einen Mangel — trotzdem „In Ordnung“?
            </p>
          )}
          {!s.ergebnis && <p className="text-sm text-muted-foreground">Nach Besichtigung und Messung: {ERGEBNIS[vorschlag].text}.</p>}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pr-maengel">Mängel</Label>
              {vorschlag === "maengel" && (
                <Button variant="ghost" className="h-9 gap-1.5 text-primary" onClick={() => setze("maengel", maengelText(s.besichtigung, messungen, erderFehler))}>
                  <PenLine className="h-4 w-4" /> Aus der Prüfung übernehmen
                </Button>
              )}
            </div>
            <Textarea id="pr-maengel" rows={4} value={s.maengel} onChange={(e) => setze("maengel", e.target.value)} placeholder="Was behoben werden muss" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-bem">Bemerkung <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="pr-bem" rows={2} value={s.bemerkung} onChange={(e) => setze("bemerkung", e.target.value)} />
          </div>
        </div>
      </Karte>

      <div className="sticky bottom-0 z-20 -mx-3 flex gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:mx-0 lg:rounded-lg lg:border"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Button variant="outline" className="h-12 flex-1" disabled={!dirty || speichert} onClick={() => void speichern().then((ok) => ok && toast.success("Gespeichert"))}>
          {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {dirty ? "Speichern" : "Gespeichert"}
        </Button>
        <Button className="h-12 flex-[2] text-base" disabled={speichert} onClick={() => void zurUnterschrift()}>
          <PenLine className="h-4 w-4" /> Kunde unterschreibt
        </Button>
      </div>

      <KundenUnterschrift
        open={unterschreiben}
        onOpenChange={setUnterschreiben}
        sicht={{
          nummer: p.nummer, datum: s.datum, kunde: a?.kunden?.name ?? null, projekt: a?.bezeichnung ?? "", baustelle: a?.standort ?? null,
          arbeiten: "", zeiten: [], material: [],
        }}
        nameVorschlag=""
        titel={`Prüfprotokoll ${p.nummer ?? ""}`.trim()}
        hinweis="Mit Ihrer Unterschrift bestätigen Sie die Durchführung der Prüfung und die Kenntnis des Ergebnisses."
        inhalt={(
          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{PRUEF_ART[s.art]}</p>
            {s.ergebnis && (
              <p className={cn("rounded-lg px-4 py-3 text-xl font-semibold", TON_KLASSE[ERGEBNIS[s.ergebnis].ton])}>{ERGEBNIS[s.ergebnis].text}</p>
            )}
            {s.ergebnis && <p className="text-lg">{ERGEBNIS[s.ergebnis].lang}</p>}
            {s.maengel.trim() && <p className="whitespace-pre-wrap text-lg leading-relaxed">{s.maengel.trim()}</p>}
            <p className="text-base text-muted-foreground">
              {s.besichtigung.length} Prüfpunkte besichtigt · {messungen.length} {messungen.length === 1 ? "Stromkreis" : "Stromkreise"} gemessen
            </p>
          </section>
        )}
        onBestaetigen={unterschrieben}
      />

      <AlertDialog open={loeschen} onOpenChange={setLoeschen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
            <AlertDialogDescription>Das Prüfprotokoll {p.nummer} ist noch nicht unterschrieben und wird endgültig gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void loeschenAusfuehren()}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {pdf.element}
    </Seite>
  );
}

function Feldchen({ label, wert, onChange, platz, text }: { label: string; wert: string; onChange: (v: string) => void; platz?: string; text?: boolean }) {
  return (
    <label className="space-y-1">
      <span className="block truncate text-xs text-muted-foreground">{label}</span>
      <Input className={cn("h-11", !text && "zahl text-right")} value={wert} onChange={(e) => onChange(e.target.value)} placeholder={platz}
        inputMode={text ? "text" : "decimal"} autoComplete="off" />
    </label>
  );
}

// ── Unterschrieben: ansehen ──────────────────────────────────────────

function Ansicht({ p }: { p: PruefungVoll }) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { firma, istChef } = useSitzung();
  const { data: kunden = [] } = useKunden();
  const pdf = usePdf();
  const a = p.anlagen;
  const besichtigung = besichtigungLesen(p.besichtigung);
  const messungen = messungenLesen(p.messungen);
  const [laeuft, setLaeuft] = useState(false);

  const verrechnen = async () => {
    if (!a) return;
    setLaeuft(true);
    try {
      const { id } = await rechnungAusPruefungen([{ ...p, anlage: a }], kunden.find((k) => k.id === a.kunde_id) ?? null, firma, isoTag());
      await neuLaden("anlagen", "belege");
      toast.success("Rechnungsentwurf angelegt");
      navigate(`/belege/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Seite
      titel={`Prüfprotokoll ${p.nummer ?? ""}`.trim()}
      untertitel={[a?.bezeichnung, a?.kunden?.name].filter(Boolean).join(" · ")}
      zurueckPfad={a ? `/anlagen/${a.id}` : "/anlagen"}
      aktionen={(
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="PDF" disabled={pdf.laeuft} onClick={() => void pdf.zeigen(() => pruefungLaden(p.id))}>
          {pdf.laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : pdf.pc ? <FileText className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
        </Button>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.ergebnis && <StatusPille eintrag={ERGEBNIS[p.ergebnis]} />}
        <span className="text-sm text-muted-foreground">{PRUEF_ART[p.art as PruefArt]} am {datum(p.datum)} · Prüfer {name(p.ersteller)}</span>
      </div>
      {p.rechnung_id ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-status-lila bg-status-lila p-3 text-sm text-status-lila-fg">
          <Receipt className="h-4 w-4 shrink-0" /> <span className="flex-1">Verrechnet — das Protokoll ist festgeschrieben.</span>
          {istChef && <Link to={`/belege/${p.rechnung_id}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold hover:underline">Rechnung öffnen <ExternalLink className="h-4 w-4" /></Link>}
        </div>
      ) : istChef && (
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={() => void verrechnen()} disabled={laeuft}>
          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Rechnung erstellen
        </Button>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Karte titel="Ergebnis">
            <p className="text-sm">{p.ergebnis ? ERGEBNIS[p.ergebnis].lang : "–"}</p>
            {p.maengel && <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{p.maengel}</p>}
            {p.bemerkung && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.bemerkung}</p>}
          </Karte>
          <Karte titel="Besichtigung" ohnePolster>
            <ul className="divide-y">
              {besichtigung.map((b, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm lg:px-5">
                  <span className="min-w-0 flex-1">{b.punkt}</span>
                  <StatusPille eintrag={b.ok === true ? { ton: "gruen", text: "OK" } : b.ok === false ? { ton: "rot", text: "Mangel" } : { ton: "grau", text: "–" }} />
                </li>
              ))}
            </ul>
          </Karte>
        </div>
        <div className="space-y-4">
          <Karte titel="Messungen" ohnePolster>
            {messungen.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Keine Messungen.</p> : (
              <ul className="divide-y">
                {messungen.map((m, i) => {
                  const f = messungBewerten(m);
                  return (
                    <li key={i} className="px-4 py-2 text-sm lg:px-5">
                      <p className="font-medium">{m.stromkreis || `Stromkreis ${i + 1}`} <span className="font-normal text-muted-foreground">{[m.schutz, m.querschnitt].filter(Boolean).join(" · ")}</span></p>
                      <p className="zahl text-xs text-muted-foreground">
                        {MESS_FELDER.filter((k) => m[k] != null).map((k) => `${FELD_TEXT[k]} ${zahlZuText(m[k])}`).join(" · ") || "–"}
                      </p>
                      {f.length > 0 && <p className="text-xs text-status-rot-fg">{f.join(" · ")}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Karte>
          <Karte titel="Unterschrift des Kunden">
            <UnterschriftBild pfad={p.unterschrift_pfad} />
            <p className="mt-2 text-sm"><span className="font-medium">{p.unterschrift_name}</span> <span className="text-muted-foreground">· {zeitpunkt(p.unterschrieben_am)}</span></p>
          </Karte>
        </div>
      </div>
      {pdf.element}
    </Seite>
  );
}

function UnterschriftBild({ pfad }: { pfad: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pfad) return;
    let aktiv = true;
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase.storage.from("projekt-dateien").createSignedUrl(pfad, 3600).then(({ data }) => { if (aktiv) setUrl(data?.signedUrl ?? null); }));
    return () => { aktiv = false; };
  }, [pfad]);
  return (
    <div className="flex h-32 items-center justify-center overflow-hidden rounded-md border bg-white p-2">
      {url ? <img src={url} alt="Unterschrift" className="max-h-full max-w-full object-contain" /> : <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />}
    </div>
  );
}
