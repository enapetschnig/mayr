import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { useNeuLaden } from "@/hooks/useDaten";
import { dezimalLesen, euro, isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { zahlungErfassen } from "./opDaten";
import { ZAHLUNG_ART, type ZahlungArt } from "./opLogik";

const ARTEN: { wert: ZahlungArt; text: string; hilfe: string }[] = [
  { wert: "zahlung", text: "Zahlung", hilfe: "Geld ist eingegangen" },
  { wert: "skonto", text: "Skonto", hilfe: "Abzug akzeptiert" },
  { wert: "ausbuchung", text: "Ausbuchen", hilfe: "Kommt nicht mehr (Kulanz, uneinbringlich)" },
];

/**
 * Zahlung zu einer Rechnung erfassen. Vorbelegt mit dem offenen Rest und
 * heute — der häufigste Fall ist ein Tipp auf „Speichern“. Mehr als offen
 * ist, geht nicht (eine Überzahlung wäre eine Gutschrift).
 */
export function ZahlungDialog({
  belegId, nummer, offen, open, onOpenChange, onGespeichert,
}: {
  belegId: string;
  nummer: string | null;
  offen: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGespeichert?: () => void;
}) {
  const heute = isoTag();
  const neuLaden = useNeuLaden();
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(heute);
  const [art, setArt] = useState<ZahlungArt>("zahlung");
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useBeimOeffnen(open ? belegId : null, () => {
    setBetrag(zahlFeld(offen));
    setDatum(heute);
    setArt("zahlung");
    setNotiz("");
  });

  const wert = dezimalLesen(betrag);
  const fehler = wert === null ? "Betrag fehlt"
    : wert <= 0 ? "Betrag muss über 0 € liegen"
      : wert > offen + 0.005 ? `Offen sind nur ${euro(offen)} — eine Überzahlung bitte als Gutschrift`
        : !datum ? "Datum fehlt" : datum > heute ? "Das Datum liegt in der Zukunft" : null;

  const speichern = async () => {
    if (fehler || wert === null || speichert) return;
    setSpeichert(true);
    try {
      await zahlungErfassen({ beleg_id: belegId, datum, betrag: wert, art, notiz: leerNull(notiz) });
      await neuLaden("op", "belege");
      const rest = Math.round((offen - wert) * 100) / 100;
      toast.success(rest <= 0 ? `${nummer ?? "Rechnung"} ist bezahlt` : `${ZAHLUNG_ART[art]} gespeichert — offen noch ${euro(rest)}`);
      onOpenChange(false);
      onGespeichert?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Zahlung erfassen"
      beschreibung={`${nummer ?? "Rechnung"} · offen ${euro(offen)}`}
      gesperrt={speichert}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-40" onClick={speichern} disabled={!!fehler || speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      )}
    >
      <div className="grid max-w-xl gap-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Art">
          {ARTEN.map((a) => (
            <button key={a.wert} type="button" role="radio" aria-checked={art === a.wert} onClick={() => setArt(a.wert)}
              className={cn("min-h-14 rounded-lg border px-2 py-2 text-left text-sm transition-colors",
                art === a.wert ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
              <span className="block font-medium">{a.text}</span>
              <span className="block text-[11px] leading-tight text-muted-foreground">{a.hilfe}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Feld id="z-betrag" label="Betrag €" hinweis={fehler && betrag ? <span className="text-destructive">{fehler}</span> : null}>
            <Input id="z-betrag" className="h-12 text-right text-base" inputMode="decimal" value={betrag}
              onChange={(e) => setBetrag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void speichern(); }} />
          </Feld>
          <Feld id="z-datum" label="Datum">
            <Input id="z-datum" type="date" className="h-12 text-base" value={datum} max={heute} onChange={(e) => setDatum(e.target.value)} />
          </Feld>
        </div>
        <Feld id="z-notiz" label={<>Notiz<Zusatz>(optional)</Zusatz></>}>
          <Textarea id="z-notiz" rows={2} className="text-base" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Teilzahlung laut Vereinbarung" />
        </Feld>
      </div>
    </FormularDialog>
  );
}
