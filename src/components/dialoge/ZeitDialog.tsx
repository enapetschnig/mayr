import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjektWahl } from "@/components/ProjektWahl";
import { SichtbarkeitWahl } from "@/components/Bausteine";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { isoTag, stunden as stundenText, stundenAusVonBis, zahlLesen } from "@/lib/format";
import type { Sichtbarkeit, Zeit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Stunden buchen — so knapp wie möglich.
 *
 * Standard ist "7 Stunden auf Projekt X", ein Tipp auf eine Schnellwahl
 * reicht. Wer es genauer will, schaltet auf Von–Bis um; die App merkt sich
 * die zuletzt benutzte Art.
 */

const SCHNELLWAHL = [2, 4, 6, 7, 8, 8.5, 9, 10];
const MODUS_KEY = "mayr.zeitmodus";

type Modus = "stunden" | "vonbis";

export function ZeitDialog({
  open, onOpenChange, eintrag, projektId: vorProjekt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eintrag?: Zeit | null;
  projektId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { data: projekte = [] } = useProjekte();
  const [projektId, setProjektId] = useState("");
  const [datum, setDatum] = useState(isoTag());
  const [modus, setModus] = useState<Modus>("stunden");
  const [std, setStd] = useState("");
  const [von, setVon] = useState("07:00");
  const [bis, setBis] = useState("16:00");
  const [pause, setPause] = useState("30");
  const [taetigkeit, setTaetigkeit] = useState("");
  const [sicht, setSicht] = useState<Sichtbarkeit>("privat");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gemerkt: Modus = "stunden";
    try { if (localStorage.getItem(MODUS_KEY) === "vonbis") gemerkt = "vonbis"; } catch { /* egal */ }
    if (eintrag) {
      setProjektId(eintrag.projekt_id);
      setDatum(eintrag.datum);
      setModus(eintrag.von && eintrag.bis ? "vonbis" : "stunden");
      setStd(String(eintrag.stunden).replace(".", ","));
      setVon(eintrag.von?.slice(0, 5) || "07:00");
      setBis(eintrag.bis?.slice(0, 5) || "16:00");
      setPause(String(eintrag.pause_minuten ?? 0));
      setTaetigkeit(eintrag.taetigkeit || "");
      setSicht(eintrag.sichtbarkeit as Sichtbarkeit);
    } else {
      setProjektId(vorProjekt || "");
      setDatum(isoTag());
      setModus(gemerkt);
      setStd("");
      setTaetigkeit("");
      setSicht("privat");
    }
  }, [open, eintrag, vorProjekt]);

  const projekt = projekte.find((p) => p.id === projektId);
  const gemeinsam = projekt?.sichtbarkeit === "gemeinsam";
  const ergebnis = modus === "stunden" ? zahlLesen(std) : stundenAusVonBis(von, bis, zahlLesen(pause));

  const modusWechseln = (m: Modus) => {
    setModus(m);
    try { localStorage.setItem(MODUS_KEY, m); } catch { /* egal */ }
  };

  const speichern = async () => {
    if (!projektId) return toast.error("Bitte ein Projekt wählen.");
    if (!(ergebnis > 0 && ergebnis <= 24)) return toast.error("Die Stunden müssen zwischen 0 und 24 liegen.");
    setSpeichert(true);
    const daten = {
      projekt_id: projektId,
      datum,
      stunden: ergebnis,
      von: modus === "vonbis" ? von : null,
      bis: modus === "vonbis" ? bis : null,
      pause_minuten: modus === "vonbis" ? zahlLesen(pause) : 0,
      taetigkeit: taetigkeit.trim() || null,
      sichtbarkeit: gemeinsam ? sicht : "privat",
    };
    const { error } = eintrag
      ? await supabase.from("zeiten").update(daten).eq("id", eintrag.id)
      : await supabase.from("zeiten").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success(`${stundenText(ergebnis)} gebucht`);
    await neuLaden("zeiten");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!eintrag) return;
    setSpeichert(true);
    const { error } = await supabase.from("zeiten").delete().eq("id", eintrag.id);
    setSpeichert(false);
    if (error) return toast.error(error.message);
    toast.success("Eintrag gelöscht");
    await neuLaden("zeiten");
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={eintrag ? "Stunden bearbeiten" : "Stunden erfassen"}
      gesperrt={speichert}
      fuss={
        <>
          {eintrag && !eintrag.rechnung_id && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={loeschen} disabled={speichert}>
              <Trash2 className="h-4 w-4 mr-2" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-40">
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {ergebnis > 0 ? `${stundenText(ergebnis)} speichern` : "Speichern"}
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {eintrag?.rechnung_id && (
          <p className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            Dieser Eintrag ist schon in einer Rechnung verrechnet.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="z-projekt">Projekt</Label>
          <ProjektWahl id="z-projekt" wert={projektId} onChange={(id) => setProjektId(id)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="z-datum">Datum</Label>
          <Input id="z-datum" type="date" className="h-11" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>

        <div className="space-y-3">
          <div className="flex rounded-lg border overflow-hidden w-fit">
            {(["stunden", "vonbis"] as Modus[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => modusWechseln(m)}
                className={cn("px-4 py-2 text-sm font-medium transition-colors",
                  m === "vonbis" && "border-l",
                  modus === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
              >
                {m === "stunden" ? "Stunden" : "Von – Bis"}
              </button>
            ))}
          </div>

          {modus === "stunden" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {SCHNELLWAHL.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={zahlLesen(std) === h ? "default" : "outline"}
                    className="h-12 text-base"
                    onClick={() => setStd(String(h).replace(".", ","))}
                  >
                    {String(h).replace(".", ",")} h
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  className="h-11 text-lg max-w-32"
                  placeholder="z. B. 7,5"
                  value={std}
                  onChange={(e) => setStd(e.target.value)}
                  aria-label="Stunden"
                />
                <span className="text-muted-foreground">Stunden</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="z-von" className="text-xs">Von</Label>
                <Input id="z-von" type="time" className="h-11" value={von} onChange={(e) => setVon(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="z-bis" className="text-xs">Bis</Label>
                <Input id="z-bis" type="time" className="h-11" value={bis} onChange={(e) => setBis(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="z-pause" className="text-xs">Pause (Min.)</Label>
                <Input id="z-pause" inputMode="numeric" className="h-11" value={pause} onChange={(e) => setPause(e.target.value)} />
              </div>
              <p className="col-span-3 text-sm text-muted-foreground">
                Ergibt <strong className="text-foreground">{stundenText(ergebnis)}</strong>
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="z-taetigkeit">Was wurde gemacht? <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="z-taetigkeit" rows={2} value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)}
            placeholder="z. B. Verteiler gesetzt, Leitungen eingezogen" />
        </div>

        {gemeinsam && (
          <div className="space-y-2">
            <Label>Wer sieht diese Stunden?</Label>
            <SichtbarkeitWahl wert={sicht} onChange={setSicht}
              hinweisGemeinsam="Die Partner im Projekt sehen sie" />
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
