import { useState } from "react";
import { toast } from "sonner";
import { Lock, Minus, PenLine, Plus, ScanBarcode, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { ScanDialog } from "@/components/scanner/ScanDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zahl, zahlLesen } from "@/lib/format";
import { EINHEITEN, type Artikel, type Lagerort } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DIREKT, materialFehler, materialMenge, mengeSchritt, neueId, textAnhaengen, type Entwurf, type MaterialZeile } from "./regieLogik";

type ArtikelKurz = Pick<Artikel, "id" | "bezeichnung" | "einheit" | "ek_preis">;

/**
 * Material im Regiebericht: suchen, scannen oder frei eintippen.
 * Artikel kommen aus einem Lagerort (Standard: der eigene Bus) und werden
 * als Ausfassung gebucht — oder „direkt“ (gekauft, geliefert, ohne Lager).
 * Freie Positionen sind immer direkt.
 */
export function MaterialListe({
  entwurf, aendern, ich, lagerorte, standardQuelle, onStandardQuelle, namen,
}: {
  entwurf: Entwurf;
  aendern: (f: (e: Entwurf) => Entwurf) => void;
  ich: string;
  lagerorte: Lagerort[];
  standardQuelle: string;
  onStandardQuelle: (q: string) => void;
  namen: (userId: string | null) => string;
}) {
  const [suche, setSuche] = useState(false);
  const [scan, setScan] = useState(false);
  const [frei, setFrei] = useState(false);

  const setzen = (key: string, teil: Partial<MaterialZeile>) =>
    aendern((e) => ({ ...e, material: e.material.map((m) => (m.key === key ? { ...m, ...teil } : m)) }));

  const artikelDazu = (a: ArtikelKurz, menge = 1) => {
    const quelle = standardQuelle;
    aendern((e) => {
      // Gleicher Artikel aus gleicher Quelle: Menge erhöhen statt zweiter Zeile
      const da = e.material.find((m) => m.artikelId === a.id && m.quelle === quelle && m.aenderbar);
      if (da) {
        return { ...e, material: e.material.map((m) => (m.key === da.key ? { ...m, menge: mengeSchritt(m.menge, menge) } : m)) };
      }
      const zeile: MaterialZeile = {
        key: neueId(), id: null, artikelId: a.id, bezeichnung: a.bezeichnung, einheit: a.einheit,
        menge: String(menge).replace(".", ","), quelle, ekPreis: a.ek_preis, aenderbar: true, basis: null, userId: ich,
      };
      return { ...e, material: [...e.material, zeile] };
    });
  };

  const codeGelesen = async (code: string) => {
    const { data, error } = await supabase.rpc("artikel_zu_code", { p_code: code });
    if (error) return toast.error("Code nicht gelesen", { description: error.message });
    const treffer = data?.[0];
    if (!treffer) return toast.error("Unbekannter Code", { description: `${code} ist nicht im Artikelstamm. Über „Suchen“ oder „Frei“ eintragen.` });
    const { data: a, error: e2 } = await supabase.from("artikel").select("id, bezeichnung, einheit, ek_preis")
      .eq("id", treffer.artikel_id).maybeSingle();
    if (e2 || !a) return toast.error("Artikel nicht gefunden", { description: e2?.message ?? code });
    const menge = Number(treffer.menge) > 0 ? Number(treffer.menge) : 1;
    artikelDazu(a, menge);
    toast.success(`${zahl(menge)} ${a.einheit} · ${a.bezeichnung}`);
  };

  const entfernen = (m: MaterialZeile) =>
    aendern((e) => ({
      ...e,
      material: e.material.filter((x) => x.key !== m.key),
      entfernt: m.id ? { ...e.entfernt, material: [...e.entfernt.material, m.id] } : e.entfernt,
    }));

  const quellen = [...lagerorte.map((l) => ({ wert: l.id, text: l.name })), { wert: DIREKT, text: "Direkt (ohne Lager)" }];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="rb-quelle" className="shrink-0 text-sm font-normal text-muted-foreground">Neues Material aus</Label>
        <Select value={standardQuelle} onValueChange={onStandardQuelle}>
          <SelectTrigger id="rb-quelle" className="h-11 min-w-0 flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {quellen.map((q) => <SelectItem key={q.wert} value={q.wert} className="py-2.5">{q.text}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {entwurf.material.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Kein Material.</p>
      ) : (
        <ul className="space-y-2">
          {entwurf.material.map((m) => (
            <MaterialZeileKarte
              key={m.key}
              m={m}
              quellen={quellen}
              wer={namen(m.userId)}
              onSetzen={(teil) => setzen(m.key, teil)}
              onEntfernen={() => entfernen(m)}
            />
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="outline" className="h-12 gap-1.5 px-2" onClick={() => setSuche(true)}>
          <Search className="h-4 w-4" /> Suchen
        </Button>
        <Button type="button" variant="outline" className="h-12 gap-1.5 px-2" onClick={() => setScan(true)}>
          <ScanBarcode className="h-4 w-4" /> Scannen
        </Button>
        <Button type="button" variant="outline" className="h-12 gap-1.5 px-2" onClick={() => setFrei(true)}>
          <PenLine className="h-4 w-4" /> Frei
        </Button>
      </div>

      <FormularDialog open={suche} onOpenChange={setSuche} titel="Material suchen" beschreibung={`Aus: ${quellen.find((q) => q.wert === standardQuelle)?.text ?? "–"}`}>
        {suche && (
          <ArtikelSuche
            autoFocus
            listeKlasse="max-h-[calc(100dvh-13rem)]"
            onWahl={(a) => {
              artikelDazu(a);
              setSuche(false);
              toast.success(`${a.bezeichnung} dazu`);
            }}
          />
        )}
      </FormularDialog>

      <ScanDialog open={scan} onOpenChange={setScan} onCode={(c) => void codeGelesen(c)} dauerhaft titel="Material scannen" />

      <FreiePosition
        open={frei}
        onOpenChange={setFrei}
        onDazu={(bezeichnung, menge, einheit) => aendern((e) => ({
          ...e,
          material: [...e.material, {
            key: neueId(), id: null, artikelId: null, bezeichnung, einheit, menge, quelle: DIREKT, ekPreis: null,
            aenderbar: true, basis: null, userId: ich,
          }],
        }))}
      />
    </div>
  );
}

function MaterialZeileKarte({
  m, quellen, wer, onSetzen, onEntfernen,
}: {
  m: MaterialZeile;
  quellen: { wert: string; text: string }[];
  wer: string;
  onSetzen: (teil: Partial<MaterialZeile>) => void;
  onEntfernen: () => void;
}) {
  const fehler = materialFehler(m);
  const menge = materialMenge(m);
  // Eine gelöschte oder inaktive Quelle trotzdem anzeigen
  const optionen = m.artikelId && m.quelle !== DIREKT && !quellen.some((q) => q.wert === m.quelle)
    ? [{ wert: m.quelle, text: "Anderer Lagerort" }, ...quellen]
    : quellen;

  if (!m.aenderbar) {
    return (
      <li className="rounded-lg border bg-card p-3">
        <div className="flex items-baseline gap-3">
          <span className="zahl w-20 shrink-0 text-right font-semibold">{zahl(menge)} {m.einheit}</span>
          <span className="min-w-0 flex-1 text-sm leading-snug">{m.bezeichnung}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 pl-[5.75rem] text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> {m.verrechnet ? "schon verrechnet" : `gebucht von ${wer} — ändern nur ${wer} oder der Chef`}
        </p>
      </li>
    );
  }

  return (
    <li className={cn("rounded-lg border bg-card p-3", fehler && "border-destructive/60")}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 pt-0.5 font-medium leading-snug">{m.bezeichnung || "Ohne Bezeichnung"}</p>
        <Button type="button" variant="ghost" size="icon" className="-mr-1.5 -mt-1.5 h-11 w-11 shrink-0 text-muted-foreground"
          onClick={onEntfernen} aria-label={`${m.bezeichnung} entfernen`}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      {/* Am Handy rutscht „Woher“ in eine eigene Zeile, ab Tablet steht es daneben */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" disabled={menge <= 1}
          onClick={() => onSetzen({ menge: mengeSchritt(m.menge, -1) })} aria-label="Eins weniger">
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          inputMode="decimal"
          enterKeyHint="done"
          className="zahl h-11 w-16 shrink-0 px-1 text-center text-base font-semibold"
          value={m.menge}
          onChange={(e) => onSetzen({ menge: e.target.value })}
          onBlur={() => { if (m.menge.trim() && zahlLesen(m.menge) > 0) onSetzen({ menge: String(menge).replace(".", ",") }); }}
          aria-label={`Menge ${m.bezeichnung}`}
        />
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
          onClick={() => onSetzen({ menge: mengeSchritt(m.menge, 1) })} aria-label="Eins mehr">
          <Plus className="h-4 w-4" />
        </Button>
        <span className="w-9 shrink-0 truncate text-sm text-muted-foreground">{m.einheit}</span>
        {m.artikelId ? (
          <Select value={m.quelle} onValueChange={(q) => onSetzen({ quelle: q })}>
            <SelectTrigger className="h-11 min-w-[9rem] flex-1 basis-[9rem] px-2.5 text-sm" aria-label="Woher"><SelectValue /></SelectTrigger>
            <SelectContent>
              {optionen.map((q) => <SelectItem key={q.wert} value={q.wert} className="py-2.5">{q.text}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">freie Position · direkt</span>
        )}
      </div>
      {fehler && <p className="mt-1 text-sm text-destructive">{fehler}</p>}
    </li>
  );
}

function FreiePosition({
  open, onOpenChange, onDazu,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDazu: (bezeichnung: string, menge: string, einheit: string) => void;
}) {
  const [bezeichnung, setBezeichnung] = useState("");
  const [menge, setMenge] = useState("1");
  const [einheit, setEinheit] = useState("Stk");

  const schliessen = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setBezeichnung("");
      setMenge("1");
      setEinheit("Stk");
    }
  };

  const dazu = () => {
    if (!bezeichnung.trim()) return toast.error("Bitte eine Bezeichnung eintragen.");
    if (!(zahlLesen(menge) > 0)) return toast.error("Die Menge muss größer als 0 sein.");
    onDazu(bezeichnung.trim(), menge.trim(), einheit);
    schliessen(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={schliessen}
      titel="Freie Position"
      beschreibung="Material, das nicht im Artikelstamm ist — wird direkt gebucht, ohne Lager."
      fuss={
        <>
          <Button variant="outline" className="h-12" onClick={() => schliessen(false)}>Abbrechen</Button>
          <Button className="h-12 min-w-40" onClick={dazu}>Hinzufügen</Button>
        </>
      }
    >
      <div className="max-w-xl space-y-4">
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="fp-bez">Bezeichnung</Label>
            <DiktatKnopf onText={(t) => setBezeichnung((alt) => textAnhaengen(alt, t))} />
          </div>
          <Input id="fp-bez" className="h-12 text-base" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
            placeholder="z. B. Kabelbinder schwarz" autoComplete="off" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="fp-menge">Menge</Label>
            <Input id="fp-menge" inputMode="decimal" className="zahl h-12 text-base" value={menge} onChange={(e) => setMenge(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fp-einheit">Einheit</Label>
            <Select value={einheit} onValueChange={setEinheit}>
              <SelectTrigger id="fp-einheit" className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EINHEITEN.map((e) => <SelectItem key={e} value={e} className="py-2.5">{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </FormularDialog>
  );
}
