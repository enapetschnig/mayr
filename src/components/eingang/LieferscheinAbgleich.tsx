import { useMemo } from "react";
import { toast } from "sonner";
import { ExternalLink, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusPille } from "@/components/Bausteine";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { datum, dezimalLesen, zahl } from "@/lib/format";
import type { StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { lsAdresse, lsPositionen, useLieferscheine, type LieferscheinMitProjekt } from "./eingangDaten";
import { abgleich, type AbgleichZeile, type PositionEntwurf } from "./eingangLogik";

const STATUS: Record<AbgleichZeile["status"], StatusEintrag> = {
  passt: { ton: "gruen", text: "passt" },
  menge: { ton: "rot", text: "Menge weicht ab" },
  nicht_geliefert: { ton: "gelb", text: "nicht am Lieferschein" },
  nicht_verrechnet: { ton: "grau", text: "nicht verrechnet" },
};
// Fracht, Zuschläge, Verpackung stehen nie am Lieferschein
const NEBENKOSTEN = /fracht|zuschlag|verpackung|porto|versand|maut|kupfer/i;

/**
 * Lieferscheine der Monteure gegen die Rechnung: zugeordnet über Nummer,
 * Lieferant oder von Hand. Zeigt je Zeile, ob Menge und Artikel stimmen —
 * und übernimmt das Projekt vom Lieferschein in die Positionen.
 */
export function LieferscheinAbgleich({
  rechnungId, lieferant, nummern, positionen, onProjekte,
}: {
  rechnungId: string | null;
  lieferant: string;
  nummern: string[];
  positionen: PositionEntwurf[];
  /** Projekt je Position aus den zugeordneten Lieferscheinen */
  onProjekte: (zuweisung: Record<string, string>) => void;
}) {
  const neuLaden = useNeuLaden();
  const { data: alle = [] } = useLieferscheine();
  const zugeordnet = alle.filter((l) => rechnungId && l.eingangsrechnung_id === rechnungId);
  // Vorschläge: gleiche Nummer wie auf der Rechnung, sonst gleicher Lieferant, noch frei
  const vorschlaege = useMemo(() => {
    const nr = new Set(nummern.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const lf = lieferant.trim().toLowerCase();
    return alle.filter((l) => !l.eingangsrechnung_id && (
      (l.nummer && nr.has(l.nummer.trim().toLowerCase()))
      || (lf && l.lieferant && (l.lieferant.toLowerCase().includes(lf) || lf.includes(l.lieferant.toLowerCase())))
    )).sort((a, b) => Number(!!b.nummer && nr.has(b.nummer.toLowerCase())) - Number(!!a.nummer && nr.has(a.nummer.toLowerCase())));
  }, [alle, nummern, lieferant]);

  // Zeilen, die laut Rechnung zu einem noch nicht fotografierten/zugeordneten Lieferschein gehören, warten
  const verbundeneNr = new Set(zugeordnet.map((l) => (l.nummer ?? "").trim().toLowerCase()).filter(Boolean));
  const vergleichbar = positionen.filter((p) => p.bezeichnung.trim() && !NEBENKOSTEN.test(p.bezeichnung)
    && (!p.lieferschein_nr.trim() || verbundeneNr.has(p.lieferschein_nr.trim().toLowerCase())));
  const wartend = [...new Set(positionen.map((p) => p.lieferschein_nr.trim()).filter((n) => n && !verbundeneNr.has(n.toLowerCase())))];
  const zeilen = abgleich(
    vergleichbar.map((p) => ({ artikelnummer: p.artikelnummer, bezeichnung: p.bezeichnung, menge: dezimalLesen(p.menge) })),
    zugeordnet.flatMap((l) => lsPositionen(l)),
  );
  const probleme = zeilen.filter((z) => z.status !== "passt").length;
  const nachNummer = vorschlaege.filter((l) => l.nummer && nummern.some((n) => n.trim().toLowerCase() === l.nummer!.trim().toLowerCase()));

  const verbinden = async (l: LieferscheinMitProjekt | LieferscheinMitProjekt[], an: boolean) => {
    const ids = (Array.isArray(l) ? l : [l]).map((x) => x.id);
    const { error } = await supabase.from("lieferscheine").update({ eingangsrechnung_id: an ? rechnungId : null }).in("id", ids);
    if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return; }
    await neuLaden("eingang");
  };
  const ansehen = async (l: LieferscheinMitProjekt) => {
    const fenster = window.open("", "_blank");
    try {
      const url = await lsAdresse(l.datei_pfad);
      if (fenster) fenster.location.href = url; else window.location.href = url;
    } catch (e) {
      fenster?.close();
      toast.error("Foto nicht geöffnet", { description: (e as Error).message });
    }
  };
  // Projekt der Lieferscheine auf die passenden Positionen
  const projekteUebernehmen = () => {
    const zuweisung: Record<string, string> = {};
    positionen.forEach((p) => {
      const l = zugeordnet.find((ls) => ls.projekt_id && (
        (p.lieferschein_nr && ls.nummer && p.lieferschein_nr.trim().toLowerCase() === ls.nummer.trim().toLowerCase())
        || abgleich([{ artikelnummer: p.artikelnummer, bezeichnung: p.bezeichnung, menge: null }], lsPositionen(ls))[0]?.status !== "nicht_geliefert"));
      if (l?.projekt_id) zuweisung[p.schluessel] = l.projekt_id;
    });
    const n = Object.keys(zuweisung).length;
    if (!n) { toast("Keine Position passt zu einem Lieferschein mit Projekt."); return; }
    onProjekte(zuweisung);
    toast.success(`${n} ${n === 1 ? "Position" : "Positionen"} dem Projekt vom Lieferschein zugeordnet`);
  };

  if (!rechnungId) {
    return vorschlaege.length ? (
      <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        {vorschlaege.length} passende {vorschlaege.length === 1 ? "Lieferschein" : "Lieferscheine"} von der Baustelle — nach dem Speichern abgleichen.
      </p>
    ) : null;
  }
  if (!zugeordnet.length && !vorschlaege.length) return null;

  const lsZeile = (l: LieferscheinMitProjekt, verbunden: boolean) => (
    <li key={l.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{l.nummer ? `Lieferschein ${l.nummer}` : "Lieferschein"} · {datum(l.datum)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[l.lieferant, l.projekte ? `${l.projekte.nummer} ${l.projekte.name}` : "ohne Projekt", l.profiles && `${l.profiles.vorname} ${l.profiles.nachname}`,
            `${lsPositionen(l).length} Zeilen${l.gelesen_am ? "" : " · noch nicht gelesen"}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Foto ansehen" onClick={() => void ansehen(l)}><ExternalLink className="h-4 w-4" /></Button>
      {verbunden
        ? <Button variant="outline" className="h-10 gap-1.5" onClick={() => void verbinden(l, false)}><Unlink className="h-4 w-4" /> Lösen</Button>
        : <Button variant="outline" className="h-10 gap-1.5" onClick={() => void verbinden(l, true)}><Link2 className="h-4 w-4" /> Zuordnen</Button>}
    </li>
  );

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold">Abgleich mit den Lieferscheinen</h3>
        {zugeordnet.length > 0 && (probleme
          ? <StatusPille eintrag={{ ton: "rot", text: `${probleme} ${probleme === 1 ? "Abweichung" : "Abweichungen"}` }} />
          : <StatusPille eintrag={{ ton: "gruen", text: "stimmt" }} />)}
      </div>
      {zugeordnet.length > 0 && <ul className="divide-y rounded-lg border bg-card">{zugeordnet.map((l) => lsZeile(l, true))}</ul>}
      {zugeordnet.length > 0 && wartend.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">Noch ohne Foto: Lieferschein {wartend.join(", ")} — diese Zeilen sind nicht verglichen.</p>
      )}
      {zugeordnet.length > 0 && zeilen.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Artikel</th><th className="px-2 py-2 text-right font-medium">verrechnet</th><th className="px-2 py-2 text-right font-medium">geliefert</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {zeilen.map((z, i) => (
                <tr key={i} className={cn(z.status === "menge" && "bg-status-rot")}>
                  <td className="max-w-[16rem] px-3 py-2"><span className="line-clamp-2">{z.bezeichnung}</span></td>
                  <td className="zahl px-2 py-2 text-right">{z.verrechnet == null ? "–" : zahl(z.verrechnet)}</td>
                  <td className="zahl px-2 py-2 text-right">{z.geliefert == null ? "–" : zahl(z.geliefert)}</td>
                  <td className="px-3 py-2 text-right"><StatusPille eintrag={STATUS[z.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {zugeordnet.some((l) => l.projekt_id) && positionen.length > 0 && (
        <Button variant="outline" className="w-full" onClick={projekteUebernehmen}>Projekt vom Lieferschein in die Positionen übernehmen</Button>
      )}
      {vorschlaege.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted-foreground">{nachNummer.length ? "Die Rechnung nennt diese Lieferscheine:" : "Passt vielleicht dazu:"}</p>
            {nachNummer.length > 1 && (
              <Button variant="outline" className="h-10 gap-1.5" onClick={() => void verbinden(nachNummer, true)}>
                <Link2 className="h-4 w-4" /> Alle {nachNummer.length} zuordnen
              </Button>
            )}
          </div>
          <ul className="divide-y rounded-lg border bg-card">{vorschlaege.slice(0, 5).map((l) => lsZeile(l, false))}</ul>
        </>
      )}
    </section>
  );
}
