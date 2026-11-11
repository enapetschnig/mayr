import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Camera, ChevronRight, ClipboardSignature, Clock, FilePlus2, FileText, FolderPlus, Mic, Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { useSitzung } from "@/hooks/useSitzung";
import { cn } from "@/lib/utils";

/*
  „+ Neu“ wie bei Lengauer Stockner: ein Knopf oben in der Seitenleiste
  öffnet eine Auswahl mit großen Zeilen. Jeder Eintrag führt in den
  VORHANDENEN Weg (Dialog oder Seite). Die Suche (Strg+K) und das „+“ am
  Menüpunkt starten dieselben Aktionen über neuStarten().
*/

export type NeuArt = "projekt" | "angebot" | "sprache" | "rechnung" | "termin" | "zeit" | "regie" | "foto";

interface NeuAktion {
  art: NeuArt;
  titel: string;
  text: string;
  icon: LucideIcon;
  /** Ziel-Adresse; ohne Ziel öffnet der Rahmen einen Dialog */
  ziel?: string;
  nurChef?: boolean;
}

const ALLE: NeuAktion[] = [
  { art: "projekt", titel: "Projekt", text: "Neue Baustelle, Nummer kommt von selbst", icon: FolderPlus },
  { art: "angebot", titel: "Angebot", text: "Am PC schreiben, mit Katalog und KI", icon: FileText, ziel: "/belege/neu?typ=angebot", nurChef: true },
  { art: "sprache", titel: "Angebot vor Ort", text: "„3 Steckdosen, 2 Schalter, 1 FI“ — sprechen, fertig", icon: Mic, ziel: "/belege/neu?typ=angebot&sprache=1", nurChef: true },
  { art: "rechnung", titel: "Rechnung", text: "Leer oder aus dem Projekt übernehmen", icon: FilePlus2, ziel: "/belege/neu?typ=rechnung", nurChef: true },
  { art: "termin", titel: "Termin", text: "Einsatz in die Plantafel eintragen", icon: CalendarPlus },
  { art: "zeit", titel: "Stunden", text: "Stunden auf ein Projekt buchen", icon: Clock },
  { art: "regie", titel: "Regiebericht", text: "Mit Unterschrift des Kunden", icon: ClipboardSignature, ziel: "/regie/neu" },
  { art: "foto", titel: "Foto", text: "Zum Projekt fotografieren", icon: Camera },
];

export function useNeuAktionen(): NeuAktion[] {
  const { istChef } = useSitzung();
  return ALLE.filter((a) => istChef || !a.nurChef);
}

const EREIGNIS = "mayr:neu";

/** Startet eine Neu-Aktion von überall; ohne Art öffnet sich die Auswahl. */
export function neuStarten(art?: NeuArt) {
  window.dispatchEvent(new CustomEvent<NeuArt | undefined>(EREIGNIS, { detail: art }));
}

/** Der blaue Knopf — in der Seitenleiste, eingeklappt nur das Plus. */
export function NeuKnopf({ kompakt }: { kompakt?: boolean }) {
  return (
    <Button type="button" size="sm" onClick={() => neuStarten()} aria-label="Neu anlegen" title="Neues Projekt, Angebot, Rechnung …"
      data-neu-knopf className={cn("h-8 w-full justify-start gap-2", kompakt && "w-8 justify-center px-0")}>
      <Plus className="h-4 w-4" />
      {!kompakt && <span>Neu</span>}
    </Button>
  );
}

/** Auswahl und Dialoge — einmal im Rahmen, auf jeder Breite. */
export function NeuRahmen() {
  const navigate = useNavigate();
  const aktionen = useNeuAktionen();
  const [auswahl, setAuswahl] = useState(false);
  const [offen, setOffen] = useState<NeuArt | null>(null);

  const ausfuehren = (art: NeuArt) => {
    setAuswahl(false);
    const a = ALLE.find((x) => x.art === art);
    if (!a) return;
    if (a.ziel) navigate(a.ziel);
    else setOffen(art);
  };

  useEffect(() => {
    const h = (e: Event) => {
      const art = (e as CustomEvent<NeuArt | undefined>).detail;
      if (art) ausfuehren(art);
      else setAuswahl(true);
    };
    window.addEventListener(EREIGNIS, h);
    return () => window.removeEventListener(EREIGNIS, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zu = (o: boolean) => { if (!o) setOffen(null); };

  return (
    <>
      <Dialog open={auswahl} onOpenChange={setAuswahl}>
        <DialogContent className="max-w-lg gap-0 p-0" data-neu-auswahl>
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle className="text-base">Was möchtest du anlegen?</DialogTitle>
            <DialogDescription className="sr-only">Projekt, Angebot, Rechnung, Termin, Stunden …</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto p-4">
            {aktionen.map((a) => (
              <button key={a.art} type="button" onClick={() => ausfuehren(a.art)} data-neu={a.art}
                className="flex min-h-14 w-full items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <a.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{a.titel}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{a.text}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ProjektDialog open={offen === "projekt"} onOpenChange={zu} />
      <TerminDialog open={offen === "termin"} onOpenChange={zu} />
      <ZeitDialog open={offen === "zeit"} onOpenChange={zu} />
      <FotoDialog open={offen === "foto"} onOpenChange={zu} />
    </>
  );
}
