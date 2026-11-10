import { useEffect, useState } from "react";
import { Loader2, Mic, MicOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormularDialog } from "@/components/FormularDialog";
import { StatusPille } from "@/components/Bausteine";
import { useDiktat } from "@/components/DiktatKnopf";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, zahlLesen } from "@/lib/format";
import { materialVorschlag, type KiKomponente, type KiMaterial } from "@/lib/ki";
import { artikelVk } from "@/lib/preise";
import type { Artikel } from "@/lib/types";
import { artikelPosition, leerePosition, zahlText, type EditorPosition } from "./editor";

const BEISPIELE = [
  "PV-Anlage 9 kWp auf Ziegeldach mit Überspannungsschutz",
  "Wallbox 11 kW in der Garage, Zuleitung 20 m",
  "Neuer Zählerverteiler Einfamilienhaus mit 3 FI und 24 LS",
  "Badsanierung: 4 Steckdosen, 2 Lichtauslässe, Spiegelleuchte",
];
const SCHRITTE = ["Vorhaben verstehen …", "Komponenten und Mengen planen …", "Im Artikelstamm suchen …", "Passende Artikel auswählen …"];
const OHNE = "__ohne__";

type Zeile = { aktiv: boolean; menge: string; artikelId: string };

/**
 * Material per KI: Vorhaben in einem Satz beschreiben, Claude plant die
 * Komponenten samt Mengen und sucht sie im eigenen Artikelstamm (Datanorm).
 * Der Mensch hakt ab, ändert Mengen oder wählt eine Alternative.
 */
