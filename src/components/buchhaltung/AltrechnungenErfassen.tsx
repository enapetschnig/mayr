import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, FileUp, Loader2, Plus, Trash2, X } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { supabase } from "@/integrations/supabase/client";
import { csvZerlegen } from "@/lib/csvImport";
import type { ZahlenFormat } from "@/lib/csvImport";
import { euro, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { altrechnungenAnlegen, useKategorien } from "./buchhaltungDaten";
import { ALT_SPALTEN, altAusCsv, altSpaltenErkennen, altZeileLesen, type AltEingabe, type AltSpalte } from "./buchhaltungLogik";
import { KategorieWahl } from "./KategorieTeile";

type Zeile = AltEingabe & { schluessel: string; pdf: File | null };
const leer = (): Zeile => ({ schluessel: crypto.randomUUID(), nummer: "", datum: "", kunde: "", netto: "", ust_satz: "20", brutto: "", faellig_am: "", bezahlt: "", pdf: null });
const istLeer = (z: Zeile) => !z.nummer.trim() && !z.datum.trim() && !z.kunde.trim() && !z.netto.trim() && !z.brutto.trim();

/** Text einer CSV-Datei: UTF-8, sonst Windows-1252 (Excel in Österreich) */
async function csvText(f: File): Promise<string> {
  const roh = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(roh); } catch { return new TextDecoder("windows-1252").decode(roh); }
}

/**
 * Altrechnungen schnell hintereinander erfassen: eine Tabelle zum Durchtippen
 * (Tab springt weiter, Enter in der letzten Spalte = neue Zeile) oder eine
 * CSV aus dem alten Programm mit wählbaren Spalten. Je Zeile optional das
 * Original als PDF. Unbekannte Kunden legt das Speichern an.
 */
