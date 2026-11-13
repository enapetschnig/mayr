import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, Loader2, MapPin, PackagePlus, Plus, Search, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { StatusPille } from "@/components/Bausteine";
import { ProjektWahl } from "@/components/ProjektWahl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArtikelDialog } from "@/components/stamm/ArtikelDialog";
import { aufBestellungenVerteilen, istOffen, type OffenePosition } from "@/components/bestellung/bestellLogik";
import { lsPositionen, type LieferscheinMitProjekt } from "@/components/eingang/eingangDaten";
import { useLagerorte, useNeuLaden } from "@/hooks/useDaten";
import { dezimalLesen, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArtikelSuche } from "./ArtikelSuche";
import { ArtikelVorschau } from "./ArtikelVorschau";
import { lagerplatzSetzen, platzSchluessel, useHauptbilder, useLagerplaetze } from "./artikelDaten";
import { istNebenkosten, lieferantPasst, nummerNorm, zeileZuordnen, type ZuordnungKandidat } from "./artikelLogik";
import { ARTIKEL_KURZ, MENGE_MAX, artikelInfo, fehlerText, runden3, standardLagerort, zuArtikelKurz, type ArtikelKurz } from "./materialDaten";

type Zeile = {
  nr: number;
  text: string;
  artikelnummer: string | null;
  einheitLs: string | null;
  artikel: ArtikelKurz | null;
  grund: string | null;
  sicher: boolean;
  menge: string;
  /** nicht einbuchen (Fracht, Verpackung, fehlt) */
  aus: boolean;
  platz: string;
  platzVorher: string;
  /** für welchen Artikel und Lagerort der Platz geladen ist */
  platzFuer: string;
};

type BestellPos = OffenePosition & { ek_preis: number | null; nummer: string };

/**
 * Wareneingang aus einem Lieferschein (Foto/PDF, die KI hat die Zeilen
 * gelesen): je Zeile den Artikel zuordnen (Artikelnummer beim Lieferanten,
 * EAN, Hersteller-Nr.; sonst suchen oder neu anlegen), Menge und Lagerplatz
 * prüfen, einbuchen — ins Lager oder als Kommission direkt aufs Projekt.
 * Offene Bestellungen desselben Lieferanten werden dabei abgehakt.
 * `lieferschein_einbuchen` bucht alles oder nichts und nur einmal.
 */