export function KiMaterialDialog({
  open, onOpenChange, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Positionen, optional unter einem neuen Titel */
  onUebernehmen: (positionen: EditorPosition[], titel: string | null, hinweise: string[]) => void;
}) {
  const { firma } = useSitzung();
  const [text, setText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<KiMaterial | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [mitTitel, setMitTitel] = useState(true);
  const [mitHinweisen, setMitHinweisen] = useState(false);
  const diktat = useDiktat((t) => setText((alt) => (alt.trim() ? `${alt.trimEnd()} ${t}` : t)));

  useEffect(() => {
    if (!laeuft) return;
    setSchritt(0);
    const t = setInterval(() => setSchritt((s) => Math.min(s + 1, SCHRITTE.length - 1)), 8000);
    return () => clearInterval(t);
  }, [laeuft]);
  const { aktiv: hoert, stop: diktatStop } = diktat;
  useEffect(() => {
    if (!open && hoert) diktatStop();
  }, [open, hoert, diktatStop]);

  const fragen = async () => {
    diktat.stop();
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await materialVorschlag(text);
      setErgebnis(r);
      setZeilen(r.komponenten.map((k) => ({ aktiv: true, menge: zahlText(k.menge), artikelId: k.artikel?.id ?? OHNE })));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const neu = () => { setErgebnis(null); setZeilen([]); };
  const setZeile = (i: number, z: Partial<Zeile>) => setZeilen((alt) => alt.map((x, j) => (j === i ? { ...x, ...z } : x)));
  const artikelVon = (k: KiKomponente, id: string): Artikel | null =>
    id === OHNE ? null : [k.artikel, ...k.alternativen].find((a) => a?.id === id) ?? null;

  const gewaehlt = ergebnis ? ergebnis.komponenten.map((k, i) => ({ k, z: zeilen[i] })).filter(({ z }) => z?.aktiv && zahlLesen(z.menge) > 0) : [];
  const summe = gewaehlt.reduce((s, { k, z }) => s + artikelVk(artikelVon(k, z.artikelId), firma) * zahlLesen(z.menge), 0);
  const ohnePreis = gewaehlt.filter(({ k, z }) => !artikelVon(k, z.artikelId)).length;

  const uebernehmen = () => {
    if (!ergebnis) return;
    const positionen = gewaehlt.map(({ k, z }) => {
      const a = artikelVon(k, z.artikelId);
      return a
        ? { ...artikelPosition(a, firma), menge: z.menge }
        : leerePosition("material", { bezeichnung: k.was, menge: z.menge, einheit: k.einheit || "Stk" });
    });
    onUebernehmen(positionen, mitTitel ? ergebnis.titel : null, mitHinweisen ? ergebnis.hinweise : []);
    onOpenChange(false);
    neu();
    setText("");
  };

  // nach Gruppe, Reihenfolge der KI
  const gruppen: { name: string; idx: number[] }[] = [];
  ergebnis?.komponenten.forEach((k, i) => {
    const g = gruppen.find((x) => x.name === k.gruppe);
    if (g) g.idx.push(i); else gruppen.push({ name: k.gruppe, idx: [i] });
  });

  return (
    <FormularDialog
      open={open}
      onOpenChange={(o) => { if (!laeuft) onOpenChange(o); }}
      titel="Material per KI"
      beschreibung={ergebnis ? ergebnis.titel : "Beschreiben, was gebaut wird — die KI stellt das Material aus deinem Artikelstamm zusammen"}
      gesperrt={laeuft}
      fuss={ergebnis ? (
        <>
          <Button variant="outline" className="h-12 sm:mr-auto" onClick={neu}>Neu beschreiben</Button>
          <Button className="h-12" disabled={!gewaehlt.length} onClick={uebernehmen}>
            {gewaehlt.length} {gewaehlt.length === 1 ? "Position" : "Positionen"} übernehmen
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="h-12" disabled={laeuft} onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12 gap-1.5" disabled={laeuft || text.trim().length < 3} onClick={() => void fragen()}>
            {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Vorschlagen
          </Button>
        </>
      )}
    >
      {!ergebnis && (
        <>
          <div className="relative">
            <Textarea rows={3} className="pr-14 text-base" placeholder="z. B. PV-Anlage 9 kWp auf Ziegeldach" value={text}
              onChange={(e) => setText(e.target.value)} disabled={laeuft} />
            {diktat.moeglich && (
              <Button type="button" variant={diktat.aktiv ? "default" : "outline"} size="icon" className="absolute right-2 top-2 h-10 w-10"
                aria-label={diktat.aktiv ? "Diktat beenden" : "Diktieren"} onClick={() => (diktat.aktiv ? diktat.stop() : diktat.start())} disabled={laeuft}>
                {diktat.aktiv ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
          </div>
          {!laeuft && (
            <div className="flex flex-wrap gap-2">
              {BEISPIELE.map((b) => (
                <button key={b} type="button" onClick={() => setText(b)}
                  className="min-h-9 rounded-full border bg-card px-3 text-left text-sm hover:border-primary/50">{b}</button>
              ))}
            </div>
          )}
          {laeuft && (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              <div>
                <p className="font-medium">{SCHRITTE[schritt]}</p>
                <p className="text-muted-foreground">Dauert etwa eine halbe Minute.</p>
              </div>
            </div>
          )}
          {fehler && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{fehler}</p>}
        </>
      )}

      {ergebnis && (
        <>
          {gruppen.map((g) => (
            <section key={g.name} className="space-y-1.5">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</h3>
              <ul className="divide-y rounded-lg border bg-card">
                {g.idx.map((i) => {
                  const k = ergebnis.komponenten[i];
                  const z = zeilen[i];
                  const a = artikelVon(k, z.artikelId);
                  const auswahl = [k.artikel, ...k.alternativen].filter((x): x is Artikel => !!x);
                  return (
                    <li key={i} className="flex gap-3 p-3">
                      <Checkbox className="mt-1 h-5 w-5" checked={z.aktiv} onCheckedChange={(c) => setZeile(i, { aktiv: !!c })} aria-label={k.was} />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="font-medium leading-tight">{k.was}</p>
                          {k.passt === "aehnlich" && a?.id === k.artikel?.id && <StatusPille eintrag={{ ton: "gelb", text: "ähnlich — prüfen" }} />}
                          {!a && <StatusPille eintrag={{ ton: "grau", text: "ohne Artikel" }} />}
                        </div>
                        <p className="text-xs text-muted-foreground">{k.begruendung}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Input inputMode="decimal" className="zahl h-10 w-20 text-right" value={z.menge} aria-label="Menge"
                              onChange={(e) => setZeile(i, { menge: e.target.value })} />
                            <span className="text-sm text-muted-foreground">{a?.einheit || k.einheit}</span>
                          </div>
                          <select value={z.artikelId} onChange={(e) => setZeile(i, { artikelId: e.target.value })} aria-label="Artikel"
                            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                            {auswahl.map((x) => (
                              <option key={x.id} value={x.id}>{x.bezeichnung}{x.hersteller ? ` · ${x.hersteller}` : ""} — {euro(artikelVk(x, firma))}</option>
                            ))}
                            <option value={OHNE}>Ohne Artikel — Preis selbst eintragen</option>
                          </select>
                        </div>
                      </div>
                      <span className="zahl shrink-0 pt-0.5 text-right text-sm font-semibold">
                        {a ? euro(artikelVk(a, firma) * zahlLesen(z.menge)) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {ergebnis.hinweise.length > 0 && (
            <section className="space-y-1.5 rounded-lg border bg-card p-3 text-sm">
              <p className="font-semibold">Vor Ort klären</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {ergebnis.hinweise.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </section>
          )}

          <div className="space-y-2 text-sm">
            <label className="flex min-h-10 items-center gap-2.5">
              <Checkbox className="h-5 w-5" checked={mitTitel} onCheckedChange={(c) => setMitTitel(!!c)} />
              Unter eigenem Titel „{ergebnis.titel}“
            </label>
            <label className="flex min-h-10 items-center gap-2.5">
              <Checkbox className="h-5 w-5" checked={mitHinweisen} onCheckedChange={(c) => setMitHinweisen(!!c)} />
              Hinweise als Text ins Angebot
            </label>
          </div>
          <p className="text-sm">
            Material netto <span className="zahl font-semibold">{euro(summe)}</span>
            {ohnePreis > 0 && <span className="text-muted-foreground"> · {ohnePreis} ohne Preis, bitte eintragen</span>}
          </p>
        </>
      )}
    </FormularDialog>
  );
}
