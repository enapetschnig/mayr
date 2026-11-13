import { useState } from "react";
import { Plus } from "lucide-react";
import { Karte } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { AufgabeDialog } from "@/components/aufgaben/AufgabeDialog";
import { AufgabeDetail } from "@/components/aufgaben/AufgabeDetail";
import { AufgabenListe } from "@/components/aufgaben/AufgabenListe";
import { useMeineAufgaben, type AufgabeMitInfo } from "@/components/aufgaben/aufgabenDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { sortieren, zaehlen } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";

/** Startseite: meine offenen Aufgaben zum Abhaken — die dringendsten oben */
export function MeineAufgaben() {
  const { profil } = useSitzung();
  const { data: meine = [], isLoading } = useMeineAufgaben(profil?.id);
  const [gewaehlt, setGewaehlt] = useState<AufgabeMitInfo | null>(null);
  const [neu, setNeu] = useState(false);
  const heute = isoTag();
  const z = zaehlen(meine, heute);
  if (isLoading) return null;

  return (
    <Karte titel={`Meine Aufgaben${z.offen ? ` · ${z.offen}` : ""}${z.ueberfaellig ? ` (${z.ueberfaellig} überfällig)` : ""}`}
      alle={meine.length > 0 ? { to: "/aufgaben", text: "Alle" } : undefined}
      aktion={meine.length === 0 ? (
        <Button variant="ghost" size="sm" className="-my-2 h-11 gap-1 text-primary" onClick={() => setNeu(true)}><Plus className="h-4 w-4" /> Aufgabe</Button>
      ) : undefined}
      ohnePolster>
      <div className="px-3 pb-3 lg:px-4" data-meine-aufgaben>
        {meine.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
        ) : (
          <AufgabenListe aufgaben={sortieren(meine, heute).slice(0, 6)} onWahl={setGewaehlt} mitPersonen={false} />
        )}
      </div>
      <AufgabeDetail aufgabe={gewaehlt} onOpenChange={(o) => !o && setGewaehlt(null)} />
      <AufgabeDialog open={neu} onOpenChange={setNeu} />
    </Karte>
  );
}
