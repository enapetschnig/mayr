import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tags } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Altrechnungen } from "@/components/buchhaltung/Altrechnungen";
import { AusgangListe } from "@/components/buchhaltung/AusgangListe";
import { EingangListe } from "@/components/buchhaltung/EingangListe";
import { KategorienDialog } from "@/components/buchhaltung/KategorienDialog";
import { Uebergabe } from "@/components/buchhaltung/Uebergabe";
import { ZeitraumWahl, type Zeitraum } from "@/components/buchhaltung/Zeitraum";
import type { Richtung } from "@/components/buchhaltung/buchhaltungLogik";
import { cn } from "@/lib/utils";

type Reiter = "ausgang" | "eingang" | "alt" | "kanzlei";
const REITER: { wert: Reiter; text: string }[] = [
  { wert: "ausgang", text: "Ausgang" },
  { wert: "eingang", text: "Eingang" },
  { wert: "alt", text: "Altrechnungen" },
  { wert: "kanzlei", text: "Kanzlei" },
];

/**
 * /buchhaltung?reiter=ausgang|eingang|alt|kanzlei — Ausgang (unsere
 * Rechnungen) und Eingang (Lieferanten) je Monat oder Jahr mit Summen und
 * Kategorien, Altrechnungen aus dem bisherigen Programm, und der Monat für
 * die Kanzlei (BMD/RZL). Nur der Chef.
 */
export default function Buchhaltung() {
  const [params, setParams] = useSearchParams();
  const r = params.get("reiter");
  const reiter: Reiter = r === "eingang" || r === "alt" || r === "kanzlei" ? r : "ausgang";
  // Vorbelegt: der letzte abgeschlossene Monat — den will auch die Kanzlei
  const [zeitraum, setZeitraum] = useState<Zeitraum>(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return { art: "monat", jahr: d.getFullYear(), monat: d.getMonth() };
  });
  const [kategorienFuer, setKategorienFuer] = useState<Richtung | null>(null);

  const reiterSetzen = (w: Reiter) => {
    const neu = new URLSearchParams(params);
    if (w === "ausgang") neu.delete("reiter");
    else neu.set("reiter", w);
    setParams(neu, { replace: true });
  };

  return (
    <Seite
      titel="Buchhaltung"
      untertitel="Ausgangs- und Eingangsrechnungen, Kategorien, der Monat für die Kanzlei"
      breit
      aktionen={(
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setKategorienFuer(reiter === "eingang" ? "eingang" : "ausgang")}>
          <Tags className="h-4 w-4" /> <span className="hidden sm:inline">Kategorien</span>
        </Button>
      )}
    >
      <div className="grid grid-cols-4 gap-1 rounded-lg border bg-muted/50 p-1 sm:inline-grid sm:w-auto" role="tablist" aria-label="Bereich">
        {REITER.map((x) => (
          <button key={x.wert} type="button" role="tab" aria-selected={reiter === x.wert} onClick={() => reiterSetzen(x.wert)}
            className={cn("min-h-11 truncate rounded-md px-2 text-sm font-medium transition-colors sm:px-4",
              reiter === x.wert ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
            {x.wert === "alt" ? <><span className="sm:hidden">Alt</span><span className="hidden sm:inline">{x.text}</span></> : x.text}
          </button>
        ))}
      </div>

      {reiter !== "alt" && <ZeitraumWahl wert={zeitraum} onChange={setZeitraum} nurMonat={reiter === "kanzlei"} />}

      {reiter === "ausgang" && <AusgangListe zeitraum={zeitraum} onKategorien={() => setKategorienFuer("ausgang")} />}
      {reiter === "eingang" && <EingangListe zeitraum={zeitraum} onKategorien={() => setKategorienFuer("eingang")} />}
      {reiter === "alt" && <Altrechnungen />}
      {reiter === "kanzlei" && <Uebergabe zeitraum={zeitraum} />}

      <KategorienDialog richtung={kategorienFuer} onRichtung={setKategorienFuer} />
    </Seite>
  );
}
