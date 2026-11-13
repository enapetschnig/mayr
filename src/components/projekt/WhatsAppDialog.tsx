import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { useMitarbeiter, useNeuLaden, useTeams, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag, isoZuDatum, uhrzeit } from "@/lib/format";
import { istFoerderStatus } from "@/lib/foerderung";
import { FOERDER_STATUS, name } from "@/lib/types";
import { istFestnetz, nummerText, vorlageFuellen, vorlagenLesen, waLink, waNummer } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

const TAG = new Intl.DateTimeFormat("de-AT", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });

/**
 * WhatsApp an den Kunden: Vorlage wählen (Termin, Montage fertig, Förderung,
 * frei), Text prüfen, „In WhatsApp öffnen“. Geschickt wird in WhatsApp —
 * die App vermerkt im Projekt-Verlauf, was wann an wen ging.
 */
export function WhatsAppDialog({ open, onOpenChange, projekt }: { open: boolean; onOpenChange: (o: boolean) => void; projekt: ProjektMitKunde }) {
  const { firma, profil } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: leute = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const vorlagen = vorlagenLesen(firma?.whatsapp_vorlagen);
  const [vorlage, setVorlage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [nummer, setNummer] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const heute = isoTag();

  // Nächster Einsatz: ab heute, frühester zuerst
  const { data: einsatz } = useQuery({
    queryKey: ["termine", "naechster-einsatz", projekt.id, heute],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("datum, von, ganztags, mitarbeiter, team_id")
        .eq("projekt_id", projekt.id).gte("datum", heute).order("datum").order("von").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const adresse = [projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const team = einsatz
    ? [teams.find((t) => t.id === einsatz.team_id)?.name,
       einsatz.mitarbeiter.map((id) => leute.find((p) => p.id === id)).filter(Boolean).map((p) => p!.vorname).join(", ")]
        .filter(Boolean).join(" – ")
    : "";
  const werte = {
    kunde: projekt.kunden?.name,
    projekt: projekt.name,
    adresse,
    datum: einsatz ? TAG.format(isoZuDatum(einsatz.datum)) : "",
    uhrzeit: einsatz && !einsatz.ganztags && einsatz.von ? `${uhrzeit(einsatz.von)} Uhr` : "",
    team,
    foerderstatus: istFoerderStatus(projekt.foerder_status) ? FOERDER_STATUS[projekt.foerder_status].text : "",
    foerderstelle: projekt.foerder_stelle,
    absender: profil ? name(profil) : "",
    firma: firma?.name,
    telefon: firma?.telefon,
  };

  useBeimOeffnen(open ? projekt.id : null, () => {
    setVorlage(null);
    setText("");
    setNummer(projekt.kunden?.telefon ?? "");
  });

  const waehlen = (n: string | null) => {
    setVorlage(n);
    const v = vorlagen.find((x) => x.name === n);
    setText(v ? vorlageFuellen(v.text, werte) : "");
  };

  const nr = waNummer(nummer);
  const fehlt = /(^|\s)–(\s|[.,)]|$)/.test(text);

  const senden = async () => {
    if (!nr) return toast.error("Bitte eine Handynummer eintragen (z. B. 0664 1234567).");
    if (!text.trim()) return toast.error("Bitte einen Text eingeben.");
    if (laeuft) return; // Doppeltipp: nur einmal öffnen und vermerken
    setLaeuft(true);
    // Erst öffnen (sonst blockt der Browser das Fenster), dann vermerken
    window.open(waLink(nr, text.trim()), "_blank", "noopener");
    const { error } = await supabase.from("projekt_verlauf").insert({
      projekt_id: projekt.id, art: "whatsapp", text: text.trim(), an: nr, user_id: profil?.id,
    });
    if (error) toast.error("WhatsApp geöffnet, aber nicht im Verlauf vermerkt", { description: error.message });
    else toast.success("Im Projekt-Verlauf vermerkt", { description: "Gesendet ist erst, wenn Sie in WhatsApp auf Senden tippen." });
    await neuLaden("projekt_verlauf");
    setLaeuft(false);
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="WhatsApp an Kunde"
      beschreibung={projekt.kunden?.name ? `${projekt.kunden.name} · ${projekt.name}` : projekt.name}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={senden} disabled={!nr || !text.trim() || laeuft} className="gap-2"><Send className="h-4 w-4" /> In WhatsApp öffnen</Button>
        </>
      }>
      <div className="max-w-xl space-y-5">
        <div className="space-y-2">
          <Label htmlFor="wa-nr">Handynummer</Label>
          <Input id="wa-nr" className="h-12" inputMode="tel" value={nummer} onChange={(e) => setNummer(e.target.value)} placeholder="0664 1234567" />
          <p className={cn("text-xs", nummer && !nr ? "text-destructive" : "text-muted-foreground")}>
            {nr ? `WhatsApp an ${nummerText(nr)}` : nummer ? "Diese Nummer kann WhatsApp nicht lesen." : "Beim Kunden ist keine Nummer hinterlegt."}
          </p>
          {istFestnetz(nr) && <p className="text-xs text-status-gelb-fg">Das ist eine Festnetznummer — WhatsApp geht meist nur ans Handy.</p>}
        </div>
        <div className="space-y-2">
          <Label>Vorlage</Label>
          <div className="flex flex-wrap gap-2">
            {[...vorlagen.map((v) => v.name), null].map((n) => (
              <button key={n ?? "frei"} type="button" onClick={() => waehlen(n)} aria-pressed={vorlage === n}
                className={cn("min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                  vorlage === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>
                {n ?? "Freier Text"}
              </button>
            ))}
          </div>
          {vorlage === "Termin" && !einsatz && <p className="text-xs text-muted-foreground">Kein Einsatz ab heute eingeplant — Datum und Uhrzeit bitte selbst eintragen.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="wa-text">Nachricht</Label>
          <Textarea id="wa-text" rows={8} className="text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text an den Kunden …" />
          {fehlt && <p className="text-xs text-status-gelb-fg">„–“ steht für etwas, das die App nicht weiß — bitte ergänzen oder streichen.</p>}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
          WhatsApp öffnet sich mit dem Text, gesendet wird dort. Im Projekt steht danach, was wann an wen ging.
        </p>
      </div>
    </FormularDialog>
  );
}
