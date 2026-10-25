import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, ScanBarcode, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { ScanDialog } from "@/components/scanner/ScanDialog";
import { Gruppentitel } from "@/components/Bausteine";
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
import { datum, euro, zahl } from "@/lib/format";
import { artikelVk } from "@/lib/preise";
import { EINHEITEN, KATEGORIEN_ARTIKEL, type Artikel, type ArtikelCode } from "@/lib/types";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "./Felder";
import { fehlerText, useBestandSummen, useLieferanten } from "./stammDaten";

type Form = {
  bezeichnung: string;
  langtext: string;
  artikelnummer: string;
  lieferant: string;
  hersteller: string;
  hersteller_nr: string;
  ean: string;
  einheit: string;
  kategorie: string;
  warengruppe: string;
  rabattgruppe: string;
  listenpreis: string;
  ek_preis: string;
  vk_preis: string;
  lagerartikel: boolean;
  mindestbestand: string;
  aktiv: boolean;
};

const KEINE = "_keine";

function formAus(a: Partial<Artikel> | null | undefined): Form {
  return {
    bezeichnung: a?.bezeichnung ?? "",
    langtext: a?.langtext ?? "",
    artikelnummer: a?.artikelnummer ?? "",
    lieferant: a?.lieferant ?? "Eigen",
    hersteller: a?.hersteller ?? "",
    hersteller_nr: a?.hersteller_nr ?? "",
    ean: a?.ean ?? "",
    einheit: a?.einheit ?? "Stk",
    kategorie: a?.kategorie ?? "",
    warengruppe: a?.warengruppe ?? "",
    rabattgruppe: a?.rabattgruppe ?? "",
    listenpreis: zahlFeld(a?.listenpreis),
    ek_preis: zahlFeld(a?.ek_preis),
    vk_preis: zahlFeld(a?.vk_preis),
    lagerartikel: a?.lagerartikel ?? false,
    mindestbestand: zahlFeld(a?.mindestbestand),
    aktiv: a?.aktiv ?? true,
  };
}

const QUELLE_TEXT: Record<string, string> = { manuell: "von Hand angelegt", datanorm: "Datanorm-Import", csv: "CSV-Import", demo: "Demo-Daten" };

type NeuerCode = { code: string; menge: number };
type Verwendung = { buchungen: number; positionen: number; leistungen: number };

/**
 * Artikel anlegen, bearbeiten, ansehen. Der Chef pflegt alles; ein Monteur
 * darf einen neuen Artikel anlegen (unbekannter Strichcode auf der
 * Baustelle) und bestehenden Artikeln Codes zuordnen — ändern darf er sie
 * nicht (RLS: update/delete nur Chef).
 */
