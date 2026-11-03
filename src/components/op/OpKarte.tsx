import { useState } from "react";
import { toast } from "sonner";
import { BellRing, FileText, Loader2, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIstPc } from "@/components/AppLayout";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, isoTag, tageDazu } from "@/lib/format";
import { mahnGesamt } from "@/lib/mahnPdf";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import type { Beleg } from "@/lib/types";
import { cn } from "@/lib/utils";
import { mahnungPdf } from "./mahnen";
import { mahnungAnlegen, mahnungLoeschen, useBelegOp, zahlungLoeschen, type Mahnung, type Zahlung } from "./opDaten";
import { mahnFristAbgelaufen, mahnVorschlag, offenBetrag, STUFE_TEXT, ZAHLUNG_ART, type MahnVorschlag, type Stufe, type ZahlungArt } from "./opLogik";
import { PdfVorschau, type PdfDatei } from "./PdfVorschau";
import { ZahlungDialog } from "./ZahlungDialog";

type Rechnung = Pick<
  Beleg,
  | "id" | "nummer" | "status" | "datum" | "faellig_am" | "brutto"
  | "empf_name" | "empf_zusatz" | "empf_strasse" | "empf_plz" | "empf_ort" | "empf_uid"
>;

/**
 * In der fertigen Rechnung: was bezahlt ist, was offen ist, Zahlungen
 * erfassen und löschen, mahnen (Erinnerung → 1. Mahnung → letzte Mahnung)
 * und jede Mahnung wieder als PDF. Nur für den Chef (RLS).
 */
