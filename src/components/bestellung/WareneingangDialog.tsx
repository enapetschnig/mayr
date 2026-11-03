import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2, PackageCheck, ScanLine } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { MengeFeld } from "@/components/material/MengeFeld";
import { mengeEingabe, mengeText, runden3 } from "@/components/material/materialDaten";
import { ScanDialog, type ScanRueckmeldung } from "@/components/scanner/ScanDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { artikelZuCode } from "@/components/scanner/artikelZuCode";
import { useNeuLaden } from "@/hooks/useDaten";
import { codeVarianten } from "@/lib/strichcode";
import { zahl, zahlLesen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { positionInfo, wareneingangBuchen, type BestellungVoll } from "./bestellDaten";
import { offeneMenge, positionFuerArtikel } from "./bestellLogik";

/**
 * Lieferung gegen die Bestellung einbuchen: je Position die gelieferte
 * Menge (leer = 0), „Alles wie bestellt“ füllt den offenen Rest, Scannen
 * zählt je Code +1 (Karton-Code: + Packungsinhalt) auf die passende
 * Position. Gebucht wird ins Lager bzw. aufs Projekt der Bestellung.
 */
export function WareneingangDialog({ open, onOpenChange, bestellung: b }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bestellung: BestellungVoll;
}) {
  const neuLaden = useNeuLaden();
  const [mengen, setMengen] = useState<Record<string, string>>({});
  const [lieferschein, setLieferschein] = useState("");
  const [scan, setScan] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const positionen = b.bestell_positionen;

  useEffect(() => {
    if (open) { setMengen({}); setLieferschein(""); }
  }, [open]);

  const menge = (id: string) => Math.max(0, zahlLesen(mengen[id] ?? ""));
  const erfasst = positionen.filter((p) => menge(p.id) > 0);
  const ziel = b.projekte ? `aufs Projekt ${b.projekte.nummer}` : `ins ${b.lagerorte?.name ?? "Lager"}`;

  const allesWieBestellt = () =>
    setMengen(Object.fromEntries(positionen.map((p) => [p.id, offeneMenge(p) ? mengeEingabe(offeneMenge(p)) : ""])));

  const codeGelesen = async (code: string): Promise<ScanRueckmeldung> => {
    let treffer;
    try {
      treffer = await artikelZuCode(code);
    } catch {
      return { text: "Keine Verbindung", unter: "Bitte noch einmal scannen.", ton: "warnung" };
    }
    // Gleiche EAN bei zwei Lieferanten: dann über die EAN des bestellten Artikels
    const artikelId = treffer && positionen.some((p) => p.artikel_id === treffer.artikel_id)
      ? treffer.artikel_id
      : positionen.find((p) => p.artikel.ean && codeVarianten(code).includes(p.artikel.ean))?.artikel_id;
    if (!artikelId) return { text: "Nicht in dieser Bestellung", unter: code, ton: "warnung" };
    const p = positionFuerArtikel(positionen, artikelId, (x) => menge(x.id));
    if (!p) return { text: "Nicht in dieser Bestellung", unter: code, ton: "warnung" };
    const jetzt = runden3(menge(p.id) + (treffer?.artikel_id === artikelId ? treffer.menge : 1));
    setMengen((m) => ({ ...m, [p.id]: mengeEingabe(jetzt) }));
    const offen = offeneMenge(p);
    return {
      text: p.artikel.bezeichnung,
      unter: `${zahl(jetzt)} von ${zahl(offen)} ${p.artikel.einheit} offen${jetzt > offen ? " — mehr als bestellt" : ""}`,
      ton: jetzt > offen ? "warnung" : "ok",
    };
  };

  const buchen = async () => {
    setLaeuft(true);
    try {
      await wareneingangBuchen(b, positionen.map((p) => ({ position: p, menge: menge(p.id) })), lieferschein);
      await neuLaden("bestellungen", "lager", "material", "artikel");
      toast.success(`${erfasst.length === 1 ? "1 Position" : `${erfasst.length} Positionen`} eingebucht`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Lieferung einbuchen"
      beschreibung={`${b.nummer} · ${b.lieferant} · gebucht wird ${ziel}`}
      gesperrt={laeuft}
      ungespeichert={erfasst.length > 0}
      fuss={(
        <Button className="h-12 w-full text-base sm:w-auto" onClick={() => void buchen()} disabled={laeuft || !erfasst.length}>
          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          {erfasst.length ? `${erfasst.length} ${erfasst.length === 1 ? "Position" : "Positionen"} einbuchen` : "Menge eintragen oder scannen"}
        </Button>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button className="h-12 sm:h-11" onClick={() => setScan(true)}>
            <ScanLine className="h-4 w-4" /> Scannen
          </Button>
          <Button variant="outline" className="h-12 sm:h-11" onClick={allesWieBestellt}>
            <CheckCheck className="h-4 w-4" /> Alles wie bestellt
          </Button>
        </div>
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="we-ls">Lieferschein-Nr. <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="we-ls" value={lieferschein} onChange={(e) => setLieferschein(e.target.value)} className="h-11 text-base sm:text-sm" autoComplete="off" />
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {positionen.map((p) => {
            const offen = offeneMenge(p);
            const m = menge(p.id);
            return (
              <li key={p.id} className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", !offen && !m && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{p.artikel.bezeichnung}</p>
                  <p className="truncate text-xs text-muted-foreground">{positionInfo(p.artikel)}</p>
                  <p className="text-xs">
                    Bestellt <span className="zahl">{mengeText(Number(p.menge), p.artikel.einheit)}</span>
                    {Number(p.geliefert) > 0 && <> · schon da <span className="zahl">{zahl(Number(p.geliefert))}</span></>}
                    {" · "}<span className={cn("font-medium", offen ? "text-foreground" : "text-success")}>{offen ? `offen ${zahl(offen)}` : "vollständig"}</span>
                    {m > offen && <span className="font-medium text-status-gelb-fg"> · mehr als offen</span>}
                  </p>
                </div>
                <MengeFeld wert={mengen[p.id] ?? ""} min={0} beschriftung={`Geliefert ${p.artikel.bezeichnung}`}
                  onChange={(t) => setMengen((x) => ({ ...x, [p.id]: t }))} />
              </li>
            );
          })}
        </ul>
      </div>
      <ScanDialog open={scan} onOpenChange={setScan} onCode={codeGelesen} dauerhaft titel="Lieferung scannen"
        anzahl={erfasst.length} />
    </FormularDialog>
  );
}
