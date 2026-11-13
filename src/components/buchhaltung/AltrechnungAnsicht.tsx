import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, FileUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { Karte, StatusPille } from "@/components/Bausteine";
import FormularDialog from "@/components/FormularDialog";
import { KundeWahl } from "@/components/KundeWahl";
import { Seite } from "@/components/PageHeader";
import { useIstPc } from "@/components/AppLayout";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpKarte } from "@/components/op/OpKarte";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { Feld, useBeimOeffnen, zahlFeld } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { archivieren, archivLaden } from "@/lib/belegArchiv";
import { datum, euro, isoTag } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import type { Beleg } from "@/lib/types";
import { sichererDateiname } from "@/lib/upload";
import { altrechnungAendern, altrechnungLoeschen, kategorieSetzen, useKategorien } from "./buchhaltungDaten";
import { altZeileLesen } from "./buchhaltungLogik";
import { ALT_PILLE } from "./AusgangListe";
import { KategorieWahl } from "./KategorieTeile";

/**
 * /belege/:id für eine Altrechnung: was im alten Programm stand, das Original
 * (falls hinterlegt), Zahlungen, Ausbuchen und Mahnen wie bei jeder Rechnung.
 * Anders als eigene Rechnungen lässt sie sich korrigieren und löschen.
 */
