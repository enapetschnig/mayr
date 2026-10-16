import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileUp, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Serienaufnahme } from "@/components/Serienaufnahme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjektWahl } from "@/components/ProjektWahl";
import { SichtbarkeitWahl } from "@/components/Bausteine";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { dateienHochladen } from "@/lib/upload";
import type { Sichtbarkeit } from "@/lib/types";

/**
 * Fotos (und Dokumente) zu einem Projekt — vorbild ist "+ Foto" der
 * Schrettl-App: ein Knopf, Projekt wählen, Bilder rein, fertig.
 *
 * Auf einem gemeinsamen Projekt sind Fotos standardmäßig für alle sichtbar
 * — das ist der Sinn der Sache. Wer etwas nur für sich ablegen will
 * (z. B. einen Lieferschein mit Einkaufspreisen), stellt auf "Nur ich".
 */
export function FotoDialog({
  open, onOpenChange, projektId: vorProjekt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projektId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { data: projekte = [] } = useProjekte();
  const [projektId, setProjektId] = useState("");
  const [dateien, setDateien] = useState<File[]>([]);
  const [vorschauen, setVorschauen] = useState<string[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [sicht, setSicht] = useState<Sichtbarkeit>("gemeinsam");
  const [laedt, setLaedt] = useState(false);
  const [serieOffen, setSerieOffen] = useState(false);
  const galerie = useRef<HTMLInputElement>(null);
  const dokumente = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setProjektId(vorProjekt || "");
    setDateien([]);
    setBeschreibung("");
    setSicht("gemeinsam");
  }, [open, vorProjekt]);

  useEffect(() => {
    const neu = dateien.map((d) => (d.type.startsWith("image/") ? URL.createObjectURL(d) : ""));
    setVorschauen(neu);
    return () => neu.forEach((u) => u && URL.revokeObjectURL(u));
  }, [dateien]);

  const gemeinsam = projekte.find((p) => p.id === projektId)?.sichtbarkeit === "gemeinsam";
  const dazu = (liste: FileList | File[] | null) => {
    if (!liste || !liste.length) return;
    // Sofort kopieren: Eine FileList ist "lebendig" — wird das Feld danach
    // geleert, wäre sie leer, bevor React den Zustand übernimmt.
    const neu = Array.from(liste);
    setDateien((v) => [...v, ...neu].slice(0, 50));
  };

  const hochladen = async () => {
    if (!projektId || dateien.length === 0) return;
    setLaedt(true);
    const erg = await dateienHochladen(projektId, dateien, gemeinsam ? sicht : "privat", beschreibung.trim());
    setLaedt(false);
    if (erg.ok > 0) {
      toast.success(`${erg.ok} ${erg.ok === 1 ? "Datei" : "Dateien"} abgelegt`);
      await neuLaden("dateien");
    }
    if (erg.fehler.length) {
      toast.error(`${erg.fehler.length} nicht hochgeladen`, { description: erg.fehler.join("\n") });
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <FormularDialog
        open={open && !serieOffen}
        onOpenChange={onOpenChange}
        titel="Foto zum Projekt"
        beschreibung="Landet direkt im Projekt unter Fotos & Dateien."
        gesperrt={laedt}
        fuss={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laedt}>Abbrechen</Button>
            <Button onClick={hochladen} disabled={laedt || !projektId || dateien.length === 0} className="gap-2">
              {laedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {laedt ? "Lädt hoch…"
                : !projektId ? "Zuerst Projekt wählen"
                : dateien.length === 0 ? "Zuerst Fotos wählen"
                : `${dateien.length} ${dateien.length === 1 ? "Datei" : "Dateien"} ablegen`}
            </Button>
          </>
        }
      >
        <div className="max-w-xl space-y-5">
          <div className="space-y-2">
            <Label htmlFor="f-projekt">Zu welchem Projekt?</Label>
            <ProjektWahl id="f-projekt" wert={projektId} onChange={(id) => setProjektId(id)} />
          </div>

          <div className="space-y-2">
            <Label>Aufnehmen oder auswählen</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setSerieOffen(true)}>
                <Camera className="h-5 w-5" /><span>Fotos machen</span>
              </Button>
              <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => galerie.current?.click()}>
                <ImagePlus className="h-5 w-5" /><span>Aus Galerie</span>
              </Button>
              <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => dokumente.current?.click()}>
                <FileUp className="h-5 w-5" /><span>Dokument</span>
              </Button>
            </div>
            <input ref={galerie} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
            <input ref={dokumente} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg,.dxf,image/*"
              onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
          </div>

          {dateien.length > 0 && (
            <div className="space-y-2">
              <Label>{dateien.length} ausgewählt</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {dateien.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="relative">
                    {vorschauen[i]
                      ? <img src={vorschauen[i]} alt={d.name} className="h-24 w-full rounded-md border object-cover" />
                      : <div className="h-24 w-full rounded-md border bg-muted flex items-center justify-center p-2 text-xs text-center break-all">{d.name}</div>}
                    <button type="button" onClick={() => setDateien((v) => v.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow" aria-label={`${d.name} entfernen`}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="f-beschr">Notiz <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="f-beschr" className="h-11" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="z. B. Verteiler EG vor dem Verschließen" />
          </div>

          {gemeinsam && (
            <div className="space-y-2">
              <Label>Wer sieht die Fotos?</Label>
              <SichtbarkeitWahl wert={sicht} onChange={setSicht} hinweisGemeinsam="Alle Partner im Projekt" />
            </div>
          )}
        </div>
      </FormularDialog>

      <Serienaufnahme
        open={serieOffen}
        onOpenChange={setSerieOffen}
        titel="Fotos fürs Projekt"
        onFertig={(neu) => { dazu(neu); setSerieOffen(false); }}
      />
    </>
  );
}
