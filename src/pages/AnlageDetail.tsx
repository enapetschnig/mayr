import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, ClipboardCheck, Loader2, Pencil, QrCode, Receipt, ShieldCheck } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { telLink } from "@/components/stamm/KundeDetail";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import { AnlageDialog } from "@/components/anlagen/AnlageDialog";
import {
  anlageAdresse, anlageText, pruefungAnlegen, rechnungAusPruefungen, useAnlage, usePruefungen,
} from "@/components/anlagen/anlagenDaten";
import { BESICHTIGUNG, ERGEBNIS, PRUEF_ART, faelligkeit, type AnlagenArt, type PruefArt } from "@/components/anlagen/pruefLogik";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { Button } from "@/components/ui/button";
import { useIstPc } from "@/components/AppLayout";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, isoTag } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { anlagenEtikett } from "@/lib/pruefPdf";
import { REGIE_STATUS } from "@/lib/types";
import { mitPvDaten, PvDetails } from "@/components/kontakte/AnlagePv";

const INTERVALL_TEXT = (m: number | null) =>
  !m ? "keine wiederkehrende Prüfung" : m % 12 === 0 ? (m === 12 ? "jährlich" : `alle ${m / 12} Jahre`) : `alle ${m} Monate`;

/**
 * /anlagen/:id — eine Anlage: wann sie dran ist, alle Prüfprotokolle,
 * „Prüfung starten“, QR-Aufkleber und (Chef) Rechnung aus den
 * unterschriebenen, noch nicht verrechneten Protokollen.
 */
