import { useEffect, useState } from "react";
import { Calculator, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormularDialog } from "@/components/FormularDialog";
import { dezimalLesen, euro, zahl } from "@/lib/format";
import { useSitzung } from "@/hooks/useSitzung";
import { aufschlagAus, kalkPreis, lohnarten } from "@/lib/kalkulation";
import { EINHEITEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ART_NAME, positionGesamt, preisText, type EditorPosition, type PositionsArt } from "./editor";

const ARTEN_WAEHLBAR: PositionsArt[] = ["leistung", "artikel", "arbeit", "material", "pauschale", "text"];

/** Eine Position ganz bearbeiten (oder frei anlegen): Texte, Menge, Einheit, Preis. */
export function PositionDialog({
  position, onOpenChange, onUebernehmen, onLoeschen, neu = false, stundensatz,
}: {
  position: EditorPosition | null;
  onOpenChange: (o: boolean) => void;
  onUebernehmen: (p: EditorPosition) => void;
  onLoeschen?: (id: string) => void;
  /** Freie Position, noch nicht in der Liste */
  neu?: boolean;
  /** Standard-Stundensatz (Projekt oder Betrieb) für die Kalkulation */
  stundensatz?: number;
}) {
  const { firma } = useSitzung();
  const [p, setP] = useState<EditorPosition | null>(position);
  // Kalkulation: Einkauf, Aufschlag, Minuten und Satz als Text — jede Änderung rechnet den Einzelpreis neu
  const [kalkOffen, setKalkOffen] = useState(false);
  const [ek, setEk] = useState("");
  const [aufschlag, setAufschlag] = useState("");
  const [minuten, setMinuten] = useState("");
  const [satzName, setSatzName] = useState("Standard");
  const standardSatz = stundensatz ?? Number(firma?.stundensatz ?? 0);
  useEffect(() => {
    setP(position);
    if (!position) return;
    setKalkOffen(position.ek_preis != null || position.minuten != null);
    setEk(position.ek_preis == null ? "" : zahl(position.ek_preis));
    setMinuten(position.minuten == null ? "" : zahl(position.minuten));
    // der Aufschlag, der im Preis steckt — sonst der des Betriebs
    const drin = aufschlagAus({ preis: dezimalLesen(position.einzelpreis) ?? 0, ek: position.ek_preis, minuten: position.minuten, satz: standardSatz });
    setAufschlag(zahl(drin ?? Number(firma?.material_aufschlag ?? 0)));
    setSatzName("Standard");
  }, [position, firma?.material_aufschlag, standardSatz]);
  if (!p) return null;

  const saetze = lohnarten(firma, standardSatz);
  const satz = saetze.find((l) => l.name === satzName) ?? saetze[0];
  const kalkulierbar = p.art !== "arbeit" && p.art !== "pauschale";
  const kalkAendern = (teil: { ek?: string; aufschlag?: string; minuten?: string; satzName?: string }) => {
    const werte = { ek, aufschlag, minuten, satzName, ...teil };
    setEk(werte.ek);
    setAufschlag(werte.aufschlag);
    setMinuten(werte.minuten);
    setSatzName(werte.satzName);
    const e = dezimalLesen(werte.ek);
    const m = dezimalLesen(werte.minuten);
    const s2 = (saetze.find((l) => l.name === werte.satzName) ?? saetze[0])?.satz ?? 0;
    const preis = kalkPreis({ ek: e ?? 0, aufschlag: dezimalLesen(werte.aufschlag) ?? 0, minuten: m ?? 0, satz: s2 });
    // EK und Montagezeit gehen in die interne Kalkulation des Belegs, der Preis direkt in die Position
    setP({ ...p, ek_preis: e, minuten: m, einzelpreis: preis > 0 ? preisText(preis) : p.einzelpreis });
  };
  const aufschlagPlus = (d: number) => kalkAendern({ aufschlag: zahl(Math.round(((dezimalLesen(aufschlag) ?? 0) + d) * 10) / 10) });
  /** Einzelpreis von Hand geändert: der Aufschlag folgt */
  const preisAendern = (wert: string) => {
    setP({ ...p, einzelpreis: wert });
    const drin = aufschlagAus({ preis: dezimalLesen(wert) ?? 0, ek: dezimalLesen(ek), minuten: dezimalLesen(minuten), satz: satz?.satz ?? 0 });
    if (drin != null) setAufschlag(zahl(drin));
  };
  const ekZahl = dezimalLesen(ek);
  const ertrag = ekZahl != null ? (dezimalLesen(p.einzelpreis) ?? 0) - ekZahl - ((dezimalLesen(minuten) ?? 0) / 60) * (satz?.satz ?? 0) : null;

  const titel = p.art === "titel";
  const text = p.art === "text";
  const set = (werte: Partial<EditorPosition>) => setP({ ...p, ...werte });
  const einheiten = EINHEITEN.includes(p.einheit) ? EINHEITEN : [p.einheit, ...EINHEITEN];

  return (
    <FormularDialog
      open={!!position}
      onOpenChange={onOpenChange}
      titel={neu ? "Freie Position" : titel ? "Titel bearbeiten" : "Position bearbeiten"}
      beschreibung={neu ? "Text, Menge und Preis selbst eintragen" : titel ? "Raum oder Zwischenüberschrift" : ART_NAME[p.art]}
      fuss={(
        <>
          {!neu && onLoeschen && (
            <Button variant="ghost" className="h-12 text-destructive hover:text-destructive sm:mr-auto" onClick={() => onLoeschen(p.id)}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={neu && !p.bezeichnung.trim()} onClick={() => onUebernehmen(p)}>
            {neu ? "Hinzufügen" : "Übernehmen"}
          </Button>
        </>
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pos-bez">{titel ? "Name" : "Bezeichnung"}</Label>
        <Textarea id="pos-bez" rows={2} value={p.bezeichnung} onChange={(e) => set({ bezeichnung: e.target.value })} className="text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pos-lang">{titel ? "Beschreibung (optional)" : "Langtext (optional, steht klein darunter)"}</Label>
        <Textarea id="pos-lang" rows={4} value={p.langtext} onChange={(e) => set({ langtext: e.target.value })} />
      </div>

      {!titel && !text && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="pos-menge">Menge</Label>
              <Input id="pos-menge" inputMode="decimal" className="h-12 text-right zahl" value={p.menge} onChange={(e) => set({ menge: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Einheit</Label>
              <Select value={p.einheit} onValueChange={(v) => set({ einheit: v })}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{einheiten.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-ep">Einzelpreis netto €</Label>
              <Input id="pos-ep" inputMode="decimal" className="h-12 text-right zahl" value={p.einzelpreis} onChange={(e) => preisAendern(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gesamt</Label>
              <div className="feld-berechnet flex h-12 items-center justify-end rounded-md border px-3 font-semibold zahl">{euro(positionGesamt(p))}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Art</Label>
            <Select value={p.art} onValueChange={(v) => set({ art: v as PositionsArt })}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>{ARTEN_WAEHLBAR.map((a) => <SelectItem key={a} value={a}>{ART_NAME[a]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {kalkulierbar && (
            <section className="rounded-lg border bg-card">
              <button type="button" onClick={() => setKalkOffen(!kalkOffen)} aria-expanded={kalkOffen}
                className="flex min-h-12 w-full items-center gap-2 px-3 text-left text-sm font-medium">
                <Calculator className="h-4 w-4 text-primary" />
                <span className="flex-1">Einkauf und Aufschlag <span className="font-normal text-muted-foreground">— {ekZahl != null ? `EK ${euro(ekZahl)} · Aufschlag ${aufschlag || 0} %` : "Einkauf + Aufschlag + Arbeitszeit"}</span></span>
                <ChevronDown className={kalkOffen ? "h-4 w-4 rotate-180 transition-transform" : "h-4 w-4 transition-transform"} />
              </button>
              {kalkOffen && (
                <div className="space-y-3 border-t px-3 pb-3 pt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="k-ek">Einkauf € je {p.einheit}</Label>
                      <Input id="k-ek" inputMode="decimal" className="zahl h-12 text-right" value={ek} onChange={(e) => kalkAendern({ ek: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="k-auf">Aufschlag %</Label>
                      <div className="flex">
                        <Button type="button" variant="outline" className="h-12 w-10 shrink-0 rounded-r-none px-0" aria-label="Aufschlag 5 % weniger" onClick={() => aufschlagPlus(-5)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input id="k-auf" inputMode="decimal" className="zahl h-12 min-w-0 rounded-none border-x-0 text-center" value={aufschlag}
                          onChange={(e) => kalkAendern({ aufschlag: e.target.value })} />
                        <Button type="button" variant="outline" className="h-12 w-10 shrink-0 rounded-l-none px-0" aria-label="Aufschlag 5 % mehr" onClick={() => aufschlagPlus(5)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="k-min">Arbeitszeit Min.</Label>
                      <Input id="k-min" inputMode="decimal" className="zahl h-12 text-right" value={minuten} onChange={(e) => kalkAendern({ minuten: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stundensatz</Label>
                      <Select value={satz?.name} onValueChange={(v) => kalkAendern({ satzName: v })}>
                        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {saetze.map((l) => <SelectItem key={l.name} value={l.name}>{l.name} · {euro(l.satz)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Einzelpreis = Einkauf + Aufschlag{dezimalLesen(minuten) ? " + Arbeitszeit × Stundensatz" : ""} — ändert sich mit.
                    {ertrag != null && <> Aufschlag je {p.einheit}: <span className={cn("zahl font-semibold", ertrag < 0 ? "text-destructive" : "text-foreground")}>{euro(ertrag)}</span></>}
                  </p>
                </div>
              )}
            </section>
          )}
          {p.quelle && (
            <p className="text-xs text-muted-foreground">
              Aus dem Projekt übernommen — löschen gibt die Stunden und das Material wieder frei.
            </p>
          )}
        </>
      )}
    </FormularDialog>
  );
}
