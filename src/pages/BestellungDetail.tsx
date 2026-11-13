import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Ban, Check, ClipboardCopy, Download, FileText, Loader2, PackageCheck, Save, Send, Share2, ShoppingCart, Trash2, X,
} from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import { WareneingangDialog } from "@/components/bestellung/WareneingangDialog";
import {
  bestellungLaden, bestellungLoeschen, positionInfo, bestellungSpeichern, positionenErsetzen, statusSetzen, useBestellung, useLieferanten, useLieferungen,
  type BestellungVoll,
} from "@/components/bestellung/bestellDaten";
import { BESTELL_STATUS, bestellSumme, istOffen, offeneMenge, type BestellStatus } from "@/components/bestellung/bestellLogik";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { MengeFeld } from "@/components/material/MengeFeld";
import { mengeEingabe, mengeText, neueId, preisEingabe, runden3 } from "@/components/material/materialDaten";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { ProjektWahl } from "@/components/ProjektWahl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIstPc } from "@/components/AppLayout";
import { useLagerorte, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { alsText, csvHerunterladen } from "@/lib/abfrage";
import { bestellPdfErstellen } from "@/lib/bestellPdf";
import { datum, euro, zahl, zahlLesen } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { zeitpunkt } from "@/lib/regiePdf";
import { name, type Artikel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Zeile = { key: string; artikel: BestellungVoll["bestell_positionen"][number]["artikel"]; menge: string; ek: string };
type Frage = { titel: string; text: string; knopf: string; gefahr?: boolean; aktion: () => Promise<void> };

const preisText = (n: number | string | null) => (n == null ? "" : String(Number(n)).replace(".", ","));

/**
 * /bestellungen/:id — eine Bestellung. Entwurf: Lieferant, Ziel und
 * Positionen bearbeiten, dann „Als bestellt markieren“ (PDF, CSV für den
 * Webshop oder Text kopieren — geschickt wird außerhalb der App). Danach:
 * Lieferung einbuchen (auch per Scan), Teillieferungen, Rest abschließen.
 */
export default function BestellungDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useBestellung(id);
  if (isLoading) return <Seite titel="Bestellung"><p className="py-10 text-center text-sm text-muted-foreground">Lädt …</p></Seite>;
  if (error || !data) {
    return (
      <Seite titel="Bestellung" zurueckPfad="/bestellungen">
        <Leer icon={ShoppingCart} text={error ? `Konnte nicht geladen werden: ${(error as Error).message}` : "Diese Bestellung gibt es nicht (mehr)."}>
          <Button asChild className="h-11"><Link to="/bestellungen">Zu den Bestellungen</Link></Button>
        </Leer>
      </Seite>
    );
  }
  return <Inhalt key={`${data.id}-${data.updated_at}`} b={data} />;
}

function Inhalt({ b }: { b: BestellungVoll }) {
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const pc = useIstPc();
  const { firma } = useSitzung();
  const { data: orte = [] } = useLagerorte();
  const { data: lieferanten = [] } = useLieferanten();
  const positionIds = useMemo(() => b.bestell_positionen.map((p) => p.id), [b.bestell_positionen]);
  const { data: lieferungen = [] } = useLieferungen(b.id, b.status === "entwurf" ? [] : positionIds);
  const entwurf = b.status === "entwurf";
  const status = b.status as BestellStatus;

  const [lieferant, setLieferant] = useState(b.lieferant);
  const [liefertermin, setLiefertermin] = useState(b.liefertermin ?? "");
  const [notiz, setNotiz] = useState(b.notiz ?? "");
  const [ziel, setZiel] = useState<"lager" | "projekt">(b.projekt_id ? "projekt" : "lager");
  const [lagerortId, setLagerortId] = useState(b.lagerort_id ?? "");
  const [projektId, setProjektId] = useState(b.projekt_id ?? "");
  const anfang = useMemo<Zeile[]>(() => b.bestell_positionen.map((p) => ({
    key: p.id, artikel: p.artikel, menge: mengeEingabe(Number(p.menge)), ek: preisText(p.ek_preis),
  })), [b.bestell_positionen]);
  const [zeilen, setZeilen] = useState<Zeile[]>(anfang);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [eingang, setEingang] = useState(false);
  const [frage, setFrage] = useState<Frage | null>(null);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);

  const kopf = { lieferant: lieferant.trim(), liefertermin: liefertermin || null, notiz: notiz.trim() || null,
    lagerort_id: ziel === "lager" ? lagerortId || null : null, projekt_id: ziel === "projekt" ? projektId || null : null };
  const kopfAlt = { lieferant: b.lieferant, liefertermin: b.liefertermin, notiz: b.notiz, lagerort_id: b.lagerort_id, projekt_id: b.projekt_id };
  const zeilenText = (z: Zeile[]) => JSON.stringify(z.map((x) => [x.artikel.id, zahlLesen(x.menge), preisEingabe(x.ek)]));
  const dirty = entwurf && (JSON.stringify(kopf) !== JSON.stringify(kopfAlt) || zeilenText(zeilen) !== zeilenText(anfang));
  const summe = bestellSumme(zeilen.map((z) => ({ menge: zahlLesen(z.menge), ek_preis: preisEingabe(z.ek) })));

  const speichern = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!kopf.lieferant) { toast.error("Lieferant fehlt."); return false; }
    if (!kopf.lagerort_id && !kopf.projekt_id) { toast.error(ziel === "lager" ? "Lagerort wählen." : "Projekt wählen."); return false; }
    if (zeilen.some((z) => !(zahlLesen(z.menge) > 0))) { toast.error("Jede Position braucht eine Menge über 0."); return false; }
    setLaeuft("speichern");
    try {
      if (zeilenText(zeilen) !== zeilenText(anfang)) {
        await positionenErsetzen(b.id, zeilen.map((z) => ({ artikel_id: z.artikel.id, menge: runden3(zahlLesen(z.menge)), ek_preis: preisEingabe(z.ek) })));
      }
      // Kopf immer schreiben: neuer updated_at lädt die Seite frisch
      await bestellungSpeichern(b.id, kopf);
      await neuLaden("bestellungen");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setLaeuft(null);
    }
  };

  const artikelDazu = (a: Artikel) => {
    setZeilen((z) => {
      const da = z.find((x) => x.artikel.id === a.id);
      if (da) {
        toast.info(`${a.bezeichnung}: Menge +1`);
        return z.map((x) => (x === da ? { ...x, menge: mengeEingabe(zahlLesen(x.menge) + 1) } : x));
      }
      return [...z, { key: neueId(), artikel: { ...a }, menge: "1", ek: preisText(a.ek_preis) }];
    });
  };

  const tun = async (schluessel: string, aktion: () => Promise<void>, erfolg?: string) => {
    setLaeuft(schluessel);
    try {
      await aktion();
      await neuLaden("bestellungen");
      if (erfolg) toast.success(erfolg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  const pdfZeigen = async () => {
    if (!firma) return toast.error("Firmendaten fehlen — bitte in den Einstellungen eintragen.");
    if (!(await speichern())) return;
    setLaeuft("pdf");
    try {
      const frisch = await bestellungLaden(b.id);
      if (!frisch) return;
      const d = await bestellPdfErstellen(frisch, firma);
      if (pc) setVorschau(d);
      else await pdfTeilenOderLaden(d.blob, d.dateiname);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  };

  // Webshop-Upload (Sonepar, Rexel …): Artikelnummer und Menge vorne, wie die Bestellliste im Lager
  const csvLaden = () => csvHerunterladen(`bestellung-${b.nummer ?? "entwurf"}.csv`, [
    ["Artikelnummer", "Menge", "Einheit", "Bezeichnung", "Hersteller", "Hersteller-Nr.", "EAN"],
    ...zeilen.map((z) => [z.artikel.artikelnummer, zahlLesen(z.menge), z.artikel.einheit, z.artikel.bezeichnung, z.artikel.hersteller,
      z.artikel.hersteller_nr, alsText(z.artikel.ean)]),
  ]);

  const textKopieren = async () => {
    const p = b.projekte;
    const an = p ? [`Baustelle ${p.name}`, p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")] : [firma?.name, firma?.strasse, [firma?.plz, firma?.ort].filter(Boolean).join(" ")];
    const text = [
      `Bestellung ${b.nummer ?? ""}`.trim(),
      "",
      ...zeilen.map((z) => `${zahl(zahlLesen(z.menge))} ${z.artikel.einheit}  ${z.artikel.artikelnummer ? `${z.artikel.artikelnummer}  ` : ""}${z.artikel.bezeichnung}`),
      "",
      `Lieferung an: ${an.filter(Boolean).join(", ")}`,
      ...(kopf.liefertermin ? [`Liefertermin: ${datum(kopf.liefertermin)}`] : []),
      ...(kopf.notiz ? [kopf.notiz] : []),
      "",
      "Danke und freundliche Grüße",
      firma?.inhaber || firma?.name || "",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Bestelltext kopiert — in Mail oder Webshop einfügen.");
    } catch {
      toast.error("Kopieren ging nicht — bitte PDF oder CSV nehmen.");
    }
  };

  const bestellen = async () => {
    if (!zeilen.length) return toast.error("Erst Artikel dazunehmen.");
    if (!(await speichern())) return;
    await tun("bestellen", () => statusSetzen(b.id, "bestellt"), "Als bestellt markiert — jetzt PDF oder CSV an den Lieferanten.");
  };

  const lagerName = orte.find((o) => o.id === b.lagerort_id)?.name ?? b.lagerorte?.name ?? "Lager";
  const zielText = b.projekte ? `Baustelle ${b.projekte.nummer} ${b.projekte.name}` : lagerName;
  const posName = new Map(b.bestell_positionen.map((p) => [p.id, p.artikel]));
  const lagerWahl = orte.filter((o) => o.art === "lager").length ? orte.filter((o) => o.art === "lager" || o.id === lagerortId) : orte;

  return (
    <Seite
      titel={`Bestellung ${b.nummer ?? ""}`.trim()}
      untertitel={`${b.lieferant} · ${zielText}`}
      zurueckPfad="/bestellungen"
      aktionen={(
        <>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="PDF" disabled={!!laeuft || !zeilen.length} onClick={() => void pdfZeigen()}>
            {laeuft === "pdf" ? <Loader2 className="h-5 w-5 animate-spin" /> : pc ? <FileText className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
          </Button>
          {entwurf && (
            <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label="Bestellung löschen" disabled={!!laeuft}
              onClick={() => setFrage({
                titel: "Entwurf löschen?", text: `Die Bestellung ${b.nummer} ist noch nicht bestellt und wird endgültig gelöscht.`, knopf: "Löschen", gefahr: true,
                aktion: async () => { await bestellungLoeschen(b.id); await neuLaden("bestellungen"); toast.success("Gelöscht"); navigate("/bestellungen", { replace: true }); },
              })}>
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </>
      )}
    >
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusPille eintrag={BESTELL_STATUS[status]} />
          <p className="text-sm text-muted-foreground">
            {[`angelegt ${datum(b.datum)}`, b.bestellt_am ? `bestellt ${zeitpunkt(b.bestellt_am)}` : null,
              b.liefertermin ? `Liefertermin ${datum(b.liefertermin)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
          {istOffen(status) && (
            <Button className="h-12 text-base sm:h-11 sm:text-sm" onClick={() => setEingang(true)} disabled={!!laeuft}>
              <PackageCheck className="h-4 w-4" /> Lieferung einbuchen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={csvLaden} disabled={!zeilen.length}>
            <Download className="h-4 w-4" /> CSV für den Webshop
          </Button>
          <Button variant="outline" className="h-11" onClick={() => void textKopieren()} disabled={!zeilen.length}>
            <ClipboardCopy className="h-4 w-4" /> Text kopieren
          </Button>
          {status === "teilgeliefert" && (
            <Button variant="outline" className="h-11" disabled={!!laeuft} onClick={() => setFrage({
              titel: "Rest kommt nicht mehr?", text: "Die Bestellung wird abgeschlossen. Was noch offen ist, wird nicht mehr erwartet und zählt beim Nachbestellen nicht mehr als bestellt.",
              knopf: "Abschließen", aktion: () => tun("status", () => statusSetzen(b.id, "erledigt"), "Bestellung abgeschlossen"),
            })}>
              <Check className="h-4 w-4" /> Rest kommt nicht mehr
            </Button>
          )}
          {status === "bestellt" && (
            <Button variant="outline" className="h-11" disabled={!!laeuft} onClick={() => setFrage({
              titel: "Bestellung stornieren?", text: "Noch nichts geliefert — die Bestellung wird storniert und zählt nicht mehr als bestellt.",
              knopf: "Stornieren", gefahr: true, aktion: () => tun("status", () => statusSetzen(b.id, "storniert"), "Bestellung storniert"),
            })}>
              <Ban className="h-4 w-4" /> Stornieren
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
        <Karte titel="Bestellung">
          {entwurf ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="be-lieferant">Lieferant</Label>
                <Input id="be-lieferant" value={lieferant} onChange={(e) => setLieferant(e.target.value)} list="be-lieferanten" className="h-11 text-base sm:text-sm" autoComplete="off" />
                <datalist id="be-lieferanten">{lieferanten.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Liefern</Label>
                <div className="flex gap-2">
                  {(["lager", "projekt"] as const).map((z) => (
                    <button key={z} type="button" onClick={() => setZiel(z)} aria-pressed={ziel === z}
                      className={cn("h-11 flex-1 rounded-full border px-3 text-sm font-medium", ziel === z ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                      {z === "lager" ? "Ins Lager" : "Auf die Baustelle"}
                    </button>
                  ))}
                </div>
                {ziel === "lager" ? (
                  <Select value={lagerortId} onValueChange={setLagerortId}>
                    <SelectTrigger className="h-11" aria-label="Lagerort"><SelectValue placeholder="Lagerort" /></SelectTrigger>
                    <SelectContent>{lagerWahl.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <ProjektWahl wert={projektId} onChange={(id) => setProjektId(id)} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="be-termin">Liefertermin <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="be-termin" type="date" value={liefertermin} onChange={(e) => setLiefertermin(e.target.value)} className="h-11 text-base sm:text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="be-notiz">Hinweis <span className="font-normal text-muted-foreground">(Kundennummer, Ansprechpartner …)</span></Label>
                <Textarea id="be-notiz" rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Lieferant</dt><dd className="font-medium">{b.lieferant}</dd>
              <dt className="text-muted-foreground">Liefern an</dt>
              <dd>{b.projekte ? <Link to={`/projekte/${b.projekte.id}`} className="text-primary hover:underline">{zielText}</Link> : zielText}</dd>
              {b.liefertermin && (<><dt className="text-muted-foreground">Liefertermin</dt><dd>{datum(b.liefertermin)}</dd></>)}
              {b.notiz && (<><dt className="text-muted-foreground">Hinweis</dt><dd className="whitespace-pre-wrap">{b.notiz}</dd></>)}
              <dt className="text-muted-foreground">Summe</dt><dd className="zahl">{euro(summe)} netto</dd>
            </dl>
          )}
        </Karte>

        <Karte titel={`Positionen · ${zeilen.length}`} ohnePolster aktion={summe ? <span className="zahl text-sm text-muted-foreground">{euro(summe)} netto</span> : undefined}>
          {entwurf ? (
            <div>
              {zeilen.length === 0 && <p className="px-4 pb-2 text-sm text-muted-foreground lg:px-5">Noch keine Artikel — unten suchen und dazunehmen.</p>}
              <ul className="divide-y border-b">
                {zeilen.map((z) => (
                  <li key={z.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center lg:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{z.artikel.bezeichnung}</p>
                      <p className="truncate text-xs text-muted-foreground">{positionInfo(z.artikel)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <MengeFeld wert={z.menge} beschriftung={`Menge ${z.artikel.bezeichnung}`}
                        onChange={(t) => setZeilen((l) => l.map((x) => (x.key === z.key ? { ...x, menge: t } : x)))} />
                      <span className="w-9 shrink-0 text-xs text-muted-foreground">{z.artikel.einheit}</span>
                      <label className="relative">
                        <span className="sr-only">EK {z.artikel.bezeichnung}</span>
                        <Input value={z.ek} onChange={(e) => setZeilen((l) => l.map((x) => (x.key === z.key ? { ...x, ek: e.target.value } : x)))}
                          inputMode="decimal" placeholder="EK" className="zahl h-11 w-24 pr-6 text-right" autoComplete="off" />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </label>
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${z.artikel.bezeichnung} entfernen`}
                        onClick={() => setZeilen((l) => l.filter((x) => x.key !== z.key))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="p-4 lg:px-5">
                <ArtikelSuche onWahl={artikelDazu} platzhalter="Artikel dazu – Name, Nummer, EAN …" />
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {b.bestell_positionen.map((p) => {
                const offen = offeneMenge(p);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3 lg:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{p.artikel.bezeichnung}</p>
                      <p className="truncate text-xs text-muted-foreground">{positionInfo(p.artikel)}</p>
                      <p className="text-xs">
                        bestellt <span className="zahl">{mengeText(Number(p.menge), p.artikel.einheit)}</span>
                        {" · "}geliefert <span className="zahl">{zahl(Number(p.geliefert))}</span>
                        {p.ek_preis != null && <span className="text-muted-foreground"> · EK {euro(Number(p.ek_preis))}</span>}
                      </p>
                    </div>
                    {status === "storniert" ? null : offen > 0
                      ? <StatusPille eintrag={{ ton: Number(p.geliefert) > 0 ? "gelb" : "grau", text: `offen ${zahl(offen)}` }} />
                      : <StatusPille eintrag={{ ton: "gruen", text: "Da" }} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Karte>
      </div>

      {lieferungen.length > 0 && (
        <Karte titel="Lieferungen" ohnePolster>
          <ul className="divide-y">
            {lieferungen.map((l) => (
              <li key={l.vorgang} className="px-4 py-3 lg:px-5">
                <p className="text-sm font-medium">{zeitpunkt(l.wann)} · {name(l.wer)}</p>
                {l.notiz && <p className="text-xs text-muted-foreground">{l.notiz}</p>}
                <ul className="mt-1 space-y-0.5">
                  {l.zeilen.map((z, i) => {
                    const a = posName.get(z.position);
                    return (
                      <li key={i} className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{a?.bezeichnung ?? "–"}</span>
                        <span className="zahl shrink-0">+{zahl(z.menge)} <span className="text-muted-foreground">{a?.einheit}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Karte>
      )}

      {entwurf && (
        <div className="sticky bottom-0 z-20 -mx-3 flex gap-2 border-t bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:mx-0 lg:rounded-lg lg:border"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <Button variant="outline" className="h-12 flex-1" disabled={!dirty || !!laeuft} onClick={() => void speichern().then((ok) => ok && toast.success("Gespeichert"))}>
            {laeuft === "speichern" ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {dirty ? "Speichern" : "Gespeichert"}
          </Button>
          <Button className="h-auto min-h-12 flex-[2] whitespace-normal text-base leading-tight" disabled={!!laeuft || !zeilen.length} onClick={() => void bestellen()}>
            {laeuft === "bestellen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Als bestellt markieren
          </Button>
        </div>
      )}

      {istOffen(status) && <WareneingangDialog open={eingang} onOpenChange={setEingang} bestellung={b} />}
      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
      <AlertDialog open={!!frage} onOpenChange={(o) => { if (!o) setFrage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{frage?.titel}</AlertDialogTitle>
            <AlertDialogDescription>{frage?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant={frage?.gefahr ? "destructive" : "default"} className="h-11"
              onClick={() => { const f = frage; setFrage(null); if (f) void f.aktion().catch((e) => toast.error((e as Error).message)); }}>
              {frage?.knopf}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}