export function OpKarte({ rechnung, onGeaendert }: { rechnung: Rechnung; onGeaendert?: () => void }) {
  const pc = useIstPc();
  const heute = isoTag();
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data, isLoading } = useBelegOp(rechnung.id);
  const [zahlungOffen, setZahlungOffen] = useState(false);
  const [mahnFrage, setMahnFrage] = useState<MahnVorschlag | null>(null);
  const [weg, setWeg] = useState<{ art: "zahlung"; z: Zahlung } | { art: "mahnung"; m: Mahnung } | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);

  const zahlungen = data?.zahlungen ?? [];
  const mahnungen = data?.mahnungen ?? [];
  if (isLoading) return null;
  // Stornierte Rechnungen nur zeigen, wenn schon Geld da war (das muss zurück oder auf die Korrektur)
  if (rechnung.status === "storniert" && !zahlungen.length) return null;
  if (rechnung.status !== "offen" && rechnung.status !== "bezahlt" && rechnung.status !== "storniert") return null;

  const brutto = Number(rechnung.brutto);
  const bezahlt = zahlungen.reduce((s, z) => s + Number(z.betrag), 0);
  const offen = offenBetrag(brutto, zahlungen);
  const moeglich = firma ? mahnVorschlag(rechnung, zahlungen, mahnungen, firma, heute) : null;
  // Die nächste Stufe erst, wenn die Frist der letzten Mahnung vorbei ist
  const vorschlag = moeglich && mahnFristAbgelaufen(mahnungen, heute) ? moeglich : null;
  const hoechste = mahnungen.reduce((m, x) => Math.max(m, x.stufe), 0);
  const laufendeFrist = moeglich && !vorschlag ? mahnungen.find((m) => m.stufe === hoechste)?.frist_bis : null;

  const fertig = async () => {
    await neuLaden("op", "belege");
    onGeaendert?.();
  };

  const zeigen = async (d: PdfDatei) => {
    if (pc) setVorschau(d);
    else await pdfTeilenOderLaden(d.blob, d.dateiname);
  };

  const pdfVon = async (m: Mahnung) => {
    if (!firma) return toast.error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    setLaeuft(`pdf-${m.id}`);
    try {
      await zeigen(await mahnungPdf(firma, rechnung, zahlungen, m));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  const mahnen = async () => {
    if (!mahnFrage || !firma) return;
    setLaeuft("mahnen");
    try {
      const m = await mahnungAnlegen(rechnung.id, mahnFrage, heute);
      setMahnFrage(null);
      await neuLaden("op");
      toast.success(`${STUFE_TEXT[m.stufe as Stufe]} erstellt — jetzt dem Kunden schicken`);
      await zeigen(await mahnungPdf(firma, rechnung, zahlungen, m));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  const loeschen = async () => {
    if (!weg) return;
    setLaeuft("weg");
    try {
      if (weg.art === "zahlung") await zahlungLoeschen(weg.z.id);
      else await mahnungLoeschen(weg.m.id);
      setWeg(null);
      await fertig();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4 lg:p-5" aria-label="Zahlungen und Mahnungen">
      <h2 className="text-[0.9375rem] font-semibold">Zahlungen</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div><p className="text-xs text-muted-foreground">Rechnung</p><p className="zahl font-medium">{euro(brutto)}</p></div>
        <div><p className="text-xs text-muted-foreground">Bezahlt</p><p className="zahl font-medium">{euro(bezahlt)}</p></div>
        <div>
          <p className="text-xs text-muted-foreground">Offen</p>
          <p className={cn("zahl font-semibold", offen > 0 && rechnung.status === "offen" ? "text-foreground" : "text-muted-foreground")}>{euro(offen)}</p>
        </div>
      </div>

      {zahlungen.length > 0 && (
        <ul className="mt-3 divide-y rounded-md border">
          {zahlungen.map((z) => (
            <li key={z.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{datum(z.datum)} · {ZAHLUNG_ART[z.art as ZahlungArt] ?? z.art}</p>
                {z.notiz && <p className="truncate text-xs text-muted-foreground">{z.notiz}</p>}
              </div>
              <span className="zahl shrink-0 font-medium">{euro(Number(z.betrag))}</span>
              {rechnung.status !== "storniert" && (
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Zahlung löschen" onClick={() => setWeg({ art: "zahlung", z })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {mahnungen.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Mahnungen</h3>
          <ul className="mt-2 divide-y rounded-md border">
            {mahnungen.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{STUFE_TEXT[m.stufe as Stufe]}</p>
                  <p className="text-xs text-muted-foreground">{datum(m.datum)} · Frist {datum(m.frist_bis)}{m.frist_bis < heute && rechnung.status === "offen" ? " (vorbei)" : ""}</p>
                </div>
                <span className="zahl shrink-0">{euro(mahnGesamt({ offen: Number(m.offen), spesen: Number(m.spesen), zinsen: Number(m.zinsen) }))}</span>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="PDF der Mahnung" onClick={() => void pdfVon(m)} disabled={!!laeuft}>
                  {laeuft === `pdf-${m.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </Button>
                {m.stufe === hoechste && rechnung.status === "offen" && (
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Mahnung zurücknehmen" onClick={() => setWeg({ art: "mahnung", m })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {rechnung.status === "offen" && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button className="h-11 gap-1.5" onClick={() => setZahlungOffen(true)} disabled={!!laeuft || offen <= 0}>
            <Wallet className="h-4 w-4" /> Zahlung erfassen
          </Button>
          {vorschlag && (
            <Button variant="outline" className="h-11 gap-1.5" onClick={() => setMahnFrage(vorschlag)} disabled={!!laeuft}>
              <BellRing className="h-4 w-4" /> {STUFE_TEXT[vorschlag.stufe]}
            </Button>
          )}
        </div>
      )}
      {rechnung.status === "offen" && laufendeFrist && moeglich && (
        <p className="mt-2 text-xs text-muted-foreground">{STUFE_TEXT[moeglich.stufe]} ab {datum(tageDazu(laufendeFrist, 1))}, wenn bis dahin nichts kommt.</p>
      )}
      {rechnung.status === "offen" && !moeglich && hoechste >= 3 && (
        <p className="mt-2 text-xs text-muted-foreground">Die letzte Mahnung ist draußen. Weiter geht es mit Inkasso oder Anwalt.</p>
      )}

      <ZahlungDialog belegId={rechnung.id} nummer={rechnung.nummer} offen={offen} open={zahlungOffen}
        onOpenChange={setZahlungOffen} onGespeichert={() => onGeaendert?.()} />

      <AlertDialog open={!!mahnFrage} onOpenChange={(o) => { if (!o && laeuft !== "mahnen") setMahnFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mahnFrage ? STUFE_TEXT[mahnFrage.stufe] : ""} erstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              {mahnFrage && `Seit ${mahnFrage.tage} ${mahnFrage.tage === 1 ? "Tag" : "Tagen"} überfällig. Neue Frist: ${datum(mahnFrage.frist_bis)}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mahnFrage && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt>Offen</dt><dd className="zahl text-right">{euro(mahnFrage.offen)}</dd>
              {mahnFrage.zinsen > 0 && <><dt>Verzugszinsen</dt><dd className="zahl text-right">{euro(mahnFrage.zinsen)}</dd></>}
              {mahnFrage.spesen > 0 && <><dt>Mahnspesen</dt><dd className="zahl text-right">{euro(mahnFrage.spesen)}</dd></>}
              <dt className="font-semibold">Zu zahlen</dt><dd className="zahl text-right font-semibold">{euro(mahnGesamt(mahnFrage))}</dd>
            </dl>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={laeuft === "mahnen"}>Abbrechen</AlertDialogCancel>
            <Button className="h-11" onClick={() => void mahnen()} disabled={laeuft === "mahnen"}>
              {laeuft === "mahnen" && <Loader2 className="h-4 w-4 animate-spin" />} Erstellen und PDF
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!weg} onOpenChange={(o) => { if (!o) setWeg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{weg?.art === "zahlung" ? "Zahlung löschen?" : "Mahnung zurücknehmen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {weg?.art === "zahlung"
                ? `${euro(Number(weg.z.betrag))} vom ${datum(weg.z.datum)} — die Rechnung ist danach wieder um diesen Betrag offen.`
                : weg ? `${STUFE_TEXT[weg.m.stufe as Stufe]} vom ${datum(weg.m.datum)} — nur, wenn sie nicht verschickt wurde.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void loeschen()} disabled={laeuft === "weg"}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
    </section>
  );
}
