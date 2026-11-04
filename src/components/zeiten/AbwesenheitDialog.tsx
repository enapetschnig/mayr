import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, isoTag, zahl } from "@/lib/format";
import { ABWESENHEIT_ART, name, type AbwesenheitArt } from "@/lib/types";
import { abwesenheitsTage } from "@/lib/zeitkonto";
import { cn } from "@/lib/utils";

const ARTEN: AbwesenheitArt[] = ["urlaub", "krank", "arzt", "zeitausgleich", "berufsschule", "sonstiges"];

/**
 * Urlaub & Co.: der Monteur beantragt, der Chef genehmigt — Krankenstand ist
 * eine Meldung und gilt sofort. Trägt der Chef ein, gilt es auch sofort.
 */
export function AbwesenheitDialog({ open, onOpenChange, userId: vorUser }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [userId, setUserId] = useState("");
  const [art, setArt] = useState<AbwesenheitArt>("urlaub");
  const [von, setVon] = useState(isoTag());
  const [bis, setBis] = useState(isoTag());
  const [std, setStd] = useState("");
  const [notiz, setNotiz] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useBeimOeffnen(open ? vorUser ?? "neu" : null, () => {
    setUserId(vorUser ?? profil?.id ?? "");
    setArt("urlaub");
    setVon(isoTag());
    setBis(isoTag());
    setStd("");
    setNotiz("");
  });

  const einTag = von === bis;
  const tage = von && bis && bis >= von ? abwesenheitsTage({ von, bis }).length : 0;
  const sofort = istChef || art === "krank";

  const speichern = async () => {
    if (!von || !bis) return toast.error("Bitte von und bis eintragen.");
    if (bis < von) return toast.error("„Bis“ liegt vor „Von“.");
    if (tage === 0) return toast.error("In diesem Zeitraum liegt kein Arbeitstag — Wochenende oder Feiertag.");
    const stunden = einTag && std.trim() ? dezimalLesen(std) : null;
    if (einTag && std.trim() && !(stunden && stunden > 0 && stunden <= 24)) return toast.error("Stunden bitte prüfen.");
    setSpeichert(true);
    const { error } = await supabase.from("abwesenheiten").insert({
      user_id: userId || profil!.id, art, von, bis, stunden, notiz: notiz.trim() || null,
    });
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(sofort ? `${ABWESENHEIT_ART[art].text} eingetragen` : `${ABWESENHEIT_ART[art].text} beantragt — der Chef bekommt das auf die Startseite`);
    await neuLaden("abwesenheiten", "zeiten");
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Abwesenheit" gesperrt={speichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-40 gap-2">
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} {sofort ? "Eintragen" : "Beantragen"}
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {istChef && mitarbeiter.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="ab-wer">Für wen?</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="ab-wer" className="h-12"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
              <SelectContent>
                {mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{name(m)}{m.id === profil?.id ? " (ich)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Was?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Art der Abwesenheit">
            {ARTEN.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={art === a} onClick={() => setArt(a)}
                className={cn("h-12 rounded-md border px-2 text-sm font-medium transition-colors",
                  art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                {ABWESENHEIT_ART[a].text}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ab-von" className="text-xs">Von</Label>
            <Input id="ab-von" type="date" className="h-12" value={von}
              onChange={(e) => { setVon(e.target.value); if (!bis || bis < e.target.value) setBis(e.target.value); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ab-bis" className="text-xs">Bis</Label>
            <Input id="ab-bis" type="date" className="h-12" min={von} value={bis} onChange={(e) => setBis(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {tage === 1 ? "1 Arbeitstag" : `${zahl(tage)} Arbeitstage`} — Wochenenden und Feiertage zählen nicht.
        </p>
        {einTag && (
          <div className="space-y-1">
            <Label htmlFor="ab-std">Nur ein Teil des Tages? <span className="font-normal text-muted-foreground">(Stunden, optional)</span></Label>
            <Input id="ab-std" inputMode="decimal" className="h-12 w-32" value={std} onChange={(e) => setStd(e.target.value)} placeholder="z. B. 2" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="ab-notiz">Notiz <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="ab-notiz" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>
      </div>
    </FormularDialog>
  );
}
