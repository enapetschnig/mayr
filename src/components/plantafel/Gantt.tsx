import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, FolderKanban, GripVertical, Truck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Bausteine";
import { fehlerText } from "@/components/stamm/stammDaten";
import { datum as datumText, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import { faelligkeiten } from "@/lib/fuhrpark";
import { ablegen, amTag, ANSICHTEN, bahnen, balkenLage, inZeile, tageZwischen, verschieben, zuweisen, type Ansicht, type Griff, type Zeile } from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import { ABWESENHEIT_ART, FAHRZEUG_ART, TEAM_FARBEN, name, type AbwesenheitArt, type Fahrzeug, type FahrzeugArt, type Profil, type Projekt, type Team, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Plantafel als Gantt (Vorbild Steinbrecher-Ressourcenplanung): links Teams
 * mit ihren Leuten, Leute ohne Team, Busse/Steiger/Geräte; rechts die Tage.
 * - Balken ziehen = verschieben (Tag und Zeile: anderes Team → Leute und Bus
 *   wechseln mit, andere Person oder anderer Bus → getauscht)
 * - Ränder ziehen = früher anfangen / länger machen
 * - leere Tage aufziehen = neuer Einsatz für diese Zeile
 * - Projekt aus der Liste rechts auf eine Zeile ziehen = bis Freitag eingeplant
 * - Person oder Gerät (Griff links oder rechts) auf einen Balken = dazuholen,
 *   auf ein Team = Person wechselt ins Team / Team fährt mit diesem Bus
 * - Bus eines Teams oben im Team wählen (passt die Einsätze ab heute an)
 * - mit Strg/Alt gezogen = kopieren
 * Alles wirkt sofort und lässt sich mit Strg+Z zurücknehmen. Am Tablet: halten = ziehen.
 */

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const LINKS = 264;
const wochentag = (iso: string) => (isoZuDatum(iso).getDay() + 6) % 7;
const frei = (iso: string) => wochentag(iso) >= 5 || !!feiertagName(iso);
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}–${t.bis ? uhrzeit(t.bis) : ""}`);
const zeileSchluessel = (z: Zeile) => (z.art === "offen" ? "offen" : `${z.art}:${z.id}`);
const zeileAus = (s: string): Zeile => (s === "offen" ? { art: "offen" } : { art: s.split(":")[0] as "team", id: s.split(":")[1] });
const kurz = (iso: string) => `${WT[wochentag(iso)]} ${datumText(iso).slice(0, 6)}`;
const ZU_KEY = "elektro.plantafel.zu";

type Inhalt =
  | { art: "balken"; id: string; griff: Griff; zeile: Zeile; tag: string }
  | { art: "neu"; zeile: Zeile; tag: string }
  | { art: "projekt"; id: string }
  | { art: "ressource"; was: "person" | "fahrzeug"; id: string };
/** ziel = Zeile unter dem Zeiger, balken = Einsatz unter dem Zeiger */
/** kopie = Strg/Alt gedrückt: der Einsatz wird kopiert statt verschoben */
type Ziehen = { inhalt: Inhalt; startX: number; startY: number; x: number; y: number; bewegt: boolean; sx0: number; sx: number; ziel: string | null; balken: string | null; kopie: boolean };
type Rueck = { text: string; zurueck: () => Promise<void> };

const FELDER = ["datum", "bis_datum", "mitarbeiter", "fahrzeuge", "team_id"] as const;
type Felder = Pick<Termin, (typeof FELDER)[number]>;
const felderVon = (t: Termin): Felder => ({ datum: t.datum, bis_datum: t.bis_datum, mitarbeiter: t.mitarbeiter, fahrzeuge: t.fahrzeuge, team_id: t.team_id });

export function Gantt({
  start, ansicht, termine, termineKey, teams, mitarbeiter, fahrzeuge, projekte, abwesend, konfliktIds, darf, heute, onOeffnen, onNeu, seitenleiste,
}: {
  start: string;
  ansicht: Ansicht;
  termine: Termin[];
  termineKey: unknown[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: Projekt[];
  abwesend: { id: string | null; user_id: string | null; von: string | null; bis: string | null; art: string | null }[];
  konfliktIds: Set<string>;
  darf: boolean;
  heute: string;
  onOeffnen: (t: Termin) => void;
  onNeu: (v: { datum: string; bisDatum?: string; zeile: Zeile }) => void;
  /** Rückgängig-Knopf in der Werkzeugleiste der Seite */
  seitenleiste: boolean;
}) {
  const qc = useQueryClient();
  const a = ANSICHTEN.find((x) => x.wert === ansicht)!;
  const tage = useMemo(() => Array.from({ length: a.tage }, (_, i) => tageDazu(start, i)), [start, a.tage]);
  const bahnRef = useRef<HTMLDivElement>(null);
  // Die Tage füllen die Breite; erst unter der Mindestbreite wird seitlich geblättert
  const [platz, setPlatz] = useState(0);
  useEffect(() => {
    const el = bahnRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlatz(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const breite = Math.max(a.breite, Math.floor((platz - LINKS - 2) / tage.length));
  const gesamt = breite * tage.length;
  const kopfRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [ziehen, setZiehenState] = useState<Ziehen | null>(null);
  const ziehenRef = useRef<Ziehen | null>(null);
  const setZiehen = (z: Ziehen | null) => { ziehenRef.current = z; setZiehenState(z); };
  const [rueck, setRueck] = useState<Rueck[]>([]);
  const [zu, setZu] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(ZU_KEY) ?? "[]"); } catch { return []; } });
  const umklappen = (id: string) => setZu((alt) => {
    const neu = alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id];
    try { localStorage.setItem(ZU_KEY, JSON.stringify(neu)); } catch { /* egal */ }
    return neu;
  });

  // Zur heutigen Woche scrollen, wenn sie nicht vorne steht (3 Monate beginnt eine Woche früher)
  useEffect(() => {
    const i = tage.indexOf(heute);
    if (bahnRef.current && i > 6) bahnRef.current.scrollLeft = (i - 3) * breite;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, ansicht]);

  // ------------------------------------------------------------- Speichern
  const cacheSetzen = (f: (liste: Termin[]) => Termin[]) => qc.setQueryData<Termin[]>(termineKey, (alt) => f(alt ?? []));
  const neuLaden = () => qc.invalidateQueries({ queryKey: ["termine"] });

  /** Ändern: sofort zeichnen, dann speichern; bei Fehler zurück */
  const aendern = async (t: Termin, neu: Partial<Felder>, text: string, rueckgaengig = true) => {
    const alt = felderVon(t);
    cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...neu } : x)));
    const { error } = await supabase.from("termine").update(neu).eq("id", t.id);
    if (error) {
      cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...alt } : x)));
      toast.error("Nicht gespeichert", { description: fehlerText(error) });
      return;
    }
    if (rueckgaengig) setRueck((r) => [...r.slice(-29), { text, zurueck: () => aendern({ ...t, ...neu }, alt, "", false) }]);
    void neuLaden();
  };

  const anlegen = async (werte: Partial<Termin> & { titel: string; datum: string }, text: string) => {
    const { data, error } = await supabase.from("termine").insert(werte).select("id").single();
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    setRueck((r) => [...r.slice(-29), {
      text,
      zurueck: async () => { const { error: e } = await supabase.from("termine").delete().eq("id", data.id); if (e) toast.error("Nicht zurückgenommen", { description: fehlerText(e) }); void neuLaden(); },
    }]);
    void neuLaden();
  };

  const rueckgaengig = async () => {
    const letzte = rueck.at(-1);
    if (!letzte) return;
    setRueck((r) => r.slice(0, -1));
    await letzte.zurueck();
    toast(`Zurückgenommen: ${letzte.text}`);
  };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z" || ziel?.closest("input, textarea, select, [role=dialog]")) return;
      e.preventDefault();
      void rueckgaengig();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  /** Bus eines Teams wechseln — die Einsätze des Teams ab heute fahren mit dem neuen */
  const busWechseln = async (team: Team, neuId: string | null) => {
    const altId = team.fahrzeug_id;
    if (altId === neuId) return;
    const { error } = await supabase.from("teams").update({ fahrzeug_id: neuId }).eq("id", team.id);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    const { data: betroffen } = await supabase.from("termine").select("*").eq("team_id", team.id).or(`datum.gte.${heute},bis_datum.gte.${heute}`);
    const liste = (betroffen ?? []) as Termin[];
    const tausch = (fz: string[]) => {
      const ohne = fz.filter((x) => x !== altId && x !== neuId);
      return neuId ? [...ohne, neuId] : ohne;
    };
    for (const t of liste) await supabase.from("termine").update({ fahrzeuge: tausch(t.fahrzeuge) }).eq("id", t.id);
    const busName = (id: string | null) => fahrzeuge.find((f) => f.id === id)?.name ?? "kein Bus";
    setRueck((r) => [...r.slice(-29), {
      text: `${team.name}: ${busName(neuId)}`,
      zurueck: async () => {
        await supabase.from("teams").update({ fahrzeug_id: altId }).eq("id", team.id);
        for (const t of liste) await supabase.from("termine").update({ fahrzeuge: t.fahrzeuge }).eq("id", t.id);
        void qc.invalidateQueries({ queryKey: ["teams"] });
        void neuLaden();
      },
    }]);
    toast.success(`${team.name} fährt jetzt mit ${busName(neuId)}`, { description: liste.length ? `${liste.length} ${liste.length === 1 ? "Einsatz" : "Einsätze"} ab heute angepasst` : undefined });
    void qc.invalidateQueries({ queryKey: ["teams"] });
    void neuLaden();
  };

  /** Person fest in ein anderes Team — die Einsätze bleiben, wie sie sind */
  const teamWechseln = async (userId: string, ziel: Team) => {
    if (ziel.mitglieder.includes(userId)) return;
    const vorher = teams.filter((t) => t.mitglieder.includes(userId) || t.id === ziel.id).map((t) => ({ id: t.id, mitglieder: t.mitglieder }));
    const schreiben = async (liste: { id: string; mitglieder: string[] }[]) => {
      for (const t of liste) {
        const { error } = await supabase.from("teams").update({ mitglieder: t.mitglieder }).eq("id", t.id);
        if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return false; }
      }
      void qc.invalidateQueries({ queryKey: ["teams"] });
      return true;
    };
    const neu = vorher.map((t) => ({ id: t.id, mitglieder: t.id === ziel.id ? [...t.mitglieder, userId] : t.mitglieder.filter((x) => x !== userId) }));
    if (!(await schreiben(neu))) return;
    const wer = name(mitarbeiter.find((m) => m.id === userId));
    setRueck((r) => [...r.slice(-29), { text: `${wer} → Team ${ziel.name}`, zurueck: async () => { await schreiben(vorher); } }]);
    toast.success(`${wer} ist jetzt im Team ${ziel.name}`, { description: "Neue Einsätze des Teams nehmen ihn oder sie mit; bestehende bleiben." });
  };

  // ------------------------------------------------------------- Ziehen
  const zielUnter = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return {
      ziel: (el?.closest("[data-reihe]") as HTMLElement | null)?.dataset.reihe ?? null,
      balken: (el?.closest("[data-balken]") as HTMLElement | null)?.dataset.balken ?? null,
    };
  };
  const tagBei = (x: number): string | null => {
    const r = kopfRef.current?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.floor((x - r.left) / breite);
    return i >= 0 && i < tage.length ? tage[i] : null;
  };
  const deltaTage = (z: Ziehen) => (z.bewegt ? Math.round((z.x - z.startX + z.sx - z.sx0) / breite) : 0);

  const beginne = (inhalt: Inhalt, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = bahnRef.current?.scrollLeft ?? 0;
    const z0: Ziehen = { inhalt, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, bewegt: false, sx0: sx, sx, ziel: null, balken: null, kopie: false };
    if (e.pointerType !== "touch") { setZiehen(z0); return; }
    // Tablet: kurz halten = ziehen, tippen = öffnen, wischen = blättern
    let timer = 0;
    const weg = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", bew); window.removeEventListener("pointerup", auf); window.removeEventListener("pointercancel", weg);
    };
    const bew = (ev: PointerEvent) => { if (Math.abs(ev.clientX - z0.startX) + Math.abs(ev.clientY - z0.startY) > 10) weg(); };
    const auf = () => { weg(); void loslassen(z0); };
    window.addEventListener("pointermove", bew); window.addEventListener("pointerup", auf); window.addEventListener("pointercancel", weg);
    timer = window.setTimeout(() => { weg(); navigator.vibrate?.(25); setZiehen({ ...z0, sx0: bahnRef.current?.scrollLeft ?? sx, sx: bahnRef.current?.scrollLeft ?? sx }); }, 350);
  };

  const zeileName = (z: Zeile) => {
    if (z.art === "team") return `Team ${teams.find((t) => t.id === z.id)?.name ?? ""}`;
    if (z.art === "person") return name(mitarbeiter.find((m) => m.id === z.id));
    if (z.art === "fahrzeug") return fahrzeuge.find((f) => f.id === z.id)?.name ?? "Fahrzeug";
    return "nicht eingeteilt";
  };

  const loslassen = async (z: Ziehen) => {
    const i = z.inhalt;
    if (i.art === "neu") {
      if (!darf) return;
      const ende = tagBei(z.x) ?? i.tag;
      const [von, bis] = i.tag <= ende ? [i.tag, ende] : [ende, i.tag];
      onNeu({ datum: von, bisDatum: bis > von ? bis : undefined, zeile: i.zeile });
      return;
    }
    if (i.art === "balken") {
      const t = termine.find((x) => x.id === i.id);
      if (!t) return;
      if (!z.bewegt) { onOeffnen(t); return; }
      if (!darf) return;
      const d = deltaTage(z);
      if (i.griff !== "mitte") {
        if (d) await aendern(t, verschieben(t, i.griff, d), `${t.titel}: ${i.griff === "rechts" ? "Ende" : "Beginn"} verschoben`);
        return;
      }
      const ziel = z.ziel ? zeileAus(z.ziel) : i.zeile;
      const nachTag = tageDazu(i.tag, d);
      const neu = ablegen(t, { zeile: i.zeile, tag: i.tag }, { zeile: ziel, tag: nachTag }, teams);
      if (z.kopie) {
        await anlegen({
          titel: t.titel, projekt_id: t.projekt_id, ort: t.ort, beschreibung: t.beschreibung, ganztags: t.ganztags, von: t.von, bis: t.bis, dringend: t.dringend, ...neu,
        }, `${t.titel} kopiert`);
        toast.success(`${t.titel} kopiert`, { description: `${zeileName(ziel)} · ${kurz(neu.datum)}` });
        return;
      }
      const gleich = FELDER.every((f) => JSON.stringify(neu[f]) === JSON.stringify(t[f]));
      if (!gleich) await aendern(t, neu, `${t.titel} → ${zeileSchluessel(ziel) === zeileSchluessel(i.zeile) ? kurz(neu.datum) : zeileName(ziel)}`);
      return;
    }
    if (!darf || !z.bewegt) return;
    if (i.art === "ressource") {
      const t = termine.find((x) => x.id === z.balken);
      const zielTeam = !t && z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
      if (zielTeam && i.was === "fahrzeug") { await busWechseln(zielTeam, i.id); return; }
      if (zielTeam && i.was === "person") { await teamWechseln(i.id, zielTeam); return; }
      if (!t) { toast("Auf einen Einsatz ziehen = dazuholen · auf ein Team ziehen = ins Team"); return; }
      const neu = zuweisen(t, { art: i.was, id: i.id });
      if (neu.mitarbeiter.length === t.mitarbeiter.length && neu.fahrzeuge.length === t.fahrzeuge.length) return;
      const wer = i.was === "person" ? name(mitarbeiter.find((m) => m.id === i.id)) : fahrzeuge.find((f) => f.id === i.id)?.name;
      await aendern(t, neu, `${wer} → ${t.titel}`);
      return;
    }
    if (i.art === "projekt") {
      const tag = tagBei(z.x);
      const zeilenZiel = z.ziel;
      if (!tag || !zeilenZiel) { toast("Auf eine Zeile in der Tafel ziehen"); return; }
      const p = projekte.find((x) => x.id === i.id);
      if (!p) return;
      const zeile = zeileAus(zeilenZiel);
      // bis Freitag derselben Woche (am Wochenende nur der Tag)
      const bis = wochentag(tag) < 5 ? tageDazu(tag, 4 - wochentag(tag)) : tag;
      const leer = { id: "", datum: tag, bis_datum: null, ganztags: false, von: "07:00", bis: "15:30", mitarbeiter: [], fahrzeuge: [], team_id: null };
      const verteilt = ablegen(leer, { zeile: { art: "offen" }, tag }, { zeile, tag }, teams);
      await anlegen({
        titel: p.name, projekt_id: p.id, ort: [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        ganztags: false, von: "07:00", bis: "15:30", ...verteilt, bis_datum: bis > tag ? bis : null,
      }, `${p.nummer} eingeplant`);
      toast.success(`${p.nummer} ${p.name}`, { description: `${zeileName(zeile)} · ${kurz(tag)}${bis > tag ? ` – ${kurz(bis)}` : ""}` });
    }
  };

  useEffect(() => {
    if (!ziehen) return;
    let rollen = 0;
    const box = bahnRef.current;
    const stand = (z: Ziehen) => `${z.bewegt}|${deltaTage(z)}|${z.ziel}|${z.balken}|${z.kopie}|${tagBei(z.x)}`;
    const setze = (neu: Ziehen) => {
      const alt = ziehenRef.current;
      ziehenRef.current = neu;
      if (chipRef.current) { chipRef.current.style.left = `${neu.x + 14}px`; chipRef.current.style.top = `${neu.y + 12}px`; }
      if (!alt || stand(alt) !== stand(neu)) setZiehenState(neu);
    };
    const bewegen = (e: PointerEvent) => {
      const z = ziehenRef.current;
      if (!z) return;
      setze({ ...z, x: e.clientX, y: e.clientY, ...zielUnter(e.clientX, e.clientY), kopie: e.ctrlKey || e.altKey || e.metaKey, bewegt: z.bewegt || Math.abs(e.clientX - z.startX) + Math.abs(e.clientY - z.startY) > 5 });
    };
    // Am Rand weiterblättern
    const rand = () => {
      const z = ziehenRef.current;
      if (z?.bewegt && box) {
        const r = box.getBoundingClientRect();
        const vx = z.x < r.left + LINKS + 30 && z.x > r.left + LINKS - 10 ? -14 : z.x > r.right - 40 && z.x < r.right + 10 ? 14 : 0;
        const vy = z.y < r.top + 70 && z.y > r.top ? -10 : z.y > r.bottom - 30 && z.y < r.bottom + 10 ? 10 : 0;
        if (vx || vy) { box.scrollLeft += vx; box.scrollTop += vy; setze({ ...z, sx: box.scrollLeft }); }
      }
      rollen = requestAnimationFrame(rand);
    };
    rollen = requestAnimationFrame(rand);
    const los = () => { const z = ziehenRef.current; setZiehen(null); if (z) void loslassen(z); };
    const abbrechen = () => setZiehen(null);
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") abbrechen(); };
    const halt = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
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
  }, [ziehen !== null]);

  /** Wie der Einsatz während des Ziehens aussähe (Vorschau an Ort und Stelle) */
  const vorschau = (t: Termin): Termin => {
    const z = ziehen;
    if (!z?.bewegt || z.inhalt.art !== "balken" || z.inhalt.id !== t.id) return t;
    return { ...t, ...verschieben(t, z.inhalt.griff, deltaTage(z)) };
  };

  // ------------------------------------------------------------- Zeilen
  const inTeam = new Set(teams.flatMap((t) => t.mitglieder));
  type Reihe = { zeile: Zeile; kopf: ReactNode; stufe: 0 | 1; hell?: boolean };
  const abschnitte: { titel: string; icon: ReactNode; reihen: Reihe[] }[] = [
    {
      titel: "Teams", icon: <Users className="h-3.5 w-3.5" />,
      reihen: teams.flatMap((team) => [
        { zeile: { art: "team", id: team.id } as Zeile, stufe: 0 as const, hell: true,
          kopf: <TeamKopf team={team} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} darf={darf} offen={!zu.includes(team.id)} onKlappen={() => umklappen(team.id)} onBus={(id) => void busWechseln(team, id)} /> },
        ...(zu.includes(team.id) ? [] : team.mitglieder.map((id) => mitarbeiter.find((m) => m.id === id)).filter((m): m is Profil => !!m).map((m) => ({
          zeile: { art: "person", id: m.id } as Zeile, stufe: 1 as const,
          kopf: <PersonKopf m={m} darf={darf} onGriff={(e) => beginne({ art: "ressource", was: "person", id: m.id }, e)} />,
        }))),
      ]),
    },
    {
      titel: "Ohne Team", icon: <Users className="h-3.5 w-3.5" />,
      reihen: mitarbeiter.filter((m) => !inTeam.has(m.id)).map((m) => ({
        zeile: { art: "person", id: m.id } as Zeile, stufe: 0 as const,
        kopf: <PersonKopf m={m} darf={darf} onGriff={(e) => beginne({ art: "ressource", was: "person", id: m.id }, e)} />,
      })),
    },
    {
      titel: "Busse, Steiger & Geräte", icon: <Truck className="h-3.5 w-3.5" />,
      reihen: fahrzeuge.map((f) => ({
        zeile: { art: "fahrzeug", id: f.id } as Zeile, stufe: 0 as const,
        kopf: <FahrzeugKopf f={f} heute={heute} darf={darf} onGriff={(e) => beginne({ art: "ressource", was: "fahrzeug", id: f.id }, e)} />,
      })),
    },
    { titel: "Nicht eingeteilt", icon: null, reihen: [{ zeile: { art: "offen" }, stufe: 0, kopf: <span className="text-sm text-muted-foreground">Einsätze ohne Team und Leute</span> }] },
  ];

  const sichtbar = (t: Termin) => !!balkenLage(t.datum, t.bis_datum ?? t.datum, start, tage.length);
  // Während des Ziehens bleibt der gezogene Balken in seiner Zeile (Vorschau verschiebt nur den Tag)
  const zielZeile = !ziehen?.bewegt ? null
    : ziehen.inhalt.art === "balken" ? (ziehen.inhalt.griff === "mitte" ? ziehen.ziel : null)
    : ziehen.inhalt.art === "ressource" ? (!ziehen.balken && ziehen.ziel?.startsWith("team:") ? ziehen.ziel : null)
    : ziehen.ziel;

  const reiheZeichnen = (r: Reihe) => {
    const s = zeileSchluessel(r.zeile);
    const liste = termine.filter((t) => inZeile(t, r.zeile)).map(vorschau).filter(sichtbar);
    const { bahn, anzahl } = bahnen(liste);
    const hoch = r.zeile.art === "person" ? 26 : 32;
    const hoehe = Math.max(1, anzahl) * hoch + 8;
    const weg = r.zeile.art === "person" ? abwesend.filter((x) => x.user_id === (r.zeile as { id: string }).id) : [];
    const team = r.zeile.art === "person" ? teams.find((t) => t.mitglieder.includes((r.zeile as { id: string }).id)) : undefined;
    const istZiel = zielZeile === s;
    return (
      <div key={s} className={cn("flex border-b", r.hell && "bg-muted/25")} style={{ width: LINKS + gesamt, minHeight: hoehe }}>
        <div className={cn("sticky left-0 z-20 flex shrink-0 items-center border-r px-2", r.hell ? "bg-muted" : "bg-card", r.stufe === 1 && "pl-7", istZiel && "ring-2 ring-inset ring-primary")}
          style={{ width: LINKS }} data-reihe={s}>{r.kopf}</div>
        <div className={cn("relative", istZiel && "bg-primary/10 ring-2 ring-inset ring-primary")} style={{ width: gesamt }} data-reihe={s}
          onPointerDown={darf ? (e) => { if (e.target !== e.currentTarget) return; const t = tagBei(e.clientX); if (t) beginne({ art: "neu", zeile: r.zeile, tag: t }, e); } : undefined}
          title={darf ? "Leere Tage aufziehen = neuer Einsatz" : undefined}>
          {weg.map((x) => {
            const lage = x.von && x.bis ? balkenLage(x.von, x.bis, start, tage.length) : null;
            if (!lage) return null;
            return (
              <div key={x.id} className="pointer-events-none absolute inset-y-1 z-[5] flex items-center overflow-hidden rounded border border-dashed border-muted-foreground/50 bg-muted px-1.5 text-xs font-medium text-muted-foreground"
                style={{ left: lage.links * breite + 1, width: lage.laenge * breite - 2 }}>
                {lage.laenge * breite > 50 ? ABWESENHEIT_ART[x.art as AbwesenheitArt]?.text ?? "Abwesend" : ""}
              </div>
            );
          })}
          {liste.map((t) => (
            <Balken key={t.id} t={t} lage={balkenLage(t.datum, t.bis_datum ?? t.datum, start, tage.length)!} breite={breite} top={4 + (bahn.get(t.id) ?? 0) * hoch} hoehe={hoch - 4}
              team={teams.find((x) => x.id === t.team_id)} blass={r.zeile.art === "person" && !!t.team_id && t.team_id === team?.id}
              projekt={projekte.find((p) => p.id === t.projekt_id)} fahrzeuge={fahrzeuge} konflikt={konfliktIds.has(t.id)} darf={darf}
              gezogen={!!ziehen?.bewegt && ziehen.inhalt.art === "balken" && ziehen.inhalt.id === t.id}
              ziel={!!ziehen?.bewegt && ziehen.inhalt.art === "ressource" && ziehen.balken === t.id}
              onGriff={(griff, e) => beginne({ art: "balken", id: t.id, griff, zeile: r.zeile, tag: tagBei(e.clientX) ?? t.datum }, e)} />
          ))}
          {ziehen?.bewegt && ziehen.inhalt.art === "neu" && zeileSchluessel(ziehen.inhalt.zeile) === s && (() => {
            const ende = tagBei(ziehen.x) ?? ziehen.inhalt.tag;
            const v = ziehen.inhalt.tag <= ende ? ziehen.inhalt.tag : ende, b = ziehen.inhalt.tag <= ende ? ende : ziehen.inhalt.tag;
            const lage = balkenLage(v, b, start, tage.length);
            return lage && <div className="pointer-events-none absolute inset-y-1 rounded border-2 border-dashed border-primary bg-primary/15" style={{ left: lage.links * breite, width: lage.laenge * breite }} />;
          })()}
        </div>
      </div>
    );
  };

  // Kopf: Monate/KW und Tage
  const monate: { text: string; laenge: number }[] = [];
  for (const t of tage) {
    const text = breite >= 40 ? `KW ${kw(t)} · ${isoZuDatum(t).toLocaleDateString("de-AT", { month: "long", year: "numeric" })}` : isoZuDatum(t).toLocaleDateString("de-AT", { month: "long", year: "numeric" });
    const schluessel = breite >= 40 ? text : t.slice(0, 7);
    const letzte = monate.at(-1);
    if (letzte && (letzte as { s?: string }).s === schluessel) letzte.laenge++;
    else monate.push(Object.assign({ text, laenge: 1 }, { s: schluessel }));
  }

  const z = ziehen;
  const chipText = (() => {
    if (!z?.bewegt) return "";
    const i = z.inhalt;
    if (i.art === "balken") {
      const t = termine.find((x) => x.id === i.id);
      if (!t) return "";
      const v = verschieben(t, i.griff, deltaTage(z));
      const wohin = i.griff === "mitte" && z.ziel && z.ziel !== zeileSchluessel(i.zeile) ? ` → ${zeileName(zeileAus(z.ziel))}` : "";
      const tage_ = tageZwischen(v.datum, v.bis_datum ?? v.datum) + 1;
      return `${z.kopie && i.griff === "mitte" ? "Kopie: " : ""}${kurz(v.datum)}${v.bis_datum ? ` – ${kurz(v.bis_datum)}` : ""} · ${tage_} ${tage_ === 1 ? "Tag" : "Tage"}${wohin}`;
    }
    if (i.art === "neu") {
      const ende = tagBei(z.x) ?? i.tag;
      const [v, b] = i.tag <= ende ? [i.tag, ende] : [ende, i.tag];
      return `Neu: ${kurz(v)}${b > v ? ` – ${kurz(b)}` : ""} · ${zeileName(i.zeile)}`;
    }
    if (i.art === "projekt") {
      const p = projekte.find((x) => x.id === i.id);
      const tag = tagBei(z.x);
      const zeile = z.ziel ? zeileName(zeileAus(z.ziel)) : "auf eine Zeile ziehen";
      return `${p?.nummer ?? ""} → ${zeile}${tag ? ` ab ${kurz(tag)}` : ""}`;
    }
    const wer = i.was === "person" ? name(mitarbeiter.find((m) => m.id === i.id)) : fahrzeuge.find((f) => f.id === i.id)?.name;
    const t = termine.find((x) => x.id === z.balken);
    if (t) return `${wer} → ${t.titel}`;
    const team = z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
    if (team) return i.was === "person" ? `${wer} → ins Team ${team.name}` : `Team ${team.name} fährt mit ${wer}`;
    return `${wer} → auf einen Einsatz oder ein Team ziehen`;
  })();

  return (
    <div className={cn("grid gap-3", seitenleiste && "xl:grid-cols-[minmax(0,1fr)_15rem]", ziehen && "select-none")}>
      <div className="min-w-0 space-y-2">
        {darf && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <button type="button" disabled={!rueck.length} onClick={() => void rueckgaengig()} title={rueck.length ? `${rueck.at(-1)?.text} (Strg+Z)` : undefined}
              className="h-9 rounded-md border bg-card px-3 text-sm font-medium text-foreground disabled:opacity-40">
              Rückgängig{rueck.length ? ` (${rueck.length})` : ""}
            </button>
            <span>Balken ziehen = verschieben (mit Strg: kopieren) · Ränder = länger/kürzer · leere Tage aufziehen = neu · Person oder Bus am Griff ⋮⋮ auf einen Einsatz oder ein Team ziehen · Projekt von rechts hereinziehen</span>
          </div>
        )}
        <div ref={bahnRef} className="relative max-h-[calc(100vh-15rem)] overflow-auto rounded-lg border bg-card" data-plantafel>
          <div className="relative" style={{ width: LINKS + gesamt }}>
            <div className="sticky top-0 z-30 border-b bg-card">
              <div className="flex border-b text-xs font-medium">
                <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LINKS }} />
                {monate.map((m, i) => <div key={i} className="shrink-0 truncate border-r px-1.5 py-1" style={{ width: m.laenge * breite }}>{m.laenge * breite > 50 ? m.text : ""}</div>)}
              </div>
              <div className="flex text-xs">
                <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LINKS }} />
                <div ref={kopfRef} className="flex">
                  {tage.map((t) => (
                    <div key={t} title={feiertagName(t) || undefined}
                      className={cn("shrink-0 border-r py-1 text-center leading-tight", frei(t) && "bg-muted text-muted-foreground", t === heute && "font-bold text-primary", wochentag(t) === 6 && "border-r-foreground/20")}
                      style={{ width: breite }}>
                      {breite >= 40 ? <>{WT[wochentag(t)]} {Number(t.slice(8))}.{breite >= 80 ? `${Number(t.slice(5, 7))}.` : ""}</> : <><span className="block text-[10px]">{WT[wochentag(t)][0]}</span>{Number(t.slice(8))}</>}
                      {breite >= 80 && feiertagName(t) && <span className="block truncate px-1 text-[10px] font-normal">{feiertagName(t)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Wochenende, Feiertag und heute als Hintergrund */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: LINKS, width: gesamt }}>
              {tage.map((t, i) => (frei(t) || t === heute) ? <div key={t} className={cn("absolute bottom-0 top-0", frei(t) ? "bg-muted/60" : "bg-primary/5")} style={{ left: i * breite, width: breite }} /> : null)}
              {tage.map((t, i) => wochentag(t) === 0 && i > 0 ? <div key={`w${t}`} className="absolute bottom-0 top-0 border-l border-foreground/10" style={{ left: i * breite }} /> : null)}
            </div>
            <div className="relative z-[1]">
              {abschnitte.filter((x) => x.reihen.length).map((ab) => (
                <Fragment key={ab.titel}>
                  <div className="sticky left-0 z-20 flex items-center gap-1.5 border-b bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground" style={{ width: LINKS }}>
                    {ab.icon}{ab.titel}
                  </div>
                  {ab.reihen.map(reiheZeichnen)}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {seitenleiste && (
        <Seitenleiste tag={tage.includes(heute) ? heute : tage[0]} termine={termine} abwesend={abwesend} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge}
          projekte={projekte.filter((p) => p.status === "aktiv" || p.status === "angebot")} darf={darf}
          onZiehen={(i, e) => beginne(i, e)} />
      )}

      {z?.bewegt && (
        <div ref={chipRef} className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs font-medium shadow-sm"
          style={{ left: z.x + 14, top: z.y + 12 }}>{chipText}</div>
      )}
    </div>
  );
}

function kw(iso: string): number {
  const d = isoZuDatum(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

function Balken({
  t, lage, breite, top, hoehe, team, blass, projekt, fahrzeuge, konflikt, darf, gezogen, ziel, onGriff,
}: {
  t: Termin;
  lage: { links: number; laenge: number; offenLinks: boolean; offenRechts: boolean };
  breite: number;
  top: number;
  hoehe: number;
  team?: Team;
  blass: boolean;
  projekt?: Projekt;
  fahrzeuge: Fahrzeug[];
  konflikt: boolean;
  darf: boolean;
  gezogen: boolean;
  ziel: boolean;
  onGriff: (g: Griff, e: React.PointerEvent) => void;
}) {
  const w = lage.laenge * breite;
  const fz = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean);
  const farbe = team ? TEAM_FARBEN[team.farbe]?.klasse : "border-primary/40 bg-primary-soft text-primary";
  const text = `${projekt ? `${projekt.nummer.slice(-4)} ` : ""}${t.titel}`;
  return (
    <div data-balken={t.id}
      title={[t.titel, projekt?.nummer, `${datumText(t.datum).slice(0, 6)}${t.bis_datum ? ` – ${datumText(t.bis_datum).slice(0, 6)}` : ""}`, zeitText(t), fz.join(", "), `${t.mitarbeiter.length} Leute`].filter(Boolean).join(" · ")}
      onPointerDown={(e) => onGriff("mitte", e)}
      className={cn("absolute z-[6] flex items-center gap-1 overflow-hidden border px-1.5 text-xs leading-tight", farbe,
        lage.offenLinks ? "rounded-l-none border-l-0" : "rounded-l-md", lage.offenRechts ? "rounded-r-none border-r-0" : "rounded-r-md",
        blass && "opacity-55", t.status === "erledigt" && "opacity-50", konflikt && "ring-2 ring-status-rot-fg",
        gezogen && "z-20 shadow-md ring-2 ring-foreground/50", ziel && "ring-2 ring-primary",
        darf ? (gezogen ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer")}
      style={{ left: lage.links * breite + 1, width: w - 2, top, height: hoehe }}>
      {w > 26 && (
        <span className="min-w-0 truncate">
          <span className="font-semibold">{konflikt ? "⚠ " : ""}{t.dringend && t.status !== "erledigt" ? "! " : ""}{t.status === "erledigt" ? "✓ " : ""}{text}</span>
          {w > 200 && <span className="opacity-75"> · {zeitText(t)}</span>}
        </span>
      )}
      {w > 150 && (fz.length > 0 || t.mitarbeiter.length > 0) && (
        <span className="ml-auto flex shrink-0 items-center gap-1 opacity-75">
          <Users className="h-3 w-3" />{t.mitarbeiter.length}
          {fz.length > 0 && <><Truck className="ml-0.5 h-3 w-3" /><span className="max-w-[7rem] truncate">{fz.join(", ")}</span></>}
        </span>
      )}
      {darf && w > 24 && (
        <>
          <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-foreground/15" onPointerDown={(e) => onGriff("links", e)} aria-hidden />
          <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-foreground/15" onPointerDown={(e) => onGriff("rechts", e)} aria-hidden />
        </>
      )}
    </div>
  );
}

function TeamKopf({ team, mitarbeiter, fahrzeuge, darf, offen, onKlappen, onBus }: {
  team: Team; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; darf: boolean; offen: boolean; onKlappen: () => void; onBus: (id: string | null) => void;
}) {
  const leiter = mitarbeiter.find((m) => m.id === team.leiter_id);
  const busse = fahrzeuge.filter((f) => f.art === "bus" || f.art === "pkw" || f.id === team.fahrzeug_id);
  return (
    <span className="flex w-full min-w-0 items-center gap-1.5 py-1">
      <button type="button" onClick={onKlappen} aria-label={offen ? `${team.name} zuklappen` : `${team.name} aufklappen`} aria-expanded={offen}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background">
        <ChevronDown className={cn("h-4 w-4 transition-transform", !offen && "-rotate-90")} />
      </button>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TEAM_FARBEN[team.farbe]?.punkt ?? "bg-slate-500")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{team.name}{leiter && !team.name.includes(leiter.vorname ?? "") ? <span className="font-normal text-muted-foreground"> · {leiter.vorname}</span> : null}</span>
        <span className="flex items-center gap-1">
          <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {darf ? (
            <select value={team.fahrzeug_id ?? ""} onChange={(e) => onBus(e.target.value || null)} aria-label={`Bus von ${team.name}`}
              className="h-6 min-w-0 max-w-[10rem] truncate rounded border bg-card px-1 text-xs" onPointerDown={(e) => e.stopPropagation()}>
              <option value="">kein Bus</option>
              {busse.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          ) : <span className="truncate text-xs text-muted-foreground">{fahrzeuge.find((f) => f.id === team.fahrzeug_id)?.name ?? "kein Bus"}</span>}
          <span className="ml-auto text-xs text-muted-foreground">{team.mitglieder.length}</span>
        </span>
      </span>
    </span>
  );
}

function PersonKopf({ m, darf, onGriff }: { m: Profil; darf: boolean; onGriff: (e: React.PointerEvent) => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {darf && <span className="shrink-0 cursor-grab text-muted-foreground" onPointerDown={onGriff} title={`${name(m)} auf einen Einsatz ziehen`}><GripVertical className="h-4 w-4" /></span>}
      <Avatar profil={m} className="h-6 w-6 text-[10px]" />
      <span className="truncate text-sm">{name(m)}</span>
    </span>
  );
}

function FahrzeugKopf({ f, heute, darf, onGriff }: { f: Fahrzeug; heute: string; darf: boolean; onGriff: (e: React.PointerEvent) => void }) {
  const faellig = faelligkeiten(f, heute);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {darf && <span className="shrink-0 cursor-grab text-muted-foreground" onPointerDown={onGriff} title={`${f.name} auf einen Einsatz ziehen`}><GripVertical className="h-4 w-4" /></span>}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{f.name}</span>
          {faellig.some((x) => x.ueberfaellig) && <span title={faellig.map((x) => x.was).join(", ") + " überfällig"}><AlertTriangle className="h-3.5 w-3.5 text-status-rot-fg" /></span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{[FAHRZEUG_ART[f.art as FahrzeugArt]?.text, f.kennzeichen, f.gemietet && "gemietet"].filter(Boolean).join(" · ")}</span>
      </span>
    </span>
  );
}

/** Rechts: Projekte zum Einplanen, wer und was heute frei ist — alles zum Hereinziehen */
function Seitenleiste({
  tag, termine, abwesend, mitarbeiter, fahrzeuge, projekte, darf, onZiehen,
}: {
  tag: string;
  termine: Termin[];
  abwesend: { user_id: string | null; von: string | null; bis: string | null }[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: Projekt[];
  darf: boolean;
  onZiehen: (i: Inhalt, e: React.PointerEvent) => void;
}) {
  const [suche, setSuche] = useState("");
  const amTagListe = termine.filter((t) => amTag(t, tag));
  const belegt = new Set(amTagListe.flatMap((t) => [...t.mitarbeiter, ...t.fahrzeuge]));
  const weg = new Set(abwesend.filter((a) => a.von && a.bis && a.von <= tag && a.bis >= tag).map((a) => a.user_id));
  const freiLeute = mitarbeiter.filter((m) => !belegt.has(m.id) && !weg.has(m.id));
  const freiFz = fahrzeuge.filter((f) => !belegt.has(f.id));
  const q = suche.trim().toLowerCase();
  const pListe = projekte.filter((p) => !q || `${p.nummer} ${p.name} ${p.ort ?? ""}`.toLowerCase().includes(q)).slice(0, 40);
  const chip = cn("flex min-h-9 touch-none items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium", darf && "cursor-grab hover:border-primary/50");
  return (
    <aside className="space-y-3">
      <section className="rounded-lg border bg-card p-3">
        <p className="pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Projekte einplanen</p>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Projekt suchen …" aria-label="Projekt suchen"
          className="mb-2 h-9 w-full rounded-md border bg-background px-2.5 text-sm" />
        <ul className="max-h-[22rem] space-y-1 overflow-y-auto">
          {pListe.map((p) => (
            <li key={p.id} onPointerDown={darf ? (e) => onZiehen({ art: "projekt", id: p.id }, e) : undefined} data-projekt-ziehen={p.id}
              className={cn("flex touch-none items-center gap-2 rounded-md border px-2 py-1.5 text-xs", darf && "cursor-grab hover:border-primary/50")}>
              <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><span className="block font-semibold">{p.nummer}</span><span className="block truncate">{p.name}</span></span>
            </li>
          ))}
        </ul>
        {darf && <p className="mt-2 text-xs text-muted-foreground">Auf ein Team, eine Person oder einen Bus ziehen — eingeplant bis Freitag.</p>}
      </section>
      <section className="rounded-lg border bg-card p-3">
        <p className="pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Frei am {datumText(tag).slice(0, 6)}</p>
        <div className="flex flex-wrap gap-1.5">
          {freiLeute.map((m) => (
            <span key={m.id} className={chip} onPointerDown={darf ? (e) => onZiehen({ art: "ressource", was: "person", id: m.id }, e) : undefined}>
              <Avatar profil={m} className="h-6 w-6 text-[10px]" />{m.vorname || m.nachname}
            </span>
          ))}
          {freiFz.map((f) => (
            <span key={f.id} className={cn(chip, "px-3")} onPointerDown={darf ? (e) => onZiehen({ art: "ressource", was: "fahrzeug", id: f.id }, e) : undefined}>
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />{f.name}
            </span>
          ))}
          {!freiLeute.length && !freiFz.length && <p className="text-xs text-muted-foreground">Alle eingeteilt.</p>}
        </div>
        {darf && <p className="mt-2 text-xs text-muted-foreground">Auf einen Einsatz-Balken ziehen = dazuholen.</p>}
      </section>
    </aside>
  );
}