export function ArtikelDialog({
  open, onOpenChange, artikel, vorgabe, onGespeichert,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  artikel?: Artikel | null;
  /** Startwerte für einen neuen Artikel (z. B. gescannter Code) */
  vorgabe?: Partial<Artikel>;
  onGespeichert?: (a: Artikel) => void;
}) {
  const neuLaden = useNeuLaden();
  const { firma, istChef } = useSitzung();
  const { data: lieferanten = [] } = useLieferanten();
  const { data: bestaende } = useBestandSummen();
  const [f, setF] = useState<Form>(formAus(null));
  const [neueCodes, setNeueCodes] = useState<NeuerCode[]>([]);
  const [codeText, setCodeText] = useState("");
  const [codeMenge, setCodeMenge] = useState("1");
  const [scanZiel, setScanZiel] = useState<"ean" | "code" | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [verwendung, setVerwendung] = useState<Verwendung | null>(null);

  const neu = !artikel;
  const darfPflegen = istChef || neu;

  // Nur beim Öffnen bzw. Wechsel des Artikels füllen — ein Neuladen der
  // Liste im Hintergrund darf keine Eingaben überschreiben.
  useBeimOeffnen(open ? artikel?.id ?? "neu" : null, () => {
    setF(formAus(artikel ?? vorgabe));
    setNeueCodes([]);
    setCodeText("");
    setCodeMenge("1");
    setVerwendung(null);
  });

  const { data: codes = [] } = useQuery({
    queryKey: ["artikel", "codes", artikel?.id],
    enabled: open && !!artikel,
    queryFn: async () => {
      const { data, error } = await supabase.from("artikel_codes").select("*").eq("artikel_id", artikel!.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as ArtikelCode[];
    },
  });

  const setze = <K extends keyof Form>(k: K, v: Form[K]) => setF((alt) => ({ ...alt, [k]: v }));

  // ── Preise: VK leer = EK + Aufschlag des Betriebs ───────────────────
  const ek = dezimalLesen(f.ek_preis);
  const liste = dezimalLesen(f.listenpreis);
  const vk = dezimalLesen(f.vk_preis);
  const vkBerechnet = artikelVk({ vk_preis: null, ek_preis: ek, listenpreis: liste }, firma);
  const aufschlag = Number(firma?.material_aufschlag ?? 0);
  const vkHinweis = vk != null
    ? ek ? `Aufschlag auf den EK: ${zahl(((vk - ek) / ek) * 100)} %` : null
    : ek != null ? `Leer = ${euro(vkBerechnet)} (EK + ${zahl(aufschlag)} %)`
      : liste != null ? `Leer = Listenpreis ${euro(liste)}` : "Ohne EK und Listenpreis gibt es keinen VK.";
  const rabattHinweis = liste && ek != null && ek < liste ? `${zahl(((liste - ek) / liste) * 100)} % unter Liste` : null;
  const bestand = artikel ? bestaende?.[artikel.id] ?? 0 : 0;

  // ── Strichcodes ─────────────────────────────────────────────────────
  /** Prüft, ob ein Code frei ist. Gehört er schon einem anderen Artikel, geht es nicht. */
  const codePruefen = async (code: string): Promise<boolean> => {
    if (code === f.ean.trim()) {
      toast.error("Das ist schon die EAN dieses Artikels.");
      return false;
    }
    if (codes.some((c) => c.code === code) || neueCodes.some((c) => c.code === code)) {
      toast.error("Dieser Code ist schon eingetragen.");
      return false;
    }
    const { data: belegt, error } = await supabase.from("artikel_codes")
      .select("artikel_id, artikel(bezeichnung)").eq("code", code).maybeSingle();
    if (error) {
      toast.error("Code nicht geprüft", { description: fehlerText(error) });
      return false;
    }
    if (belegt) {
      toast.error("Code ist schon vergeben", { description: `Gehört zu „${belegt.artikel?.bezeichnung ?? "anderer Artikel"}“.` });
      return false;
    }
    let andere = supabase.from("artikel").select("bezeichnung").eq("ean", code);
    if (artikel) andere = andere.neq("id", artikel.id);
    const { data: mitEan } = await andere.limit(1);
    if (mitEan?.length) {
      toast.warning("Hinweis", { description: `„${mitEan[0].bezeichnung}“ hat diese EAN. Beim Scannen gilt künftig dieser Artikel.`, duration: 6000 });
    }
    return true;
  };

  const codeHinzufuegen = async (roh?: string) => {
    const code = (roh ?? codeText).trim();
    const menge = dezimalLesen(codeMenge) ?? 1;
    if (!code) return toast.error("Bitte einen Code eingeben oder scannen.");
    if (!(menge > 0)) return toast.error("Die Menge muss größer als 0 sein.");
    if (!(await codePruefen(code))) return;
    if (neu) {
      setNeueCodes((alt) => [...alt, { code, menge }]);
    } else {
      const { error } = await supabase.from("artikel_codes").insert({ code, artikel_id: artikel!.id, menge });
      if (error) return toast.error("Code nicht gespeichert", { description: fehlerText(error) });
      await neuLaden("artikel");
      toast.success("Code zugeordnet");
    }
    setCodeText("");
    setCodeMenge("1");
  };

  const codeEntfernen = async (c: ArtikelCode) => {
    const { error } = await supabase.from("artikel_codes").delete().eq("code", c.code);
    if (error) return toast.error("Code nicht entfernt", { description: fehlerText(error) });
    await neuLaden("artikel");
    toast("Code entfernt", {
      duration: 6000,
      action: {
        label: "Rückgängig",
        onClick: async () => {
          const { error: e2 } = await supabase.from("artikel_codes").insert({ code: c.code, artikel_id: c.artikel_id, menge: c.menge });
          if (e2) toast.error("Nicht wiederhergestellt", { description: fehlerText(e2) });
          await neuLaden("artikel");
        },
      },
    });
  };

  const gescannt = (code: string) => {
    if (scanZiel === "ean") setze("ean", code);
    else void codeHinzufuegen(code);
    setScanZiel(null);
  };

  // ── Speichern ───────────────────────────────────────────────────────
  const speichern = async () => {
    if (!f.bezeichnung.trim()) return toast.error("Bitte eine Bezeichnung eingeben.");
    const zahlen: [keyof Form, string][] = [["listenpreis", "Listenpreis"], ["ek_preis", "EK"], ["vk_preis", "VK"], ["mindestbestand", "Mindestbestand"]];
    for (const [k, text] of zahlen) {
      const roh = String(f[k]).trim();
      const n = dezimalLesen(roh);
      if (roh && (n === null || n < 0)) return toast.error(`${text}: „${roh}“ ist keine gültige Zahl.`);
    }
    setSpeichert(true);
    const daten = {
      bezeichnung: f.bezeichnung.trim(),
      langtext: leerNull(f.langtext),
      artikelnummer: leerNull(f.artikelnummer),
      lieferant: f.lieferant.trim() || "Eigen",
      hersteller: leerNull(f.hersteller),
      hersteller_nr: leerNull(f.hersteller_nr),
      ean: leerNull(f.ean.replace(/\s/g, "")),
      einheit: f.einheit || "Stk",
      kategorie: leerNull(f.kategorie),
      warengruppe: leerNull(f.warengruppe),
      rabattgruppe: leerNull(f.rabattgruppe),
      listenpreis: dezimalLesen(f.listenpreis),
      ek_preis: dezimalLesen(f.ek_preis),
      vk_preis: dezimalLesen(f.vk_preis),
      lagerartikel: f.lagerartikel,
      mindestbestand: f.lagerartikel ? dezimalLesen(f.mindestbestand) : null,
      aktiv: f.aktiv,
    };
    const { data, error } = artikel
      ? await supabase.from("artikel").update(daten).eq("id", artikel.id).select().single()
      : await supabase.from("artikel").insert(daten).select().single();
    if (error) {
      setSpeichert(false);
      return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    }
    if (neu && neueCodes.length) {
      const { error: e2 } = await supabase.from("artikel_codes")
        .insert(neueCodes.map((c) => ({ code: c.code, artikel_id: data.id, menge: c.menge })));
      if (e2) toast.error("Strichcodes nicht gespeichert", { description: fehlerText(e2) });
    }
    setSpeichert(false);
    await neuLaden("artikel", "leistungen", "lager");
    toast.success(neu ? "Artikel angelegt" : "Artikel gespeichert");
    onGespeichert?.(data);
    onOpenChange(false);
  };

  // ── Löschen: nur, wenn nirgends verwendet — sonst deaktivieren ──────
  const loeschenPruefen = async () => {
    if (!artikel) return;
    setSpeichert(true);
    const zaehle = async (tabelle: "material_buchungen" | "beleg_positionen" | "leistung_material") => {
      const { count, error } = await supabase.from(tabelle).select("artikel_id", { count: "exact", head: true }).eq("artikel_id", artikel.id);
      if (error) throw error;
      return count ?? 0;
    };
    try {
      const [buchungen, positionen, leistungen] = await Promise.all([
        zaehle("material_buchungen"), zaehle("beleg_positionen"), zaehle("leistung_material"),
      ]);
      setVerwendung({ buchungen, positionen, leistungen });
    } catch (e) {
      toast.error("Nicht geprüft", { description: fehlerText(e as { message?: string }) });
    }
    setSpeichert(false);
  };

  const wirdVerwendet = !!verwendung && verwendung.buchungen + verwendung.positionen + verwendung.leistungen > 0;

  const loeschen = async () => {
    if (!artikel) return;
    setSpeichert(true);
    const { error } = await supabase.from("artikel").delete().eq("id", artikel.id);
    setSpeichert(false);
    setVerwendung(null);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    await neuLaden("artikel", "leistungen", "lager");
    toast.success("Artikel gelöscht");
    onOpenChange(false);
  };

  const deaktivieren = async () => {
    if (!artikel) return;
    setSpeichert(true);
    const { error } = await supabase.from("artikel").update({ aktiv: false }).eq("id", artikel.id);
    setSpeichert(false);
    setVerwendung(null);
    if (error) return toast.error("Nicht deaktiviert", { description: fehlerText(error) });
    await neuLaden("artikel", "leistungen", "lager");
    toast.success("Artikel deaktiviert");
    onOpenChange(false);
  };

  const verwendungText = verwendung ? [
    verwendung.buchungen && `${zahl(verwendung.buchungen)} Materialbuchung${verwendung.buchungen === 1 ? "" : "en"}`,
    verwendung.positionen && `${zahl(verwendung.positionen)} Position${verwendung.positionen === 1 ? "" : "en"} in Angeboten/Rechnungen`,
    verwendung.leistungen && `${zahl(verwendung.leistungen)} Leistung${verwendung.leistungen === 1 ? "" : "en"} im Katalog`,
  ].filter(Boolean).join(", ") : "";

  const einheiten = f.einheit && !EINHEITEN.includes(f.einheit) ? [...EINHEITEN, f.einheit] : EINHEITEN;
  const kategorien = f.kategorie && !KATEGORIEN_ARTIKEL.includes(f.kategorie) ? [...KATEGORIEN_ARTIKEL, f.kategorie] : KATEGORIEN_ARTIKEL;

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={neu ? "Neuer Artikel" : darfPflegen ? "Artikel bearbeiten" : "Artikel"}
      beschreibung={!darfPflegen ? "Ändern kann nur der Chef. Strichcodes zuordnen geht." : undefined}
      gesperrt={speichert}
      fuss={
        <>
          {istChef && !neu && (
            <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" onClick={loeschenPruefen} disabled={speichert}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>
            {darfPflegen ? "Abbrechen" : "Schließen"}
          </Button>
          {darfPflegen && (
            <Button className="h-11 min-w-40" onClick={speichern} disabled={speichert}>
              {speichert && <Loader2 className="h-4 w-4 animate-spin" />}{neu ? "Artikel anlegen" : "Speichern"}
            </Button>
          )}
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-7">
        <fieldset disabled={!darfPflegen} className="space-y-4">
          <Gruppentitel className="px-0 pb-0">Artikel</Gruppentitel>
          <Feld id="a-bez" label="Bezeichnung">
            <Input id="a-bez" className="h-12" value={f.bezeichnung} onChange={(e) => setze("bezeichnung", e.target.value)}
              placeholder="z. B. NYM-J 3x1,5 mm² Ring 100 m" autoFocus={neu} />
          </Feld>
          <Feld id="a-lang" label={<>Langtext<Zusatz>(optional)</Zusatz></>}>
            <Textarea id="a-lang" rows={2} value={f.langtext} onChange={(e) => setze("langtext", e.target.value)} />
          </Feld>
          <div className="grid gap-4 sm:grid-cols-2">
            <Feld id="a-einheit" label="Einheit">
              <Select value={f.einheit} onValueChange={(v) => setze("einheit", v)}>
                <SelectTrigger id="a-einheit" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{einheiten.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </Feld>
            <Feld id="a-kat" label="Kategorie">
              <Select value={f.kategorie || KEINE} onValueChange={(v) => setze("kategorie", v === KEINE ? "" : v)}>
                <SelectTrigger id="a-kat" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEINE}>– keine –</SelectItem>
                  {kategorien.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </Feld>
            <Feld id="a-herst" label="Hersteller">
              <Input id="a-herst" className="h-11" value={f.hersteller} onChange={(e) => setze("hersteller", e.target.value)} placeholder="z. B. Hager" />
            </Feld>
            <Feld id="a-hnr" label="Hersteller-Nr.">
              <Input id="a-hnr" className="h-11" value={f.hersteller_nr} onChange={(e) => setze("hersteller_nr", e.target.value)} />
            </Feld>
            <Feld id="a-lief" label="Lieferant">
              <Input id="a-lief" className="h-11" list="a-lieferanten" value={f.lieferant} onChange={(e) => setze("lieferant", e.target.value)}
                placeholder="Eigen" />
              <datalist id="a-lieferanten">{lieferanten.map((l) => <option key={l} value={l} />)}</datalist>
            </Feld>
            <Feld id="a-nr" label={<>Artikelnummer<Zusatz>beim Lieferanten</Zusatz></>}>
              <Input id="a-nr" className="h-11" value={f.artikelnummer} onChange={(e) => setze("artikelnummer", e.target.value)} />
            </Feld>
            {istChef && (
              <>
                <Feld id="a-wg" label="Warengruppe">
                  <Input id="a-wg" className="h-11" value={f.warengruppe} onChange={(e) => setze("warengruppe", e.target.value)} />
                </Feld>
                <Feld id="a-rg" label="Rabattgruppe">
                  <Input id="a-rg" className="h-11" value={f.rabattgruppe} onChange={(e) => setze("rabattgruppe", e.target.value)} />
                </Feld>
              </>
            )}
          </div>
        </fieldset>

        {/* Strichcodes: EAN am Artikel + weitere Codes (Karton = Packungsinhalt) */}
        <section className="space-y-4">
          <Gruppentitel className="px-0 pb-0">Strichcodes</Gruppentitel>
          <fieldset disabled={!darfPflegen}>
            <Feld id="a-ean" label="EAN" hinweis="Der Strichcode auf dem einzelnen Stück.">
              <div className="flex gap-2">
                <Input id="a-ean" className="h-11 font-mono" inputMode="numeric" value={f.ean} onChange={(e) => setze("ean", e.target.value)} />
                {darfPflegen && (
                  <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setScanZiel("ean")}>
                    <ScanBarcode className="h-4 w-4" /> Scannen
                  </Button>
                )}
              </div>
            </Feld>
          </fieldset>

          <div className="space-y-2">
            <p className="text-sm font-medium">Weitere Codes <Zusatz>(Karton, Bündel, gelernte Codes)</Zusatz></p>
            {codes.length + neueCodes.length > 0 && (
              <ul className="divide-y rounded-lg border bg-card">
                {codes.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{c.code}</span>
                    <span className="zahl shrink-0 text-sm text-muted-foreground">= {zahl(c.menge)} {f.einheit}</span>
                    {istChef && (
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Code entfernen" onClick={() => codeEntfernen(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
                {neueCodes.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{c.code}</span>
                    <span className="zahl shrink-0 text-sm text-muted-foreground">= {zahl(c.menge)} {f.einheit}</span>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Code entfernen"
                      onClick={() => setNeueCodes((alt) => alt.filter((x) => x.code !== c.code))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-[1fr_5.5rem] gap-2 sm:grid-cols-[1fr_7rem_auto_auto]">
              <Input className="h-11 font-mono" value={codeText} onChange={(e) => setCodeText(e.target.value)} placeholder="Code"
                aria-label="Weiterer Code" onKeyDown={(e) => e.key === "Enter" && codeHinzufuegen()} />
              <Input className="h-11 text-right" inputMode="decimal" value={codeMenge} onChange={(e) => setCodeMenge(e.target.value)}
                aria-label="Menge je Code (Packungsinhalt)" title="Packungsinhalt" />
              <Button type="button" variant="outline" className="h-11" onClick={() => setScanZiel("code")}>
                <ScanBarcode className="h-4 w-4" /> Code scannen
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => codeHinzufuegen()}>
                <Plus className="h-4 w-4" /> Hinzufügen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Die Zahl rechts ist der Packungsinhalt: ein Karton-Code mit 50 bucht beim Scannen 50 {f.einheit}.</p>
          </div>
        </section>

        {/* Preise: der Monteur sieht beim Anlegen nur den EK, bestehende Preise gar nicht */}
        {(istChef || neu) && (
          <fieldset disabled={!darfPflegen} className="space-y-4">
            <Gruppentitel className="px-0 pb-0">Preise je {f.einheit || "Einheit"}</Gruppentitel>
            <div className="grid gap-4 sm:grid-cols-3">
              {istChef && (
                <Feld id="a-liste" label="Listenpreis">
                  <Input id="a-liste" className="zahl h-11" inputMode="decimal" value={f.listenpreis} onChange={(e) => setze("listenpreis", e.target.value)} />
                </Feld>
              )}
              <Feld id="a-ek" label={istChef ? "EK" : <>EK<Zusatz>(falls bekannt)</Zusatz></>} hinweis={istChef ? rabattHinweis : null}>
                <Input id="a-ek" className="zahl h-11" inputMode="decimal" value={f.ek_preis} onChange={(e) => setze("ek_preis", e.target.value)} />
              </Feld>
              {istChef && (
                <Feld id="a-vk" label={<>VK<Zusatz>fest</Zusatz></>} hinweis={vkHinweis}>
                  <Input id="a-vk" className="zahl h-11" inputMode="decimal" value={f.vk_preis} onChange={(e) => setze("vk_preis", e.target.value)}
                    placeholder={vk == null && (ek != null || liste != null) ? zahl(vkBerechnet) : ""} />
                </Feld>
              )}
            </div>
          </fieldset>
        )}

        {istChef && (
          <fieldset disabled={!darfPflegen} className="space-y-4">
            <Gruppentitel className="px-0 pb-0">Lager</Gruppentitel>
            <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2">
              <span>
                <span className="block text-sm font-medium">Lagerartikel</span>
                <span className="block text-xs text-muted-foreground">Liegt im Lager oder im Bus, Bestand wird geführt</span>
              </span>
              <Switch checked={f.lagerartikel} onCheckedChange={(v) => setze("lagerartikel", v)} />
            </label>
            {f.lagerartikel && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Feld id="a-min" label="Mindestbestand" hinweis="Darunter erscheint der Artikel als „nachbestellen“.">
                  <Input id="a-min" className="zahl h-11" inputMode="decimal" value={f.mindestbestand} onChange={(e) => setze("mindestbestand", e.target.value)} />
                </Feld>
                {!neu && (
                  <Feld label="Bestand gesamt">
                    <p className="feld-berechnet zahl flex h-11 items-center rounded-md border px-3 text-sm">{zahl(bestand)} {f.einheit}</p>
                  </Feld>
                )}
              </div>
            )}
            <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2">
              <span>
                <span className="block text-sm font-medium">Aktiv</span>
                <span className="block text-xs text-muted-foreground">Inaktive Artikel tauchen in Suche und Auswahl nicht mehr auf</span>
              </span>
              <Switch checked={f.aktiv} onCheckedChange={(v) => setze("aktiv", v)} />
            </label>
          </fieldset>
        )}

        {artikel && (
          <p className="text-xs text-muted-foreground">
            {QUELLE_TEXT[artikel.quelle] ?? artikel.quelle} · angelegt {datum(artikel.created_at)} · geändert {datum(artikel.updated_at)}
          </p>
        )}
      </div>

      <ScanDialog open={scanZiel !== null} onOpenChange={(o) => !o && setScanZiel(null)} onCode={gescannt}
        titel={scanZiel === "ean" ? "EAN scannen" : "Weiteren Code scannen"} />

      <AlertDialog open={!!verwendung} onOpenChange={(o) => !o && setVerwendung(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{wirdVerwendet ? "Artikel wird verwendet" : "Artikel löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {wirdVerwendet
                ? `„${artikel?.bezeichnung}“ steckt in ${verwendungText} und kann deshalb nicht gelöscht werden. Deaktivieren geht: er bleibt dort erhalten, taucht aber in Suche und Auswahl nicht mehr auf.`
                : `„${artikel?.bezeichnung}“ wird endgültig gelöscht, samt seinen Strichcodes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            {wirdVerwendet ? (
              artikel?.aktiv ? (
                <Button className="h-11" onClick={deaktivieren} disabled={speichert}>Deaktivieren</Button>
              ) : null
            ) : (
              <Button variant="destructive" className="h-11" onClick={loeschen} disabled={speichert}>Endgültig löschen</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}
