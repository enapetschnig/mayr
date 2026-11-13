import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fehlerText } from "@/components/stamm/stammDaten";
import { dateiHochladen } from "@/components/dokumente/dokumentDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { groesseText, ORDNER_VORSCHLAG, PERSONAL_ART, PERSONAL_ARTEN, vormonat, type PersonalArt } from "@/lib/dokumente";
import { isoTag } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Dokument hochladen — Firmendokument (Ordner, Titel, gültig bis, nur Chef)
 * oder Mitarbeiter-Dokument (Art, Monat beim Lohnzettel). PDF oder Foto.
 */
export function DokumentDialog({
  open, onOpenChange, ziel, ordnerListe = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** firma = Firmendokument, sonst die Person, der das Dokument gehört */
  ziel: { art: "firma"; ordner?: string } | { art: "personal"; userId: string; name: string };
  ordnerListe?: string[];
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const feld = useRef<HTMLInputElement>(null);
  const [datei, setDatei] = useState<File | null>(null);
  const [titel, setTitel] = useState("");
  const [ordner, setOrdner] = useState("");
  const [gueltig, setGueltig] = useState("");
  const [nurChef, setNurChef] = useState(false);
  const [art, setArt] = useState<PersonalArt>("lohnzettel");
  const [monat, setMonat] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const firma = ziel.art === "firma";
  const eigene = !firma && ziel.userId === profil?.id;
  // Was der Mitarbeiter selbst hochladen darf (wie die Policy)
  const arten = istChef ? PERSONAL_ARTEN : PERSONAL_ARTEN.filter((a) => PERSONAL_ART[a].selbst);

  useEffect(() => {
    if (!open) return;
    setDatei(null); setTitel(""); setGueltig(""); setNurChef(false);
    setOrdner(firma ? ziel.ordner ?? "" : "");
    setArt(istChef && !eigene ? "lohnzettel" : "krankenschein");
    setMonat(vormonat(isoTag()).slice(0, 7));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordnerVorschlaege = [...new Set([...ordnerListe, ...ORDNER_VORSCHLAG])];

  const speichern = async () => {
    if (!datei) return toast.error("Bitte eine Datei wählen (PDF oder Foto).");
    if (firma && !titel.trim() && !datei.name) return toast.error("Bitte einen Titel eintragen.");
    if (firma && !ordner.trim()) return toast.error("Bitte einen Ordner wählen oder eintippen.");
    setLaeuft(true);
    let pfad: string | null = null;
    try {
      const d = await dateiHochladen(firma ? "firmen-dokumente" : "personal", firma ? "firma" : ziel.userId, datei);
      pfad = d.pfad;
      const { error } = firma
        ? await supabase.from("firmen_dokumente").insert({
          ordner: ordner.trim(), titel: titel.trim() || datei.name.replace(/\.\w+$/, ""), gueltig_bis: gueltig || null, nur_chef: nurChef,
          pfad: d.pfad, name: d.name, mime: d.mime, groesse: d.groesse,
        })
        : await supabase.from("personal_dokumente").insert({
          user_id: ziel.userId, art, titel: titel.trim() || null,
          monat: PERSONAL_ART[art].mitMonat && monat ? `${monat}-01` : null,
          pfad: d.pfad, name: d.name, mime: d.mime, groesse: d.groesse,
        });
      if (error) throw error;
      toast.success(firma ? "Dokument abgelegt" : eigene ? "Hochgeladen" : `Abgelegt — ${ziel.name} sieht es beim nächsten Öffnen der App`);
      await neuLaden("dokumente");
      onOpenChange(false);
    } catch (e) {
      if (pfad) await supabase.storage.from(firma ? "firmen-dokumente" : "personal").remove([pfad]);
      toast.error("Nicht hochgeladen", { description: fehlerText(e as Error) });
    } finally {
      setLaeuft(false);
    }
  };

  const pille = (an: boolean) => cn("min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted");

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} gesperrt={laeuft} ungespeichert={!!datei}
      titel={firma ? "Firmendokument ablegen" : eigene ? "Dokument hochladen" : `Dokument für ${ziel.name}`}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laeuft}>Abbrechen</Button>
          <Button onClick={() => void speichern()} disabled={laeuft || !datei} className="min-w-40">
            {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Hochladen
          </Button>
        </>
      }>
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <input ref={feld} type="file" accept="application/pdf,image/*" className="hidden" aria-label="Datei"
            onChange={(e) => { setDatei(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <button type="button" onClick={() => feld.current?.click()}
            className="flex min-h-20 w-full items-center gap-3 rounded-lg border-2 border-dashed bg-card p-4 text-left hover:border-primary/60">
            <FileUp className="h-7 w-7 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{datei ? datei.name : "Datei wählen oder fotografieren"}</span>
              <span className="block text-xs text-muted-foreground">{datei ? groesseText(datei.size) : "PDF oder Foto, höchstens 20 MB"}</span>
            </span>
          </button>
        </div>

        {!firma && (
          <>
            <div className="space-y-2">
              <Label>Art</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Art des Dokuments">
                {arten.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={art === a} className={pille(art === a)} onClick={() => setArt(a)}>{PERSONAL_ART[a].text}</button>
                ))}
              </div>
            </div>
            {PERSONAL_ART[art].mitMonat && (
              <div className="space-y-2">
                <Label htmlFor="d-monat">Für Monat</Label>
                <Input id="d-monat" type="month" className="h-12 w-full sm:w-56" value={monat} onChange={(e) => setMonat(e.target.value)} />
              </div>
            )}
          </>
        )}

        {firma && (
          <div className="space-y-2">
            <Label htmlFor="d-ordner">Ordner</Label>
            <div className="flex flex-wrap gap-2">
              {ordnerVorschlaege.map((o) => <button key={o} type="button" className={pille(ordner === o)} onClick={() => setOrdner(o)}>{o}</button>)}
            </div>
            <Input id="d-ordner" className="h-12" value={ordner} onChange={(e) => setOrdner(e.target.value)} placeholder="oder neuen Ordner eintippen" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="d-titel">Titel <span className="font-normal text-muted-foreground">{firma ? "(sonst der Dateiname)" : "(optional)"}</span></Label>
          <Input id="d-titel" className="h-12" value={titel} onChange={(e) => setTitel(e.target.value)}
            placeholder={firma ? "z. B. Betriebshaftpflicht 2026" : "z. B. Krankenstand 10.–12.11."} />
        </div>

        {firma && (
          <>
            <div className="space-y-2">
              <Label htmlFor="d-gueltig">Gültig bis <span className="font-normal text-muted-foreground">(Zertifikate, Versicherungen — optional)</span></Label>
              <Input id="d-gueltig" type="date" className="h-12 w-full sm:w-56" value={gueltig} onChange={(e) => setGueltig(e.target.value)} />
            </div>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
              <span className="text-sm">
                <span className="block font-medium">Nur für den Chef</span>
                <span className="block text-xs text-muted-foreground">Mitarbeiter sehen es nicht (Verträge, Polizzen)</span>
              </span>
              <Switch checked={nurChef} onCheckedChange={setNurChef} aria-label="Nur für den Chef" />
            </label>
          </>
        )}
      </div>
    </FormularDialog>
  );
}
