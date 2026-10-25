import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, Loader2, Package, PackageMinus, PackagePlus, ShoppingCart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Leer, StatusPille } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNeuLaden, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, zahl } from "@/lib/format";
import { artikelVk, runden2 } from "@/lib/preise";
import { BUCHUNGS_ART, name, type BuchungsArt, type StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  artikelInfo, fehlerText, mengeText, runden3, useMaterialLive, useProjektBuchungen, useProjektMaterial,
  useRegieMaterialAnzahl, zeitpunktText, type BuchungMitBezug, type ProjektMaterialZeile,
} from "./materialDaten";

const VERRECHNET: StatusEintrag = { ton: "lila", text: "Verrechnet" };

type Posten = {
  schluessel: string;
  zeile: ProjektMaterialZeile;
  buchungen: BuchungMitBezug[];
  verrechnet: number;
  /** VK je Einheit (nur Anzeige, Chef) */
  vk: number;
  wert: number;
  wertOffen: number;
};

// Freie Positionen fasst die View nach Bezeichnung + Einheit zusammen — hier genauso
const schluesselZeile = (z: ProjektMaterialZeile) => z.artikel_id ?? `frei:${z.bezeichnung ?? ""}|${z.einheit ?? "Stk"}`;
const schluesselBuchung = (b: BuchungMitBezug) => b.artikel_id ?? `frei:${b.bezeichnung ?? ""}|${b.einheit ?? "Stk"}`;
const vorzeichen = (art: string) => (art === "rueckgabe" ? -1 : 1);

/**
 * Material eines Projekts (ohne Regieberichte — die zählen dort):
 * ausgefasst, zurück, direkt gekauft, verbraucht, noch nicht verrechnet.
 * Je Artikel aufklappbar bis zur einzelnen Buchung; eigene, noch nicht
 * verrechnete Buchungen lassen sich dort löschen (Fehlgriff beim Scannen).
 * Werte (VK) sieht nur der Chef.
 */
