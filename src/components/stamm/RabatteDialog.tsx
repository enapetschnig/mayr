import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormularDialog } from "@/components/FormularDialog";
import { useNeuLaden } from "@/hooks/useDaten";
import { dezimalLesen, zahl } from "@/lib/format";
import { fehlerText, useArtikelGruppen, useLieferanten } from "./stammDaten";

type Zeile = { id: string | null; hersteller: string | null; rabattgruppe: string | null; rabatt: string; notiz: string };
const zeileText = (z: Pick<Zeile, "hersteller" | "rabattgruppe">) =>
  z.rabattgruppe ? `Rabattgruppe ${z.rabattgruppe}` : z.hersteller ? z.hersteller : "Alle Artikel (Grundrabatt)";

/**
 * Einkaufskonditionen je Lieferant: Grundrabatt, dazu genauere je Hersteller
 * oder Rabattgruppe. Beim Speichern rechnet die Datenbank den Einkauf aller
 * Artikel mit Listenpreis neu — die Angebote kalkulieren dann damit.
 */
export function RabatteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const neuLaden = useNeuLaden();
  const { data: lieferanten = [] } = useLieferanten();
  const [lieferant, setLieferant] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [geladen, setGeladen] = useState<Zeile[]>([]);
  const [neu, setNeu] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const aktiv = lieferant ?? lieferanten[0] ?? null;
  const { data: gruppen = [] } = useArtikelGruppen(aktiv);

  useEffect(() => {
    if (!open || !aktiv) return;
    let weg = false;
    void supabase.from("rabatte").select("*").eq("lieferant", aktiv).then(({ data, error }) => {
      if (weg) return;
      if (error) { toast.error("Rabatte nicht geladen", { description: fehlerText(error) }); return; }
      const z = (data ?? []).map((r) => ({ id: r.id, hersteller: r.hersteller, rabattgruppe: r.rabattgruppe, rabatt: zahl(Number(r.rabatt)), notiz: r.notiz ?? "" }))
        .sort((a, b) => Number(!!a.hersteller || !!a.rabattgruppe) - Number(!!b.hersteller || !!b.rabattgruppe) || zeileText(a).localeCompare(zeileText(b)));
      setZeilen(z);
      setGeladen(z);
    });
    return () => { weg = true; };
  }, [open, aktiv]);

  // Auswahl zum Hinzufügen: Hersteller (mit Anzahl) und Rabattgruppen (mit Hersteller)
  const optionen = useMemo(() => {
    const hersteller = new Map<string, number>();
    const rg = new Map<string, { anzahl: number; hersteller: Set<string> }>();
    gruppen.forEach((g) => {
      if (g.hersteller) hersteller.set(g.hersteller, (hersteller.get(g.hersteller) ?? 0) + g.anzahl);
      if (g.rabattgruppe) {
        const e = rg.get(g.rabattgruppe) ?? { anzahl: 0, hersteller: new Set<string>() };
        e.anzahl += g.anzahl;
        if (g.hersteller) e.hersteller.add(g.hersteller);
        rg.set(g.rabattgruppe, e);
      }
    });
    const da = new Set(zeilen.map((z) => `${z.hersteller ?? ""}|${z.rabattgruppe ?? ""}`));
    return [
      ...(!da.has("|") ? [{ wert: "|", text: "Alle Artikel (Grundrabatt)" }] : []),
      ...[...hersteller.entries()].sort((a, b) => b[1] - a[1]).filter(([h]) => !da.has(`${h}|`))
        .map(([h, n]) => ({ wert: `${h}|`, text: `Hersteller ${h} · ${zahl(n)} Artikel` })),
      ...[...rg.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl).filter(([c]) => !da.has(`|${c}`))
        .map(([c, e]) => ({ wert: `|${c}`, text: `Rabattgruppe ${c} · ${[...e.hersteller].join(", ") || "ohne Hersteller"} · ${zahl(e.anzahl)} Artikel` })),
    ];
  }, [gruppen, zeilen]);

  const hinzufuegen = () => {
    if (!neu) return;
    const [h, g] = neu.split("|");
    setZeilen((alt) => [...alt, { id: null, hersteller: h || null, rabattgruppe: g || null, rabatt: "", notiz: "" }]);
    setNeu("");
  };
  const setZeile = (i: number, w: Partial<Zeile>) => setZeilen((alt) => alt.map((z, j) => (j === i ? { ...z, ...w } : z)));
  const anzahlVon = (z: Zeile) => gruppen
    .filter((g) => (!z.hersteller || g.hersteller === z.hersteller) && (!z.rabattgruppe || g.rabattgruppe === z.rabattgruppe))
    .reduce((s, g) => s + g.anzahl, 0);

  const ungueltig = zeilen.some((z) => { const r = dezimalLesen(z.rabatt); return r == null || r <= -100 || r >= 100; });
  const geaendert = JSON.stringify(zeilen) !== JSON.stringify(geladen);

  const speichern = async () => {
    if (!aktiv) return;
    setLaeuft("Speichern …");
    try {
      const weg = geladen.filter((g) => !zeilen.some((z) => z.id === g.id)).map((g) => g.id!);
      if (weg.length) {
        const { error } = await supabase.from("rabatte").delete().in("id", weg);
        if (error) throw error;
      }
      for (const z of zeilen) {
        const werte = { lieferant: aktiv, hersteller: z.hersteller, rabattgruppe: z.rabattgruppe, rabatt: dezimalLesen(z.rabatt)!, notiz: z.notiz.trim() || null };
        const { error } = z.id
          ? await supabase.from("rabatte").update({ ...werte, updated_at: new Date().toISOString() }).eq("id", z.id)
          : await supabase.from("rabatte").insert(werte);
        if (error) throw error;
      }
      // Einkauf in Paketen neu rechnen (große Kataloge)
      let gesamt = 0;
      for (;;) {
        setLaeuft(`Einkauf neu rechnen … ${zahl(gesamt)} Artikel`);
        const { data, error } = await supabase.rpc("rabatte_anwenden", { p_lieferant: aktiv, p_max: 5000 });
        if (error) throw error;
        if (!data) break;
        gesamt += data;
      }
      toast.success("Rabatte gespeichert", { description: gesamt ? `Einkauf von ${zahl(gesamt)} Artikeln neu gerechnet` : "Einkaufspreise waren schon aktuell" });
      void neuLaden("artikel");
      onOpenChange(false);
    } catch (e) {
      toast.error("Rabatte nicht gespeichert", { description: fehlerText(e as { code?: string; message?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={(o) => { if (!laeuft) onOpenChange(o); }}
      titel="Rabatte beim Großhandel"
      beschreibung="Einkauf = Listenpreis − Rabatt. Der genaueste gilt: Rabattgruppe vor Hersteller vor Grundrabatt."
      ungespeichert={geaendert}
      gesperrt={!!laeuft}
      fuss={(
        <>
          <Button variant="outline" className="h-12" disabled={!!laeuft} onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12 gap-1.5" disabled={!!laeuft || ungueltig || !geaendert} onClick={() => void speichern()}>
            {laeuft ? <><Loader2 className="h-4 w-4 animate-spin" /> {laeuft}</> : "Speichern und Einkauf neu rechnen"}
          </Button>
        </>
      )}
    >
      {lieferanten.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="rab-lief">Lieferant</Label>
          <select id="rab-lief" value={aktiv ?? ""} onChange={(e) => setLieferant(e.target.value)} disabled={geaendert}
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-base">
            {lieferanten.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}

      <ul className="divide-y rounded-lg border bg-card">
        {zeilen.length === 0 && <li className="p-4 text-sm text-muted-foreground">Noch keine Rabatte für {aktiv} — unten den Grundrabatt anlegen.</li>}
        {zeilen.map((z, i) => (
          <li key={`${z.hersteller}|${z.rabattgruppe}`} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{zeileText(z)}</p>
              <p className="text-xs text-muted-foreground">{zahl(anzahlVon(z))} Artikel{z.rabattgruppe && z.hersteller ? ` · ${z.hersteller}` : ""}</p>
              <Input value={z.notiz} placeholder="Notiz (z. B. Jahresgespräch 2026)" className="mt-1.5 h-9 text-sm" onChange={(e) => setZeile(i, { notiz: e.target.value })} />
            </div>
            <div className="flex items-center gap-1.5">
              <Input inputMode="decimal" className="zahl h-12 w-20 text-right text-base" value={z.rabatt} aria-label={`Rabatt ${zeileText(z)}`}
                onChange={(e) => setZeile(i, { rabatt: e.target.value })} />
              <span>%</span>
              <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label="Entfernen"
                onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <select value={neu} onChange={(e) => setNeu(e.target.value)} aria-label="Rabatt hinzufügen für"
          className="h-12 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base">
          <option value="">Rabatt hinzufügen für …</option>
          {optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
        </select>
        <Button variant="outline" className="h-12 gap-1.5" disabled={!neu} onClick={hinzufuegen}><Plus className="h-4 w-4" /> Dazu</Button>
      </div>
    </FormularDialog>
  );
}