export function AltrechnungAnsicht({ beleg }: { beleg: Beleg }) {
  const pc = useIstPc();
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { data: alle = [] } = useKategorien();
  const kategorien = alle.filter((k) => k.richtung === "ausgang");
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);
  const pdfFeld = useRef<HTMLInputElement>(null);
  const { data: original, isLoading: originalLaedt } = useQuery({
    queryKey: ["belege", "archiv", beleg.id],
    queryFn: () => archivLaden(beleg.id),
  });

  const fertig = () => neuLaden("belege", "buchhaltung", "op");
  const pdfZeigen = async () => {
    if (!original) return;
    const d = { blob: original, dateiname: `${sichererDateiname(beleg.nummer ?? "Altrechnung")}.pdf` };
    if (pc) setVorschau(d);
    else await pdfTeilenOderLaden(d.blob, d.dateiname);
  };
  const pdfAblegen = async (f: File) => {
    setLaeuft("pdf");
    const ok = await archivieren(beleg.id, f);
    setLaeuft(null);
    if (!ok) return toast.error("PDF nicht abgelegt");
    toast.success("Original abgelegt");
    await neuLaden("belege");
  };
  const kategorie = async (id: string | null) => {
    try {
      await kategorieSetzen("ausgang", [beleg.id], kategorien.find((k) => k.id === id) ?? null);
      await fertig();
    } catch (e) {
      toast.error("Kategorie nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    }
  };
  const loeschen = async () => {
    setLaeuft("weg");
    try {
      await altrechnungLoeschen(beleg.id);
      await fertig();
      toast.success("Altrechnung gelöscht");
      navigate("/buchhaltung?reiter=alt", { replace: true });
    } catch (e) {
      toast.error("Nicht gelöscht", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <Seite titel={`Altrechnung ${beleg.nummer ?? ""}`} untertitel="aus dem bisherigen Programm" zurueckPfad="/buchhaltung?reiter=alt"
      aktionen={<Button variant="outline" className="h-11 gap-1.5" onClick={() => setBearbeiten(true)}><Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Bearbeiten</span></Button>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Karte>
            <div className="flex flex-wrap items-start justify-between gap-3 pt-4">
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  {beleg.kunde_id ? <Link to={`/kunden?k=${beleg.kunde_id}`} className="hover:underline">{beleg.empf_name}</Link> : beleg.empf_name}
                </p>
                <p className="text-sm text-muted-foreground">{[beleg.empf_strasse, [beleg.empf_plz, beleg.empf_ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
              </div>
              <StatusPille eintrag={ALT_PILLE} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Nummer</dt><dd className="font-mono">{beleg.nummer}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Datum</dt><dd>{datum(beleg.datum)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Fällig</dt><dd>{beleg.faellig_am ? datum(beleg.faellig_am) : "–"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Netto</dt><dd className="zahl">{euro(Number(beleg.netto))}</dd></div>
              <div><dt className="text-xs text-muted-foreground">USt {Number(beleg.ust_satz)} %</dt><dd className="zahl">{euro(Number(beleg.ust))}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Brutto</dt><dd className="zahl font-semibold">{euro(Number(beleg.brutto))}</dd></div>
            </dl>
            <div className="mt-4 max-w-xs space-y-1">
              <p className="text-xs text-muted-foreground">Kategorie</p>
              <KategorieWahl kategorien={kategorien} wert={beleg.kategorie_id} onChange={(id) => void kategorie(id)} />
            </div>
          </Karte>

          <Karte titel="Original">
            <input ref={pdfFeld} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pdfAblegen(f); e.target.value = ""; }} />
            {originalLaedt ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : original ? (
              <Button variant="outline" className="h-11 gap-1.5" onClick={() => void pdfZeigen()}><FileText className="h-4 w-4" /> PDF ansehen</Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">Kein PDF hinterlegt.</p>
                <Button variant="outline" className="h-11 gap-1.5" disabled={laeuft === "pdf"} onClick={() => pdfFeld.current?.click()}>
                  {laeuft === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} PDF anhängen
                </Button>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Ein abgelegtes Original bleibt, wie es ist. Falsches PDF: Altrechnung löschen und neu erfassen.</p>
          </Karte>

        </div>

        <OpKarte rechnung={beleg} onGeaendert={() => void fertig()} />
      </div>
      <Button variant="ghost" className="h-11 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}>
        <Trash2 className="h-4 w-4" /> Altrechnung löschen
      </Button>

      <AltBearbeiten beleg={beleg} open={bearbeiten} onOpenChange={setBearbeiten} onGespeichert={fertig} />
      <AlertDialog open={loeschFrage} onOpenChange={setLoeschFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Altrechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {beleg.nummer} · {beleg.empf_name} samt Zahlungen, Mahnungen und PDF. Im alten Programm bleibt sie, wie sie ist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void loeschen()} disabled={laeuft === "weg"}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
    </Seite>
  );
}

function AltBearbeiten({ beleg, open, onOpenChange, onGespeichert }: { beleg: Beleg; open: boolean; onOpenChange: (o: boolean) => void; onGespeichert: () => Promise<unknown> }) {
  const { data: kunden = [] } = useKunden();
  const [w, setW] = useState({ nummer: "", datum: "", netto: "", ust_satz: "", brutto: "", faellig_am: "" });
  const [kundeId, setKundeId] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  useBeimOeffnen(open ? beleg.id : null, () => {
    setW({ nummer: beleg.nummer ?? "", datum: beleg.datum, netto: zahlFeld(beleg.netto), ust_satz: zahlFeld(beleg.ust_satz), brutto: zahlFeld(beleg.brutto), faellig_am: beleg.faellig_am ?? "" });
    setKundeId(beleg.kunde_id);
  });
  const kunde = kunden.find((k) => k.id === kundeId);
  const gelesen = altZeileLesen({ ...w, kunde: kunde?.name ?? beleg.empf_name ?? "", bezahlt: "" }, isoTag());
  const setz = (teil: Partial<typeof w>) => setW((a) => ({ ...a, ...teil }));

  const speichern = async () => {
    const r = gelesen.rechnung;
    if (!r) return toast.error(gelesen.fehler ?? "Bitte prüfen");
    setSpeichert(true);
    try {
      await altrechnungAendern(beleg.id, {
        nummer: r.nummer, datum: r.datum, faellig_am: r.faellig_am, netto: r.netto, ust: r.ust, brutto: r.brutto, ust_satz: r.ust_satz,
        kunde_id: kunde?.id ?? null, empf_name: r.kunde, kategorie_id: beleg.kategorie_id,
      }, kunde);
      await onGespeichert();
      toast.success("Altrechnung gespeichert");
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Altrechnung bearbeiten" beschreibung="Netto oder Brutto genügt — das andere rechnet die App." gesperrt={speichert}
      fuss={<>
        <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
        <Button className="h-12 min-w-32" onClick={() => void speichern()} disabled={speichert}>{speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern</Button>
      </>}>
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <Feld id="a-nr" label="Nummer"><Input id="a-nr" className="h-11 font-mono" value={w.nummer} onChange={(e) => setz({ nummer: e.target.value })} /></Feld>
        <Feld id="a-k" label="Kunde"><KundeWahl wert={kundeId} onChange={(k) => setKundeId(k?.id ?? null)} /></Feld>
        <Feld id="a-d" label="Datum"><Input id="a-d" type="date" className="h-11" value={w.datum} onChange={(e) => setz({ datum: e.target.value })} /></Feld>
        <Feld id="a-f" label="Fällig"><Input id="a-f" type="date" className="h-11" value={w.faellig_am} onChange={(e) => setz({ faellig_am: e.target.value })} /></Feld>
        <Feld id="a-n" label="Netto €"><Input id="a-n" className="zahl h-11 text-right" inputMode="decimal" value={w.netto} onChange={(e) => setz({ netto: e.target.value, brutto: "" })} /></Feld>
        <Feld id="a-u" label="USt %"><Input id="a-u" className="zahl h-11 text-right" inputMode="decimal" value={w.ust_satz} onChange={(e) => setz({ ust_satz: e.target.value, brutto: "" })} /></Feld>
        <Feld id="a-b" label="Brutto €" hinweis={gelesen.rechnung ? `USt ${euro(gelesen.rechnung.ust)} · brutto ${euro(gelesen.rechnung.brutto)}` : <span className="text-destructive">{gelesen.fehler}</span>}>
          <Input id="a-b" className="zahl h-11 text-right" inputMode="decimal" value={w.brutto} onChange={(e) => setz({ brutto: e.target.value, netto: "" })} />
        </Feld>
      </div>
    </FormularDialog>
  );
}
