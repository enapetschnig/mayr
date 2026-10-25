import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, Info, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel, StatusPille } from "@/components/Bausteine";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen } from "@/lib/csvImport";
import { euro, zahl } from "@/lib/format";
import { artikelVk } from "@/lib/preise";
import { EINHEITEN, TON_KLASSE, type Artikel, type StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "./Felder";
import { kalkulieren, nachKategorie, naechsteNummer, naechsteReihenfolge } from "./leistungHilfen";
import { fehlerText, type LeistungMitMaterial, type MaterialArtikel } from "./stammDaten";

type Form = {
  nummer: string;
  kurztext: string;
  langtext: string;
  kategorie: string;
  einheit: string;
  minuten: string;
  preis: string;
  suchwoerter: string;
  reihenfolge: string;
  aktiv: boolean;
};

type MaterialZeile = { artikel: MaterialArtikel; menge: string };

const INAKTIV: StatusEintrag = { ton: "grau", text: "Inaktiv" };
const OHNE_PREIS: StatusEintrag = { ton: "gelb", text: "Ohne Preis" };
const UNTER_SATZ: StatusEintrag = { ton: "gelb", text: "unter Stundensatz" };

const formAus = (l: Partial<LeistungMitMaterial> | null): Form => ({
  nummer: l?.nummer ?? "",
  kurztext: l?.kurztext ?? "",
  langtext: l?.langtext ?? "",
  kategorie: l?.kategorie ?? "",
  einheit: l?.einheit ?? "Stk",
  minuten: l ? zahlFeld(l.minuten) : "",
  preis: zahlFeld(l?.preis),
  suchwoerter: l?.suchwoerter ?? "",
  reihenfolge: l?.reihenfolge != null ? String(l.reihenfolge) : "",
  aktiv: l?.aktiv ?? true,
});

const materialAus = (a: Artikel | MaterialArtikel): MaterialArtikel => ({
  id: a.id, bezeichnung: a.bezeichnung, einheit: a.einheit, ek_preis: a.ek_preis, vk_preis: a.vk_preis,
  listenpreis: a.listenpreis, aktiv: a.aktiv, hersteller: a.hersteller, hersteller_nr: a.hersteller_nr, artikelnummer: a.artikelnummer,
});

/**
 * Leistung anlegen/bearbeiten: Texte, Montagezeit, fester oder berechneter
 * Preis, Material aus dem Artikelstamm und eine Kalkulation, die beim
 * Tippen mitrechnet. „Duplizieren“ macht aus dem aktuellen Stand eine neue,
 * noch nicht gespeicherte Leistung.
 */
export function LeistungDialog({
  open, onOpenChange, leistung, kategorieVorgabe, katalog,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = neue Leistung */
  leistung: LeistungMitMaterial | null;
  /** neue Leistung gleich in dieser Kategorie */
  kategorieVorgabe?: string;
  /** ganzer Katalog — für Kategorien, nächste Nummer und Reihenfolge */
  katalog: LeistungMitMaterial[];
}) {
  const neuLaden = useNeuLaden();
  const { firma } = useSitzung();
  const [f, setF] = useState<Form>(formAus(null));
  const [material, setMaterial] = useState<MaterialZeile[]>([]);
  // id der bearbeiteten Leistung; null = neu (auch nach „Duplizieren“)
  const [id, setId] = useState<string | null>(null);
  const [kopieVon, setKopieVon] = useState<string | null>(null);
  const [suchOffen, setSuchOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState<{ positionen: number | null } | null>(null);
  // zuletzt vorgeschlagene Nummer — wird nur ersetzt, solange niemand sie geändert hat
  const autoNummer = useRef("");

  useBeimOeffnen(open ? leistung?.id ?? "neu" : null, () => {
    setId(leistung?.id ?? null);
    setKopieVon(null);
    setLoeschFrage(null);
    if (leistung) {
      setF(formAus(leistung));
      setMaterial(leistung.leistung_material.filter((m) => m.artikel).map((m) => ({ artikel: m.artikel!, menge: zahlFeld(m.menge) })));
      autoNummer.current = "";
    } else {
      const kategorie = kategorieVorgabe ?? "";
      const nummer = naechsteNummer(katalog, kategorie);
      autoNummer.current = nummer;
      setF({ ...formAus(null), kategorie, nummer });
      setMaterial([]);
    }
  });

  const setze = <K extends keyof Form>(k: K, v: Form[K]) => setF((alt) => ({ ...alt, [k]: v }));

  const kategorien = useMemo(() => nachKategorie(katalog).map((g) => g.kategorie), [katalog]);

  const kategorieSetzen = (kategorie: string) => {
    setF((alt) => {
      const neu = { ...alt, kategorie };
      // Bei einer neuen Leistung die Nummer mitziehen, solange sie der eigene Vorschlag ist
      if (!id && (!alt.nummer.trim() || alt.nummer === autoNummer.current)) {
        autoNummer.current = naechsteNummer(katalog, kategorie);
        neu.nummer = autoNummer.current;
      }
      return neu;
    });
  };

  // ── Kalkulation, live ────────────────────────────────────────────────
  const minuten = dezimalLesen(f.minuten) ?? 0;
  const festPreis = f.preis.trim() ? dezimalLesen(f.preis) : null;
  const mengen = material.map((m) => dezimalLesen(m.menge) ?? 0);
  const k = kalkulieren({ preis: festPreis, minuten }, material.map((m, i) => ({ menge: mengen[i], artikel: m.artikel })), firma);

  // ── Material ─────────────────────────────────────────────────────────
  const artikelGewaehlt = (a: Artikel) => {
    setSuchOffen(false);
    if (material.some((m) => m.artikel.id === a.id)) {
      toast("Schon in der Liste", { description: `„${a.bezeichnung}“ — Menge dort anpassen.` });
      return;
    }
    setMaterial((alt) => [...alt, { artikel: materialAus(a), menge: "1" }]);
  };

  // ── Duplizieren: aktueller Stand wird eine neue, ungespeicherte Leistung ──
  const duplizieren = () => {
    setKopieVon(f.kurztext.trim() || "Leistung");
    setId(null);
    const nummer = naechsteNummer(katalog, f.kategorie);
    autoNummer.current = nummer;
    setF((alt) => ({ ...alt, kurztext: `${alt.kurztext.trim()} (Kopie)`, nummer, reihenfolge: "" }));
  };

  // ── Speichern ───────────────────────────────────────────────────────
  const speichern = async () => {
    const kurztext = f.kurztext.trim();
    if (!kurztext) return toast.error("Bitte einen Kurztext eingeben.");
    const min = f.minuten.trim() ? dezimalLesen(f.minuten) : 0;
    if (min === null || min < 0 || min >= 1_000_000) return toast.error(`Minuten: „${f.minuten}“ ist keine gültige Zahl.`);
    const preis = f.preis.trim() ? dezimalLesen(f.preis) : null;
    if (f.preis.trim() && (preis === null || preis < 0)) return toast.error(`Preis: „${f.preis}“ ist keine gültige Zahl.`);
    const rText = f.reihenfolge.trim();
    if (rText && !/^-?\d{1,9}$/.test(rText)) return toast.error("Reihenfolge: bitte eine ganze Zahl.");
    const schlecht = material.find((_, i) => !(mengen[i] > 0));
    if (schlecht) return toast.error(`Menge für „${schlecht.artikel.bezeichnung}“ fehlt.`);

    const kategorie = f.kategorie.trim() || "Allgemein";
    const vorher = id ? katalog.find((x) => x.id === id) : null;
    const umgezogen = !!vorher && vorher.kategorie.trim().toLowerCase() !== kategorie.toLowerCase();
    // Leer = ans Ende der Kategorie; beim Umziehen ebenso, sofern niemand die Zahl angefasst hat
    const reihenfolge = !rText || (umgezogen && rText === String(vorher.reihenfolge))
      ? naechsteReihenfolge(katalog, kategorie, id ?? undefined)
      : Number(rText);

    setSpeichert(true);
    const daten = {
      nummer: leerNull(f.nummer),
      kurztext,
      langtext: leerNull(f.langtext),
      kategorie,
      einheit: f.einheit || "Stk",
      minuten: min,
      preis,
      suchwoerter: leerNull(f.suchwoerter.replace(/\s+/g, " ")),
      reihenfolge,
      aktiv: f.aktiv,
    };
    const { data, error } = id
      ? await supabase.from("leistungen").update(daten).eq("id", id).select("id").single()
      : await supabase.from("leistungen").insert(daten).select("id").single();
    if (error) {
      setSpeichert(false);
      return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    }
    const lid = data.id;
    if (!id) setId(lid); // falls das Material scheitert, nicht noch einmal neu anlegen

    // Material: erst schreiben, dann Entferntes löschen — scheitert etwas, geht nichts verloren
    const zeilen = material.map((m, i) => ({ leistung_id: lid, artikel_id: m.artikel.id, menge: mengen[i] }));
    let materialFehler = null as { message?: string; code?: string } | null;
    if (zeilen.length) {
      const { error: e1 } = await supabase.from("leistung_material").upsert(zeilen, { onConflict: "leistung_id,artikel_id" });
      materialFehler = e1;
    }
    if (!materialFehler && vorher) {
      let weg = supabase.from("leistung_material").delete().eq("leistung_id", lid);
      if (zeilen.length) weg = weg.not("artikel_id", "in", `(${zeilen.map((z) => z.artikel_id).join(",")})`);
      const { error: e2 } = await weg;
      materialFehler = e2;
    }
    setSpeichert(false);
    await neuLaden("leistungen");
    if (materialFehler) return toast.error("Leistung gespeichert, Material nicht", { description: fehlerText(materialFehler) });
    toast.success(vorher ? "Leistung gespeichert" : "Leistung angelegt");
    onOpenChange(false);
  };

  // ── Löschen: Positionen in Angeboten/Rechnungen behalten ihren Text ──
  const loeschenFragen = async () => {
    if (!id) return;
    const { count, error } = await supabase.from("beleg_positionen").select("id", { count: "exact", head: true }).eq("leistung_id", id);
    setLoeschFrage({ positionen: error ? null : count ?? 0 });
  };

  const loeschen = async () => {
    if (!id) return;
    setSpeichert(true);
    const { error } = await supabase.from("leistungen").delete().eq("id", id);
    setSpeichert(false);
    setLoeschFrage(null);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    await neuLaden("leistungen");
    toast.success("Leistung gelöscht");
    onOpenChange(false);
  };

  const deaktivieren = async () => {
    if (!id) return;
    setSpeichert(true);
    const { error } = await supabase.from("leistungen").update({ aktiv: false }).eq("id", id);
    setSpeichert(false);
    setLoeschFrage(null);
    if (error) return toast.error("Nicht deaktiviert", { description: fehlerText(error) });
    await neuLaden("leistungen");
    toast.success("Leistung deaktiviert");
    onOpenChange(false);
  };

  const neu = !id;
  const einheiten = f.einheit && !EINHEITEN.includes(f.einheit) ? [...EINHEITEN, f.einheit] : EINHEITEN;
  const vorherAktiv = id ? katalog.find((x) => x.id === id)?.aktiv : false;

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={kopieVon ? "Neue Leistung (Kopie)" : neu ? "Neue Leistung" : "Leistung bearbeiten"}
      gesperrt={speichert}
      breite="breit"
      fuss={
        <>
          {!neu && (
            <div className="flex gap-2 sm:mr-auto">
              <Button variant="ghost" className="h-11 flex-1 text-destructive sm:flex-none" onClick={loeschenFragen} disabled={speichert}>
                <Trash2 className="h-4 w-4" /> Löschen
              </Button>
              <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={duplizieren} disabled={speichert}>
                <Copy className="h-4 w-4" /> Duplizieren
              </Button>
            </div>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />}{neu ? "Leistung anlegen" : "Speichern"}
          </Button>
        </>
      }
    >
      <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-7">
          {kopieVon && (
            <div className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm", TON_KLASSE.grau)}>
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Kopie von „{kopieVon}“ — wird erst beim Speichern angelegt. Das Original bleibt, wie es gespeichert ist.</span>
            </div>
          )}

          <section className="space-y-4">
            <Gruppentitel className="px-0 pb-0">Leistung</Gruppentitel>
            <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <Feld id="l-nr" label="Nummer">
                <Input id="l-nr" className="h-11 font-mono" value={f.nummer} onChange={(e) => setze("nummer", e.target.value)} placeholder="01.01" />
              </Feld>
              <Feld id="l-kurz" label="Kurztext">
                <Input id="l-kurz" className="h-12" value={f.kurztext} onChange={(e) => setze("kurztext", e.target.value)}
                  placeholder="z. B. Steckdose UP komplett" autoFocus={neu && !kopieVon} />
              </Feld>
            </div>
            <Feld id="l-kat" label="Kategorie">
              <Input id="l-kat" className="h-11" list="l-kategorien" value={f.kategorie} onChange={(e) => kategorieSetzen(e.target.value)}
                placeholder="z. B. Schalter & Steckdosen" autoComplete="off" />
              <datalist id="l-kategorien">{kategorien.map((x) => <option key={x} value={x} />)}</datalist>
              {kategorien.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {kategorien.map((x) => (
                    <button key={x} type="button" onClick={() => kategorieSetzen(x)}
                      className={cn("min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                        x === f.kategorie.trim() ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
                      {x}
                    </button>
                  ))}
                </div>
              )}
            </Feld>
            <Feld id="l-lang" label={<>Langtext<Zusatz>— steht so im Angebot</Zusatz></>}>
              <Textarea id="l-lang" rows={3} value={f.langtext} onChange={(e) => setze("langtext", e.target.value)} />
            </Feld>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Feld id="l-einheit" label="Einheit">
                <Select value={f.einheit} onValueChange={(v) => setze("einheit", v)}>
                  <SelectTrigger id="l-einheit" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{einheiten.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </Feld>
              <Feld id="l-min" label={<>Minuten<Zusatz>je {f.einheit}</Zusatz></>}>
                <Input id="l-min" className="zahl h-11" inputMode="decimal" value={f.minuten} onChange={(e) => setze("minuten", e.target.value)} placeholder="0" />
              </Feld>
              <Feld id="l-preis" label={<>Preis<Zusatz>fest</Zusatz></>} className="col-span-2 sm:col-span-1"
                hinweis={festPreis == null ? `Leer = berechnet: ${euro(k.berechnet)}` : `berechnet wären ${euro(k.berechnet)}`}>
                <Input id="l-preis" className="zahl h-11" inputMode="decimal" value={f.preis} onChange={(e) => setze("preis", e.target.value)}
                  placeholder={zahl(k.berechnet)} />
              </Feld>
            </div>
            <Feld id="l-such" label="Suchwörter"
              hinweis="Damit findet die Spracheingabe die Leistung — Wörter, wie man sie auf der Baustelle sagt (z. B. „schuko dose zweifach“). Mit Leerzeichen trennen.">
              <Input id="l-such" className="h-11" value={f.suchwoerter} onChange={(e) => setze("suchwoerter", e.target.value)} autoComplete="off" />
            </Feld>
            <div className="grid gap-4 sm:grid-cols-2">
              <Feld id="l-reihe" label="Reihenfolge" hinweis="Kleinere Zahl steht weiter oben. Leer = ans Ende der Kategorie.">
                <Input id="l-reihe" className="zahl h-11" inputMode="numeric" value={f.reihenfolge} onChange={(e) => setze("reihenfolge", e.target.value)}
                  placeholder="automatisch" />
              </Feld>
              <label className="flex min-h-11 items-center justify-between gap-4 self-start rounded-lg border bg-card px-3 py-2 sm:mt-6">
                <span>
                  <span className="block text-sm font-medium">Aktiv</span>
                  <span className="block text-xs text-muted-foreground">Inaktive stehen in Angebot und Regiebericht nicht zur Wahl</span>
                </span>
                <Switch checked={f.aktiv} onCheckedChange={(v) => setze("aktiv", v)} />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <Gruppentitel className="px-0 pb-0">Material je {f.einheit}</Gruppentitel>
              <Button variant="outline" className="h-11" onClick={() => setSuchOffen(true)}>
                <Plus className="h-4 w-4" /> Material
              </Button>
            </div>
            {material.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                Kein Material — die Leistung kostet dann nur Arbeitszeit.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {material.map((m, i) => {
                  const vk = artikelVk(m.artikel, firma);
                  const ohnePreis = m.artikel.ek_preis == null && m.artikel.vk_preis == null && m.artikel.listenpreis == null;
                  return (
                    <li key={m.artikel.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-3 pr-1.5">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-sm font-medium leading-snug">{m.artikel.bezeichnung}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[m.artikel.hersteller, m.artikel.hersteller_nr ?? m.artikel.artikelnummer].filter(Boolean).join(" · ")}
                          {(m.artikel.hersteller || m.artikel.hersteller_nr || m.artikel.artikelnummer) && " · "}
                          <span className="zahl">{euro(vk)}</span> je {m.artikel.einheit}
                        </p>
                        {(!m.artikel.aktiv || ohnePreis) && (
                          <div className="mt-1 flex gap-1.5">
                            {!m.artikel.aktiv && <StatusPille eintrag={INAKTIV} />}
                            {ohnePreis && <StatusPille eintrag={OHNE_PREIS} />}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input className={cn("zahl h-11 w-24 text-right", !(mengen[i] > 0) && "border-destructive")} inputMode="decimal"
                          value={m.menge} aria-label={`Menge ${m.artikel.bezeichnung}`}
                          onChange={(e) => setMaterial((alt) => alt.map((x, j) => (j === i ? { ...x, menge: e.target.value } : x)))} />
                        <span className="w-10 text-sm text-muted-foreground">{m.artikel.einheit}</span>
                      </div>
                      <span className="zahl ml-auto w-24 text-right text-sm font-medium">{euro(vk * mengen[i])}</span>
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${m.artikel.bezeichnung} entfernen`}
                        onClick={() => setMaterial((alt) => alt.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Kalkulation — am PC rechts daneben und immer sichtbar */}
        <section className="space-y-2 rounded-lg border bg-card p-4 lg:sticky lg:top-0">
          <Gruppentitel className="px-0 pb-1">Kalkulation je {f.einheit}</Gruppentitel>
          <KalkZeile titel="Material-EK" wert={euro(k.materialEk)} />
          <KalkZeile titel="Material-VK" wert={euro(k.materialVk)} />
          <KalkZeile titel={`Lohn ${zahl(minuten)} min × ${euro(k.stundensatz)}/h`} wert={euro(k.lohn)} />
          <div className="border-t pt-2">
            <KalkZeile titel={festPreis != null ? "Preis (fest)" : "Preis (berechnet)"} wert={euro(k.preis)} fett />
          </div>
          <KalkZeile titel="Rohertrag" unter="Preis − Material-EK"
            wert={`${euro(k.rohertrag)}${k.rohertragProzent != null ? ` · ${zahl(k.rohertragProzent)} %` : ""}`} />
          {k.jeStunde != null && (
            <KalkZeile titel="je Arbeitsstunde" wert={euro(k.jeStunde)}
              zusatz={k.stundensatz > 0 && k.jeStunde < k.stundensatz ? <StatusPille eintrag={UNTER_SATZ} /> : null} />
          )}
        </section>
      </div>

      <FormularDialog open={suchOffen} onOpenChange={setSuchOffen} titel="Material hinzufügen" beschreibung="Artikel antippen — die Menge danach in der Liste eintragen">
        <ArtikelSuche autoFocus onWahl={artikelGewaehlt} listeKlasse="max-h-[calc(100dvh-14rem)]" />
      </FormularDialog>

      <AlertDialog open={!!loeschFrage} onOpenChange={(o) => !o && setLoeschFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leistung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {`„${f.kurztext.trim() || "Leistung"}“ wird samt Materialliste gelöscht.`}
              {loeschFrage?.positionen
                ? ` Sie steckt in ${zahl(loeschFrage.positionen)} Position${loeschFrage.positionen === 1 ? "" : "en"} in Angeboten oder Rechnungen — dort bleiben Text und Preis erhalten.`
                : " In Angeboten und Rechnungen bleiben Text und Preis erhalten."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            {vorherAktiv && !!loeschFrage?.positionen && (
              <Button variant="outline" className="h-11" onClick={deaktivieren} disabled={speichert}>Nur deaktivieren</Button>
            )}
            <Button variant="destructive" className="h-11" onClick={loeschen} disabled={speichert}>Endgültig löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}

function KalkZeile({ titel, unter, wert, fett, zusatz }: { titel: string; unter?: string; wert: string; fett?: boolean; zusatz?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 text-muted-foreground">
        {titel}
        {unter && <span className="block text-xs">{unter}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("zahl", fett ? "text-base font-bold text-foreground" : "font-medium text-foreground")}>{wert}</span>
        {zusatz}
      </span>
    </div>
  );
}
