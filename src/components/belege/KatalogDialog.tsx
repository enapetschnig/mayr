import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes, Cable, ChevronLeft, ChevronRight, CircuitBoard, Cpu, FireExtinguisher, Hammer, Lightbulb, Loader2, Minus, Network, Package, Plug, Plus, Router,
  Search, ShieldAlert, ShoppingCart, SunMedium, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormularDialog } from "@/components/FormularDialog";
import { useHauptbilder } from "@/components/material/artikelDaten";
import { ArtikelVorschau } from "@/components/material/ArtikelVorschau";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, zahl } from "@/lib/format";
import { artikelVk } from "@/lib/preise";
import type { Artikel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Reihenfolge und Bild je Kategorie (Namen aus `artikel_einordnen`) */
const KATEGORIEN: { name: string; icon: LucideIcon }[] = [
  { name: "Schalter & Steckdosen", icon: Plug },
  { name: "Licht", icon: Lightbulb },
  { name: "Kabel & Leitungen", icon: Cable },
  { name: "Verteiler & Schutzgeräte", icon: CircuitBoard },
  { name: "Dosen & Verbindungstechnik", icon: Package },
  { name: "Rohre & Kanäle", icon: Router },
  { name: "Befestigung & Kleinmaterial", icon: Hammer },
  { name: "Smart Home & KNX", icon: Cpu },
  { name: "Sicherheit & Melder", icon: ShieldAlert },
  { name: "Erdung & Blitzschutz", icon: Zap },
  { name: "Netzwerk & Medien", icon: Network },
  { name: "E-Mobilität & PV", icon: SunMedium },
  { name: "Brandschutz", icon: FireExtinguisher },
  { name: "Werkzeug & Messen", icon: Wrench },
  { name: "Sonstiges", icon: Boxes },
];
const iconVon = (k: string) => KATEGORIEN.find((x) => x.name === k)?.icon ?? Package;
const SEITE = 60;
const FELDER = "id, artikelnummer, hersteller, bezeichnung, einheit, vk_preis, aufschlag, ek_preis, listenpreis, kategorie, unterkategorie";

type Knoten = { kategorie: string; unterkategorie: string | null; hersteller: string | null; anzahl: number };
type KatArtikel = Pick<Artikel, "id" | "artikelnummer" | "hersteller" | "bezeichnung" | "einheit" | "vk_preis" | "aufschlag" | "ek_preis" | "listenpreis"> & { kategorie: string | null; unterkategorie: string | null };
export type KatalogWahl = { artikel: KatArtikel; menge: number };

/**
 * Artikel aus dem Katalog (Datanorm + eigene) nach Kategorien: Kategorie →
 * Hersteller/Programm → Artikel. Mengen sammeln, dann alles auf einmal
 * übernehmen. Eine Option neben Leistungskatalog, Eingabezeile und KI.
 */
export function KatalogDialog({ open, onOpenChange, ziel, onUebernehmen }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ziel: string | null;
  onUebernehmen: (wahl: KatalogWahl[]) => void;
}) {
  const { firma } = useSitzung();
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [unter, setUnter] = useState<string | null>(null);
  const [hersteller, setHersteller] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [q, setQ] = useState("");
  const [anzahl, setAnzahl] = useState(SEITE);
  const [korb, setKorb] = useState<Map<string, KatalogWahl>>(new Map());

  useEffect(() => { if (open) { setKorb(new Map()); setSuche(""); setQ(""); } }, [open]);
  useEffect(() => { const t = setTimeout(() => setQ(suche.trim()), 300); return () => clearTimeout(t); }, [suche]);
  useEffect(() => setAnzahl(SEITE), [kategorie, unter, hersteller, q]);

  const { data: baum = [], isLoading: baumLaedt } = useQuery({
    queryKey: ["artikel", "katalog"],
    enabled: open,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("artikel_katalog");
      if (error) throw error;
      return (data ?? []).map((x: Knoten) => ({ ...x, anzahl: Number(x.anzahl) })) as Knoten[];
    },
  });

  const proKategorie = useMemo(() => {
    const m = new Map<string, number>();
    baum.forEach((k) => m.set(k.kategorie, (m.get(k.kategorie) ?? 0) + k.anzahl));
    return m;
  }, [baum]);
  const inKat = baum.filter((k) => k.kategorie === kategorie);
  const herstellerListe = useMemo(() => summe(inKat.filter((k) => !unter || k.unterkategorie === unter), (k) => k.hersteller), [inKat, unter]);
  const unterListe = useMemo(() => summe(inKat.filter((k) => !hersteller || k.hersteller === hersteller), (k) => k.unterkategorie), [inKat, hersteller]);

  const zeigeArtikel = !!q || !!kategorie;
  const { data: artikel = [], isFetching } = useQuery({
    queryKey: ["artikel", "katalog", "liste", kategorie, unter, hersteller, q, anzahl],
    enabled: open && zeigeArtikel,
    placeholderData: (alt) => alt,
    queryFn: async () => {
      if (q && !kategorie) {
        const { data, error } = await supabase.rpc("artikel_suchen", { p_q: q, p_anzahl: anzahl });
        if (error) throw error;
        return (data ?? []) as unknown as KatArtikel[];
      }
      let abfrage = (supabase.from("artikel").select(FELDER) as any).eq("aktiv", true).eq("kategorie", kategorie);
      if (unter) abfrage = abfrage.eq("unterkategorie", unter);
      if (hersteller) abfrage = abfrage.eq("hersteller", hersteller);
      for (const w of q.split(/\s+/).filter(Boolean)) abfrage = abfrage.or(`bezeichnung.ilike.%${w.replace(/[%,()]/g, "")}%,artikelnummer.ilike.%${w.replace(/[%,()]/g, "")}%`);
      const { data, error } = await abfrage.order("unterkategorie", { nullsFirst: false }).order("bezeichnung").range(0, anzahl - 1);
      if (error) throw error;
      return (data ?? []) as KatArtikel[];
    },
  });

  const menge = (id: string) => korb.get(id)?.menge ?? 0;
  const setzen = (a: KatArtikel, n: number) => setKorb((alt) => {
    const neu = new Map(alt);
    if (n <= 0) neu.delete(a.id); else neu.set(a.id, { artikel: a, menge: n });
    return neu;
  });
  const imKorb = [...korb.values()];
  const korbSumme = imKorb.reduce((s, w) => s + artikelVk(w.artikel, firma) * w.menge, 0);

  const zurueck = () => { if (unter || hersteller) { setUnter(null); setHersteller(null); } else setKategorie(null); };
  const uebernehmen = () => { onUebernehmen(imKorb); onOpenChange(false); };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Artikelkatalog" breite="breit"
      beschreibung={`${zahl([...proKategorie.values()].reduce((a, b) => a + b, 0))} Artikel aus Datanorm und eigenem Stamm${ziel ? ` — landet unter „${ziel}“` : ""}`}
      fuss={(
        <>
          <span className="mr-auto hidden text-sm text-muted-foreground sm:block">
            {imKorb.length ? <>{imKorb.length} Artikel · <span className="zahl font-semibold text-foreground">{euro(korbSumme)}</span> netto</> : "Menge mit + wählen, dann übernehmen"}
          </span>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12 sm:min-w-48" disabled={!imKorb.length} onClick={uebernehmen} data-katalog-uebernehmen>
            <ShoppingCart className="h-4 w-4" /> {imKorb.length ? `${imKorb.length} übernehmen` : "Übernehmen"}
          </Button>
        </>
      )}>
      <div className="space-y-3" data-katalog>
        <div className="flex items-center gap-2">
          {kategorie && (
            <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={zurueck} aria-label="Zurück"><ChevronLeft className="h-5 w-5" /></Button>
          )}
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-12 pl-9" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Im Katalog suchen"
              placeholder={kategorie ? `In „${kategorie}“ suchen …` : "Im ganzen Katalog suchen — Name, Nummer, EAN"} />
          </label>
        </div>

        {kategorie && (
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Pfad">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setKategorie(null); setUnter(null); setHersteller(null); }}>Katalog</button>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button type="button" className={cn("font-medium", unter || hersteller ? "text-primary hover:underline" : "")} onClick={() => { setUnter(null); setHersteller(null); }}>{kategorie}</button>
            {hersteller && <><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{hersteller}</span></>}
            {unter && <><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{unter}</span></>}
          </nav>
        )}

        {!kategorie && !q && (
          baumLaedt ? <p className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Katalog lädt …</p> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {KATEGORIEN.filter((k) => proKategorie.get(k.name)).map((k) => (
                <button key={k.name} type="button" onClick={() => setKategorie(k.name)} data-kategorie={k.name}
                  className="flex min-h-24 flex-col justify-between gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><k.icon className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-sm font-semibold leading-tight">{k.name}</span>
                    <span className="zahl text-xs text-muted-foreground">{zahl(proKategorie.get(k.name) ?? 0)} Artikel</span>
                  </span>
                </button>
              ))}
            </div>
          )
        )}

        {kategorie && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3 lg:max-h-[60dvh] lg:overflow-y-auto lg:pr-1">
              <Gruppe titel="Hersteller" eintraege={herstellerListe} wahl={hersteller} onWahl={setHersteller} />
              <Gruppe titel="Programm / Warengruppe" eintraege={unterListe} ohne={hersteller} wahl={unter} onWahl={setUnter} />
            </div>
            <ArtikelListe artikel={artikel} laedt={isFetching} firma={firma} menge={menge} setzen={setzen}
              mehr={artikel.length >= anzahl ? () => setAnzahl((n) => n + SEITE) : undefined} />
          </div>
        )}

        {!kategorie && q && (
          <ArtikelListe artikel={artikel} laedt={isFetching} firma={firma} menge={menge} setzen={setzen} mitKategorie
            mehr={artikel.length >= anzahl && anzahl < 200 ? () => setAnzahl((n) => Math.min(200, n + SEITE)) : undefined} />
        )}

        {imKorb.length > 0 && (
          <p className="rounded-md bg-primary-soft px-3 py-2 text-sm sm:hidden">
            {imKorb.length} Artikel · <span className="zahl font-semibold">{euro(korbSumme)}</span> netto
          </p>
        )}
      </div>
    </FormularDialog>
  );
}

