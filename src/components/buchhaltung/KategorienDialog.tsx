import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { cn } from "@/lib/utils";
import { KATEGORIE_ARTEN, kategorieLoeschen, kategorieSpeichern, useKategorien } from "./buchhaltungDaten";
import type { Kategorie, Richtung } from "./buchhaltungLogik";

type Zeile = { id: string | null; schluessel: string; name: string; art: string; stichworte: string; konto: string };

const zeileAus = (k: Kategorie): Zeile => ({ id: k.id, schluessel: k.id, name: k.name, art: k.art ?? "sonstiges", stichworte: k.stichworte, konto: k.konto ? String(k.konto) : "" });

/**
 * Kategorien pflegen, getrennt für Ausgang und Eingang: Name, Stichworte
 * (für den Vorschlag), beim Eingang die Art für die Buchhaltung, optional
 * ein eigenes Konto. Gespeichert wird alles auf einmal.
 */
export function KategorienDialog({ richtung, onRichtung }: { richtung: Richtung | null; onRichtung: (r: Richtung | null) => void }) {
  const neuLaden = useNeuLaden();
  const { data: alle = [] } = useKategorien(!!richtung);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [basis, setBasis] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const eingang = richtung === "eingang";

  useBeimOeffnen(richtung ? `${richtung}-${alle.length}` : null, () => {
    const z = alle.filter((k) => k.richtung === richtung).map(zeileAus);
    setZeilen(z);
    setBasis(JSON.stringify(z));
  });
  const geaendert = JSON.stringify(zeilen) !== basis;

  const aendern = (s: string, teil: Partial<Zeile>) => setZeilen((alt) => alt.map((z) => (z.schluessel === s ? { ...z, ...teil } : z)));
  const schieben = (i: number, um: number) => setZeilen((alt) => {
    const neu = [...alt];
    const [z] = neu.splice(i, 1);
    neu.splice(i + um, 0, z);
    return neu;
  });

  const speichern = async () => {
    if (!richtung) return;
    const namen = zeilen.map((z) => z.name.trim().toLowerCase());
    if (namen.some((n) => !n)) return toast.error("Jede Kategorie braucht einen Namen.");
    if (new Set(namen).size !== namen.length) return toast.error("Zwei Kategorien heißen gleich.");
    for (const z of zeilen) {
      if (z.konto.trim() && !/^\d{1,9}$/.test(z.konto.trim())) return toast.error(`${z.name}: das Konto ist eine Nummer.`);
    }
    setSpeichert(true);
    try {
      const vorher = alle.filter((k) => k.richtung === richtung);
      for (const k of vorher.filter((k) => !zeilen.some((z) => z.id === k.id))) await kategorieLoeschen(k.id);
      for (const [i, z] of zeilen.entries()) {
        const alt = vorher.find((k) => k.id === z.id);
        const neu = { id: z.id, richtung, name: z.name, art: eingang ? z.art : null, konto: z.konto.trim() ? Number(z.konto) : null, stichworte: z.stichworte, sortierung: i + 1 };
        if (!alt || JSON.stringify(zeileAus(alt)) !== JSON.stringify(z) || alt.sortierung !== i + 1) await kategorieSpeichern(neu);
      }
      await neuLaden("buchhaltung", "eingang");
      toast.success("Kategorien gespeichert");
      onRichtung(null);
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <FormularDialog
      open={!!richtung}
      onOpenChange={(o) => { if (!o) onRichtung(null); }}
      titel="Kategorien"
      beschreibung="Wofür das Geld hereinkommt und wofür es hinausgeht. Die Stichworte machen den Vorschlag bei neuen Rechnungen."
      gesperrt={speichert}
      ungespeichert={geaendert}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onRichtung(null)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-32" onClick={() => void speichern()} disabled={speichert || !geaendert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      )}
    >
      <div className="grid max-w-md grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1" role="tablist">
        {(["ausgang", "eingang"] as const).map((r) => (
          <button key={r} type="button" role="tab" aria-selected={richtung === r} disabled={geaendert && richtung !== r}
            title={geaendert && richtung !== r ? "Erst speichern" : undefined}
            onClick={() => onRichtung(r)}
            className={cn("min-h-11 rounded-md text-sm font-medium disabled:opacity-50", richtung === r ? "bg-card ring-1 ring-border" : "text-muted-foreground")}>
            {r === "ausgang" ? "Ausgang (Erlöse)" : "Eingang (Aufwand)"}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {zeilen.map((z, i) => (
          <li key={z.schluessel} className="grid gap-2 rounded-lg border bg-card p-3 lg:grid-cols-[14rem_10rem_1fr_7rem_auto] lg:items-center">
            <Input aria-label="Name" className="h-11 font-medium" placeholder="Name" value={z.name} onChange={(e) => aendern(z.schluessel, { name: e.target.value })} />
            {eingang ? (
              <Select value={z.art} onValueChange={(v) => aendern(z.schluessel, { art: v })}>
                <SelectTrigger className="h-11" aria-label="Art für die Buchhaltung"><SelectValue /></SelectTrigger>
                <SelectContent>{KATEGORIE_ARTEN.map((a) => <SelectItem key={a.wert} value={a.wert}>{a.text}</SelectItem>)}</SelectContent>
              </Select>
            ) : <span className="hidden lg:block" />}
            <Input aria-label="Stichworte" className="h-11" placeholder="Stichworte, mit Komma" value={z.stichworte} onChange={(e) => aendern(z.schluessel, { stichworte: e.target.value })} />
            <Input aria-label="Konto" className="h-11" inputMode="numeric" placeholder="Konto" title="Eigenes Konto für die Kanzlei (optional)" value={z.konto} onChange={(e) => aendern(z.schluessel, { konto: e.target.value })} />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Nach oben" disabled={i === 0} onClick={() => schieben(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Nach unten" disabled={i === zeilen.length - 1} onClick={() => schieben(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" aria-label="Löschen"
                onClick={() => setZeilen((alt) => alt.filter((x) => x.schluessel !== z.schluessel))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="h-11 w-full gap-1.5 lg:w-auto" onClick={() => setZeilen((alt) => [...alt, { id: null, schluessel: crypto.randomUUID(), name: "", art: "material", stichworte: "", konto: "" }])}>
        <Plus className="h-4 w-4" /> Kategorie
      </Button>
      <p className="text-sm text-muted-foreground">
        {eingang
          ? "Die Art sagt der Buchhaltung, auf welches Aufwandskonto die Rechnung kommt (Einstellungen der Kanzlei: Konten). Ein eigenes Konto geht vor."
          : "Ein eigenes Konto gilt für Rechnungen mit 20 % USt; 13 %, 10 % und Reverse Charge behalten ihre Konten."}
        {" "}Gelöschte Kategorien verschwinden aus den Rechnungen, die Rechnungen bleiben.
      </p>
    </FormularDialog>
  );
}
