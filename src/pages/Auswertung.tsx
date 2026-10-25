import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Download, FolderKanban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Avatar, Karte, Kennzahl, Leer, ProjektStatusBadge } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useProjekte, useProjektZahlen } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { alleZeilen, csvHerunterladen } from "@/lib/abfrage";
import { datum, euro, isoTag, stunden, uhrzeit, zahl } from "@/lib/format";
import { buchungVk, runden2, stundensatzFuer } from "@/lib/preise";
import { name } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONATE_KURZ = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONAT_LANG = new Intl.DateTimeFormat("de-AT", { month: "long" });

type Ansicht = "ueberblick" | "nachkalkulation";
/** monat 0–11, null = ganzes Jahr */
type Zeitraum = { jahr: number; monat: number | null };

const summe = (xs: (number | string | null | undefined)[]) => runden2(xs.reduce<number>((s, x) => s + Number(x ?? 0), 0));
const vorzeichen = (art: string) => (art === "rueckgabe" ? -1 : 1);

function zeitraumAus(params: URLSearchParams): Zeitraum {
  const heute = new Date();
  const jahr = Number(params.get("jahr"));
  if (!jahr) return { jahr: heute.getFullYear(), monat: heute.getMonth() };
  const monat = Number(params.get("monat"));
  return { jahr, monat: monat >= 1 && monat <= 12 ? monat - 1 : null };
}

const zeitraumText = ({ jahr, monat }: Zeitraum) =>
  monat == null ? String(jahr) : `${MONAT_LANG.format(new Date(jahr, monat, 1))} ${jahr}`;

/** Belege kurz — Umsatz, Angebote und Nachkalkulation rechnen alle daraus */
function useBelegeKurz() {
  return useQuery({
    queryKey: ["belege", "auswertung"],
    queryFn: () => alleZeilen((a, b) => supabase.from("belege")
      .select("id, typ, status, netto, datum, projekt_id").order("id").range(a, b)),
  });
}

