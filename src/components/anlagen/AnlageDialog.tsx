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
import { linkSauber, UEBERWACHUNG, type Ueberwachung } from "@/components/kontakte/kontaktLogik";

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
  pv: PvForm;
};

/** PV-Anlagendaten als Text im Formular */
type PvForm = {
  kwp: string; module_anzahl: string; module_typ: string; wechselrichter: string; speicher_kwh: string; speicher_typ: string;
  einsp_prozent: string; einsp_kw: string; wallbox: string; ueberschuss: "" | "ja" | "nein"; ueberschuss_wie: string;
  inbetriebnahme: string; zaehlpunkt: string; ueberwachung: Ueberwachung | ""; ueberwachung_link: string; planung_link: string;
};

const pvAus = (a: Anlage | null): PvForm => ({
  kwp: zahlFeld(a?.pv_kwp), module_anzahl: a?.module_anzahl != null ? String(a.module_anzahl) : "", module_typ: a?.module_typ ?? "",
  wechselrichter: a?.wechselrichter ?? "", speicher_kwh: zahlFeld(a?.speicher_kwh), speicher_typ: a?.speicher_typ ?? "",
  einsp_prozent: zahlFeld(a?.einspeisung_prozent), einsp_kw: zahlFeld(a?.einspeisung_kw), wallbox: a?.wallbox ?? "",
  ueberschuss: a?.ueberschuss == null ? "" : a.ueberschuss ? "ja" : "nein", ueberschuss_wie: a?.ueberschuss_wie ?? "",
  inbetriebnahme: a?.inbetriebnahme ?? "", zaehlpunkt: a?.zaehlpunkt ?? "",
  ueberwachung: (a?.ueberwachung as Ueberwachung) ?? "", ueberwachung_link: a?.ueberwachung_link ?? "", planung_link: a?.planung_link ?? "",
});
const PV_LEER = JSON.stringify(pvAus(null));

