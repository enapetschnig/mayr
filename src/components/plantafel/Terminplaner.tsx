import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Bausteine";
import { fehlerText } from "@/components/stamm/stammDaten";
import { BalkenInfo } from "@/components/plantafel/Gantt";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { datum as datumText, isoTag, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { projektFarbe, tageZwischen, textAuf } from "@/lib/plantafel";
import {
  abwesenheitTon, einrasten, gruppenBilden, kalenderwoche, nebeneinander, planVerschieben, stundenBereich, zeitAus, zeitLage, type Gruppe,
} from "@/lib/terminplaner";
import { feiertagName } from "@/lib/zeitkonto";
import { ABWESENHEIT_ART, name, type AbwesenheitArt, type Fahrzeug, type Profil, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Terminplaner — die Plantafel mit getauschten Achsen, wie SETECs alter
 * Terminplaner: Spalten = Leute (Geschäftsführung, Büro, Teams, ohne Team),
 * Zeilen = Tage mit den Stunden. Einsätze als Blöcke über die Zeit (Farbe des
 * Projekts, Termine ohne Projekt blau), Urlaub/ZA grün, Krank rot, Schule gelb.
 * - PC: alle Leute nebeneinander; rechts Monatskalender zum Springen
 * - Antippen = kleines Fenster (wie in der Tafel); leere Zelle = neuer Einsatz
 * - Ziehen = andere Uhrzeit, anderer Tag, andere Person; unterer Rand = länger
 * - Handy: ein Tag (Leute untereinander, Zeit quer) oder eine Person (Mo–Fr)
 */

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const wochentag = (iso: string) => (isoZuDatum(iso).getDay() + 6) % 7;
const kurz = (iso: string) => `${WT[wochentag(iso)]} ${datumText(iso).slice(0, 6)}`;
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}–${t.bis ? uhrzeit(t.bis) : ""}`);
/** Pixel je Stunde (PC) und Breite der Zeitspalte */
const STD = 24;
const ZEIT = 84;

export type Abwesend = { id: string | null; user_id: string | null; von: string | null; bis: string | null; art: string | null };
export type PlanNeu = { datum: string; von?: string; bis?: string; mitarbeiterId?: string };

const ABW_KLASSE = {
  rot: "bg-status-rot text-status-rot-fg border-status-rot-fg/30",
  gruen: "bg-status-gruen text-status-gruen-fg border-status-gruen-fg/30",
  gelb: "bg-status-gelb text-status-gelb-fg border-status-gelb-fg/30",
} as const;

type Gemeinsam = {
  tage: string[];
  termine: Termin[];
  termineKey: unknown[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: ProjektMitKunde[];
  abwesend: Abwesend[];
  konfliktIds: Set<string>;
  darf: boolean;
  heute: string;
  onBearbeiten: (t: Termin) => void;
  onNeu: (v: PlanNeu) => void;
};

/** Spaltengruppen aus Leuten und Teams */
export function useGruppen(mitarbeiter: Profil[], teams: Team[]) {
  return useMemo(() => gruppenBilden(mitarbeiter, teams), [mitarbeiter, teams]);
}

/** Filter oben: alle, eine Gruppe oder eine Person */
export function FilterWahl({ gruppen, wert, onChange, className, alleText = "Alle Mitarbeiter" }: {
  gruppen: Gruppe<Profil>[]; wert: string; onChange: (w: string) => void; className?: string; alleText?: string;
}) {
  return (
    <select value={wert} onChange={(e) => onChange(e.target.value)} aria-label="Wen zeigen?"
      className={cn("rounded-md border bg-card px-2 text-sm font-medium", className)}>
      {alleText && <option value="">{alleText}</option>}
      <optgroup label="Gruppe">
        {gruppen.map((g) => <option key={g.schluessel} value={g.schluessel}>{g.titel}</option>)}
      </optgroup>
      <optgroup label="Person">
        {gruppen.flatMap((g) => g.leute).map((m) => <option key={m.id} value={`p:${m.id}`}>{name(m)}</option>)}
      </optgroup>
    </select>
  );
}

export function gefiltert(gruppen: Gruppe<Profil>[], filter: string): Gruppe<Profil>[] {
  if (!filter) return gruppen;
  if (filter.startsWith("p:")) {
    const id = filter.slice(2);
    return gruppen.map((g) => ({ ...g, leute: g.leute.filter((m) => m.id === id) })).filter((g) => g.leute.length);
  }
  const g = gruppen.filter((x) => x.schluessel === filter);
  return g.length ? g : gruppen;
}

/** Speichern mit „Rückgängig“ im Hinweis — sofort gezeichnet, bei Fehler zurück */
function useAendern(termineKey: unknown[]) {
  const qc = useQueryClient();
  const cacheSetzen = (f: (l: Termin[]) => Termin[]) => qc.setQueryData<Termin[]>(termineKey, (alt) => f(alt ?? []));
  const neuLaden = () => qc.invalidateQueries({ queryKey: ["termine"] });
  const aendern = async (t: Termin, neu: Partial<Termin>, text?: string): Promise<boolean> => {
    const alt = Object.fromEntries(Object.keys(neu).map((k) => [k, t[k as keyof Termin]])) as Partial<Termin>;
    cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...neu } : x)));
    const { error } = await supabase.from("termine").update(neu).eq("id", t.id);
    if (error) {
      cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...alt } : x)));
      toast.error("Nicht gespeichert", { description: fehlerText(error) });
      return false;
    }
    if (text) {
      toast.success(text, {
        action: { label: "Rückgängig", onClick: () => void aendern({ ...t, ...neu }, alt) },
      });
    }
    void neuLaden();
    return true;
  };
  const loeschen = async (t: Termin) => {
    const { error } = await supabase.from("termine").delete().eq("id", t.id);
    if (error) { toast.error("Nicht gelöscht", { description: fehlerText(error) }); return; }
    const { id: _id, created_at: _c, ...rest } = t;
    toast(`${t.titel} gelöscht`, { action: { label: "Rückgängig", onClick: () => void supabase.from("termine").insert({ ...rest, id: t.id }).then(() => neuLaden()) } });
    void neuLaden();
  };
  return { aendern, loeschen };
}

/** Kleines Fenster am Block — dasselbe wie in der Tafel */
function Info({ info, p, onZu }: { info: { id: string; x: number; y: number }; p: Gemeinsam & { aendern: ReturnType<typeof useAendern>["aendern"]; loeschen: (t: Termin) => Promise<void> }; onZu: () => void }) {
  const t = p.termine.find((x) => x.id === info.id);
  if (!t) return null;
  return (
    <BalkenInfo t={t} x={info.x} y={info.y} projekt={p.projekte.find((x) => x.id === t.projekt_id)} team={p.teams.find((x) => x.id === t.team_id)}
      mitarbeiter={p.mitarbeiter} fahrzeuge={p.fahrzeuge} darf={p.darf} konflikt={p.konfliktIds.has(t.id)}
      onZu={onZu}
      onBearbeiten={() => { onZu(); p.onBearbeiten(t); }}
      onErledigt={() => void p.aendern(t, { status: t.status === "erledigt" ? "geplant" : "erledigt" })}
      onGeraet={(id) => void p.aendern(t, { fahrzeuge: t.fahrzeuge.includes(id) ? t.fahrzeuge.filter((x) => x !== id) : [...t.fahrzeuge, id] })}
      onPersonWeg={(id) => void p.aendern(t, { mitarbeiter: t.mitarbeiter.filter((x) => x !== id) }, `${name(p.mitarbeiter.find((m) => m.id === id))} aus ${t.titel}`)}
      onLoeschen={() => { onZu(); void p.loeschen(t); }} />
  );
}

/** Text im Block: Kunde (oder Projekt), Titel, Zeit — so viel, wie Platz hat */
function BlockText({ t, projekt, hoehe, konflikt }: { t: Termin; projekt?: ProjektMitKunde; hoehe: number; konflikt: boolean }) {
  const kopf = projekt?.kunden?.name ?? projekt?.name;
  const zeilen = Math.max(1, Math.floor((hoehe - 4) / 14));
  return (
    <>
      <span className="block truncate font-semibold">{konflikt ? "⚠ " : ""}{t.dringend && t.status !== "erledigt" ? "! " : ""}{t.status === "erledigt" ? "✓ " : ""}{kopf ?? t.titel}</span>
      {zeilen > 1 && kopf && <span className={cn("block", zeilen > 3 ? "line-clamp-2" : "truncate")}>{t.titel}</span>}
      {zeilen > (kopf ? 3 : 1) && <span className="block truncate opacity-80">{zeitText(t)}</span>}
    </>
  );
}

const blockFarbe = (projekt?: ProjektMitKunde) => {
  if (!projekt) return { klasse: "bg-status-blau text-status-blau-fg border border-status-blau-fg/30", stil: {} };
  const f = projektFarbe(projekt);
  return { klasse: "", stil: { backgroundColor: f, color: textAuf(f) } };
};

/** Im Halten ziehen (Tablet), sonst sofort; Tippen = öffnen */
function startZiehen(e: React.PointerEvent, los: () => void, tippen: () => void) {
  if (e.pointerType !== "touch") { los(); return; }
  const x0 = e.clientX, y0 = e.clientY;
  let timer = 0;
  const weg = () => {
    window.clearTimeout(timer);
    window.removeEventListener("pointermove", bew); window.removeEventListener("pointerup", auf); window.removeEventListener("pointercancel", weg);
  };
  const bew = (ev: PointerEvent) => { if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 10) weg(); };
  const auf = () => { weg(); tippen(); };
  window.addEventListener("pointermove", bew); window.addEventListener("pointerup", auf); window.addEventListener("pointercancel", weg);
  timer = window.setTimeout(() => { weg(); navigator.vibrate?.(25); los(); }, 350);
}

type Zug = {
  id: string; person: string; tag: string; griff: "mitte" | "unten";
  startX: number; startY: number; x: number; y: number; bewegt: boolean;
  /** Abstand Zeiger – Blockoberkante in px */
  versatz: number;
  ziel: { person: string; tag: string; minute: number } | null;
};

/* ───────────────────────────────────────────────────────────── PC ── */

export function Terminplaner(p: Gemeinsam & { gruppen: Gruppe<Profil>[]; seite?: ReactNode; className?: string }) {
  const { tage, termine, gruppen, abwesend, projekte, darf, heute } = p;
  const { aendern, loeschen } = useAendern(p.termineKey);
  const [info, setInfo] = useState<{ id: string; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [platz, setPlatz] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlatz(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const leute = gruppen.flatMap((g) => g.leute);
  const breite = Math.max(118, Math.floor((platz - ZEIT - 2) / Math.max(1, leute.length)));
  const [ab, bis] = useMemo(() => stundenBereich(termine, tage), [termine, tage]);
  const tagHoehe = ((bis - ab) / 60) * STD;
  const sichtbarIds = new Set(leute.map((m) => m.id));
  const weg = (pid: string, tag: string) => abwesend.find((a) => a.user_id === pid && a.von && a.bis && a.von <= tag && a.bis >= tag);
  // Sa/So nur, wenn dort etwas steht
  const belegt = (tag: string) => termine.some((t) => zeitLage(t, tag, ab, bis) && t.mitarbeiter.some((m) => sichtbarIds.has(m)));
  const zeilenTage = tage.filter((t) => wochentag(t) < 5 || belegt(t));
  const freiesWochenende = tage.filter((t) => wochentag(t) >= 5 && !belegt(t));

  // Jetzt-Linie
  const [jetzt, setJetzt] = useState(() => new Date());
  useEffect(() => { const i = window.setInterval(() => setJetzt(new Date()), 60_000); return () => window.clearInterval(i); }, []);
  const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();

  // ------------------------------------------------------------- Ziehen
  const [zug, setZugState] = useState<Zug | null>(null);
  const zugRef = useRef<Zug | null>(null);
  const setZug = (z: Zug | null) => { zugRef.current = z; setZugState(z); };

  const zielUnter = (z: Zug, x: number, y: number): Zug["ziel"] => {
    const zelle = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-zelle]") as HTMLElement | null;
    if (!zelle) return z.ziel;
    const r = zelle.getBoundingClientRect();
    const minute = einrasten(ab + ((y - r.top - (z.griff === "mitte" ? z.versatz : 0)) / STD) * 60);
    return { person: zelle.dataset.zelle!, tag: zelle.dataset.tag!, minute: Math.max(0, Math.min(24 * 60, minute)) };
  };

  /** Was der Zug aus dem Einsatz macht (oder null, wenn nichts) */
  const ergebnis = (z: Zug) => {
    const t = termine.find((x) => x.id === z.id);
    if (!t || !z.ziel) return null;
    const lage = zeitLage(t, z.tag, ab, bis);
    if (!lage) return null;
    const griff = z.griff;
    const minuten = lage.ganz ? 0 : z.ziel.minute - (griff === "unten" ? lage.unten : lage.oben);
    const neu = planVerschieben(t, {
      tage: tageZwischen(z.tag, z.ziel.tag), minuten, vonPerson: z.person, nachPerson: z.ziel.person, griff,
    }, tageDazu);
    return { t, neu };
  };

  useEffect(() => {
    if (!zug) return;
    const bewegen = (e: PointerEvent) => {
      const z = zugRef.current;
      if (!z) return;
      const bewegt = z.bewegt || Math.abs(e.clientX - z.startX) + Math.abs(e.clientY - z.startY) > 5;
      setZug({ ...z, x: e.clientX, y: e.clientY, bewegt, ziel: bewegt ? zielUnter(z, e.clientX, e.clientY) : z.ziel });
    };
    const los = () => {
      const z = zugRef.current;
      setZug(null);
      if (!z) return;
      if (!z.bewegt) { setInfo((alt) => (alt?.id === z.id ? null : { id: z.id, x: z.x, y: z.y })); return; }
      const e = ergebnis(z);
      if (!e) return;
      const { t, neu } = e;
      const gleich = (["datum", "bis_datum", "von", "bis", "mitarbeiter"] as const).every((f) => JSON.stringify(neu[f]) === JSON.stringify(f === "von" || f === "bis" ? t[f]?.slice(0, 5) ?? null : t[f]));
      if (gleich) return;
      const wer = z.ziel && z.ziel.person !== z.person ? ` · ${name(p.mitarbeiter.find((m) => m.id === z.ziel!.person))}` : "";
      void aendern(t, neu, `${t.titel} → ${kurz(neu.datum)}${neu.von ? ` ${neu.von}–${neu.bis}` : ""}${wer}`);
    };
    const abbrechen = () => setZug(null);
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") abbrechen(); };
    const halt = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    // am Rand weiterrollen
    let rollen = 0;
    const rand = () => {
      const z = zugRef.current, box = boxRef.current;
      if (z?.bewegt && box) {
        const r = box.getBoundingClientRect();
        const vy = z.y < r.top + 70 && z.y > r.top - 20 ? -12 : z.y > r.bottom - 30 && z.y < r.bottom + 20 ? 12 : 0;
        if (vy) box.scrollTop += vy;
      }
      rollen = requestAnimationFrame(rand);
    };
    rollen = requestAnimationFrame(rand);
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", abbrechen);
    window.addEventListener("keydown", taste);
    document.addEventListener("touchmove", halt, { passive: false });
    return () => {
      cancelAnimationFrame(rollen);
      window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", los);
      window.removeEventListener("pointercancel", abbrechen); window.removeEventListener("keydown", taste);
      document.removeEventListener("touchmove", halt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zug !== null]);

  const blockDown = (t: Termin, person: string, tag: string, griff: Zug["griff"], e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = (e.currentTarget.closest("[data-block]") as HTMLElement | null)?.getBoundingClientRect();
    const z0: Zug = { id: t.id, person, tag, griff, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, bewegt: false, versatz: r ? e.clientY - r.top : 0, ziel: null };
    if (!darf) { setInfo((alt) => (alt?.id === t.id ? null : { id: t.id, x: e.clientX, y: e.clientY })); return; }
    startZiehen(e, () => setZug(z0), () => setInfo((alt) => (alt?.id === t.id ? null : { id: t.id, x: e.clientX, y: e.clientY })));
  };

  const zelleDown = (person: string, tag: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    setInfo(null);
    if (!darf) return;
    const r = e.currentTarget.getBoundingClientRect();
    const von = Math.max(ab, Math.min(bis - 60, Math.floor((ab + ((e.clientY - r.top) / STD) * 60) / 30) * 30));
    p.onNeu({ datum: tag, von: zeitAus(von), bis: zeitAus(Math.min(bis, von + 120)), mitarbeiterId: person });
  };

  const vorschau = zug?.bewegt ? ergebnis(zug) : null;

  const zelle = (m: Profil, tag: string, letzteInGruppe: boolean) => {
    const a = weg(m.id, tag);
    const liste = termine.map((t) => ({ t, lage: t.mitarbeiter.includes(m.id) ? zeitLage(t, tag, ab, bis) : null }))
      .filter((x): x is { t: Termin; lage: NonNullable<ReturnType<typeof zeitLage>> } => !!x.lage);
    const spalten = nebeneinander(liste.map((x) => ({ id: x.t.id, oben: x.lage.oben, unten: x.lage.unten })));
    const geist = vorschau && zug?.ziel?.person === m.id && zug.ziel.tag === tag ? zeitLage({ ...vorschau.t, ...vorschau.neu }, tag, ab, bis) : null;
    const ton = a ? abwesenheitTon(a.art) : null;
    return (
      <div key={m.id} data-zelle={m.id} data-tag={tag} onPointerDown={(e) => zelleDown(m.id, tag, e)}
        className={cn("relative shrink-0 border-r", letzteInGruppe && "border-r-2 border-r-foreground/20", darf && "cursor-cell")}
        style={{ width: breite, height: tagHoehe }}
        title={darf ? `${name(m)} · ${kurz(tag)} — antippen = neuer Einsatz` : undefined}>
        {a && ton && (
          <div className={cn("pointer-events-none absolute inset-0.5 rounded-sm border px-1.5 py-1 text-xs font-semibold", ABW_KLASSE[ton])}>
            {ABWESENHEIT_ART[a.art as AbwesenheitArt]?.text ?? "Abwesend"}
          </div>
        )}
        {liste.map(({ t, lage }) => {
          const sp = spalten.get(t.id) ?? { spalte: 0, anzahl: 1 };
          const projekt = projekte.find((x) => x.id === t.projekt_id);
          const { klasse, stil } = blockFarbe(projekt);
          const hoehe = ((lage.unten - lage.oben) / 60) * STD - 2;
          const gezogen = zug?.bewegt && zug.id === t.id && zug.person === m.id && zug.tag === tag;
          return (
            <div key={t.id} data-block={t.id}
              onPointerDown={(e) => blockDown(t, m.id, tag, "mitte", e)}
              title={[projekt ? `${projekt.nummer} ${projekt.name}` : null, projekt?.kunden?.name, t.titel, zeitText(t), t.ort].filter(Boolean).join(" · ")}
              className={cn("absolute z-[2] overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-[14px] shadow-sm",
                klasse, t.status === "erledigt" && "opacity-60", p.konfliktIds.has(t.id) && "ring-2 ring-status-rot-fg",
                info?.id === t.id && "ring-2 ring-foreground", gezogen && "opacity-40",
                darf ? "cursor-grab touch-none" : "cursor-pointer")}
              style={{ ...stil, top: ((lage.oben - ab) / 60) * STD + 1, height: hoehe, left: 2 + (sp.spalte * (breite - 4)) / sp.anzahl, width: (breite - 4) / sp.anzahl - 2 }}>
              <BlockText t={t} projekt={projekt} hoehe={hoehe} konflikt={p.konfliktIds.has(t.id)} />
              {darf && !lage.ganz && hoehe > 14 && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-foreground/20" onPointerDown={(e) => blockDown(t, m.id, tag, "unten", e)} />
              )}
            </div>
          );
        })}
        {geist && (
          <div className="pointer-events-none absolute inset-x-1 z-[3] rounded border-2 border-dashed border-primary bg-primary/15 px-1 text-[11px] font-semibold text-primary"
            style={{ top: ((geist.oben - ab) / 60) * STD + 1, height: ((geist.unten - geist.oben) / 60) * STD - 2 }}>
            {vorschau?.neu.von ? `${vorschau.neu.von}–${vorschau.neu.bis}` : "ganztägig"}
          </div>
        )}
      </div>
    );
  };

  const stunden: number[] = [];
  for (let h = ab; h < bis; h += 60) stunden.push(h);

  return (
    <div className={cn("flex min-h-0", zug && "select-none", p.className)}>
      <div ref={boxRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto border-t bg-card" onScroll={() => info && setInfo(null)}>
        <div style={{ width: ZEIT + breite * leute.length }}>
          {/* Kopf: Gruppen, darunter die Leute */}
          <div className="sticky top-0 z-30 border-b-2 border-foreground/15 bg-card">
            <div className="flex h-7 text-xs font-bold">
              <div className="sticky left-0 z-10 shrink-0 border-r bg-card" style={{ width: ZEIT }} />
              {gruppen.map((g) => (
                <div key={g.schluessel} title={g.titel} className="shrink-0 truncate border-r-2 border-r-foreground/20 bg-muted px-2 text-center leading-7" style={{ width: breite * g.leute.length }}>{g.titel}</div>
              ))}
            </div>
            <div className="flex border-t">
              <div className="sticky left-0 z-10 flex shrink-0 items-end border-r bg-card px-2 pb-1 text-[11px] text-muted-foreground" style={{ width: ZEIT }}>KW {kalenderwoche(tage[0])}</div>
              {gruppen.map((g) => g.leute.map((m, i) => (
                <div key={m.id} title={name(m)} className={cn("flex shrink-0 items-center justify-center gap-1.5 border-r px-1.5 py-1.5", i === g.leute.length - 1 && "border-r-2 border-r-foreground/20")} style={{ width: breite }}>
                  <Avatar profil={m} className="h-5 w-5 shrink-0 text-[9px]" />
                  <span className="truncate text-xs font-semibold">{breite < 150 && m.vorname && m.nachname ? `${m.vorname} ${m.nachname[0]}.` : name(m)}</span>
                </div>
              )))}
            </div>
          </div>

          {zeilenTage.map((tag) => {
            const fei = feiertagName(tag);
            const frei = wochentag(tag) >= 5 || !!fei;
            return (
              <div key={tag} className="border-b-2 border-foreground/15">
                <div className={cn("sticky top-[66px] z-20 flex h-6 items-center border-b text-xs", tag === heute ? "bg-primary-soft" : "bg-muted")}>
                  <div className={cn("sticky left-0 px-2 font-semibold", tag === heute && "text-primary")}>
                    {tag === heute ? "Heute, " : `${["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][wochentag(tag)]}, `}{datumText(tag)}
                    {fei && <span className="font-normal text-muted-foreground"> · {fei}</span>}
                  </div>
                </div>
                <div className="relative flex">
                  <div className="sticky left-0 z-10 shrink-0 border-r bg-card" style={{ width: ZEIT, height: tagHoehe }}>
                    {stunden.map((h) => (
                      <span key={h} className="absolute right-1.5 mt-px text-[10px] leading-none tabular-nums text-muted-foreground" style={{ top: ((h - ab) / 60) * STD }}>{zeitAus(h)}</span>
                    ))}
                  </div>
                  <div className={cn("relative flex", frei && "bg-muted/50")}
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${STD - 1}px, hsl(var(--border)) ${STD - 1}px ${STD}px)` }}>
                    {gruppen.map((g) => g.leute.map((m, i) => zelle(m, tag, i === g.leute.length - 1)))}
                    {tag === heute && jetztMin > ab && jetztMin < bis && (
                      <div className="pointer-events-none absolute inset-x-0 z-[4] h-0.5 bg-primary" style={{ top: ((jetztMin - ab) / 60) * STD }} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {freiesWochenende.length > 0 && (
            <p className="sticky left-0 px-3 py-2 text-xs text-muted-foreground">{freiesWochenende.map(kurz).join(", ")} — nichts geplant</p>
          )}
          {!leute.length && <p className="p-6 text-sm text-muted-foreground">Niemand ausgewählt.</p>}
        </div>
      </div>
      {p.seite}

      {info && <Info info={info} p={{ ...p, aendern, loeschen }} onZu={() => setInfo(null)} />}
      {zug?.bewegt && vorschau && (
        <div className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md border-2 border-primary bg-card px-2 py-1 text-xs font-semibold"
          style={{ left: zug.x + 14, top: zug.y + 12 }}>
          {kurz(vorschau.neu.datum)}{vorschau.neu.bis_datum ? ` – ${kurz(vorschau.neu.bis_datum)}` : ""} · {vorschau.neu.von ? `${vorschau.neu.von}–${vorschau.neu.bis}` : "ganztägig"}
          {zug.ziel && zug.ziel.person !== zug.person ? ` → ${name(p.mitarbeiter.find((m) => m.id === zug.ziel!.person))}` : ""}
        </div>
      )}
    </div>
  );
}

/** Rechts am PC: drei Monate zum Springen, die gezeigte Woche markiert */
export function MiniKalender({ bezug, woche, heute, onTag }: { bezug: string; woche: string[]; heute: string; onTag: (iso: string) => void }) {
  const [versatz, setVersatz] = useState(0);
  const d = isoZuDatum(bezug);
  useEffect(() => setVersatz(0), [bezug]);
  const monate = [0, 1, 2].map((i) => new Date(d.getFullYear(), d.getMonth() + versatz + i, 1, 12));
  return (
    <aside className="hidden w-60 shrink-0 overflow-y-auto border-l border-t bg-card px-3 py-2 xl:block" aria-label="Monatskalender">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Früher" onClick={() => setVersatz(versatz - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs font-medium text-muted-foreground">Springen</span>
        <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Später" onClick={() => setVersatz(versatz + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
      {monate.map((m) => {
        const erster = isoTag(m);
        const start = tageDazu(erster, -wochentag(erster));
        const wochen: string[][] = [];
        for (let w = start; w.slice(0, 7) <= erster.slice(0, 7) && wochen.length < 6; w = tageDazu(w, 7)) {
          wochen.push(Array.from({ length: 7 }, (_, i) => tageDazu(w, i)));
        }
        return (
          <div key={erster} className="mb-3">
            <p className="py-1 text-center text-sm font-semibold">{m.toLocaleDateString("de-AT", { month: "long", year: "numeric" })}</p>
            <table className="w-full table-fixed text-center text-xs">
              <thead>
                <tr className="text-muted-foreground"><th className="w-6 font-normal" />{WT.map((x) => <th key={x} className="font-normal">{x}</th>)}</tr>
              </thead>
              <tbody>
                {wochen.map((w) => {
                  const gezeigt = w[0] === woche[0];
                  return (
                    <tr key={w[0]} className={cn(gezeigt && "bg-primary-soft")}>
                      <td className="text-[10px] text-muted-foreground">{kalenderwoche(w[0])}</td>
                      {w.map((tag) => (
                        <td key={tag} className="p-0">
                          <button type="button" onClick={() => onTag(tag)} aria-label={datumText(tag)}
                            className={cn("h-7 w-full rounded tabular-nums hover:bg-muted",
                              tag.slice(0, 7) !== erster.slice(0, 7) && "text-muted-foreground/40",
                              wochentag(tag) >= 5 && "text-muted-foreground",
                              tag === heute && "font-bold text-primary ring-1 ring-primary")}>
                            {Number(tag.slice(8))}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <button type="button" onClick={() => onTag(heute)} className="w-full rounded border py-1.5 text-xs font-medium hover:bg-muted">Heute: {datumText(heute)}</button>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────── Handy ── */

export type HandyModus = "tag" | "person";

/**
 * Handy: entweder ein Tag (Leute untereinander, Zeit quer — wer ist wann wo)
 * oder eine Person (Mo–Fr nebeneinander, Stunden nach unten). Wischen =
 * nächster Tag bzw. nächste Person; nie seitlich scrollen.
 */
export function TerminplanerHandy(p: Gemeinsam & {
  gruppen: Gruppe<Profil>[]; modus: HandyModus; tagIndex: number; onTagIndex: (i: number) => void;
  person: string; onPerson: (id: string) => void; onBlaettern: (r: number) => void;
}) {
  const { tage, termine, gruppen, abwesend, projekte, heute, darf } = p;
  const { aendern, loeschen } = useAendern(p.termineKey);
  const [info, setInfo] = useState<{ id: string; x: number; y: number } | null>(null);
  const leute = gruppen.flatMap((g) => g.leute);
  const [ab, bis] = useMemo(() => stundenBereich(termine, tage), [termine, tage]);
  const weg = (pid: string, tag: string) => abwesend.find((a) => a.user_id === pid && a.von && a.bis && a.von <= tag && a.bis >= tag);
  const wisch = useRef<{ x: number; y: number } | null>(null);

  const weiter = (r: number) => {
    if (p.modus === "tag") {
      const i = p.tagIndex + r;
      if (i < 0) { p.onBlaettern(-1); p.onTagIndex(4); } else if (i > 6) { p.onBlaettern(1); p.onTagIndex(0); } else p.onTagIndex(i);
    } else {
      const i = leute.findIndex((m) => m.id === p.person);
      const n = leute[(i + r + leute.length) % leute.length];
      if (n) p.onPerson(n.id);
    }
  };
  const wischen = {
    onTouchStart: (e: React.TouchEvent) => { wisch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = wisch.current;
      wisch.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) weiter(dx < 0 ? 1 : -1);
    },
  };
  const antippen = (t: Termin, e: React.MouseEvent) => { e.stopPropagation(); setInfo((alt) => (alt?.id === t.id ? null : { id: t.id, x: Math.min(e.clientX, 40), y: e.clientY })); };
  const block = (t: Termin, stil: React.CSSProperties, hoehe: number) => {
    const projekt = projekte.find((x) => x.id === t.projekt_id);
    const f = blockFarbe(projekt);
    return (
      <button key={t.id} type="button" onClick={(e) => antippen(t, e)} data-block={t.id}
        className={cn("absolute z-[2] overflow-hidden rounded px-1 text-left text-[11px] leading-[14px]", f.klasse, t.status === "erledigt" && "opacity-60",
          p.konfliktIds.has(t.id) && "ring-2 ring-status-rot-fg", info?.id === t.id && "ring-2 ring-foreground")}
        style={{ ...f.stil, ...stil }}>
        <BlockText t={t} projekt={projekt} hoehe={hoehe} konflikt={p.konfliktIds.has(t.id)} />
      </button>
    );
  };

  const stunden: number[] = [];
  for (let h = ab; h < bis; h += 60) stunden.push(h);
  const anteil = (min: number) => `${((min - ab) / (bis - ab)) * 100}%`;

  let inhalt: ReactNode;
  if (p.modus === "tag") {
    const tag = tage[Math.max(0, Math.min(6, p.tagIndex))];
    inhalt = (
      <div className="rounded-lg border bg-card">
        <div className="relative ml-[5.5rem] h-5 border-b text-[10px] text-muted-foreground">
          {stunden.filter((h) => (h / 60) % 2 === 0).map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: anteil(h) }}>{h / 60}</span>
          ))}
        </div>
        {gruppen.map((g) => (
          <div key={g.schluessel}>
            <p className="border-b bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.titel}</p>
            {g.leute.map((m) => {
              const a = weg(m.id, tag);
              const ton = a ? abwesenheitTon(a.art) : null;
              const liste = termine.map((t) => ({ t, lage: t.mitarbeiter.includes(m.id) ? zeitLage(t, tag, ab, bis) : null }))
                .filter((x): x is { t: Termin; lage: NonNullable<ReturnType<typeof zeitLage>> } => !!x.lage);
              const sp = nebeneinander(liste.map((x) => ({ id: x.t.id, oben: x.lage.oben, unten: x.lage.unten })));
              return (
                <div key={m.id} className="flex border-b last:border-b-0">
                  <button type="button" onClick={() => p.onPerson(m.id)} className="flex w-[5.5rem] shrink-0 items-center gap-1 border-r px-1.5 text-left text-xs font-medium">
                    <Avatar profil={m} className="h-5 w-5 shrink-0 text-[9px]" /><span className="truncate">{m.vorname || name(m)}</span>
                  </button>
                  <div className={cn("relative h-12 flex-1", darf && "cursor-cell")}
                    style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0 calc(${100 / ((bis - ab) / 60)}% - 1px), hsl(var(--border)) calc(${100 / ((bis - ab) / 60)}% - 1px) ${100 / ((bis - ab) / 60)}%)` }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget || !darf) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const von = Math.max(ab, Math.min(bis - 60, Math.floor((ab + ((e.clientX - r.left) / r.width) * (bis - ab)) / 30) * 30));
                      p.onNeu({ datum: tag, von: zeitAus(von), bis: zeitAus(Math.min(bis, von + 120)), mitarbeiterId: m.id });
                    }}>
                    {a && ton && <div className={cn("pointer-events-none absolute inset-0.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", ABW_KLASSE[ton])}>{ABWESENHEIT_ART[a.art as AbwesenheitArt]?.text ?? "Abwesend"}</div>}
                    {liste.map(({ t, lage }) => {
                      const s = sp.get(t.id) ?? { spalte: 0, anzahl: 1 };
                      const h = 44 / s.anzahl;
                      return block(t, { left: anteil(lage.oben), width: `calc(${((lage.unten - lage.oben) / (bis - ab)) * 100}% - 2px)`, top: 2 + s.spalte * h, height: h - 2 }, h - 2);
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else {
    const m = leute.find((x) => x.id === p.person) ?? leute[0];
    const zeigTage = tage.filter((t, i) => i < 5 || termine.some((x) => m && x.mitarbeiter.includes(m.id) && zeitLage(x, t, ab, bis)));
    const H = 28;
    inhalt = !m ? <p className="text-sm text-muted-foreground">Niemand ausgewählt.</p> : (
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex border-b">
          <div className="w-9 shrink-0" />
          {zeigTage.map((tag) => (
            <div key={tag} className={cn("min-w-0 flex-1 border-l py-1 text-center text-[11px] leading-tight", tag === heute && "bg-primary-soft font-bold text-primary")}>
              {WT[wochentag(tag)]}<br />{Number(tag.slice(8))}.
            </div>
          ))}
        </div>
        <div className="flex">
          <div className="relative w-9 shrink-0" style={{ height: ((bis - ab) / 60) * H }}>
            {stunden.map((h) => <span key={h} className="absolute right-1 text-[10px] tabular-nums text-muted-foreground" style={{ top: ((h - ab) / 60) * H }}>{h / 60}</span>)}
          </div>
          {zeigTage.map((tag) => {
            const a = weg(m.id, tag);
            const ton = a ? abwesenheitTon(a.art) : null;
            const liste = termine.map((t) => ({ t, lage: t.mitarbeiter.includes(m.id) ? zeitLage(t, tag, ab, bis) : null }))
              .filter((x): x is { t: Termin; lage: NonNullable<ReturnType<typeof zeitLage>> } => !!x.lage);
            const sp = nebeneinander(liste.map((x) => ({ id: x.t.id, oben: x.lage.oben, unten: x.lage.unten })));
            return (
              <div key={tag} className={cn("relative min-w-0 flex-1 border-l", (wochentag(tag) >= 5 || feiertagName(tag)) && "bg-muted/50", darf && "cursor-cell")}
                style={{ height: ((bis - ab) / 60) * H, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${H - 1}px, hsl(var(--border)) ${H - 1}px ${H}px)` }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget || !darf) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const von = Math.max(ab, Math.min(bis - 60, Math.floor((ab + ((e.clientY - r.top) / H) * 60) / 30) * 30));
                  p.onNeu({ datum: tag, von: zeitAus(von), bis: zeitAus(Math.min(bis, von + 120)), mitarbeiterId: m.id });
                }}>
                {a && ton && <div className={cn("pointer-events-none absolute inset-0.5 rounded-sm border px-0.5 py-1 text-[10px] font-semibold [writing-mode:vertical-rl]", ABW_KLASSE[ton])}>{ABWESENHEIT_ART[a.art as AbwesenheitArt]?.text ?? "Abwesend"}</div>}
                {liste.map(({ t, lage }) => {
                  const s = sp.get(t.id) ?? { spalte: 0, anzahl: 1 };
                  const hoehe = ((lage.unten - lage.oben) / 60) * H - 2;
                  return block(t, { top: ((lage.oben - ab) / 60) * H + 1, height: hoehe, left: `calc(${(s.spalte * 100) / s.anzahl}% + 1px)`, width: `calc(${100 / s.anzahl}% - 2px)` }, hoehe);
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div {...wischen} className="space-y-2">
      {p.modus === "tag" ? (
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Tag">
          {tage.map((tag, i) => (
            <button key={tag} type="button" aria-pressed={i === p.tagIndex} onClick={() => p.onTagIndex(i)}
              className={cn("flex h-12 flex-col items-center justify-center rounded-md border text-xs leading-tight",
                i === p.tagIndex ? "border-primary bg-primary text-primary-foreground" : tag === heute ? "border-primary text-primary" : "bg-card",
                i !== p.tagIndex && wochentag(tag) >= 5 && "text-muted-foreground")}>
              <span>{WT[wochentag(tag)]}</span><span className="font-semibold">{Number(tag.slice(8))}.</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Vorige Person" onClick={() => weiter(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-card"><ChevronLeft className="h-5 w-5" /></button>
          <select value={p.person} onChange={(e) => p.onPerson(e.target.value)} aria-label="Person" className="h-11 min-w-0 flex-1 rounded-md border bg-card px-2 text-base font-medium">
            {gruppen.map((g) => (
              <optgroup key={g.schluessel} label={g.titel}>
                {g.leute.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" aria-label="Nächste Person" onClick={() => weiter(1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-card"><ChevronRight className="h-5 w-5" /></button>
        </div>
      )}
      {inhalt}
      <p className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-status-blau align-middle" />Termin</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-status-gruen align-middle" />Urlaub/ZA</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-status-rot align-middle" />Krank</span>
        <span>Wischen = {p.modus === "tag" ? "nächster Tag" : "nächste Person"}</span>
      </p>
      {info && <Info info={info} p={{ ...p, aendern, loeschen }} onZu={() => setInfo(null)} />}
    </div>
  );
}
