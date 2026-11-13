import { useState } from "react";
import { toast } from "sonner";
import { AlarmClock, Landmark, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPille } from "@/components/Bausteine";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, euro, isoTag } from "@/lib/format";
import { FOERDER_STELLEN, foerderFrist, fristText, istFoerderStatus } from "@/lib/foerderung";
import { runden2 } from "@/lib/preise";
import { FOERDER_STATUS, TON_KLASSE, type FoerderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Werte = { status: FoerderStatus | null; stelle: string; betrag: string; datum: string; frist: string; notiz: string };

const werteAus = (p: ProjektMitKunde): Werte => ({
  status: istFoerderStatus(p.foerder_status) ? p.foerder_status : null,
  stelle: p.foerder_stelle ?? "",
  betrag: p.foerder_betrag != null ? String(p.foerder_betrag).replace(".", ",") : "",
  datum: p.foerder_datum ?? "",
  frist: p.foerder_frist ?? "",
  notiz: p.foerder_notiz ?? "",
});

/**
 * Förderstatus des Projekts: Schritt, Förderstelle, Betrag, Datum, Frist,
 * Notiz. Jeder geänderte Schritt landet per Trigger im Projekt-Verlauf.
 */
export function FoerderDialog({ open, onOpenChange, projekt }: { open: boolean; onOpenChange: (o: boolean) => void; projekt: ProjektMitKunde }) {
  const neuLaden = useNeuLaden();
  const [w, setW] = useState<Werte>(werteAus(projekt));
  const [speichert, setSpeichert] = useState(false);
  const setze = (t: Partial<Werte>) => setW((x) => ({ ...x, ...t }));
  useBeimOeffnen(open ? projekt.id : null, () => setW(werteAus(projekt)));

  const statusWaehlen = (s: FoerderStatus) =>
    // neuer Schritt = heute, Datum bleibt änderbar
    setze({ status: s, datum: s !== w.status ? isoTag() : w.datum });

  const speichern = async () => {
    const betrag = w.betrag.trim() ? dezimalLesen(w.betrag) : null;
    if (w.betrag.trim() && (betrag === null || betrag < 0)) return toast.error(`Betrag: „${w.betrag.trim()}“ ist kein Betrag.`);
    setSpeichert(true);
    const { error } = await supabase.from("projekte").update({
      foerder_status: w.status,
      foerder_stelle: w.stelle.trim() || null,
      foerder_betrag: betrag === null ? null : runden2(betrag),
      foerder_datum: w.datum || null,
      foerder_frist: w.frist || null,
      foerder_notiz: w.notiz.trim() || null,
    }).eq("id", projekt.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success("Förderung gespeichert");
    await neuLaden("projekte", "projekt_verlauf");
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Förderung" beschreibung={`${projekt.nummer} · ${projekt.name}`} gesperrt={speichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="gap-2">{speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern</Button>
        </>
      }>
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label>Stand</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(FOERDER_STATUS) as FoerderStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => statusWaehlen(s)} aria-pressed={w.status === s}
                className={cn("min-h-11 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                  w.status === s ? cn(TON_KLASSE[FOERDER_STATUS[s].ton], "border-transparent ring-2 ring-primary") : "bg-card hover:border-primary/50")}>
                {FOERDER_STATUS[s].text}
              </button>
            ))}
          </div>
          {w.status && <button type="button" className="min-h-11 text-sm text-muted-foreground hover:underline" onClick={() => setze({ status: null })}>Nicht erfasst (leeren)</button>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-stelle">Förderstelle</Label>
          <Input id="fo-stelle" className="h-12" list="fo-stellen" value={w.stelle} onChange={(e) => setze({ stelle: e.target.value })} placeholder="z. B. OeMAG (EAG-Investitionszuschuss)" />
          <datalist id="fo-stellen">{FOERDER_STELLEN.map((s) => <option key={s} value={s} />)}</datalist>
          <div className="flex flex-wrap gap-1.5">
            {FOERDER_STELLEN.map((s) => (
              <button key={s} type="button" onClick={() => setze({ stelle: s })} className="min-h-9 rounded-full border px-3 text-xs hover:border-primary/50">{s}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="fo-betrag">Betrag €</Label>
            <Input id="fo-betrag" className="h-12" inputMode="decimal" value={w.betrag} onChange={(e) => setze({ betrag: e.target.value })} placeholder="beantragt bzw. zugesagt" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fo-datum">Datum des Schritts</Label>
            <Input id="fo-datum" className="h-12" type="date" value={w.datum} onChange={(e) => setze({ datum: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fo-frist">Frist</Label>
            <Input id="fo-frist" className="h-12" type="date" value={w.frist} onChange={(e) => setze({ frist: e.target.value })} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Frist = bis wann der nächste Schritt fällig ist, z. B. die Fertigstellungsmeldung laut Zusage. 30 Tage vorher steht sie auf der Startseite.</p>
        <div className="space-y-2">
          <Label htmlFor="fo-notiz">Notiz</Label>
          <Textarea id="fo-notiz" rows={3} value={w.notiz} onChange={(e) => setze({ notiz: e.target.value })} placeholder="z. B. Antragsnummer, Ansprechpartner, fehlende Unterlagen" />
        </div>
      </div>
    </FormularDialog>
  );
}

/** Karte in der Projektübersicht — nur wenn erfasst; sonst ein schlichter Knopf */
export function FoerderKarte({ projekt }: { projekt: ProjektMitKunde }) {
  const [offen, setOffen] = useState(false);
  const { istChef } = useSitzung();
  const status = istFoerderStatus(projekt.foerder_status) ? projekt.foerder_status : null;
  const frist = foerderFrist(projekt, isoTag());

  return (
    <>
      {status ? (
        <section className="rounded-lg border bg-card p-4" aria-label="Förderung">
          <div className="flex flex-wrap items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">Förderung</h2>
            <StatusPille eintrag={FOERDER_STATUS[status]} />
            <Button variant="ghost" size="sm" className="ml-auto h-11 gap-1.5 text-primary" onClick={() => setOffen(true)}><Pencil className="h-4 w-4" /> Ändern</Button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {projekt.foerder_stelle && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Förderstelle</dt><dd className="font-medium">{projekt.foerder_stelle}</dd></div>}
            {projekt.foerder_betrag != null && <div><dt className="text-xs text-muted-foreground">Betrag</dt><dd className="zahl font-medium">{euro(Number(projekt.foerder_betrag))}</dd></div>}
            {projekt.foerder_datum && <div><dt className="text-xs text-muted-foreground">Seit</dt><dd>{datum(projekt.foerder_datum)}</dd></div>}
          </dl>
          {projekt.foerder_frist && (
            <p className={cn("mt-2 flex items-center gap-1.5 text-sm", frist?.ueberfaellig ? "font-semibold text-destructive" : frist ? "font-medium" : "text-muted-foreground")}>
              <AlarmClock className="h-4 w-4" /> Frist {datum(projekt.foerder_frist)}{frist && ` — ${fristText(frist.inTagen)}`}
            </p>
          )}
          {projekt.foerder_notiz && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{projekt.foerder_notiz}</p>}
        </section>
      ) : null}
      <FoerderDialog open={offen} onOpenChange={setOffen} projekt={projekt} />
      {/* Erfassen ist Büroarbeit — der Monteur sieht nur eine erfasste Förderung (ändern geht im Projekt-Menü) */}
      {!status && istChef && <FoerderErfassen oeffnen={() => setOffen(true)} />}
    </>
  );
}

/** Ohne erfasste Förderung: kleiner Link statt einer leeren Karte */
function FoerderErfassen({ oeffnen }: { oeffnen: () => void }) {
  return (
    <button type="button" onClick={oeffnen} className="flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
      <Landmark className="h-4 w-4" /> Förderung erfassen
    </button>
  );
}
