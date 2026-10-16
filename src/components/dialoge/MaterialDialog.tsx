import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjektWahl } from "@/components/ProjektWahl";
import { SichtbarkeitWahl } from "@/components/Bausteine";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, isoTag, zahlLesen } from "@/lib/format";
import { EINHEITEN, type Material, type Sichtbarkeit } from "@/lib/types";

/**
 * Material auf ein Projekt buchen.
 *
 * "Speichern & nächstes" lässt den Dialog offen und behält Projekt, Datum
 * und Sichtbarkeit — so tippt man einen ganzen Lieferschein am Stück ab.
 * Bezeichnungen, die die eigene Firma schon einmal gebucht hat, schlägt die
 * App samt letztem Preis und Einheit vor.
 */
export function MaterialDialog({
  open, onOpenChange, eintrag, projektId: vorProjekt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eintrag?: Material | null;
  projektId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { firma } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const [projektId, setProjektId] = useState("");
  const [datum, setDatum] = useState(isoTag());
  const [bezeichnung, setBezeichnung] = useState("");
  const [menge, setMenge] = useState("1");
  const [einheit, setEinheit] = useState("Stk");
  const [ek, setEk] = useState("");
  const [notiz, setNotiz] = useState("");
  const [sicht, setSicht] = useState<Sichtbarkeit>("privat");
  const [speichert, setSpeichert] = useState(false);
  const [anzahl, setAnzahl] = useState(0);
  const feld = useRef<HTMLInputElement>(null);

  // Vorschläge aus den eigenen Buchungen (neueste zuerst, je Bezeichnung einmal)
  const { data: vorschlaege = [] } = useQuery({
    queryKey: ["material-vorschlaege", firma?.id],
    enabled: open && !!firma,
    queryFn: async () => {
      const { data } = await supabase.from("material")
        .select("bezeichnung, einheit, ek_preis")
        .eq("firma_id", firma!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      const gesehen = new Map<string, { bezeichnung: string; einheit: string; ek_preis: number | null }>();
      (data ?? []).forEach((m) => { if (!gesehen.has(m.bezeichnung.toLowerCase())) gesehen.set(m.bezeichnung.toLowerCase(), m); });
      return [...gesehen.values()];
    },
  });

  useEffect(() => {
    if (!open) return;
    setAnzahl(0);
    if (eintrag) {
      setProjektId(eintrag.projekt_id);
      setDatum(eintrag.datum);
      setBezeichnung(eintrag.bezeichnung);
      setMenge(String(eintrag.menge).replace(".", ","));
      setEinheit(eintrag.einheit);
      setEk(eintrag.ek_preis != null ? String(eintrag.ek_preis).replace(".", ",") : "");
      setNotiz(eintrag.notiz || "");
      setSicht(eintrag.sichtbarkeit as Sichtbarkeit);
    } else {
      setProjektId(vorProjekt || "");
      setDatum(isoTag());
      leeren();
      setSicht("privat");
    }
  }, [open, eintrag, vorProjekt]);

  const leeren = () => { setBezeichnung(""); setMenge("1"); setEinheit("Stk"); setEk(""); setNotiz(""); };

  const projekt = projekte.find((p) => p.id === projektId);
  const gemeinsam = projekt?.sichtbarkeit === "gemeinsam";

  const bezeichnungAendern = (v: string) => {
    setBezeichnung(v);
    const treffer = vorschlaege.find((s) => s.bezeichnung.toLowerCase() === v.toLowerCase());
    if (treffer) {
      setEinheit(treffer.einheit);
      if (treffer.ek_preis != null && !ek) setEk(String(treffer.ek_preis).replace(".", ","));
    }
  };

  const speichern = async (weiter: boolean) => {
    if (!projektId) return toast.error("Bitte ein Projekt wählen.");
    if (!bezeichnung.trim()) return toast.error("Bitte eintragen, welches Material.");
    if (!(zahlLesen(menge) > 0)) return toast.error("Die Menge fehlt.");
    setSpeichert(true);
    const daten = {
      projekt_id: projektId,
      datum,
      bezeichnung: bezeichnung.trim(),
      menge: zahlLesen(menge),
      einheit,
      ek_preis: ek.trim() ? zahlLesen(ek) : null,
      notiz: notiz.trim() || null,
      sichtbarkeit: gemeinsam ? sicht : "privat",
    };
    const { error } = eintrag
      ? await supabase.from("material").update(daten).eq("id", eintrag.id)
      : await supabase.from("material").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    await neuLaden("material", "material-vorschlaege");
    if (weiter && !eintrag) {
      setAnzahl((n) => n + 1);
      toast.success(`${daten.bezeichnung} gebucht`);
      leeren();
      feld.current?.focus();
    } else {
      toast.success("Material gebucht");
      onOpenChange(false);
    }
  };

  const loeschen = async () => {
    if (!eintrag) return;
    const { error } = await supabase.from("material").delete().eq("id", eintrag.id);
    if (error) return toast.error(error.message);
    toast.success("Gelöscht");
    await neuLaden("material");
    onOpenChange(false);
  };

  const summe = zahlLesen(menge) * zahlLesen(ek);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={eintrag ? "Material bearbeiten" : "Material buchen"}
      beschreibung={anzahl > 0 ? `${anzahl} Position${anzahl === 1 ? "" : "en"} schon gebucht` : undefined}
      gesperrt={speichert}
      fuss={
        <>
          {eintrag && !eintrag.rechnung_id && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={loeschen}>
              <Trash2 className="h-4 w-4 mr-2" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>
            {anzahl > 0 ? "Fertig" : "Abbrechen"}
          </Button>
          {!eintrag && (
            <Button variant="secondary" onClick={() => speichern(true)} disabled={speichert}>
              <Plus className="h-4 w-4 mr-2" /> Speichern & nächstes
            </Button>
          )}
          <Button onClick={() => speichern(false)} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Speichern
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3">
          <div className="space-y-2">
            <Label htmlFor="m-projekt">Projekt</Label>
            <ProjektWahl id="m-projekt" wert={projektId} onChange={(id) => setProjektId(id)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-datum">Datum</Label>
            <Input id="m-datum" type="date" className="h-11" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="m-bez">Material</Label>
          <Input id="m-bez" ref={feld} list="m-vorschlaege" className="h-11" autoComplete="off"
            value={bezeichnung} onChange={(e) => bezeichnungAendern(e.target.value)}
            placeholder="z. B. NYM-J 3x1,5" />
          <datalist id="m-vorschlaege">
            {vorschlaege.map((v) => <option key={v.bezeichnung} value={v.bezeichnung} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="m-menge" className="text-xs">Menge</Label>
            <Input id="m-menge" inputMode="decimal" className="h-11" value={menge} onChange={(e) => setMenge(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Einheit</Label>
            <Select value={einheit} onValueChange={setEinheit}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[...new Set([einheit, ...EINHEITEN])].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-ek" className="text-xs">EK je Einheit €</Label>
            <Input id="m-ek" inputMode="decimal" className="h-11" placeholder="optional" value={ek} onChange={(e) => setEk(e.target.value)} />
          </div>
          {summe > 0 && <p className="col-span-3 text-sm text-muted-foreground">Einkauf gesamt: <strong className="text-foreground">{euro(summe)}</strong></p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="m-notiz">Notiz <span className="font-normal text-muted-foreground">(optional, z. B. Lieferant)</span></Label>
          <Input id="m-notiz" className="h-11" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </div>

        {gemeinsam && (
          <div className="space-y-2">
            <Label>Wer sieht dieses Material?</Label>
            <SichtbarkeitWahl wert={sicht} onChange={setSicht} hinweisGemeinsam="Die Partner im Projekt sehen es" />
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