export function AltrechnungenErfassen({ art, onClose }: { art: "tabelle" | "csv" | null; onClose: () => void }) {
  const heute = isoTag();
  const neuLaden = useNeuLaden();
  const { data: kunden = [] } = useKunden();
  const { data: alleKat = [] } = useKategorien(!!art);
  const kategorien = alleKat.filter((k) => k.richtung === "ausgang");
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [format, setFormat] = useState<ZahlenFormat>(null);
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [csv, setCsv] = useState<{ name: string; kopf: string[]; daten: string[][]; zu: Partial<Record<AltSpalte, number>> } | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const csvFeld = useRef<HTMLInputElement>(null);
  const pdfFeld = useRef<HTMLInputElement>(null);
  const [pdfFuer, setPdfFuer] = useState<string | null>(null);

  useBeimOeffnen(art, () => {
    setZeilen([leer(), leer(), leer()]);
    setFormat(null);
    setKategorie(null);
    setCsv(null);
    if (art === "csv") setTimeout(() => csvFeld.current?.click(), 50);
  });

  const geprueft = useMemo(() => zeilen.map((z) => ({ z, ...(istLeer(z) ? { rechnung: null, fehler: null } : altZeileLesen(z, heute, format)) })), [zeilen, heute, format]);
  const gueltig = geprueft.filter((x) => x.rechnung);
  const fehlerhaft = geprueft.filter((x) => x.fehler);
  const doppelt = useMemo(() => {
    const n = gueltig.map((x) => x.rechnung!.nummer.toLowerCase());
    return new Set(n.filter((x, i) => n.indexOf(x) !== i));
  }, [gueltig]);
  const kundenNamen = useMemo(() => new Set(kunden.map((k) => k.name.trim().toLowerCase())), [kunden]);
  const neueKunden = [...new Set(gueltig.map((x) => x.rechnung!.kunde).filter((k) => !kundenNamen.has(k.toLowerCase())))];

  const aendern = (s: string, teil: Partial<Zeile>) => setZeilen((alt) => alt.map((z) => (z.schluessel === s ? { ...z, ...teil } : z)));

  const csvLesen = async (f: File) => {
    try {
      const alle = csvZerlegen(await csvText(f)).filter((z) => z.some((x) => x.trim()));
      if (alle.length < 2) return toast.error("In der Datei stehen keine Rechnungen (Kopfzeile und mindestens eine Zeile).");
      setCsv({ name: f.name, kopf: alle[0], daten: alle.slice(1), zu: altSpaltenErkennen(alle[0]) });
    } catch (e) {
      toast.error("Datei nicht lesbar", { description: (e as Error).message });
    }
  };
  const csvUebernehmen = () => {
    if (!csv) return;
    const fehlt = ALT_SPALTEN.filter((s) => s.pflicht && csv.zu[s.feld] === undefined);
    if (fehlt.length) return toast.error(`Bitte die Spalte für ${fehlt.map((s) => s.text).join(", ")} wählen.`);
    if (csv.zu.netto === undefined && csv.zu.brutto === undefined) return toast.error("Bitte die Spalte für Netto oder Brutto wählen.");
    const { eingaben, format: f } = altAusCsv(csv.daten, csv.zu);
    setFormat(f);
    setZeilen([...zeilen.filter((z) => !istLeer(z)), ...eingaben.map((e) => ({ ...e, ust_satz: e.ust_satz || "20", schluessel: crypto.randomUUID(), pdf: null }))]);
    setCsv(null);
    toast.success(`${eingaben.length} Zeilen übernommen — bitte kurz prüfen, dann speichern.`);
  };

  const speichern = async () => {
    if (fehlerhaft.length) return toast.error(`${fehlerhaft.length} ${fehlerhaft.length === 1 ? "Zeile hat" : "Zeilen haben"} einen Fehler — rot markiert.`);
    if (!gueltig.length) return toast.error("Noch keine Altrechnung eingetragen.");
    if (doppelt.size) return toast.error(`Nummer doppelt: ${[...doppelt].join(", ")}`);
    setSpeichert(true);
    try {
      const nummern = gueltig.map((x) => x.rechnung!.nummer);
      const { data: schon } = await supabase.from("belege").select("nummer").in("nummer", nummern);
      if (schon?.length) {
        toast.error(`Diese Nummer gibt es schon: ${schon.map((s) => s.nummer).join(", ")}`, { description: "Altrechnungen brauchen eine eigene Nummer — z. B. mit einem Kürzel davor." });
        return;
      }
      const r = await altrechnungenAnlegen(gueltig.map((x) => ({ ...x.rechnung!, kunde_id: null, kategorie_id: kategorie, pdf: x.z.pdf })), kunden);
      await neuLaden("buchhaltung", "belege", "op", "kunden");
      toast.success(`${r.angelegt} ${r.angelegt === 1 ? "Altrechnung" : "Altrechnungen"} erfasst${r.neueKunden ? `, ${r.neueKunden} ${r.neueKunden === 1 ? "Kunde" : "Kunden"} neu angelegt` : ""}`,
        r.ohnePdf.length ? { description: `PDF nicht abgelegt: ${r.ohnePdf.join(", ")}` } : undefined);
      onClose();
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  const feld = (z: Zeile, f: keyof AltEingabe, platz: string, extra?: string, letzte = false) => (
    <Input aria-label={ALT_SPALTEN.find((s) => s.feld === f)?.text} placeholder={platz} value={z[f]} list={f === "kunde" ? "alt-kunden" : undefined}
      className={cn("h-11 text-base lg:text-sm", extra)} inputMode={["netto", "brutto", "ust_satz", "bezahlt"].includes(f) ? "decimal" : undefined}
      onChange={(e) => aendern(z.schluessel, { [f]: e.target.value })}
      onKeyDown={letzte ? (e) => {
        if (e.key === "Enter" && zeilen[zeilen.length - 1].schluessel === z.schluessel) { e.preventDefault(); setZeilen((alt) => [...alt, leer()]); }
      } : undefined} />
  );

  return (
    <FormularDialog
      open={!!art}
      onOpenChange={(o) => { if (!o) onClose(); }}
      titel="Altrechnungen erfassen"
      beschreibung="Rechnungen aus dem bisherigen Programm — Nummer wie dort, Netto oder Brutto genügt. Datum 31.12.2025 oder 31.12.25."
      breite="breit"
      gesperrt={speichert}
      ungespeichert={zeilen.some((z) => !istLeer(z))}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={onClose} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-40" onClick={() => void speichern()} disabled={speichert || !gueltig.length}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} {gueltig.length ? `${gueltig.length} speichern` : "Speichern"}
          </Button>
        </>
      )}
    >
      <input ref={csvFeld} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void csvLesen(f); e.target.value = ""; }} />
      <input ref={pdfFeld} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && pdfFuer) aendern(pdfFuer, { pdf: f }); e.target.value = ""; setPdfFuer(null); }} />
      <datalist id="alt-kunden">{kunden.map((k) => <option key={k.id} value={k.name} />)}</datalist>

      {csv && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{csv.name} · {csv.daten.length} Zeilen — welche Spalte ist was?</p>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="CSV verwerfen" onClick={() => setCsv(null)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALT_SPALTEN.map((s) => (
              <div key={s.feld} className="space-y-1">
                <Label className="text-xs">{s.text}{s.pflicht ? "" : " (optional)"}</Label>
                <Select value={csv.zu[s.feld] === undefined ? "_" : String(csv.zu[s.feld])}
                  onValueChange={(v) => setCsv({ ...csv, zu: { ...csv.zu, [s.feld]: v === "_" ? undefined : Number(v) } })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">–</SelectItem>
                    {csv.kopf.map((k, i) => <SelectItem key={i} value={String(i)}>{k || `Spalte ${i + 1}`}{csv.daten[0]?.[i] ? ` (z. B. ${csv.daten[0][i].slice(0, 20)})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button className="h-11" onClick={csvUebernehmen}>In die Tabelle übernehmen</Button>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 sm:w-72">
          <Label className="text-xs">Kategorie für alle (optional)</Label>
          <KategorieWahl kategorien={kategorien} wert={kategorie} onChange={setKategorie} />
        </div>
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => csvFeld.current?.click()}><FileUp className="h-4 w-4" /> CSV einlesen</Button>
      </div>

      <div className="hidden grid-cols-[8rem_8.5rem_minmax(10rem,1fr)_7rem_4.5rem_7rem_8.5rem_6.5rem_5.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
        <span>Nummer</span><span>Datum</span><span>Kunde</span><span className="text-right">Netto €</span><span>USt %</span><span className="text-right">Brutto €</span><span>Fällig</span><span>Bezahlt</span><span />
      </div>
      <ul className="space-y-2 lg:space-y-1">
        {geprueft.map(({ z, rechnung, fehler }) => (
          <li key={z.schluessel} className={cn("rounded-lg border bg-card p-2 lg:border-0 lg:bg-transparent lg:p-0")}>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-[8rem_8.5rem_minmax(10rem,1fr)_7rem_4.5rem_7rem_8.5rem_6.5rem_5.5rem]">
              {feld(z, "nummer", "Nummer", "font-mono")}
              {feld(z, "datum", "Datum")}
              {feld(z, "kunde", "Kunde", "col-span-2 lg:col-span-1")}
              {feld(z, "netto", "Netto", "text-right")}
              {feld(z, "ust_satz", "USt %", "text-right")}
              {feld(z, "brutto", rechnung && !z.brutto.trim() ? euro(rechnung.brutto) : "Brutto", "text-right")}
              {feld(z, "faellig_am", "Fällig")}
              {feld(z, "bezahlt", "ja / Betrag", undefined, true)}
              <div className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                <Button variant={z.pdf ? "secondary" : "ghost"} size="icon" className="h-11 w-11" title={z.pdf ? z.pdf.name : "PDF des Originals"}
                  aria-label={z.pdf ? `PDF ${z.pdf.name} entfernen` : "PDF des Originals anhängen"}
                  onClick={() => { if (z.pdf) aendern(z.schluessel, { pdf: null }); else { setPdfFuer(z.schluessel); pdfFeld.current?.click(); } }}>
                  <FileText className={cn("h-4 w-4", z.pdf && "text-primary")} />
                </Button>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Zeile entfernen"
                  onClick={() => setZeilen((alt) => (alt.length > 1 ? alt.filter((x) => x.schluessel !== z.schluessel) : [leer()]))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {(fehler || (rechnung && doppelt.has(rechnung.nummer.toLowerCase()))) && (
              <p className="px-1 pt-1 text-xs text-destructive">{fehler ?? "Nummer doppelt"}</p>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" className="h-11 gap-1.5" onClick={() => setZeilen((alt) => [...alt, leer()])}><Plus className="h-4 w-4" /> Zeile</Button>

      {gueltig.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {gueltig.length} {gueltig.length === 1 ? "Rechnung" : "Rechnungen"} · brutto {euro(gueltig.reduce((s, x) => s + x.rechnung!.brutto, 0))}
          {" "}· davon offen {euro(gueltig.reduce((s, x) => s + x.rechnung!.brutto - x.rechnung!.bezahlt, 0))}
          {neueKunden.length > 0 && <> · neu angelegt {neueKunden.length === 1 ? "wird" : "werden"} <span className="font-medium text-foreground">{neueKunden.join(", ")}</span></>}
        </p>
      )}
    </FormularDialog>
  );
}
