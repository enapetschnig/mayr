import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel } from "@/components/Bausteine";
import { KundeWahl } from "@/components/KundeWahl";
import { ProjektWahl } from "@/components/ProjektWahl";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen } from "@/lib/format";
import { anlageLoeschen, anlageSpeichern, type Anlage, type AnlageEingabe } from "./anlagenDaten";
import { ANLAGEN_ART, plusMonate, type AnlagenArt } from "./pruefLogik";

const INTERVALLE = [
  { wert: "", text: "Keine wiederkehrende Prüfung" },
  { wert: "6", text: "Halbjährlich" },
  { wert: "12", text: "Jährlich" },
  { wert: "24", text: "Alle 2 Jahre" },
  { wert: "36", text: "Alle 3 Jahre" },
  { wert: "48", text: "Alle 4 Jahre" },
  { wert: "60", text: "Alle 5 Jahre" },
];

/** Vorschlag je Art — übliche Fristen, änderbar */
const INTERVALL_VORSCHLAG: Record<AnlagenArt, string> = {
  elektroanlage: "48", verteiler: "48", blitzschutz: "36", notlicht: "12", pv: "48", ladestation: "12", geraet: "12", sonstige: "12",
};

type Form = {
  kunde_id: string | null; projekt_id: string; bezeichnung: string; art: AnlagenArt; standort: string;
  strasse: string; plz: string; ort: string; hersteller: string; typ: string; baujahr: string;
  intervall: string; naechste: string; preis: string; notiz: string; aktiv: boolean;
};

const formAus = (a: Anlage | null, kundeId?: string | null): Form => ({
  kunde_id: a?.kunde_id ?? kundeId ?? null,
  projekt_id: a?.projekt_id ?? "",
  bezeichnung: a?.bezeichnung ?? "",
  art: (a?.art as AnlagenArt) ?? "elektroanlage",
  standort: a?.standort ?? "",
  strasse: a?.strasse ?? "", plz: a?.plz ?? "", ort: a?.ort ?? "",
  hersteller: a?.hersteller ?? "", typ: a?.typ ?? "", baujahr: a?.baujahr ? String(a.baujahr) : "",
  intervall: a ? (a.intervall_monate ? String(a.intervall_monate) : "") : INTERVALL_VORSCHLAG.elektroanlage,
  naechste: a?.naechste_pruefung ?? "",
  preis: zahlFeld(a?.preis),
  notiz: a?.notiz ?? "",
  aktiv: a?.aktiv ?? true,
});

/**
 * Anlage anlegen oder bearbeiten. Alle dürfen das (der Monteur steht vor
 * dem Verteiler), löschen nur der Chef — und nur ohne Prüfprotokolle.
 */