export function ProjektMaterial({ projekt }: { projekt: ProjektMitKunde }) {
  const pc = useIstPc();
  const { profil, firma, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: zeilen = [], isLoading, error } = useProjektMaterial(projekt.id);
  const { data: buchungen = [] } = useProjektBuchungen(projekt.id);
  const { data: regieAnzahl = 0 } = useRegieMaterialAnzahl(projekt.id);
  useMaterialLive(projekt.id);
  const [auf, setAuf] = useState<Set<string>>(() => new Set());
  const [loeschen, setLoeschen] = useState<BuchungMitBezug | null>(null);
  const [loescht, setLoescht] = useState(false);

  const posten = useMemo<Posten[]>(() => {
    const jeSchluessel = new Map<string, BuchungMitBezug[]>();
    buchungen.forEach((b) => {
      const k = schluesselBuchung(b);
      jeSchluessel.set(k, [...(jeSchluessel.get(k) ?? []), b]);
    });
    return zeilen
      .filter((z) => Number(z.ausgefasst) || Number(z.zurueck) || Number(z.direkt))
      .map((z) => {
        const k = schluesselZeile(z);
        const eigene = jeSchluessel.get(k) ?? [];
        const verbraucht = Number(z.verbraucht ?? 0);
        const offen = Number(z.offen ?? 0);
        let vk: number;
        let wert: number;
        let wertOffen: number;
        if (z.artikel) {
          vk = artikelVk(z.artikel, firma);
          wert = runden2(vk * verbraucht);
          wertOffen = runden2(vk * offen);
        } else {
          // Ohne Artikel gibt es nur den EK aus der Buchung → über preise.ts zum VK
          const vkVon = (b: BuchungMitBezug) => artikelVk({ vk_preis: null, ek_preis: b.ek_preis, listenpreis: null }, firma);
          wert = runden2(eigene.reduce((s, b) => s + vorzeichen(b.art) * Number(b.menge) * vkVon(b), 0));
          wertOffen = runden2(eigene.filter((b) => !b.rechnung_id).reduce((s, b) => s + vorzeichen(b.art) * Number(b.menge) * vkVon(b), 0));
          vk = verbraucht ? runden2(wert / verbraucht) : 0;
        }
        return { schluessel: k, zeile: z, buchungen: eigene, verrechnet: runden3(verbraucht - offen), vk, wert, wertOffen };
      });
  }, [zeilen, buchungen, firma]);

  const summe = runden2(posten.reduce((s, p) => s + p.wert, 0));
  const summeOffen = runden2(posten.reduce((s, p) => s + p.wertOffen, 0));

  const umschalten = (k: string) => setAuf((alt) => {
    const neu = new Set(alt);
    if (neu.has(k)) neu.delete(k);
    else neu.add(k);
    return neu;
  });

  const darfLoeschen = (b: BuchungMitBezug) => !b.rechnung_id && (istChef || (!!profil && b.user_id === profil.id));

  const buchungLoeschen = async () => {
    if (!loeschen) return;
    setLoescht(true);
    // Ohne passende Rechte löscht RLS still nichts — deshalb die gelöschten Zeilen zurückholen
    const { data, error: fehler } = await supabase.from("material_buchungen").delete().eq("id", loeschen.id).select("id");
    setLoescht(false);
    if (fehler) return toast.error("Nicht gelöscht", { description: fehlerText(fehler) });
    if (!data?.length) {
      return toast.error("Nicht gelöscht", { description: "Diese Buchung gibt es nicht mehr oder sie gehört jemand anderem." });
    }
    toast.success("Buchung gelöscht", {
      description: `${mengeText(loeschen.menge, loeschen.artikel?.einheit ?? loeschen.einheit)} ${loeschen.artikel?.bezeichnung ?? loeschen.bezeichnung ?? ""}`,
    });
    setLoeschen(null);
    void neuLaden("material", "lager", "projekt_zahlen");
  };

  const scanLink = (modus: BuchungsArt) => `/scan?projekt=${projekt.id}&modus=${modus}`;

  const aktionen = (
    <div className="grid grid-cols-3 gap-2">
      <Button asChild className="h-auto min-h-14 flex-col gap-1 whitespace-normal px-1 py-2 text-center text-[13px] leading-tight">
        <Link to={scanLink("ausfassung")}><PackageMinus className="h-5 w-5" />Ausfassen</Link>
      </Button>
      <Button asChild variant="outline" className="h-auto min-h-14 flex-col gap-1 whitespace-normal px-1 py-2 text-center text-[13px] leading-tight">
        <Link to={scanLink("rueckgabe")}><PackagePlus className="h-5 w-5" />Zurückgeben</Link>
      </Button>
      <Button asChild variant="outline" className="h-auto min-h-14 flex-col gap-1 whitespace-normal px-1 py-2 text-center text-[13px] leading-tight">
        <Link to={scanLink("direkt")}><ShoppingCart className="h-5 w-5" />Direkt gekauft</Link>
      </Button>
    </div>
  );

  const regieHinweis = regieAnzahl > 0 && (
    <p className="text-xs text-muted-foreground">
      Dazu {regieAnzahl === 1 ? "eine Materialbuchung" : `${regieAnzahl} Materialbuchungen`} in Regieberichten — die zählen beim Regiebericht.
    </p>
  );

  let inhalt;
  if (isLoading) {
    inhalt = (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Material wird geladen …
      </p>
    );
  } else if (error) {
    inhalt = <p className="py-8 text-center text-sm text-destructive">Material nicht geladen: {fehlerText(error)}</p>;
  } else if (!posten.length) {
    inhalt = (
      <div className="rounded-lg border bg-card">
        <Leer icon={Package} text="Noch kein Material auf diesem Projekt." />
      </div>
    );
  } else if (pc) {
    const spalten = istChef ? 9 : 7;
    inhalt = (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2.5 pl-4 pr-2 font-medium">Artikel</th>
              <th className="px-2 text-right font-medium">Ausgefasst</th>
              <th className="px-2 text-right font-medium">Zurück</th>
              <th className="px-2 text-right font-medium">Direkt</th>
              <th className="px-2 text-right font-medium">Verbraucht</th>
              <th className="px-2 text-right font-medium">Offen</th>
              {istChef && <th className="px-2 text-right font-medium">VK je Einh.</th>}
              {istChef && <th className="px-2 text-right font-medium">Wert</th>}
              <th className="w-12 pr-2" />
            </tr>
          </thead>
          <tbody>
            {posten.map((p) => {
              const z = p.zeile;
              const offen = auf.has(p.schluessel);
              return (
                <Fragment key={p.schluessel}>
                  <tr className={cn("cursor-pointer border-b last:border-b-0 hover:bg-muted/40", offen && "bg-muted/30")}
                    onClick={() => umschalten(p.schluessel)}>
                    <td className="py-2.5 pl-4 pr-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{z.bezeichnung}</span>
                        <VerrechnetPille p={p} />
                      </div>
                      <p className="text-xs text-muted-foreground">{z.artikel ? artikelInfo(z.artikel) : "ohne Artikelstamm"}</p>
                    </td>
                    <td className="zahl px-2 text-right">{zahl(z.ausgefasst)}</td>
                    <td className="zahl px-2 text-right">{Number(z.zurueck) ? zahl(z.zurueck) : "–"}</td>
                    <td className="zahl px-2 text-right">{Number(z.direkt) ? zahl(z.direkt) : "–"}</td>
                    <td className="zahl whitespace-nowrap px-2 text-right font-semibold">{mengeText(z.verbraucht, z.einheit)}</td>
                    <td className="zahl px-2 text-right">{zahl(z.offen)}</td>
                    {istChef && <td className="zahl whitespace-nowrap px-2 text-right">{euro(p.vk)}</td>}
                    {istChef && <td className="zahl whitespace-nowrap px-2 text-right font-semibold">{euro(p.wert)}</td>}
                    <td className="pr-2 text-right">
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-expanded={offen}
                        aria-label={`Buchungen zu ${z.bezeichnung} ${offen ? "zuklappen" : "aufklappen"}`}
                        onClick={(e) => { e.stopPropagation(); umschalten(p.schluessel); }}>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", offen && "rotate-180")} />
                      </Button>
                    </td>
                  </tr>
                  {offen && (
                    <tr className="border-b bg-muted/30">
                      <td colSpan={spalten} className="px-4 pb-2">
                        <BuchungsListe buchungen={p.buchungen} einheit={z.einheit} darfLoeschen={darfLoeschen} onLoeschen={setLoeschen} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {istChef && (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="py-2.5 pl-4 pr-2 font-semibold" colSpan={7}>
                  Summe verbraucht
                  {summeOffen !== summe && (
                    <span className="ml-2 font-normal text-muted-foreground">davon nicht verrechnet <span className="zahl">{euro(summeOffen)}</span></span>
                  )}
                </td>
                <td className="zahl whitespace-nowrap px-2 text-right font-semibold">{euro(summe)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  } else {
    inhalt = (
      <div className="divide-y rounded-lg border bg-card">
        {posten.map((p) => {
          const z = p.zeile;
          const offen = auf.has(p.schluessel);
          const teile = [
            Number(z.ausgefasst) ? `ausgefasst ${zahl(z.ausgefasst)}` : "",
            Number(z.zurueck) ? `zurück ${zahl(z.zurueck)}` : "",
            Number(z.direkt) ? `direkt ${zahl(z.direkt)}` : "",
          ].filter(Boolean).join(" · ");
          return (
            <div key={p.schluessel}>
              <button type="button" onClick={() => umschalten(p.schluessel)} aria-expanded={offen}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors active:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{z.bezeichnung}</p>
                  <p className="text-xs text-muted-foreground">{teile}</p>
                  <VerrechnetPille p={p} className="mt-1" />
                </div>
                <div className="shrink-0 text-right">
                  <p className="zahl whitespace-nowrap font-semibold">{mengeText(z.verbraucht, z.einheit)}</p>
                  {istChef && <p className="zahl whitespace-nowrap text-xs text-muted-foreground">{euro(p.wert)}</p>}
                </div>
                <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
              </button>
              {offen && (
                <div className="border-t bg-muted/30 px-3 pb-1">
                  <BuchungsListe buchungen={p.buchungen} einheit={z.einheit} darfLoeschen={darfLoeschen} onLoeschen={setLoeschen} />
                </div>
              )}
            </div>
          );
        })}
        {istChef && (
          <div className="flex items-baseline justify-between gap-3 bg-muted/30 p-3">
            <div>
              <p className="font-semibold">Summe verbraucht</p>
              {summeOffen !== summe && (
                <p className="text-xs text-muted-foreground">davon nicht verrechnet <span className="zahl">{euro(summeOffen)}</span></p>
              )}
            </div>
            <p className="zahl font-semibold">{euro(summe)}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aktionen}
      {inhalt}
      {regieHinweis}

      <AlertDialog open={!!loeschen} onOpenChange={(o) => { if (!o && !loescht) setLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {loeschen && (
                <>
                  {BUCHUNGS_ART[loeschen.art as BuchungsArt] ?? loeschen.art}: {mengeText(loeschen.menge, loeschen.artikel?.einheit ?? loeschen.einheit)}{" "}
                  {loeschen.artikel?.bezeichnung ?? loeschen.bezeichnung} am {datum(loeschen.created_at)}
                  {loeschen.lagerorte?.name ? ` (${loeschen.lagerorte.name})` : ""}.
                  {loeschen.lagerort_id ? " Der Lagerbestand stimmt danach wieder wie vorher." : ""}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={loescht}>Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void buchungLoeschen()} disabled={loescht}>
              {loescht && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Lila, sobald etwas davon in einer Rechnung steckt */
function VerrechnetPille({ p, className }: { p: Posten; className?: string }) {
  if (!p.verrechnet) return null;
  const offen = Number(p.zeile.offen ?? 0);
  return (
    <StatusPille className={className}
      eintrag={offen ? { ...VERRECHNET, text: `${zahl(p.verrechnet)} verrechnet` } : VERRECHNET} />
  );
}

function BuchungsListe({
  buchungen, einheit, darfLoeschen, onLoeschen,
}: {
  buchungen: BuchungMitBezug[];
  einheit: string | null;
  darfLoeschen: (b: BuchungMitBezug) => boolean;
  onLoeschen: (b: BuchungMitBezug) => void;
}) {
  if (!buchungen.length) return <p className="py-3 text-sm text-muted-foreground">Keine Einzelbuchungen gefunden.</p>;
  return (
    <ul className="divide-y">
      {buchungen.map((b) => {
        const ort = b.lagerorte?.name;
        return (
          <li key={b.id} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{BUCHUNGS_ART[b.art as BuchungsArt] ?? b.art}</span>
                {ort && <span className="text-muted-foreground">{b.art === "rueckgabe" ? ` → ${ort}` : ` aus ${ort}`}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {name(b.profiles)} · {zeitpunktText(b.created_at)}{b.notiz ? ` · ${b.notiz}` : ""}
              </p>
            </div>
            {b.rechnung_id && <StatusPille eintrag={VERRECHNET} />}
            <span className="zahl shrink-0 whitespace-nowrap text-sm font-semibold">
              {vorzeichen(b.art) < 0 ? "−" : "+"}{zahl(b.menge)} <span className="font-normal text-muted-foreground">{einheit ?? "Stk"}</span>
            </span>
            {darfLoeschen(b) ? (
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Buchung löschen" onClick={() => onLoeschen(b)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <span className="w-11 shrink-0" aria-hidden />
            )}
          </li>
        );
      })}
    </ul>
  );
}
