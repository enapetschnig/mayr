import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, FolderKanban, Loader2, Plus, Warehouse } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useLagerArtikel, useLagerbestand, runden3 } from "@/components/material/materialDaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLagerorte, useNeuLaden } from "@/hooks/useDaten";
import { euro, isoTag, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bestellungenAnlegen, projektBedarfLaden, useLieferanten, useOffeneBestellMengen, type Ziel } from "./bestellDaten";
import { bestellSumme, vorschlagAusLager, type Vorschlag } from "./bestellLogik";

export type NeuModus = "lager" | "projekt" | "leer";

const MODI: { wert: NeuModus; titel: string; text: string; icon: typeof Warehouse }[] = [
  { wert: "lager", titel: "Lager auffüllen", text: "Alles unter Mindestbestand", icon: Warehouse },
  { wert: "projekt", titel: "Material fürs Projekt", text: "Laut Angebot, auf die Baustelle", icon: FolderKanban },
  { wert: "leer", titel: "Leere Bestellung", text: "Artikel selbst zusammenstellen", icon: FileText },
];

/**
 * Neue Bestellung: Vorschlag aus dem Mindestbestand (je Lieferant eine
 * Bestellung, schon Bestelltes zählt ab), Material laut Angebot eines
 * Projekts, oder leer. Angelegt werden Entwürfe — bestellt wird erst auf
 * der Bestellung selbst.
 */
