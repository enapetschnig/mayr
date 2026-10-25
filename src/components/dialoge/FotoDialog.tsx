import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileUp, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Serienaufnahme } from "@/components/Serienaufnahme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useNeuLaden } from "@/hooks/useDaten";
import { dateienHochladen } from "@/lib/upload";

/**
 * Fotos (und Dokumente) zu einem Projekt — so kurz wie möglich: ein Knopf,
 * Projekt wählen, Bilder rein, fertig.
 */
export function FotoDialog({
  open, onOpenChange, projektId: vorProjekt, art = "foto",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projektId?: string;
  /** "dokument": Pläne, PDFs, Lieferscheine — landen im Ordner Dokumente */
  art?: "foto" | "dokument";
}) {
  const dok = art === "dokument";
  const neuLaden = useNeuLaden();
  const [projektId, setProjektId] = useState("");
  const [dateien, setDateien] = useState<File[]>([]);
  const [vorschauen, setVorschauen] = useState<string[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [serieOffen, setSerieOffen] = useState(false);
  const galerie = useRef<HTMLInputElement>(null);
  const dokumente = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setProjektId(vorProjekt || "");
    setDateien([]);
    setBeschreibung("");
  }, [open, vorProjekt]);

  useEffect(() => {
    const neu = dateien.map((d) => (d.type.startsWith("image/") ? URL.createObjectURL(d) : ""));
    setVorschauen(neu);
    return () => neu.forEach((u) => u && URL.revokeObjectURL(u));
  }, [dateien]);

  const dazu = (liste: FileList | File[] | null) => {
    if (!liste || !liste.length) return;
    // Sofort kopieren: Eine FileList ist „lebendig“ — wird das Feld danach
    // geleert, wäre sie leer, bevor React den Zustand übernimmt.
    const neu = Array.from(liste);
    setDateien((v) => [...v, ...neu].slice(0, 50));
  };

  const hochladen = async () => {
    if (!projektId || dateien.length === 0) return;
    setLaedt(true);
    const erg = await dateienHochladen(projektId, dateien, beschreibung.trim(), dok ? "dokument" : undefined);
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
        titel={dok ? "Dokument zum Projekt" : "Foto zum Projekt"}
        beschreibung={dok ? "Pläne, PDFs, Lieferscheine — landet im Projekt unter Dokumente." : "Landet direkt im Projekt unter Fotos."}
        gesperrt={laedt}
        fuss={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laedt}>Abbrechen</Button>
            <Button onClick={hochladen} disabled={laedt || !projektId || dateien.length === 0} className="gap-2">
              {laedt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {laedt ? "Lädt hoch…"
                : !projektId ? "Zuerst Projekt wählen"
                : dateien.length === 0 ? (dok ? "Zuerst Datei wählen" : "Zuerst Fotos wählen")
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
            {dok ? (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="col-span-2 h-auto flex-col gap-1 py-4" onClick={() => dokumente.current?.click()}>
                  <FileUp className="h-6 w-6" /><span>Datei auswählen</span>
                  <span className="text-[0.7rem] font-normal opacity-80">PDF, Plan, Excel, Word …</span>
                </Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setSerieOffen(true)}>
                  <Camera className="h-5 w-5" /><span>Abfotografieren</span>
                </Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => galerie.current?.click()}>
                  <ImagePlus className="h-5 w-5" /><span>Aus Galerie</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-auto flex-col gap-1 py-4" onClick={() => setSerieOffen(true)}>
                  <Camera className="h-6 w-6" /><span>Fotos machen</span>
                </Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-1 py-4" onClick={() => galerie.current?.click()}>
                  <ImagePlus className="h-6 w-6" /><span>Aus Galerie</span>
                </Button>
              </div>
            )}
            <input ref={galerie} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
            <input ref={dokumente} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf,.zip,image/*"
              onChange={(e) => { dazu(e.target.files); e.target.value = ""; }} />
          </div>

          {dateien.length > 0 && (
            <div className="space-y-2">
              <Label>{dateien.length} ausgewählt</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {dateien.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="relative">
                    {vorschauen[i]
                      ? <img src={vorschauen[i]} alt={d.name} className="h-24 w-full rounded-md border object-cover" />
                      : <div className="flex h-24 w-full items-center justify-center break-all rounded-md border bg-muted p-2 text-center text-xs">{d.name}</div>}
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
            <Input id="f-beschr" className="h-12" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="z. B. Verteiler EG vor dem Verschließen" />
          </div>
        </div>
      </FormularDialog>

      <Serienaufnahme
        open={serieOffen}
        onOpenChange={setSerieOffen}
        titel={dok ? "Dokument abfotografieren" : "Fotos fürs Projekt"}
        onFertig={(neu) => { dazu(neu); setSerieOffen(false); }}
      />
    </>
  );
}