export function LieferscheinEinbuchen({ ls, open, onOpenChange }: { ls: LieferscheinMitProjekt | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const neuLaden = useNeuLaden();
  const { data: orte = [] } = useLagerorte();
  const { data: plaetze } = useLagerplaetze();
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [ziel, setZiel] = useState<"lager" | "projekt">("lager");
  const [lagerortId, setLagerortId] = useState("");
  const [projektId, setProjektId] = useState("");
  const [suche, setSuche] = useState<number | null>(null);
  const [neuFuer, setNeuFuer] = useState<Zeile | null>(null);
  const [bestellt, setBestellt] = useState<BestellPos[]>([]);
  const [bucht, setBucht] = useState(false);

  // Beim Öffnen: Zeilen lesen und zuordnen
  useEffect(() => {
    if (!open || !ls) return;
    let weg = false;
    setZiel(ls.projekt_id ? "projekt" : "lager");
    setProjektId(ls.projekt_id ?? "");
    const pos = lsPositionen(ls);
    const roh: Zeile[] = pos.map((p, i) => ({
      nr: i, text: p.bezeichnung, artikelnummer: p.artikelnummer, einheitLs: p.einheit, artikel: null, grund: null, sicher: false,
      menge: p.menge != null ? String(p.menge).replace(".", ",") : "", aus: !(Number(p.menge) > 0), platz: "", platzVorher: "", platzFuer: "",
    }));
    setZeilen(roh);
    setLaedt(true);
    void (async () => {
      try {
        const zugeordnet = await zuordnen(roh, ls.lieferant);
        // Fracht, Verpackung … ohne Artikel: gleich „nicht einbuchen“ (mit einem Tipp wieder zurück)
        if (!weg) setZeilen(zugeordnet.map((z) => (!z.artikel && istNebenkosten(z.text) ? { ...z, aus: true } : z)));
      } catch (e) {
        if (!weg) toast.error("Artikel nicht zugeordnet", { description: fehlerText(e) });
      } finally {
        if (!weg) setLaedt(false);
      }
    })();
    return () => { weg = true; };
  }, [open, ls]);

  // Lager vorbelegen
  useEffect(() => {
    if (open && !lagerortId && orte.length) setLagerortId((orte.find((o) => o.art === "lager") ?? standardLagerort(orte, null))?.id ?? "");
  }, [open, orte, lagerortId]);

  // Lagerplatz je Zeile vorbelegen (am gewählten Lagerort)
  useEffect(() => {
    if (!plaetze || ziel !== "lager") return;
    setZeilen((alt) => alt.map((z) => {
      if (!z.artikel) return z;
      const k = platzSchluessel(z.artikel.id, lagerortId);
      if (z.platzFuer === k) return z; // schon geladen — Getipptes bleibt
      const p = plaetze.get(k) ?? "";
      return { ...z, platz: p, platzVorher: p, platzFuer: k };
    }));
  }, [plaetze, lagerortId, ziel, zeilen.map((z) => z.artikel?.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offene Bestellungen dieses Lieferanten fürs gewählte Ziel
  const artikelIds = useMemo(() => [...new Set(zeilen.flatMap((z) => (z.artikel ? [z.artikel.id] : [])))], [zeilen]);
  const zielId = ziel === "lager" ? lagerortId : projektId;
  useEffect(() => {
    if (!open || !artikelIds.length || !zielId) { setBestellt([]); return; }
    let weg = false;
    void (async () => {
      const q = supabase.from("bestell_positionen")
        .select("id, artikel_id, menge, geliefert, ek_preis, bestellungen!inner(status, lieferant, lagerort_id, projekt_id, bestellt_am, nummer)")
        .in("artikel_id", artikelIds).in("bestellungen.status", ["bestellt", "teilgeliefert"]);
      const { data, error } = ziel === "lager" ? await q.eq("bestellungen.lagerort_id", zielId) : await q.eq("bestellungen.projekt_id", zielId);
      if (weg || error) return;
      setBestellt((data ?? [])
        .filter((p) => istOffen(p.bestellungen.status) && (!ls?.lieferant || lieferantPasst(p.bestellungen.lieferant, ls.lieferant)))
        .sort((a, b) => (a.bestellungen.bestellt_am ?? "").localeCompare(b.bestellungen.bestellt_am ?? ""))
        .map((p) => ({ id: p.id, artikel_id: p.artikel_id, menge: p.menge, geliefert: p.geliefert, ek_preis: p.ek_preis, nummer: p.bestellungen.nummer })));
    })();
    return () => { weg = true; };
  }, [open, artikelIds, ziel, zielId, ls?.lieferant]);

  const { data: bilder } = useHauptbilder(artikelIds);
  const setzeZeile = (nr: number, w: Partial<Zeile>) => setZeilen((alt) => alt.map((z) => (z.nr === nr ? { ...z, ...w } : z)));

  const aktiv = zeilen.filter((z) => !z.aus);
  const fehlt = aktiv.filter((z) => !z.artikel);
  const mengeFalsch = aktiv.find((z) => { const n = dezimalLesen(z.menge); return n == null || !(n > 0) || n > MENGE_MAX; });
  const bereit = aktiv.length > 0 && !fehlt.length && !mengeFalsch && (ziel === "lager" ? !!lagerortId : !!projektId);
  const bestellNummern = [...new Set(bestellt.filter((b) => aktiv.some((z) => z.artikel?.id === b.artikel_id)).map((b) => b.nummer))];

  const einbuchen = async () => {
    if (!ls || !bereit) return;
    setBucht(true);
    try {
      // Mengen derselben Artikel zusammen auf die Bestellungen verteilen
      const offen = bestellt.map((b) => ({ ...b }));
      const reihen = aktiv.flatMap((z) => {
        const menge = runden3(dezimalLesen(z.menge) ?? 0);
        const teile = aufBestellungenVerteilen(z.artikel!.id, menge, offen);
        teile.forEach((t) => { const p = offen.find((o) => o.id === t.position); if (p) p.geliefert = Number(p.geliefert) + t.menge; });
        return teile.map((t) => ({
          art: ziel === "lager" ? "zugang" : "direkt",
          artikel_id: z.artikel!.id,
          menge: t.menge,
          lagerort_id: ziel === "lager" ? lagerortId : null,
          projekt_id: ziel === "projekt" ? projektId : null,
          ek_preis: bestellt.find((b) => b.id === t.position)?.ek_preis ?? z.artikel!.ek_preis ?? null,
          bestellposition_id: t.position,
        }));
      });
      const { data: n, error } = await supabase.rpc("lieferschein_einbuchen", { p_lieferschein: ls.id, p_zeilen: reihen });
      if (error) throw error;
      // Lagerplätze, die hier geändert wurden
      if (ziel === "lager") {
        for (const z of aktiv) if (z.artikel && z.platz.trim() !== z.platzVorher) await lagerplatzSetzen(z.artikel.id, lagerortId, z.platz).catch(() => undefined);
      }
      await neuLaden("eingang", "material", "lager", "bestellungen", "projekt_zahlen");
      toast.success(`Lieferschein eingebucht · ${n} ${n === 1 ? "Buchung" : "Buchungen"}`, {
        description: [ziel === "lager" ? orte.find((o) => o.id === lagerortId)?.name : "direkt aufs Projekt",
          bestellNummern.length ? `abgehakt in ${bestellNummern.join(", ")}` : null].filter(Boolean).join(" · "),
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Nicht eingebucht", { description: fehlerText(e) });
    } finally {
      setBucht(false);
    }
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={`Einbuchen · ${ls?.lieferant ?? "Lieferschein"}${ls?.nummer ? ` ${ls.nummer}` : ""}`}
      beschreibung="Artikel zuordnen, Menge und Lagerplatz prüfen — dann wird alles auf einmal gebucht."
      gesperrt={bucht}
      breite="breit"
      fuss={
        <>
          <p className="mr-auto hidden text-sm text-muted-foreground sm:block">
            {fehlt.length ? `${fehlt.length} ${fehlt.length === 1 ? "Zeile" : "Zeilen"} ohne Artikel` : mengeFalsch ? `Menge prüfen: ${mengeFalsch.text}` : `${aktiv.length} Positionen`}
          </p>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={bucht}>Abbrechen</Button>
          <Button className="h-11 min-w-48" onClick={() => void einbuchen()} disabled={!bereit || bucht || laedt}>
            {bucht ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            {aktiv.length === 1 ? "1 Position einbuchen" : `${aktiv.length} Positionen einbuchen`}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="space-y-2">
          <Label>Wohin?</Label>
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg border bg-secondary p-1 sm:max-w-md">
            {([["lager", "Ins Lager"], ["projekt", "Aufs Projekt (Kommission)"]] as const).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={ziel === k} onClick={() => setZiel(k)}
                className={cn("h-11 min-w-0 truncate rounded-md px-2 text-sm font-medium transition-colors",
                  ziel === k ? "bg-card font-semibold text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
          {ziel === "lager" ? (
            <div className="flex flex-wrap gap-2">
              {orte.map((o) => (
                <button key={o.id} type="button" onClick={() => setLagerortId(o.id)} aria-pressed={lagerortId === o.id}
                  className={cn("h-11 max-w-full truncate rounded-full border px-4 text-sm font-medium transition-colors",
                    lagerortId === o.id ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                  {o.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="sm:max-w-md"><ProjektWahl wert={projektId} onChange={(id) => setProjektId(id)} nurInArbeit /></div>
          )}
          {bestellNummern.length > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link2 className="h-4 w-4 text-primary" /> Gehört zu {bestellNummern.join(", ")} — die Bestellung wird mit abgehakt.
            </p>
          )}
        </section>

        {laedt && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Artikel werden zugeordnet …</p>}

        <ul className="divide-y rounded-lg border bg-card">
          {zeilen.map((z) => (
            <li key={z.nr} className={cn("space-y-2 p-3", z.aus && "bg-muted/40")}>
              <div className="flex items-start gap-3">
                <ArtikelVorschau url={z.artikel ? bilder?.get(z.artikel.id) : undefined} groesse="klein" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs text-muted-foreground", z.aus && "line-through")}>
                    Lieferschein: {z.text}{z.artikelnummer ? ` · ${z.artikelnummer}` : ""}
                  </p>
                  {z.artikel ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("font-medium leading-snug", z.aus && "text-muted-foreground")}>{z.artikel.bezeichnung}</span>
                      {z.grund && <StatusPille eintrag={{ ton: z.sicher ? "gruen" : "gelb", text: z.sicher ? `erkannt · ${z.grund}` : z.grund }} />}
                    </div>
                  ) : !z.aus ? (
                    <StatusPille eintrag={{ ton: "gelb", text: "Artikel zuordnen" }} />
                  ) : <p className="text-sm text-muted-foreground">Wird nicht eingebucht{istNebenkosten(z.text) ? " (Nebenkosten)" : ""}</p>}
                  {z.artikel && <p className="truncate text-xs text-muted-foreground">{artikelInfo(z.artikel)}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                  onClick={() => setzeZeile(z.nr, { aus: !z.aus })} aria-label={z.aus ? "Doch einbuchen" : "Diese Zeile nicht einbuchen"}>
                  {z.aus ? <Undo2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </Button>
              </div>
              {!z.aus && (
                <div className="flex flex-wrap items-center gap-2 pl-[3.25rem]">
                  <div className="flex items-center gap-2">
                    <Input className="zahl h-11 w-24 text-right text-base" inputMode="decimal" value={z.menge}
                      onChange={(e) => setzeZeile(z.nr, { menge: e.target.value })} aria-label={`Menge ${z.text}`} />
                    <span className="w-10 truncate text-sm text-muted-foreground">{z.artikel?.einheit ?? z.einheitLs ?? "Stk"}</span>
                  </div>
                  {ziel === "lager" && z.artikel && (
                    <div className="relative min-w-40 flex-1 sm:max-w-56">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="h-11 pl-9 text-base" value={z.platz} placeholder="Lagerplatz" maxLength={60}
                        onChange={(e) => setzeZeile(z.nr, { platz: e.target.value })} aria-label={`Lagerplatz ${z.text}`} />
                    </div>
                  )}
                  <Button variant="outline" className="h-11 gap-1.5" onClick={() => setSuche(z.nr)}>
                    <Search className="h-4 w-4" /> {z.artikel ? "Anderer Artikel" : "Artikel suchen"}
                  </Button>
                  {!z.artikel && (
                    <Button variant="outline" className="h-11 gap-1.5" onClick={() => setNeuFuer(z)}>
                      <Plus className="h-4 w-4" /> Neu anlegen
                    </Button>
                  )}
                  {z.artikel && !z.sicher && (
                    <Button variant="ghost" className="h-11 gap-1.5 text-primary" onClick={() => setzeZeile(z.nr, { sicher: true, grund: "bestätigt" })}>
                      <Check className="h-4 w-4" /> Passt
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!zeilen.length && !laedt && <p className="text-sm text-muted-foreground">Auf diesem Lieferschein sind keine Zeilen gelesen. Erst „Mit KI lesen“.</p>}
      </div>

      <FormularDialog open={suche !== null} onOpenChange={(o) => { if (!o) setSuche(null); }} titel="Artikel zuordnen"
        beschreibung={zeilen.find((z) => z.nr === suche)?.text}>
        <div className="max-w-2xl">
          <ArtikelSuche autoFocus startText={zeilen.find((z) => z.nr === suche)?.text.split(/\s+/).slice(0, 3).join(" ") ?? ""}
            listeKlasse="max-h-[65dvh]"
            onWahl={(a) => { if (suche !== null) setzeZeile(suche, { artikel: zuArtikelKurz(a), grund: "von Hand", sicher: true }); setSuche(null); }} />
        </div>
      </FormularDialog>

      <ArtikelDialog
        open={!!neuFuer}
        onOpenChange={(o) => { if (!o) setNeuFuer(null); }}
        artikel={null}
        vorgabe={neuFuer ? {
          bezeichnung: neuFuer.text, artikelnummer: neuFuer.artikelnummer, lieferant: ls?.lieferant ?? "Eigen",
          einheit: neuFuer.einheitLs || "Stk", lagerartikel: ziel === "lager",
        } : undefined}
        onGespeichert={(a) => { if (neuFuer) setzeZeile(neuFuer.nr, { artikel: zuArtikelKurz(a), grund: "neu angelegt", sicher: true }); setNeuFuer(null); }}
      />
    </FormularDialog>
  );
}

/** Kandidaten über Artikelnummer, EAN, Hersteller-Nr. und Nummern weiterer Lieferanten — dann je Zeile zuordnen. */
async function zuordnen(zeilen: Zeile[], lieferant: string | null): Promise<Zeile[]> {
  const nummern = [...new Set(zeilen.flatMap((z) => {
    const roh = (z.artikelnummer ?? "").trim();
    return roh.length >= 3 ? [roh, roh.replace(/\s+/g, "")] : [];
  }))];
  if (!nummern.length) return zeilen;
  const FELDER = `${ARTIKEL_KURZ}, lieferant, aktiv`;
  type A = ArtikelKurz & { lieferant: string; aktiv: boolean };
  const [a1, a2, a3, w] = await Promise.all([
    supabase.from("artikel").select(FELDER).in("artikelnummer", nummern).limit(200),
    supabase.from("artikel").select(FELDER).in("ean", nummern).limit(200),
    supabase.from("artikel").select(FELDER).in("hersteller_nr", nummern).limit(200),
    supabase.from("artikel_lieferanten").select(`lieferant, lieferanten_nr, artikel(${FELDER})`).in("lieferanten_nr", nummern).limit(200),
  ]);
  for (const r of [a1, a2, a3, w]) if (r.error) throw r.error;
  const karte = new Map<string, A & { weitere: { lieferant: string; lieferanten_nr: string | null }[] }>();
  const dazu = (a: A | null) => { if (a && !karte.has(a.id)) karte.set(a.id, { ...a, weitere: [] }); return a ? karte.get(a.id)! : null; };
  [...(a1.data ?? []), ...(a2.data ?? []), ...(a3.data ?? [])].forEach((a) => dazu(a as unknown as A));
  (w.data ?? []).forEach((x) => {
    const k = dazu(x.artikel as unknown as A | null);
    k?.weitere.push({ lieferant: x.lieferant, lieferanten_nr: x.lieferanten_nr });
  });
  const kandidaten: ZuordnungKandidat[] = [...karte.values()];
  return zeilen.map((z) => {
    const t = zeileZuordnen(z, lieferant, kandidaten);
    if (!t) return z;
    const a = karte.get(t.artikel_id)!;
    // Einheit des Lieferscheins weicht ab (Ring statt Meter)? Dann lieber nachsehen lassen
    const einheitAnders = !!z.einheitLs && nummerNorm(z.einheitLs) !== nummerNorm(a.einheit) && !(/^st/i.test(z.einheitLs) && a.einheit === "Stk");
    return { ...z, artikel: zuArtikelKurz(a), grund: einheitAnders ? `${t.grund} — Einheit ${z.einheitLs} prüfen` : t.grund, sicher: t.sicher && !einheitAnders };
  });
}