export function NeueBestellungDialog({ open, onOpenChange, startModus = "lager", onAngelegt }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  startModus?: NeuModus;
  onAngelegt: (ids: string[]) => void;
}) {
  const neuLaden = useNeuLaden();
  const [modus, setModus] = useState<NeuModus>(startModus);
  const [lagerId, setLagerId] = useState("");
  const [projektId, setProjektId] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [leerZiel, setLeerZiel] = useState<"lager" | "projekt">("lager");
  const [aus, setAus] = useState<Set<string>>(new Set());
  const [projekt, setProjekt] = useState<{ laedt: boolean; angebot: string | null; vorschlaege: Vorschlag[]; fehler?: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const { data: orte = [] } = useLagerorte();
  const { data: bestand = [] } = useLagerbestand();
  const { data: lagerArtikel = [] } = useLagerArtikel();
  const { data: offen, isLoading: offenLaedt } = useOffeneBestellMengen();
  const { data: lieferanten = [] } = useLieferanten();

  const lager = orte.filter((o) => o.art === "lager");
  const lagerWahl = lager.length ? lager : orte;
  const lagerortId = lagerWahl.some((o) => o.id === lagerId) ? lagerId : lagerWahl[0]?.id ?? "";

  useEffect(() => {
    if (open) { setModus(startModus); setAus(new Set()); setProjektId(""); setProjekt(null); setLieferant(""); }
  }, [open, startModus]);

  // Mindestbestand gilt für alle aktiven Lagerorte zusammen (wie die Lagerseite)
  const lagerVorschlag = useMemo(() => {
    if (!offen) return [];
    const aktiv = new Set(orte.map((o) => o.id));
    const gesamt = new Map<string, number>();
    for (const b of bestand) if (aktiv.has(b.lagerort_id)) gesamt.set(b.artikel_id, runden3((gesamt.get(b.artikel_id) ?? 0) + b.bestand));
    const zeilen = lagerArtikel
      .filter((a) => a.mindestbestand != null)
      .map((a) => ({ artikel: a, fehlt: runden3(Number(a.mindestbestand) - Math.max(0, gesamt.get(a.id) ?? 0)) }))
      .filter((z) => z.fehlt > 0);
    return vorschlagAusLager(zeilen, offen);
  }, [bestand, lagerArtikel, orte, offen]);

  const projektWaehlen = async (id: string) => {
    setProjektId(id);
    setAus(new Set());
    if (!id) return setProjekt(null);
    setProjekt({ laedt: true, angebot: null, vorschlaege: [] });
    try {
      setProjekt({ laedt: false, ...(await projektBedarfLaden(id)) });
    } catch (e) {
      setProjekt({ laedt: false, angebot: null, vorschlaege: [], fehler: (e as Error).message });
    }
  };

  const vorschlaege = modus === "lager" ? lagerVorschlag : modus === "projekt" ? projekt?.vorschlaege ?? [] : [];
  const gewaehlt = vorschlaege.filter((v) => !aus.has(v.lieferant));

  const anlegen = async () => {
    setLaeuft(true);
    try {
      let ids: string[];
      if (modus === "leer") {
        const ziel: Ziel = leerZiel === "projekt" ? { lagerort_id: null, projekt_id: projektId } : { lagerort_id: lagerortId, projekt_id: null };
        ids = await bestellungenAnlegen([{ lieferant: lieferant.trim(), positionen: [] }], ziel, isoTag());
      } else {
        const ziel: Ziel = modus === "projekt" ? { lagerort_id: null, projekt_id: projektId } : { lagerort_id: lagerortId, projekt_id: null };
        ids = await bestellungenAnlegen(gewaehlt, ziel, isoTag(), modus === "projekt" && projekt?.angebot ? `Material laut Angebot ${projekt.angebot}` : null);
      }
      await neuLaden("bestellungen");
      toast.success(ids.length === 1 ? "Bestellung angelegt" : `${ids.length} Bestellungen angelegt — je Lieferant eine`);
      onOpenChange(false);
      onAngelegt(ids);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  const bereit = modus === "leer"
    ? !!lieferant.trim() && (leerZiel === "lager" ? !!lagerortId : !!projektId)
    : gewaehlt.length > 0 && (modus === "lager" ? !!lagerortId : !!projektId);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Neue Bestellung"
      gesperrt={laeuft}
      fuss={(
        <Button className="h-12 w-full text-base sm:w-auto" onClick={() => void anlegen()} disabled={!bereit || laeuft}>
          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {modus === "leer" ? "Bestellung anlegen" : gewaehlt.length > 1 ? `${gewaehlt.length} Bestellungen anlegen` : "Bestellung anlegen"}
        </Button>
      )}
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Was bestellen">
          {MODI.map(({ wert, titel, text, icon: I }) => (
            <button key={wert} type="button" role="radio" aria-checked={modus === wert} onClick={() => { setModus(wert); setAus(new Set()); }}
              className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                modus === wert ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted/50")}>
              <I className={cn("h-5 w-5 shrink-0", modus === wert ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block font-medium">{titel}</span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
            </button>
          ))}
        </div>

        {(modus === "lager" || (modus === "leer" && leerZiel === "lager")) && (
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="nb-lager">Liefern ins</Label>
            <Select value={lagerortId} onValueChange={setLagerId}>
              <SelectTrigger id="nb-lager" className="h-11"><SelectValue placeholder="Lagerort" /></SelectTrigger>
              <SelectContent>{lagerWahl.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {modus === "leer" && (
          <div className="space-y-4">
            <div className="space-y-1.5 sm:max-w-md">
              <Label htmlFor="nb-lieferant">Lieferant</Label>
              <Input id="nb-lieferant" value={lieferant} onChange={(e) => setLieferant(e.target.value)} list="nb-lieferanten"
                placeholder="z. B. Sonepar, Rexel, Schäcke" className="h-11 text-base sm:text-sm" autoComplete="off" />
              <datalist id="nb-lieferanten">{lieferanten.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
            <div className="flex gap-2">
              {(["lager", "projekt"] as const).map((z) => (
                <button key={z} type="button" onClick={() => setLeerZiel(z)} aria-pressed={leerZiel === z}
                  className={cn("h-11 rounded-full border px-4 text-sm font-medium", leerZiel === z ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                  {z === "lager" ? "Ins Lager" : "Auf die Baustelle"}
                </button>
              ))}
            </div>
          </div>
        )}

        {(modus === "projekt" || (modus === "leer" && leerZiel === "projekt")) && (
          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor="nb-projekt">Projekt</Label>
            <ProjektWahl id="nb-projekt" wert={projektId} onChange={(id) => (modus === "projekt" ? void projektWaehlen(id) : setProjektId(id))} />
          </div>
        )}

        {modus !== "leer" && (
          <div className="space-y-2">
            {modus === "projekt" && projekt?.angebot && (
              <p className="text-sm text-muted-foreground">Material laut Angebot {projekt.angebot} — was für das Projekt schon bestellt ist, zählt ab.</p>
            )}
            {(modus === "lager" ? offenLaedt : projekt?.laedt) ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Wird berechnet …</p>
            ) : projekt?.fehler && modus === "projekt" ? (
              <p className="text-sm text-destructive">{projekt.fehler}</p>
            ) : !vorschlaege.length ? (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                {modus === "lager" ? "Nichts nachzubestellen — alles über Mindestbestand oder schon bestellt."
                  : !projektId ? "Projekt wählen." : projekt?.angebot ? "Alles aus dem Angebot ist schon bestellt (oder das Angebot hat kein Material aus dem Artikelstamm)."
                    : "Das Projekt hat kein Angebot."}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {vorschlaege.map((v) => {
                  const an = !aus.has(v.lieferant);
                  const summe = bestellSumme(v.positionen);
                  const namen = v.positionen.slice(0, 3).map((p) => p.bezeichnung).filter(Boolean);
                  return (
                    <li key={v.lieferant}>
                      <label className="flex cursor-pointer items-start gap-3 p-3">
                        <input type="checkbox" checked={an} className="mt-1 h-5 w-5 accent-primary"
                          onChange={() => setAus((s) => { const n = new Set(s); if (an) n.add(v.lieferant); else n.delete(v.lieferant); return n; })} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-medium">{v.lieferant}</span>
                            <span className="zahl text-sm text-muted-foreground">
                              {v.positionen.length === 1 ? "1 Artikel" : `${zahl(v.positionen.length)} Artikel`}{summe ? ` · ${euro(summe)}` : ""}
                            </span>
                          </span>
                          {namen.length > 0 && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {namen.join(", ")}{v.positionen.length > namen.length ? " …" : ""}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
