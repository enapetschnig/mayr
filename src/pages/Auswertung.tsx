import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FirmaBadge, Kennzahl, Leer } from "@/components/Bausteine";
import { useZeiten } from "@/components/Buchungslisten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, datumKurz, isoTag, isoZuDatum, stunden, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";

type Zeitraum = "woche" | "monat" | "vormonat" | "jahr" | "frei";

function grenzen(z: Zeitraum): { von: string; bis: string } {
  const d = new Date();
  if (z === "woche") {
    const mo = new Date(d); mo.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const so = new Date(mo); so.setDate(mo.getDate() + 6);
    return { von: isoTag(mo), bis: isoTag(so) };
  }
  if (z === "vormonat") return { von: isoTag(new Date(d.getFullYear(), d.getMonth() - 1, 1)), bis: isoTag(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (z === "jahr") return { von: `${d.getFullYear()}-01-01`, bis: `${d.getFullYear()}-12-31` };
  return { von: isoTag(new Date(d.getFullYear(), d.getMonth(), 1)), bis: isoTag(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

export default function Auswertung() {
  const navigate = useNavigate();
  const { firma, firmaVon } = useSitzung();
  const [zeitraum, setZeitraum] = useState<Zeitraum>("monat");
  const [frei, setFrei] = useState(grenzen("monat"));
  const [mitPartnern, setMitPartnern] = useState(false);
  const g = zeitraum === "frei" ? frei : grenzen(zeitraum);
  const { data: alle = [], isLoading } = useZeiten({ von: g.von, bis: g.bis });
  const zeiten = useMemo(() => alle.filter((z) => mitPartnern || z.firma_id === firma?.id), [alle, mitPartnern, firma]);

  const summe = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const verrechnet = zeiten.filter((z) => z.rechnung_id).reduce((s, z) => s + Number(z.stunden), 0);
  const tage = new Set(zeiten.filter((z) => z.firma_id === firma?.id).map((z) => z.datum)).size;

  const proProjekt = useMemo(() => {
    const m = new Map<string, { name: string; h: number; offen: number; firmen: Map<string, number> }>();
    zeiten.forEach((z) => {
      const e = m.get(z.projekt_id) ?? { name: z.projekte?.name ?? "?", h: 0, offen: 0, firmen: new Map() };
      e.h += Number(z.stunden);
      if (!z.rechnung_id && z.firma_id === firma?.id) e.offen += Number(z.stunden);
      e.firmen.set(z.firma_id, (e.firmen.get(z.firma_id) ?? 0) + Number(z.stunden));
      m.set(z.projekt_id, e);
    });
    return [...m.entries()].sort((a, b) => b[1].h - a[1].h);
  }, [zeiten, firma]);

  // Verlauf: pro Tag (Woche/Monat) oder pro Monat (Jahr)
  const verlauf = useMemo(() => {
    const nachMonat = zeitraum === "jahr" || (zeitraum === "frei" && isoZuDatum(g.bis).getTime() - isoZuDatum(g.von).getTime() > 62 * 864e5);
    const m = new Map<string, number>();
    zeiten.forEach((z) => {
      const k = nachMonat ? z.datum.slice(0, 7) : z.datum;
      m.set(k, (m.get(k) ?? 0) + Number(z.stunden));
    });
    const liste = [...m.entries()].sort();
    const max = Math.max(1, ...liste.map(([, h]) => h));
    return { liste, max, nachMonat };
  }, [zeiten, zeitraum, g.von, g.bis]);

  const csv = () => {
    const zeilen = [["Datum", "Projekt", "Firma", "Stunden", "Von", "Bis", "Pause (Min)", "Tätigkeit", "Verrechnet"]];
    [...zeiten].sort((a, b) => a.datum.localeCompare(b.datum)).forEach((z) => zeilen.push([
      datum(z.datum), z.projekte?.name ?? "", firmaVon(z.firma_id)?.name ?? "", zahl(z.stunden),
      z.von?.slice(0, 5) ?? "", z.bis?.slice(0, 5) ?? "", String(z.pause_minuten ?? 0), z.taetigkeit ?? "", z.rechnung_id ? "ja" : "nein",
    ]));
    const text = "﻿" + zeilen.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Stunden ${g.von} bis ${g.bis}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const ZR: [Zeitraum, string][] = [["woche", "Woche"], ["monat", "Monat"], ["vormonat", "Vormonat"], ["jahr", "Jahr"], ["frei", "Frei"]];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Stundenauswertung" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-5xl">
        <div className="flex rounded-lg border overflow-x-auto w-full sm:w-fit">
          {ZR.map(([z, t], i) => (
            <button key={z} onClick={() => setZeitraum(z)}
              className={cn("flex-1 sm:flex-none px-3 py-2 text-sm font-medium whitespace-nowrap", i > 0 && "border-l",
                zeitraum === z ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{t}</button>
          ))}
        </div>
        {zeitraum === "frei" && (
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            <div className="space-y-1"><Label htmlFor="a-von" className="text-xs">Von</Label><Input id="a-von" type="date" value={frei.von} onChange={(e) => setFrei({ ...frei, von: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="a-bis" className="text-xs">Bis</Label><Input id="a-bis" type="date" value={frei.bis} onChange={(e) => setFrei({ ...frei, bis: e.target.value })} /></div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{datum(g.von)} – {datum(g.bis)}</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="a-partner" checked={mitPartnern} onCheckedChange={setMitPartnern} />
              <Label htmlFor="a-partner" className="text-sm">Freigegebene Partnerstunden</Label>
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={csv} disabled={!zeiten.length}><Download className="h-4 w-4" /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kennzahl titel="Stunden gesamt" wert={stunden(summe)} />
          <Kennzahl titel="Arbeitstage (ich)" wert={String(tage)} />
          <Kennzahl titel="Verrechnet" wert={stunden(verrechnet)} />
          <Kennzahl titel="Noch offen (ich)" wert={stunden(proProjekt.reduce((s, [, e]) => s + e.offen, 0))} className="border-amber-200" />
        </div>

        {isLoading ? <p className="text-muted-foreground">Lädt…</p> : zeiten.length === 0 ? (
          <Leer icon={BarChart3} text="Keine Stunden in diesem Zeitraum." />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Nach Projekt</CardTitle></CardHeader>
              <CardContent className="px-0 sm:px-6">
                <div className="divide-y">
                  {proProjekt.map(([pid, e]) => (
                    <button key={pid} className="w-full flex items-center gap-3 px-4 sm:px-0 py-2.5 text-left hover:bg-muted/40" onClick={() => navigate(`/projekte/${pid}?tab=stunden`)}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{e.name}</p>
                        <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden flex">
                          {[...e.firmen.entries()].map(([fid, h]) => (
                            <div key={fid} style={{ width: `${(h / proProjekt[0][1].h) * 100}%`, backgroundColor: firmaVon(fid)?.farbe }} />
                          ))}
                        </div>
                        {mitPartnern && e.firmen.size > 1 && (
                          <div className="flex gap-1 mt-1 flex-wrap">{[...e.firmen.entries()].map(([fid, h]) => (
                            <span key={fid} className="text-xs flex items-center gap-1"><FirmaBadge firma={firmaVon(fid)} /> {zahl(h)} h</span>
                          ))}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold tabular-nums">{stunden(e.h)}</p>
                        {e.offen > 0 && <p className="text-xs text-amber-700">{zahl(e.offen)} h offen</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{verlauf.nachMonat ? "Nach Monat" : "Nach Tag"}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {verlauf.liste.map(([k, h]) => (
                  <div key={k} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">
                      {verlauf.nachMonat ? isoZuDatum(`${k}-01`).toLocaleDateString("de-AT", { month: "short", year: "2-digit" }) : datumKurz(k)}
                    </span>
                    <div className="h-3 rounded-sm bg-muted overflow-hidden"><div className="h-full bg-primary rounded-sm" style={{ width: `${(h / verlauf.max) * 100}%` }} /></div>
                    <span className="text-xs font-semibold tabular-nums text-right">{zahl(h)} h</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