function summe(liste: Knoten[], schluessel: (k: Knoten) => string | null) {
  const m = new Map<string, number>();
  liste.forEach((k) => { const s = schluessel(k); if (s) m.set(s, (m.get(s) ?? 0) + k.anzahl); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Gruppe({ titel, eintraege, wahl, onWahl, ohne }: {
  titel: string; eintraege: [string, number][]; wahl: string | null; onWahl: (w: string | null) => void;
  /** gewählter Hersteller — steht dann nicht noch einmal vor jedem Programm */
  ohne?: string | null;
}) {
  const [alle, setAlle] = useState(false);
  if (eintraege.length <= 1 && !wahl) return null;
  const sichtbar = alle ? eintraege : eintraege.slice(0, 8);
  return (
    <section>
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {wahl && (
          <button type="button" onClick={() => onWahl(null)} className="shrink-0 rounded-full border px-3 py-1.5 text-sm text-primary lg:rounded-md lg:border-0 lg:px-2 lg:text-left">× alle</button>
        )}
        {sichtbar.map(([name, n]) => (
          <button key={name} type="button" onClick={() => onWahl(wahl === name ? null : name)} aria-pressed={wahl === name}
            className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-left text-sm lg:rounded-md lg:border-0 lg:px-2",
              wahl === name ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-card hover:bg-muted lg:bg-transparent")}>
            <span className="min-w-0 flex-1 truncate">{ohne && name.startsWith(`${ohne} `) ? name.slice(ohne.length + 1) : name}</span>
            <span className="zahl text-xs text-muted-foreground">{zahl(n)}</span>
          </button>
        ))}
        {eintraege.length > 8 && (
          <button type="button" onClick={() => setAlle(!alle)} className="shrink-0 whitespace-nowrap px-2 py-1.5 text-left text-sm font-medium text-primary">
            {alle ? "weniger" : `alle ${eintraege.length} zeigen`}
          </button>
        )}
      </div>
    </section>
  );
}

function ArtikelListe({ artikel, laedt, firma, menge, setzen, mehr, mitKategorie }: {
  artikel: KatArtikel[]; laedt: boolean; firma: Parameters<typeof artikelVk>[1]; menge: (id: string) => number;
  setzen: (a: KatArtikel, n: number) => void; mehr?: () => void; mitKategorie?: boolean;
}) {
  const { data: bilder } = useHauptbilder(artikel.map((a) => a.id));
  if (!artikel.length) return <p className="py-8 text-center text-sm text-muted-foreground">{laedt ? "Lädt …" : "Keine Artikel gefunden."}</p>;
  return (
    <div className={cn("space-y-2 transition-opacity", laedt && "opacity-60")}>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {artikel.map((a) => {
          const n = menge(a.id);
          const Icon = iconVon(a.kategorie ?? "");
          return (
            <li key={a.id} className={cn("flex items-center gap-3 px-3 py-2.5", n > 0 && "bg-primary-soft/50")} data-katalog-artikel={a.id}>
              {bilder?.get(a.id) ? <ArtikelVorschau url={bilder.get(a.id)} groesse="klein" />
                : mitKategorie && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={a.kategorie ?? undefined} />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{a.bezeichnung}</p>
                <p className="zahl text-xs font-semibold sm:hidden">{euro(artikelVk(a, firma))} <span className="font-normal text-muted-foreground">/{a.einheit}</span></p>
                <p className="truncate text-xs text-muted-foreground">{[a.hersteller, a.artikelnummer, mitKategorie ? a.kategorie : a.unterkategorie].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="zahl hidden w-24 shrink-0 text-right text-sm sm:block">{euro(artikelVk(a, firma))}<span className="text-xs text-muted-foreground"> /{a.einheit}</span></span>
              <div className="flex shrink-0 items-center gap-1">
                {n > 0 && (
                  <>
                    <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setzen(a, n - 1)} aria-label="weniger"><Minus className="h-4 w-4" /></Button>
                    <input value={zahl(n)} inputMode="decimal" aria-label="Menge" className="zahl h-10 w-14 rounded-md border bg-background text-center text-base"
                      onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) setzen(a, v); }} />
                  </>
                )}
                <Button variant={n > 0 ? "outline" : "default"} size="icon" className="h-10 w-10" onClick={() => setzen(a, n + 1)} aria-label={`${a.bezeichnung} dazu`}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {mehr && <Button variant="outline" className="h-11 w-full" onClick={mehr} disabled={laedt}>Mehr laden</Button>}
    </div>
  );
}