export default function AnlageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pc = useIstPc();
  const heute = isoTag();
  const { firma, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: anlage, isLoading } = useAnlage(id);
  const { data: pruefungen = [] } = usePruefungen(id);
  const { data: kunden = [] } = useKunden();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);

  if (isLoading) {
    return <Seite titel="Anlage"><p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p></Seite>;
  }
  if (!anlage) {
    return (
      <Seite titel="Anlage" zurueckPfad="/anlagen">
        <Leer icon={ShieldCheck} text="Diese Anlage gibt es nicht (mehr).">
          <Button asChild className="h-11"><Link to="/anlagen">Zu den Anlagen</Link></Button>
        </Leer>
      </Seite>
    );
  }

  const fa = faelligkeit(anlage.aktiv ? anlage.naechste_pruefung : null, heute);
  const offenerEntwurf = pruefungen.find((p) => p.status === "entwurf");
  const zuVerrechnen = pruefungen.filter((p) => p.status === "unterschrieben" && !p.rechnung_id);

  const starten = async () => {
    if (offenerEntwurf) return navigate(`/pruefungen/${offenerEntwurf.id}`);
    setLaeuft("start");
    try {
      const art: PruefArt = pruefungen.length ? "wiederkehrend" : "erst";
      const punkte = BESICHTIGUNG[anlage.art as AnlagenArt] ?? BESICHTIGUNG.sonstige;
      const neu = await pruefungAnlegen(anlage.id, art, punkte.map((punkt) => ({ punkt, ok: null })), heute);
      await neuLaden("anlagen");
      navigate(`/pruefungen/${neu}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  const etikett = async () => {
    if (!firma) return toast.error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    setLaeuft("etikett");
    try {
      const d = await anlagenEtikett(anlage, firma, `${window.location.origin}/anlagen/${anlage.id}`);
      if (pc) setVorschau(d);
      else await pdfTeilenOderLaden(d.blob, d.dateiname);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  const verrechnen = async () => {
    setLaeuft("rechnung");
    try {
      const kunde = kunden.find((k) => k.id === anlage.kunde_id) ?? null;
      const { id: rechnungId, konflikte } = await rechnungAusPruefungen(
        zuVerrechnen.map((p) => ({ ...p, anlage })), kunde, firma, heute,
      );
      await neuLaden("anlagen", "belege");
      if (konflikte) toast.warning("Ein Prüfprotokoll steckt schon in einer anderen Rechnung — bitte prüfen.");
      else toast.success(Number(anlage.preis ?? 0) > 0 ? "Rechnungsentwurf angelegt — prüfen und fertigstellen." : "Rechnungsentwurf angelegt — Preis eintragen, dann fertigstellen.");
      navigate(`/belege/${rechnungId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <Seite
      titel={anlage.bezeichnung}
      untertitel={[anlage.kunden?.name, `A${anlage.nummer}`].filter(Boolean).join(" · ")}
      zurueckPfad="/anlagen"
      aktionen={(
        <>
          <Button variant="outline" className="h-11 px-3" onClick={() => void etikett()} disabled={!!laeuft} aria-label="QR-Aufkleber">
            {laeuft === "etikett" ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            <span className="hidden sm:inline">Aufkleber</span>
          </Button>
          <Button variant="outline" className="h-11 px-3" onClick={() => setBearbeiten(true)} aria-label="Anlage bearbeiten">
            <Pencil className="h-4 w-4" />
          </Button>
        </>
      )}
    >
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {anlage.aktiv ? <StatusPille eintrag={fa.eintrag} /> : <StatusPille eintrag={{ ton: "grau", text: "Wird nicht mehr geprüft" }} />}
          <p className="text-sm text-muted-foreground">
            {anlage.aktiv && anlage.naechste_pruefung ? `Nächste Prüfung am ${datum(anlage.naechste_pruefung)}` : anlage.aktiv ? "Noch kein Termin" : ""}
            {anlage.letzte_pruefung ? ` · zuletzt ${datum(anlage.letzte_pruefung)}` : ""}
          </p>
        </div>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
          <Button className="h-12 text-base sm:h-11 sm:text-sm" onClick={() => void starten()} disabled={!!laeuft}>
            {laeuft === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {offenerEntwurf ? "Angefangene Prüfung weitermachen" : "Prüfung starten"}
          </Button>
          {istChef && zuVerrechnen.length > 0 && (
            <Button variant="outline" className="h-11" onClick={() => void verrechnen()} disabled={!!laeuft}>
              {laeuft === "rechnung" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              Rechnung erstellen{zuVerrechnen.length > 1 ? ` (${zuVerrechnen.length} Prüfungen)` : ""}
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Karte titel="Anlage">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Kunde</dt>
            <dd className="min-w-0">
              {anlage.kunden ? <Link to={`/kunden?k=${anlage.kunden.id}`} className="-my-2.5 inline-flex min-h-11 items-center font-medium text-primary hover:underline">{anlage.kunden.name}</Link> : "–"}
              {telLink(anlage.kunden?.telefon) && <a href={telLink(anlage.kunden?.telefon)!} className="-mb-2.5 flex min-h-11 items-center text-primary">{anlage.kunden!.telefon}</a>}
            </dd>
            <dt className="text-muted-foreground">Art</dt><dd>{anlageText(anlage)}</dd>
            {anlageAdresse(anlage) && (<><dt className="text-muted-foreground">Adresse</dt><dd className="min-w-0">{anlageAdresse(anlage)}</dd></>)}
            {(anlage.hersteller || anlage.typ || anlage.baujahr) && (
              <><dt className="text-muted-foreground">Gerät</dt><dd>{[anlage.hersteller, anlage.typ, anlage.baujahr ? `Baujahr ${anlage.baujahr}` : null].filter(Boolean).join(" · ")}</dd></>
            )}
            <dt className="text-muted-foreground">Prüfen</dt><dd>{INTERVALL_TEXT(anlage.intervall_monate)}</dd>
            {istChef && anlage.preis != null && (<><dt className="text-muted-foreground">Preis</dt><dd className="zahl">{euro(Number(anlage.preis))} netto je Prüfung</dd></>)}
            {anlage.notiz && (<><dt className="text-muted-foreground">Notiz</dt><dd className="whitespace-pre-wrap">{anlage.notiz}</dd></>)}
          </dl>
        </Karte>

        {mitPvDaten(anlage) && <Karte titel="PV-Anlage"><PvDetails anlage={anlage} /></Karte>}

        <Karte titel="Prüfprotokolle" ohnePolster>
          {pruefungen.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Noch nie geprüft.</p>
          ) : (
            <ul className="divide-y">
              {pruefungen.map((p) => (
                <li key={p.id}>
                  <Link to={`/pruefungen/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted/50 lg:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nummer} · {datum(p.datum)}</p>
                      <p className="truncate text-xs text-muted-foreground">{PRUEF_ART[p.art as PruefArt] ?? p.art}{p.rechnung_id ? " · verrechnet" : ""}</p>
                    </div>
                    {p.status === "entwurf"
                      ? <StatusPille eintrag={REGIE_STATUS.entwurf} />
                      : p.ergebnis && <StatusPille eintrag={ERGEBNIS[p.ergebnis]} />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Karte>
      </div>

      <AnlageDialog open={bearbeiten} onOpenChange={setBearbeiten} anlage={anlage} onGeloescht={() => navigate("/anlagen", { replace: true })} />
      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
    </Seite>
  );
}
