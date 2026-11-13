import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSitzung } from "@/hooks/useSitzung";

/**
 * Einstellungen → Betrieb: die Arten für interne (unproduktive) Stunden —
 * Büro, Lager/Werkstatt, Fahrzeugpflege … Speichert für sich (nicht mit dem
 * Betriebsformular). Umbenennen ändert alte Buchungen nicht, sie behalten
 * ihren Text.
 */
export function InterneArten() {
  const { firma, neuLaden } = useSitzung();
  const [arten, setArten] = useState<string[]>([]);
  const [neu, setNeu] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  useEffect(() => { if (firma?.intern_arten) setArten(firma.intern_arten); }, [firma?.intern_arten]);
  const geaendert = JSON.stringify(arten) !== JSON.stringify(firma?.intern_arten ?? []);

  const dazu = () => {
    const t = neu.trim();
    if (!t) return;
    if (arten.some((a) => a.toLowerCase() === t.toLowerCase())) return toast.error(`„${t}“ gibt es schon.`);
    setArten([...arten, t]);
    setNeu("");
  };
  const speichern = async () => {
    if (!arten.length) return toast.error("Mindestens eine Art muss bleiben.");
    setLaeuft(true);
    const { error } = await supabase.from("firma").update({ intern_arten: arten }).eq("id", 1);
    setLaeuft(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success("Interne Stundenarten gespeichert");
    await neuLaden();
  };

  return (
    <Karte titel="Interne Stunden (unproduktiv)">
      <p className="mb-3 text-sm text-muted-foreground">
        Stunden ohne Projekt bucht man mit „Intern“ und einer dieser Arten. In der Auswertung stehen sie als unproduktiv.
      </p>
      <div className="flex flex-wrap gap-2" data-intern-arten>
        {arten.map((a) => (
          <span key={a} className="inline-flex min-h-10 items-center gap-1 rounded-full border bg-card pl-3.5 pr-1 text-sm font-medium">
            {a}
            <button type="button" aria-label={`${a} entfernen`} onClick={() => setArten(arten.filter((x) => x !== a))}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input className="h-11 w-full text-base sm:w-64 md:[@media(pointer:fine)]:text-sm" placeholder="Neue Art, z. B. Angebot erstellen" aria-label="Neue interne Art"
          value={neu} onChange={(e) => setNeu(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); dazu(); } }} />
        <Button variant="outline" className="h-11 gap-1.5" onClick={dazu} disabled={!neu.trim()}><Plus className="h-4 w-4" /> Dazu</Button>
        <Button className="h-11" onClick={() => void speichern()} disabled={!geaendert || laeuft}>
          {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
        </Button>
      </div>
    </Karte>
  );
}