/** Zahl ≥ 0 aus dem Feld; undefined = Eingabe unlesbar */
const pvZahl = (t: string, max = 1e6): number | null | undefined => {
  if (!t.trim()) return null;
  const n = dezimalLesen(t);
  return n != null && n >= 0 && n <= max ? n : undefined;
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
  pv: pvAus(a),
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
    const p = f.pv;
    const kwp = pvZahl(p.kwp, 100000), speicher = pvZahl(p.speicher_kwh, 100000);
    const prozent = pvZahl(p.einsp_prozent, 100), kw = pvZahl(p.einsp_kw, 100000);
    const anzahl = pvZahl(p.module_anzahl, 100000);
    if (kwp === undefined) return toast.error("PV-Leistung: bitte eine Zahl in kWp, z. B. 9,8.");
    if (speicher === undefined) return toast.error("Speicher: bitte eine Zahl in kWh, z. B. 10.");
    if (prozent === undefined) return toast.error("Einspeisebegrenzung: Prozent zwischen 0 und 100.");
    if (kw === undefined) return toast.error("Einspeisebegrenzung: bitte eine Zahl in kW.");
    if (anzahl === undefined || (anzahl != null && !Number.isInteger(anzahl))) return toast.error("Module: bitte die Anzahl als ganze Zahl.");
    for (const [text, link] of [["Anlagenüberwachung", p.ueberwachung_link], ["PV-Planung", p.planung_link]] as const) {
      if (link.trim() && !linkSauber(link)) return toast.error(`${text}: bitte einen Link wie https://… eintragen.`);
    }
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
      pv_kwp: kwp, module_anzahl: anzahl, module_typ: leerNull(p.module_typ), wechselrichter: leerNull(p.wechselrichter),
      speicher_kwh: speicher, speicher_typ: leerNull(p.speicher_typ), einspeisung_prozent: prozent, einspeisung_kw: kw,
      wallbox: leerNull(p.wallbox), ueberschuss: p.ueberschuss === "" ? null : p.ueberschuss === "ja",
      ueberschuss_wie: p.ueberschuss === "ja" ? leerNull(p.ueberschuss_wie) : null,
      inbetriebnahme: p.inbetriebnahme || null, zaehlpunkt: leerNull(p.zaehlpunkt.replace(/\s/g, "").toUpperCase()),
      ueberwachung: p.ueberwachung || null, ueberwachung_link: linkSauber(p.ueberwachung_link), planung_link: linkSauber(p.planung_link),
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
  const setzePv = <K extends keyof PvForm>(k: K, v: PvForm[K]) => setF((x) => ({ ...x, pv: { ...x.pv, [k]: v } }));
  // PV-Felder bei PV-Anlagen — und überall, wo schon PV-Daten stehen
  const zeigePv = f.art === "pv" || JSON.stringify(f.pv) !== PV_LEER;

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

        {zeigePv && (
          <section className="space-y-3">
            <Gruppentitel className="px-0 pb-0">PV-Anlage<Zusatz>(alles optional)</Zusatz></Gruppentitel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Feld id="pv-kwp" label="Leistung kWp">
                <Input id="pv-kwp" className="zahl h-11" inputMode="decimal" value={f.pv.kwp} onChange={(e) => setzePv("kwp", e.target.value)} placeholder="z. B. 9,8" />
              </Feld>
              <Feld id="pv-anz" label="Module Anzahl">
                <Input id="pv-anz" className="zahl h-11" inputMode="numeric" value={f.pv.module_anzahl} onChange={(e) => setzePv("module_anzahl", e.target.value)} placeholder="z. B. 22" />
              </Feld>
              <Feld id="pv-mtyp" label="Modultyp" className="col-span-2 sm:col-span-1">
                <Input id="pv-mtyp" className="h-11" value={f.pv.module_typ} onChange={(e) => setzePv("module_typ", e.target.value)} placeholder="z. B. 445 Wp Glas-Glas" />
              </Feld>
            </div>
            <Feld id="pv-wr" label="Wechselrichter">
              <Input id="pv-wr" className="h-11" value={f.pv.wechselrichter} onChange={(e) => setzePv("wechselrichter", e.target.value)} placeholder="z. B. Fronius Symo GEN24 10.0 Plus" />
            </Feld>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Feld id="pv-sp" label="Speicher kWh">
                <Input id="pv-sp" className="zahl h-11" inputMode="decimal" value={f.pv.speicher_kwh} onChange={(e) => setzePv("speicher_kwh", e.target.value)} placeholder="z. B. 10,2" />
              </Feld>
              <Feld id="pv-sptyp" label="Speichertyp">
                <Input id="pv-sptyp" className="h-11" value={f.pv.speicher_typ} onChange={(e) => setzePv("speicher_typ", e.target.value)} placeholder="z. B. BYD HVS 10.2" />
              </Feld>
            </div>
            <Feld id="pv-ep" label="Einspeisebegrenzung" hinweis="Prozent der Modulleistung oder fester Wert in kW — oder beides.">
              <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                <div className="relative">
                  <Input id="pv-ep" className="zahl h-11 pr-8" inputMode="decimal" value={f.pv.einsp_prozent} onChange={(e) => setzePv("einsp_prozent", e.target.value)} placeholder="z. B. 70" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <div className="relative">
                  <Input aria-label="Einspeisebegrenzung in kW" className="zahl h-11 pr-9" inputMode="decimal" value={f.pv.einsp_kw} onChange={(e) => setzePv("einsp_kw", e.target.value)} placeholder="z. B. 4" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">kW</span>
                </div>
              </div>
            </Feld>
            <Feld id="pv-wb" label="Wallbox">
              <Input id="pv-wb" className="h-11" value={f.pv.wallbox} onChange={(e) => setzePv("wallbox", e.target.value)} placeholder="z. B. Fronius Wattpilot Home 11 J — leer = keine" />
            </Feld>
            <Feld label="Überschussregelung">
              <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1 sm:max-w-sm" role="radiogroup" aria-label="Überschussregelung">
                {([["", "Unbekannt"], ["ja", "Ja"], ["nein", "Nein"]] as const).map(([w, t]) => (
                  <button key={w || "leer"} type="button" role="radio" aria-checked={f.pv.ueberschuss === w} onClick={() => setzePv("ueberschuss", w)}
                    className={f.pv.ueberschuss === w ? "h-10 rounded-md bg-card text-sm font-medium shadow-sm ring-1 ring-border" : "h-10 rounded-md text-sm text-muted-foreground hover:text-foreground"}>
                    {t}
                  </button>
                ))}
              </div>
            </Feld>
            {f.pv.ueberschuss === "ja" && (
              <Feld id="pv-uewie" label="Wie geregelt?">
                <Input id="pv-uewie" className="h-11" value={f.pv.ueberschuss_wie} onChange={(e) => setzePv("ueberschuss_wie", e.target.value)} placeholder="z. B. Wattpilot über Smart Meter, Heizstab über Ohmpilot" />
              </Feld>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Feld id="pv-ib" label="Inbetriebnahme">
                <Input id="pv-ib" type="date" className="h-11" value={f.pv.inbetriebnahme} onChange={(e) => setzePv("inbetriebnahme", e.target.value)} />
              </Feld>
              <Feld id="pv-zp" label="Zählpunkt">
                <Input id="pv-zp" className="h-11 font-mono" value={f.pv.zaehlpunkt} onChange={(e) => setzePv("zaehlpunkt", e.target.value)} placeholder="AT00…" autoCapitalize="characters" autoComplete="off" />
              </Feld>
            </div>
            <Feld id="pv-uew" label="Anlagenüberwachung">
              <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                <Select value={f.pv.ueberwachung || "keine"} onValueChange={(v) => setzePv("ueberwachung", v === "keine" ? "" : v as Ueberwachung)}>
                  <SelectTrigger id="pv-uew" className="h-11" aria-label="Hersteller der Überwachung"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keine">Hersteller wählen</SelectItem>
                    {Object.entries(UEBERWACHUNG).map(([k, u]) => <SelectItem key={k} value={k}>{u.text}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label="Link zur Anlagenüberwachung" className="h-11" inputMode="url" value={f.pv.ueberwachung_link}
                  onChange={(e) => setzePv("ueberwachung_link", e.target.value)} autoComplete="off"
                  placeholder={(f.pv.ueberwachung && UEBERWACHUNG[f.pv.ueberwachung].portal) || "https://…"} />
              </div>
            </Feld>
            <Feld id="pv-plan" label="PV-Planung" hinweis="Link zur Planung, z. B. PV*SOL-Bericht, SolarEdge Designer oder eine Datei in der Cloud.">
              <Input id="pv-plan" className="h-11" inputMode="url" value={f.pv.planung_link} onChange={(e) => setzePv("planung_link", e.target.value)} placeholder="https://…" autoComplete="off" />
            </Feld>
          </section>
        )}

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