export default function Auswertung() {
  const [params, setParams] = useSearchParams();
  const ansicht: Ansicht = params.get("ansicht") === "nachkalkulation" ? "nachkalkulation" : "ueberblick";
  const zeitraum = zeitraumAus(params);

  const setzen = (a: Ansicht, z: Zeitraum) => {
    const heute = new Date();
    const p: Record<string, string> = {};
    if (a !== "ueberblick") p.ansicht = a;
    if (!(z.jahr === heute.getFullYear() && z.monat === heute.getMonth())) {
      p.jahr = String(z.jahr);
      if (z.monat != null) p.monat = String(z.monat + 1);
    }
    setParams(p, { replace: true });
  };

  return (
    <Seite titel="Auswertung" zurueckPfad="/" breit>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {([["ueberblick", "Überblick"], ["nachkalkulation", "Nachkalkulation"]] as [Ansicht, string][]).map(([wert, text]) => (
          <button key={wert} type="button" onClick={() => setzen(wert, zeitraum)} aria-pressed={ansicht === wert}
            className={cn("flex h-10 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
              ansicht === wert ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
            {text}
          </button>
        ))}
      </div>
      {ansicht === "ueberblick"
        ? <Ueberblick zeitraum={zeitraum} setZeitraum={(z) => setzen("ueberblick", z)} />
        : <Nachkalkulation />}
    </Seite>
  );
}

// ── Überblick: alles bezogen auf einen Monat oder ein Jahr ───────────────

function Ueberblick({ zeitraum, setZeitraum }: { zeitraum: Zeitraum; setZeitraum: (z: Zeitraum) => void }) {
  const navigate = useNavigate();
  const { firma } = useSitzung();
  const { jahr, monat } = zeitraum;
  const heute = new Date();
  const von = new Date(jahr, monat ?? 0, 1);
  const bis = monat == null ? new Date(jahr + 1, 0, 1) : new Date(jahr, monat + 1, 1);
  const vonIso = isoTag(von);
  const bisIso = isoTag(bis);
  const weiterGesperrt = bis > heute;

  const { data: belege = [] } = useBelegeKurz();

  const zeitenQ = useQuery({
    queryKey: ["zeiten", "auswertung", vonIso, bisIso],
    placeholderData: keepPreviousData,
    queryFn: () => alleZeilen((a, b) => supabase.from("zeiten")
      .select("id, user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, rechnung_id, projekte(nummer, name), profiles(vorname, nachname, farbe), regieberichte(nummer, rechnung_id)")
      .gte("datum", vonIso).lt("datum", bisIso).order("id").range(a, b)),
  });
  const materialQ = useQuery({
    queryKey: ["material", "auswertung", vonIso, bisIso],
    placeholderData: keepPreviousData,
    queryFn: () => alleZeilen((a, b) => supabase.from("material_buchungen")
      .select("id, art, menge, ek_preis, artikel(ek_preis, vk_preis, listenpreis)")
      .in("art", ["ausfassung", "rueckgabe", "direkt"])
      .gte("created_at", von.toISOString()).lt("created_at", bis.toISOString()).order("id").range(a, b)),
  });
  const zeiten = zeitenQ.data ?? [];
  const material = materialQ.data ?? [];
  const altesBild = zeitenQ.isPlaceholderData || materialQ.isPlaceholderData;

  const imZeitraum = (d: string) => d >= vonIso && d < bisIso;
  const rechnungen = belege.filter((b) => b.typ === "rechnung" && (b.status === "offen" || b.status === "bezahlt"));
  const rechnungenZeitraum = rechnungen.filter((r) => imZeitraum(r.datum));
  const umsatz = summe(rechnungenZeitraum.map((r) => r.netto));
  const umsatzOffen = summe(rechnungenZeitraum.filter((r) => r.status === "offen").map((r) => r.netto));
  const angebote = belege.filter((b) => b.typ === "angebot" && ["offen", "angenommen", "abgelehnt"].includes(b.status) && imZeitraum(b.datum));

  const umsatzJeMonat = useMemo(() => {
    const werte = Array.from({ length: 12 }, () => 0);
    belege.forEach((r) => {
      if (r.typ === "rechnung" && (r.status === "offen" || r.status === "bezahlt") && r.datum.startsWith(`${jahr}-`)) {
        werte[Number(r.datum.slice(5, 7)) - 1] += Number(r.netto);
      }
    });
    return werte.map(runden2);
  }, [belege, jahr]);

  // Verrechnet ist eine Stunde, wenn sie selbst oder ihr Regiebericht auf einer Rechnung steht
  const verrechnet = (z: (typeof zeiten)[number]) => !!z.rechnung_id || !!z.regieberichte?.rechnung_id;
  const stundenGesamt = summe(zeiten.map((z) => z.stunden));
  const stundenOffen = summe(zeiten.filter((z) => z.projekt_id && !verrechnet(z)).map((z) => z.stunden));

  let materialEk = 0;
  let materialVk = 0;
  material.forEach((m) => {
    const n = vorzeichen(m.art) * Number(m.menge);
    materialEk += n * Number(m.ek_preis ?? m.artikel?.ek_preis ?? 0);
    materialVk += n * buchungVk(m, firma);
  });

  const personen = useMemo(() => {
    const m = new Map<string, { profil: (typeof zeiten)[number]["profiles"]; h: number; tage: Set<string> }>();
    zeiten.forEach((z) => {
      const e = m.get(z.user_id) ?? { profil: z.profiles, h: 0, tage: new Set<string>() };
      e.h += Number(z.stunden);
      e.tage.add(z.datum);
      m.set(z.user_id, e);
    });
    return [...m.entries()].map(([id, e]) => ({ id, ...e })).sort((a, b) => b.h - a.h);
  }, [zeiten]);

  const jeProjekt = useMemo(() => {
    const m = new Map<string, { id: string | null; text: string; nummer: string | null; h: number }>();
    zeiten.forEach((z) => {
      const key = z.projekt_id ?? "ohne";
      const e = m.get(key) ?? { id: z.projekt_id, text: z.projekte?.name ?? "Ohne Projekt", nummer: z.projekte?.nummer ?? null, h: 0 };
      e.h += Number(z.stunden);
      m.set(key, e);
    });
    return [...m.values()].sort((a, b) => b.h - a.h);
  }, [zeiten]);

  const schritt = (r: -1 | 1) => {
    if (monat == null) return setZeitraum({ jahr: jahr + r, monat: null });
    const d = new Date(jahr, monat + r, 1);
    setZeitraum({ jahr: d.getFullYear(), monat: d.getMonth() });
  };

  const stundenlisteLaden = () => {
    const sortiert = [...zeiten].sort((a, b) =>
      name(a.profiles).localeCompare(name(b.profiles)) || a.datum.localeCompare(b.datum) || (a.von ?? "").localeCompare(b.von ?? ""));
    const zeilen: (string | number | null)[][] = [
      ["Mitarbeiter", "Datum", "Von", "Bis", "Pause (Min.)", "Stunden", "Projekt", "Tätigkeit", "Regiebericht", "Verrechnet"],
      ...sortiert.map((z) => [
        name(z.profiles), datum(z.datum), uhrzeit(z.von), uhrzeit(z.bis), z.pause_minuten || null, Number(z.stunden),
        z.projekte ? `${z.projekte.nummer} ${z.projekte.name}` : "", z.taetigkeit, z.regieberichte?.nummer ?? "", verrechnet(z) ? "ja" : "",
      ]),
      [],
      ...personen.map((p) => [name(p.profil), "Summe", "", "", null, runden2(p.h), `${p.tage.size} Tage`]),
    ];
    csvHerunterladen(`stunden-${monat == null ? jahr : `${jahr}-${String(monat + 1).padStart(2, "0")}`}.csv`, zeilen);
  };

  const maxPerson = Math.max(1, ...personen.map((p) => p.h));
  const maxProjekt = Math.max(1, ...jeProjekt.map((p) => p.h));

  return (
    <div className="space-y-4">
      {/* Eine Filterzeile über allem, was sie betrifft */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 overflow-hidden rounded-md border bg-card text-sm">
          {([["Monat", false], ["Jahr", true]] as [string, boolean][]).map(([text, ganzesJahr], i) => {
            const an = (monat == null) === ganzesJahr;
            return (
              <button key={text} type="button" aria-pressed={an}
                onClick={() => setZeitraum({ jahr, monat: ganzesJahr ? null : jahr === heute.getFullYear() ? heute.getMonth() : 0 })}
                className={cn("px-3.5 font-medium transition-colors", i > 0 && "border-l", an ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {text}
              </button>
            );
          })}
        </div>
        <div className="flex h-10 items-center rounded-md border bg-card">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => schritt(-1)} aria-label="Zurück"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold">{zeitraumText(zeitraum)}</span>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => schritt(1)} disabled={weiterGesperrt} aria-label="Weiter"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant="outline" className="ml-auto h-10 gap-1.5" onClick={stundenlisteLaden} disabled={zeiten.length === 0}>
          <Download className="h-4 w-4" /> Stundenliste <span className="hidden sm:inline">(CSV)</span>
        </Button>
      </div>

      <div className={cn("space-y-4 transition-opacity", altesBild && "opacity-60")}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kennzahl titel="Umsatz netto" wert={euro(umsatz)}
            unter={`${rechnungenZeitraum.length} ${rechnungenZeitraum.length === 1 ? "Rechnung" : "Rechnungen"}${umsatzOffen > 0 ? ` · ${euro(umsatzOffen)} offen` : ""}`} />
          <Kennzahl titel="Stunden" wert={stunden(stundenGesamt)}
            unter={stundenOffen > 0 ? `${stunden(stundenOffen)} nicht verrechnet` : stundenGesamt > 0 ? "alles verrechnet" : undefined} />
          <Kennzahl titel="Material (Einkauf)" wert={euro(materialEk)} unter={`${euro(materialVk)} Verkaufswert`} />
          <Kennzahl titel="Angebote" wert={euro(summe(angebote.map((a) => a.netto)))}
            unter={[
              `${angebote.filter((a) => a.status === "angenommen").length} angenommen`,
              `${angebote.filter((a) => a.status === "offen").length} offen`,
              // die Summe enthält auch abgelehnte — dann sagen, wie viele
              ...((n) => (n ? [`${n} abgelehnt`] : []))(angebote.filter((a) => a.status === "abgelehnt").length),
            ].join(" · ")} />
        </div>

        <Karte titel={`Umsatz ${jahr}`}>
          <p className="-mt-1 mb-3 text-xs text-muted-foreground">Rechnungen netto je Monat — antippen zeigt den Monat</p>
          <MonatsSaeulen jahr={jahr} werte={umsatzJeMonat} markiert={monat} onWahl={(m) => setZeitraum({ jahr, monat: m })} />
        </Karte>

        <div className="grid gap-4 lg:grid-cols-2">
          <Karte titel="Stunden je Mitarbeiter">
            {personen.length === 0 ? <Leer icon={Clock} text="Keine Stunden in diesem Zeitraum." className="py-6" /> : (
              <ul className="space-y-3">
                {personen.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-2 text-sm">
                      <Avatar profil={p.profil} className="h-6 w-6 text-[10px]" />
                      <span className="truncate font-medium">{name(p.profil)}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.tage.size} {p.tage.size === 1 ? "Tag" : "Tage"}</span>
                    </div>
                    <Balken anteil={p.h / maxPerson} wert={stunden(p.h)} />
                  </li>
                ))}
              </ul>
            )}
          </Karte>

          <Karte titel="Stunden je Projekt">
            {jeProjekt.length === 0 ? <Leer icon={FolderKanban} text="Keine Stunden in diesem Zeitraum." className="py-6" /> : (
              <ul className="-mx-2 space-y-1">
                {jeProjekt.map((p) => (
                  <li key={p.id ?? "ohne"}>
                    <button type="button" disabled={!p.id} onClick={() => p.id && navigate(`/projekte/${p.id}`)}
                      className="w-full rounded-md px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/60">
                      <div className="flex items-baseline gap-2 text-sm">
                        {p.nummer && <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.nummer}</span>}
                        <span className={cn("truncate font-medium", !p.id && "text-muted-foreground")}>{p.text}</span>
                      </div>
                      <Balken anteil={p.h / maxProjekt} wert={stunden(p.h)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Karte>
        </div>
      </div>
    </div>
  );
}

/** Waagrechter Balken mit dem Wert an der Spitze */
function Balken({ anteil, wert }: { anteil: number; wert: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-2.5 rounded-r-[4px] bg-primary" style={{ width: `calc((100% - 4.5rem) * ${Math.max(0.01, anteil)})` }} />
      <span className="zahl shrink-0 text-xs font-semibold">{wert}</span>
    </div>
  );
}

/** Saubere Achsenwerte: 0, 1.000, 2.000 … statt 0, 922, 1.844 */
function achsenWerte(max: number): number[] {
  if (max <= 0) return [0, 1000];
  const roh = max / 3;
  const p = 10 ** Math.floor(Math.log10(roh));
  const schrittweite = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= roh) ?? 10 * p;
  return Array.from({ length: Math.ceil(max / schrittweite) + 1 }, (_, i) => i * schrittweite);
}

/** Zwölf Säulen, eine Reihe. Im Monatsmodus ist der gewählte Monat hervorgehoben, der Rest grau. */
function MonatsSaeulen({ jahr, werte, markiert, onWahl }: { jahr: number; werte: number[]; markiert: number | null; onWahl: (monat: number) => void }) {
  const [zeige, setZeige] = useState<number | null>(null);
  const achse = achsenWerte(Math.max(...werte));
  const oben = achse[achse.length - 1];
  const hoehe = (w: number) => `${(Math.max(0, w) / oben) * 100}%`;
  const ausrichtung = (i: number) => (i <= 1 ? "left-0" : i >= 10 ? "right-0" : "left-1/2 -translate-x-1/2");

  return (
    <div>
      <div className="flex pt-2">
        <div className="relative h-44 w-14 shrink-0" aria-hidden>
          {achse.map((t) => (
            <span key={t} className="zahl absolute right-2 translate-y-1/2 text-[11px] text-muted-foreground" style={{ bottom: hoehe(t) }}>{zahl(t)}</span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          {achse.map((t) => <div key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: hoehe(t) }} aria-hidden />)}
          <div className="absolute inset-0 flex">
            {werte.map((w, i) => (
              <button key={i} type="button" onClick={() => onWahl(i)}
                onPointerEnter={() => setZeige(i)} onPointerLeave={() => setZeige(null)} onFocus={() => setZeige(i)} onBlur={() => setZeige(null)}
                aria-label={`${MONAT_LANG.format(new Date(jahr, i, 1))}: ${euro(w)}`} aria-pressed={markiert === i}
                className="group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span style={{ height: hoehe(w) }}
                  className={cn("block w-[60%] max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-75",
                    markiert == null || markiert === i ? "bg-primary" : "bg-muted-foreground/30")} />
                {zeige === i && (
                  <span className={cn("pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-left shadow-schwebend", ausrichtung(i))}
                    style={{ bottom: `calc(${hoehe(w)} + 6px)` }}>
                    <span className="zahl block text-sm font-semibold text-popover-foreground">{euro(w)}</span>
                    <span className="block text-[11px] text-muted-foreground">{MONAT_LANG.format(new Date(jahr, i, 1))}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-14" aria-hidden>
        {MONATE_KURZ.map((m, i) => (
          <span key={m} className={cn("flex-1 pt-1.5 text-center text-[11px] text-muted-foreground", markiert === i && "font-semibold text-foreground")}>{m}</span>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Als Tabelle</summary>
        <table className="mt-2 w-full max-w-xs text-sm">
          <tbody className="divide-y">
            {werte.map((w, i) => (
              <tr key={i}><td className="py-1">{MONAT_LANG.format(new Date(jahr, i, 1))}</td><td className="py-1 text-right">{euro(w)}</td></tr>
            ))}
          </tbody>
          <tfoot className="border-t font-semibold"><tr><td className="py-1">Summe</td><td className="py-1 text-right">{euro(summe(werte))}</td></tr></tfoot>
        </table>
      </details>
    </div>
  );
}

// ── Nachkalkulation: je Projekt über die ganze Laufzeit ─────────────────

function Nachkalkulation() {
  const navigate = useNavigate();
  const pc = useIstPc();
  const { firma } = useSitzung();
  const [alle, setAlle] = useState(false);
  const { data: projekte = [] } = useProjekte();
  const { data: zahlen = {} } = useProjektZahlen();
  const { data: belege = [] } = useBelegeKurz();
  const { data: material = [] } = useQuery({
    queryKey: ["material", "auswertung-projekte"],
    queryFn: () => alleZeilen((a, b) => supabase.from("material_buchungen")
      .select("id, projekt_id, art, menge, ek_preis, rechnung_id, artikel(ek_preis, vk_preis, listenpreis), regieberichte(rechnung_id)")
      .not("projekt_id", "is", null).in("art", ["ausfassung", "rueckgabe", "direkt"]).order("id").range(a, b)),
  });

  const zeilen = useMemo(() => {
    const mat = new Map<string, { vk: number; offen: number }>();
    material.forEach((m) => {
      if (!m.projekt_id) return;
      const e = mat.get(m.projekt_id) ?? { vk: 0, offen: 0 };
      const wert = vorzeichen(m.art) * Number(m.menge) * buchungVk(m, firma);
      e.vk += wert;
      if (!m.rechnung_id && !m.regieberichte?.rechnung_id) e.offen += wert;
      mat.set(m.projekt_id, e);
    });
    return projekte
      .filter((p) => alle || p.status !== "abgeschlossen")
      .map((p) => {
        const z = zahlen[p.id];
        const satz = stundensatzFuer(p, firma);
        const m = mat.get(p.id) ?? { vk: 0, offen: 0 };
        const eigene = belege.filter((b) => b.projekt_id === p.id);
        return {
          projekt: p,
          h: Number(z?.stunden ?? 0),
          geleistet: runden2(Number(z?.stunden ?? 0) * satz + m.vk),
          offen: Math.max(0, runden2(Number(z?.stunden_offen ?? 0) * satz + m.offen)),
          angebot: summe(eigene.filter((b) => b.typ === "angebot" && (b.status === "offen" || b.status === "angenommen")).map((b) => b.netto)),
          verrechnet: summe(eigene.filter((b) => b.typ === "rechnung" && (b.status === "offen" || b.status === "bezahlt")).map((b) => b.netto)),
        };
      })
      .filter((r) => r.geleistet > 0 || r.angebot > 0 || r.verrechnet > 0)
      .sort((a, b) => b.offen - a.offen || b.geleistet - a.geleistet);
  }, [material, projekte, zahlen, belege, firma, alle]);

  const gesamt = {
    geleistet: summe(zeilen.map((r) => r.geleistet)),
    offen: summe(zeilen.map((r) => r.offen)),
    angebot: summe(zeilen.map((r) => r.angebot)),
    verrechnet: summe(zeilen.map((r) => r.verrechnet)),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 overflow-hidden rounded-md border bg-card text-sm">
          {([["Laufende Projekte", false], ["Alle Projekte", true]] as [string, boolean][]).map(([text, wert], i) => (
            <button key={text} type="button" aria-pressed={alle === wert} onClick={() => setAlle(wert)}
              className={cn("px-3.5 font-medium transition-colors", i > 0 && "border-l", alle === wert ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {text}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Geleistet = Stunden × Stundensatz + Material zum Verkaufspreis</p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kennzahl titel="Noch nicht verrechnet" wert={euro(gesamt.offen)} unter="Stunden und Material ohne Rechnung" />
        <Kennzahl titel="Geleistet" wert={euro(gesamt.geleistet)} />
        <Kennzahl titel="Angebote" wert={euro(gesamt.angebot)} unter="offen oder angenommen" />
        <Kennzahl titel="Verrechnet" wert={euro(gesamt.verrechnet)} unter="Rechnungen netto" />
      </div>

      {zeilen.length === 0 ? (
        <Leer icon={FolderKanban} text="Noch nichts geleistet oder angeboten." />
      ) : pc ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Projekt</th>
                <th className="px-4 py-2.5 text-right font-medium">Stunden</th>
                <th className="px-4 py-2.5 text-right font-medium">Geleistet</th>
                <th className="px-4 py-2.5 text-right font-medium">Angebot</th>
                <th className="px-4 py-2.5 text-left font-medium">Vom Angebot</th>
                <th className="px-4 py-2.5 text-right font-medium">Verrechnet</th>
                <th className="px-4 py-2.5 text-right font-medium">Nicht verrechnet</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {zeilen.map((r) => (
                <tr key={r.projekt.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/projekte/${r.projekt.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.projekt.nummer}</span>
                      <span className="font-medium">{r.projekt.name}</span>
                      {r.projekt.status === "abgeschlossen" && <ProjektStatusBadge status={r.projekt.status} />}
                    </div>
                    {r.projekt.kunden?.name && <p className="text-xs text-muted-foreground">{r.projekt.kunden.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">{stunden(r.h)}</td>
                  <td className="px-4 py-3 text-right">{euro(r.geleistet)}</td>
                  <td className="px-4 py-3 text-right">{r.angebot > 0 ? euro(r.angebot) : "—"}</td>
                  <td className="px-4 py-3"><AngebotMeter geleistet={r.geleistet} angebot={r.angebot} /></td>
                  <td className="px-4 py-3 text-right">{r.verrechnet > 0 ? euro(r.verrechnet) : "—"}</td>
                  <td className={cn("px-4 py-3 text-right", r.offen > 0 && "font-semibold")}>{r.offen > 0 ? euro(r.offen) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/20 font-semibold">
              <tr>
                <td className="px-4 py-2.5">Summe</td>
                <td className="px-4 py-2.5 text-right">{stunden(summe(zeilen.map((r) => r.h)))}</td>
                <td className="px-4 py-2.5 text-right">{euro(gesamt.geleistet)}</td>
                <td className="px-4 py-2.5 text-right">{euro(gesamt.angebot)}</td>
                <td />
                <td className="px-4 py-2.5 text-right">{euro(gesamt.verrechnet)}</td>
                <td className="px-4 py-2.5 text-right">{euro(gesamt.offen)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {zeilen.map((r) => (
            <button key={r.projekt.id} type="button" onClick={() => navigate(`/projekte/${r.projekt.id}`)}
              className="block w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.projekt.nummer}</span>
                {r.projekt.status === "abgeschlossen" && <ProjektStatusBadge status={r.projekt.status} />}
              </div>
              <p className="mt-0.5 truncate font-semibold">{r.projekt.name}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Geleistet</dt><dd className="zahl font-medium">{euro(r.geleistet)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Nicht verrechnet</dt><dd className={cn("zahl", r.offen > 0 ? "font-semibold" : "text-muted-foreground")}>{r.offen > 0 ? euro(r.offen) : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Angebot</dt><dd className="zahl">{r.angebot > 0 ? euro(r.angebot) : "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Verrechnet</dt><dd className="zahl">{r.verrechnet > 0 ? euro(r.verrechnet) : "—"}</dd></div>
              </dl>
              {r.angebot > 0 && <div className="mt-3"><AngebotMeter geleistet={r.geleistet} angebot={r.angebot} /></div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Wie viel vom Angebot schon geleistet ist — rot mit Betrag, sobald es drüber geht */
function AngebotMeter({ geleistet, angebot }: { geleistet: number; angebot: number }) {
  if (angebot <= 0) return <span className="text-muted-foreground">—</span>;
  const anteil = geleistet / angebot;
  const drueber = anteil > 1;
  return (
    <div className="min-w-28">
      <div className={cn("h-2 overflow-hidden rounded-full", drueber ? "bg-destructive/15" : "bg-primary-soft")}>
        <div className={cn("h-full rounded-full", drueber ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, anteil * 100)}%` }} />
      </div>
      <p className={cn("mt-1 text-xs", drueber ? "font-medium text-destructive" : "text-muted-foreground")}>
        {drueber ? `${euro(geleistet - angebot)} über dem Angebot` : `${Math.round(anteil * 100)} % geleistet`}
      </p>
    </div>
  );
}