export function AnlageDialog({
  open, onOpenChange, anlage, kundeId, onGespeichert, onGeloescht,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anlage: Anlage | null;
  kundeId?: string | null;
  onGespeichert?: (a: Anlage) => void;
  onGeloescht?: () => void;
}) {
  const { istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const [f, setF] = useState<Form>(formAus(null));
  const [basis, setBasis] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useBeimOeffnen(open ? anlage?.id ?? `neu-${kundeId ?? ""}` : null, () => {
    const neu = formAus(anlage, kundeId);
    setF(neu);
    setBasis(JSON.stringify(neu));
  });
  const setze = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const speichern = async () => {
    if (!f.bezeichnung.trim()) return toast.error("Bitte eine Bezeichnung eingeben, z. B. „Hauptverteiler Keller“.");
    const baujahr = f.baujahr.trim() ? Number(f.baujahr) : null;
    if (baujahr != null && !(baujahr >= 1900 && baujahr <= 2100)) return toast.error("Baujahr: bitte vierstellig, z. B. 2015.");
    const preis = f.preis.trim() ? dezimalLesen(f.preis) : null;
    if (f.preis.trim() && (preis == null || preis < 0)) return toast.error("Preis: bitte eine Zahl, z. B. 180 oder 180,50.");
    const werte: AnlageEingabe = {
      kunde_id: f.kunde_id,
      projekt_id: f.projekt_id || null,
      bezeichnung: f.bezeichnung.trim(),
      art: f.art,
      standort: leerNull(f.standort),
      strasse: leerNull(f.strasse), plz: leerNull(f.plz), ort: leerNull(f.ort),
      hersteller: leerNull(f.hersteller), typ: leerNull(f.typ), baujahr,
      intervall_monate: f.intervall ? Number(f.intervall) : null,
      naechste_pruefung: f.naechste || null,
      preis,
      notiz: leerNull(f.notiz),
      aktiv: f.aktiv,
    };
    setSpeichert(true);
    try {
      const a = await anlageSpeichern(anlage?.id ?? null, werte);
      await neuLaden("anlagen");
      toast.success(anlage ? "Anlage gespeichert" : "Anlage angelegt");
      onGespeichert?.(a);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    if (!anlage) return;
    setSpeichert(true);
    try {
      await anlageLoeschen(anlage.id);
      await neuLaden("anlagen");
      toast.success("Anlage gelöscht");
      onGeloescht?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setSpeichert(false);
    }
  };

  const vorschlagNaechste = !anlage && f.intervall && !f.naechste;

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={anlage ? "Anlage bearbeiten" : "Neue Anlage"}
      beschreibung={anlage ? `Anlage ${anlage.nummer}` : "Was beim Kunden regelmäßig geprüft wird"}
      gesperrt={speichert}
      ungespeichert={JSON.stringify(f) !== basis}
      fuss={(
        <>
          {anlage && istChef && (
            <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" onClick={loeschen} disabled={speichert}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />}{anlage ? "Speichern" : "Anlage anlegen"}
          </Button>
        </>
      )}
    >
      <div className="mx-auto max-w-2xl space-y-7">
        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Anlage</Gruppentitel>
          <Feld id="an-kunde" label="Kunde">
            <KundeWahl wert={f.kunde_id} onChange={(k) => setze("kunde_id", k?.id ?? null)} />
          </Feld>
          <Feld id="an-bez" label="Bezeichnung">
            <Input id="an-bez" className="h-11" value={f.bezeichnung} onChange={(e) => setze("bezeichnung", e.target.value)}
              placeholder="z. B. Hauptverteiler, Elektroanlage Wohnhaus" autoFocus={!anlage} />
          </Feld>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld id="an-art" label="Art">
              <Select value={f.art} onValueChange={(v) => setF((x) => ({ ...x, art: v as AnlagenArt, intervall: anlage ? x.intervall : INTERVALL_VORSCHLAG[v as AnlagenArt] }))}>
                <SelectTrigger id="an-art" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ANLAGEN_ART).map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Feld>
            <Feld id="an-standort" label={<>Standort<Zusatz>(im Gebäude)</Zusatz></>}>
              <Input id="an-standort" className="h-11" value={f.standort} onChange={(e) => setze("standort", e.target.value)} placeholder="z. B. Keller, Technikraum" />
            </Feld>
          </div>
        </section>

        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Prüfung</Gruppentitel>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld id="an-int" label="Prüfintervall">
              <Select value={f.intervall || "keins"} onValueChange={(v) => setze("intervall", v === "keins" ? "" : v)}>
                <SelectTrigger id="an-int" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALLE.map((i) => <SelectItem key={i.wert || "keins"} value={i.wert || "keins"}>{i.text}</SelectItem>)}
                </SelectContent>
              </Select>
            </Feld>
            <Feld id="an-naechste" label="Nächste Prüfung" hinweis={vorschlagNaechste ? "Leer lassen = ab der ersten Prüfung gerechnet." : "Springt nach jeder unterschriebenen Prüfung weiter."}>
              <Input id="an-naechste" type="date" className="h-11" value={f.naechste} onChange={(e) => setze("naechste", e.target.value)} />
            </Feld>
          </div>
          {istChef && (
            <Feld id="an-preis" label={<>Preis je Prüfung netto €<Zusatz>(Wartungsvertrag, für die Rechnung)</Zusatz></>}>
              <Input id="an-preis" className="zahl h-11 sm:max-w-40" inputMode="decimal" value={f.preis} onChange={(e) => setze("preis", e.target.value)} placeholder="z. B. 180" />
            </Feld>
          )}
          {anlage?.letzte_pruefung && f.intervall && (
            <p className="text-xs text-muted-foreground">
              Ab der letzten Prüfung wäre die nächste am {new Date(`${plusMonate(anlage.letzte_pruefung, Number(f.intervall))}T12:00:00`).toLocaleDateString("de-AT")}.
            </p>
          )}
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <span>
              <span className="block text-sm font-medium">Wird geprüft</span>
              <span className="block text-xs text-muted-foreground">Aus = abgebaut oder nicht mehr betreut — bleibt mit den Protokollen erhalten</span>
            </span>
            <Switch checked={f.aktiv} onCheckedChange={(v) => setze("aktiv", v)} />
          </label>
        </section>

        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Details<Zusatz>(optional)</Zusatz></Gruppentitel>
          <Feld id="an-strasse" label="Adresse der Anlage" hinweis="Leer = Adresse des Kunden.">
            <Input id="an-strasse" className="h-11" value={f.strasse} onChange={(e) => setze("strasse", e.target.value)} placeholder="Straße" />
          </Feld>
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input aria-label="PLZ" className="h-11" inputMode="numeric" value={f.plz} onChange={(e) => setze("plz", e.target.value)} placeholder="PLZ" />
            <Input aria-label="Ort" className="h-11" value={f.ort} onChange={(e) => setze("ort", e.target.value)} placeholder="Ort" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Feld id="an-herst" label="Hersteller"><Input id="an-herst" className="h-11" value={f.hersteller} onChange={(e) => setze("hersteller", e.target.value)} /></Feld>
            <Feld id="an-typ" label="Typ"><Input id="an-typ" className="h-11" value={f.typ} onChange={(e) => setze("typ", e.target.value)} /></Feld>
            <Feld id="an-bj" label="Baujahr"><Input id="an-bj" className="zahl h-11" inputMode="numeric" value={f.baujahr} onChange={(e) => setze("baujahr", e.target.value)} /></Feld>
          </div>
          <Feld id="an-projekt" label="Projekt" hinweis="Errichtet in diesem Projekt — die Rechnung kommt dann dorthin.">
            <ProjektWahl id="an-projekt" wert={f.projekt_id} onChange={(id) => setze("projekt_id", id)} leerText="Kein Projekt" mitAbgeschlossenen />
          </Feld>
          <Feld id="an-notiz" label="Notiz">
            <Textarea id="an-notiz" rows={3} value={f.notiz} onChange={(e) => setze("notiz", e.target.value)} placeholder="z. B. Schlüssel beim Hausmeister" />
          </Feld>
        </section>
      </div>
    </FormularDialog>
  );
}
