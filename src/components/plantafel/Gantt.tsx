import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, Clock, FolderKanban, GripVertical, HelpCircle, MapPin, Pencil, Plus, Search, Trash2, Truck, Undo2, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { fehlerText } from "@/components/stamm/stammDaten";
import { FahrzeugDialog } from "@/components/fuhrpark/FahrzeugDialog";
import { FAHRZEUG_ICON } from "@/components/fuhrpark/fuhrparkDaten";
import { datum as datumText, isoZuDatum, tageDazu, uhrzeit } from "@/lib/format";
import {
  ablegen, amTag, ANSICHTEN, arbeitsStuecke, bahnen, balkenLage, inZeile, projektFarbe, tageZwischen, textAuf, verschieben, type Ansicht, type Griff, type Zeile,
} from "@/lib/plantafel";
import { feiertagName } from "@/lib/zeitkonto";
import {
  ABWESENHEIT_ART, FAHRZEUG_ART, TEAM_FARBEN, name, type AbwesenheitArt, type Fahrzeug, type FahrzeugArt, type Profil, type Projekt, type Team, type Termin,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Plantafel als Gantt über die ganze Breite (Vorbild Steinbrecher-Ressourcenplanung):
 * links die Teams (mit ihrem Bus) und ihre Leute, Leute ohne Team, Geräte & Fahrzeuge
 * (Steiger, Anhänger, Maschinen, Messgeräte, Busse ohne Team) und „Nicht eingeteilt“,
 * rechts die Tage. Jeder Balken trägt die Farbe seines Projekts; Wochenende und
 * Feiertage bleiben Lücken. Der Bus eines Teams hat keine eigene Zeile — er gehört zum Team.
 * - Antippen = kleines Fenster am Balken (Bearbeiten, Projekt, erledigt, löschen)
 * - Ziehen = verschieben, auch in eine andere Zeile (Strg/Alt = kopieren)
 * - Ränder ziehen = früher anfangen / länger; leere Tage aufziehen = neuer Einsatz
 * - Oben „Noch nicht eingeplant“: Projekt auf eine Zeile ziehen = bis Freitag eingeplant
 * - Person am Griff ⋮⋮ auf einen Balken = dazuholen, auf ein Team = ins Team,
 *   auf „Neues Team“ = eigenes Team; „+ Neues Team“ legt eines mit Namen an
 * - Gerät am Griff ⋮⋮ auf einen Balken = mitnehmen; Bus/PKW auf ein Team = Bus des Teams
 * Alles wirkt sofort und lässt sich mit Strg+Z zurücknehmen. Am Tablet: halten = ziehen.
 */

const WT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const LINKS = 280;
const wochentag = (iso: string) => (isoZuDatum(iso).getDay() + 6) % 7;
const frei = (iso: string) => wochentag(iso) >= 5 || !!feiertagName(iso);
const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}–${t.bis ? uhrzeit(t.bis) : ""}`);
const zeileSchluessel = (z: Zeile) => (z.art === "offen" ? "offen" : `${z.art}:${z.id}`);
const zeileAus = (s: string): Zeile => (s === "offen" ? { art: "offen" } : { art: s.split(":")[0] as "team", id: s.split(":")[1] });
const kurz = (iso: string) => `${WT[wochentag(iso)]} ${datumText(iso).slice(0, 6)}`;
const ZU_KEY = "elektro.plantafel.zu";
const STREIFEN_KEY = "elektro.plantafel.streifen";
const GERAETE = "geraete";
const ART_FOLGE: FahrzeugArt[] = ["steiger", "anhaenger", "maschine", "messgeraet", "bus", "pkw"];

type Inhalt =
  | { art: "balken"; id: string; griff: Griff; zeile: Zeile; tag: string }
  | { art: "neu"; zeile: Zeile; tag: string }
  | { art: "projekt"; id: string }
  | { art: "person"; id: string }
  | { art: "fahrzeug"; id: string };
/** ziel = Zeile unter dem Zeiger, balken = Einsatz unter dem Zeiger, neuTeam = über „Neues Team“, kopie = Strg/Alt gedrückt */
type Ziehen = {
  inhalt: Inhalt; startX: number; startY: number; x: number; y: number; bewegt: boolean; sx0: number; sx: number;
  ziel: string | null; balken: string | null; neuTeam: boolean; kopie: boolean;
};
type Rueck = { text: string; zurueck: () => Promise<void> };

const FELDER = ["datum", "bis_datum", "mitarbeiter", "fahrzeuge", "team_id"] as const;
type Felder = Pick<Termin, (typeof FELDER)[number]>;
const felderVon = (t: Termin): Felder => ({ datum: t.datum, bis_datum: t.bis_datum, mitarbeiter: t.mitarbeiter, fahrzeuge: t.fahrzeuge, team_id: t.team_id });

export function Gantt({
  start, ansicht, termine, termineKey, teams, mitarbeiter, fahrzeuge, projekte, eingeplant, abwesend, konfliktIds, darf, heute, onBearbeiten, onNeu, className,
}: {
  start: string;
  ansicht: Ansicht;
  termine: Termin[];
  termineKey: unknown[];
  teams: Team[];
  mitarbeiter: Profil[];
  fahrzeuge: Fahrzeug[];
  projekte: Projekt[];
  /** Projekte mit einem Einsatz ab heute */
  eingeplant: Set<string>;
  abwesend: { id: string | null; user_id: string | null; von: string | null; bis: string | null; art: string | null }[];
  konfliktIds: Set<string>;
  darf: boolean;
  heute: string;
  onBearbeiten: (t: Termin) => void;
  onNeu: (v: { datum: string; bisDatum?: string; zeile: Zeile }) => void;
  className?: string;
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
  const [info, setInfo] = useState<{ id: string; x: number; y: number } | null>(null);
  const [zu, setZu] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(ZU_KEY) ?? "[]"); } catch { return []; } });
  const zuSetzen = (neu: string[]) => { setZu(neu); try { localStorage.setItem(ZU_KEY, JSON.stringify(neu)); } catch { /* egal */ } };
  const umklappen = (id: string) => zuSetzen(zu.includes(id) ? zu.filter((x) => x !== id) : [...zu, id]);
  const alleZu = teams.length > 0 && teams.every((t) => zu.includes(t.id));
  const [neuesGeraet, setNeuesGeraet] = useState(false);

  // Zur heutigen Woche scrollen, wenn sie nicht vorne steht
  useEffect(() => {
    const i = tage.indexOf(heute);
    if (bahnRef.current && i > 6) bahnRef.current.scrollLeft = (i - 3) * breite;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, ansicht]);

  // ------------------------------------------------------------- Speichern
  const cacheSetzen = (f: (liste: Termin[]) => Termin[]) => qc.setQueryData<Termin[]>(termineKey, (alt) => f(alt ?? []));
  const neuLaden = () => qc.invalidateQueries({ queryKey: ["termine"] });

  /** Ändern: sofort zeichnen, dann speichern; bei Fehler zurück */
  const aendern = async (t: Termin, neu: Partial<Termin>, text: string, rueckgaengig = true) => {
    const alt = Object.fromEntries(Object.keys(neu).map((k) => [k, t[k as keyof Termin]])) as Partial<Termin>;
    cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...neu } : x)));
    const { error } = await supabase.from("termine").update(neu).eq("id", t.id);
    if (error) {
      cacheSetzen((l) => l.map((x) => (x.id === t.id ? { ...x, ...alt } : x)));
      toast.error("Nicht gespeichert", { description: fehlerText(error) });
      return false;
    }
    if (rueckgaengig) setRueck((r) => [...r.slice(-29), { text, zurueck: async () => { await aendern({ ...t, ...neu }, alt, "", false); } }]);
    void neuLaden();
    return true;
  };

  const anlegen = async (werte: Partial<Termin> & { titel: string; datum: string }, text: string) => {
    const { data, error } = await supabase.from("termine").insert(werte).select("id").single();
    if (error) { toast.error("Nicht gespeichert", { description: fehlerText(error) }); return; }
    setRueck((r) => [...r.slice(-29), {
      text,
      zurueck: async () => { const { error: e } = await supabase.from("termine").delete().eq("id", data.id); if (e) toast.error("Nicht zurückgenommen", { description: fehlerText(e) }); void neuLaden(); },
    }]);
    void neuLaden();
  };

  const loeschen = async (t: Termin) => {
    const { error } = await supabase.from("termine").delete().eq("id", t.id);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    const { id: _id, created_at: _c, ...rest } = t;
    setRueck((r) => [...r.slice(-29), { text: `${t.titel} gelöscht`, zurueck: async () => { await supabase.from("termine").insert({ ...rest, id: t.id }); void neuLaden(); } }]);
    toast(`${t.titel} gelöscht`, { action: { label: "Rückgängig", onClick: () => void rueckgaengig() } });
    setInfo(null);
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

  /** Neues Team direkt auf der Tafel — mit Namen oder aus einer hereingezogenen Person */
  const teamAnlegen = async (titel: string, person?: string) => {
    const farbe = Object.keys(TEAM_FARBEN).find((f) => !teams.some((t) => t.farbe === f)) ?? "blau";
    const vorher = person ? teams.filter((t) => t.mitglieder.includes(person)).map((t) => ({ id: t.id, mitglieder: t.mitglieder })) : [];
    const { data, error } = await supabase.from("teams")
      .insert({ name: titel, farbe, mitglieder: person ? [person] : [], leiter_id: person ?? null, reihenfolge: teams.length })
      .select("id").single();
    if (error) { toast.error("Team nicht angelegt", { description: fehlerText(error) }); return false; }
    // fest ins neue Team — wie beim Hereinziehen in ein bestehendes
    for (const t of vorher) await supabase.from("teams").update({ mitglieder: t.mitglieder.filter((x) => x !== person) }).eq("id", t.id);
    setRueck((r) => [...r.slice(-29), {
      text: `Team ${titel} angelegt`,
      zurueck: async () => {
        for (const t of vorher) await supabase.from("teams").update({ mitglieder: t.mitglieder }).eq("id", t.id);
        const { error: e } = await supabase.from("teams").delete().eq("id", data.id);
        if (e) toast.error("Nicht zurückgenommen", { description: fehlerText(e) });
        void qc.invalidateQueries({ queryKey: ["teams"] });
      },
    }]);
    toast.success(`Team ${titel} angelegt`, { description: "Leute am Griff ⋮⋮ hereinziehen, den Bus rechts im Team wählen" });
    void qc.invalidateQueries({ queryKey: ["teams"] });
    return true;
  };

  /** Gerät oder Fahrzeug auf einen Einsatz (mitnehmen) oder als Bus auf ein Team */
  const geraetAblegen = async (id: string, z: Ziehen) => {
    const f = fahrzeuge.find((x) => x.id === id);
    if (!f) return;
    const t = termine.find((x) => x.id === z.balken);
    if (t) {
      if (t.fahrzeuge.includes(id)) { toast(`${f.name} ist bei ${t.titel} schon dabei`); return; }
      if (await aendern(t, { fahrzeuge: [...t.fahrzeuge, id] }, `${f.name} → ${t.titel}`)) toast.success(`${f.name} → ${t.titel}`);
      return;
    }
    const team = z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
    if (team && (f.art === "bus" || f.art === "pkw")) { await busWechseln(team, id); return; }
    toast(team ? `${FAHRZEUG_ART[f.art]?.text ?? "Gerät"} auf einen Einsatz ziehen — fest ans Team gehen nur Bus und PKW` : "Auf einen Einsatz ziehen = mitnehmen");
  };

  // ------------------------------------------------------------- Ziehen
  const zielUnter = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return {
      ziel: (el?.closest("[data-reihe]") as HTMLElement | null)?.dataset.reihe ?? null,
      balken: (el?.closest("[data-balken]") as HTMLElement | null)?.dataset.balken ?? null,
      neuTeam: !!el?.closest("[data-neues-team]"),
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
    const z0: Ziehen = { inhalt, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, bewegt: false, sx0: sx, sx, ziel: null, balken: null, neuTeam: false, kopie: false };
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
      if (!z.bewegt) { setInfo((alt) => (alt?.id === t.id ? null : { id: t.id, x: z.x, y: z.y })); return; }
      if (!darf) return;
      const d = deltaTage(z);
      if (i.griff !== "mitte") {
        if (d) await aendern(t, verschieben(t, i.griff, d), `${t.titel}: ${i.griff === "rechts" ? "Ende" : "Beginn"} verschoben`);
        return;
      }
      if (z.neuTeam) { toast("Einen Einsatz auf ein bestehendes Team ziehen — das neue Team zuerst anlegen"); return; }
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
    if (i.art === "fahrzeug") { await geraetAblegen(i.id, z); return; }
    if (i.art === "person") {
      if (z.neuTeam) {
        const m = mitarbeiter.find((x) => x.id === i.id);
        const kurzName = m?.vorname || name(m);
        await teamAnlegen(teams.some((t) => t.name === kurzName) ? name(m) : kurzName, i.id);
        return;
      }
      const t = termine.find((x) => x.id === z.balken);
      const zielTeam = !t && z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
      if (zielTeam) { await teamWechseln(i.id, zielTeam); return; }
      if (!t) { toast("Auf einen Einsatz ziehen = dazuholen · auf ein Team ziehen = ins Team"); return; }
      if (t.mitarbeiter.includes(i.id)) return;
      await aendern(t, { mitarbeiter: [...t.mitarbeiter, i.id] }, `${name(mitarbeiter.find((m) => m.id === i.id))} → ${t.titel}`);
      return;
    }
    if (i.art === "projekt") {
      const tag = tagBei(z.x);
      const zeilenZiel = z.ziel;
      if (!tag || !zeilenZiel) { toast("Auf ein Team, eine Person oder ein Gerät in der Tafel ziehen"); return; }
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
    const stand = (z: Ziehen) => `${z.bewegt}|${deltaTage(z)}|${z.ziel}|${z.balken}|${z.neuTeam}|${z.kopie}|${tagBei(z.x)}`;
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
        const vy = z.y < r.top + 90 && z.y > r.top ? -10 : z.y > r.bottom - 30 && z.y < r.bottom + 10 ? 10 : 0;
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
  type Reihe = { zeile: Zeile; kopf: ReactNode; art: "team" | "person" | "fahrzeug" | "offen"; eingerueckt?: boolean };
  const teamBusse = new Set(teams.map((t) => t.fahrzeug_id).filter(Boolean));
  const geraete = fahrzeuge.filter((f) => !teamBusse.has(f.id)).sort((x, y) => ART_FOLGE.indexOf(x.art as FahrzeugArt) - ART_FOLGE.indexOf(y.art as FahrzeugArt));
  const geraeteZu = zu.includes(GERAETE);
  const reihen: (Reihe | { titel: string; rechts?: ReactNode; klappen?: () => void; offen?: boolean } | { neuesTeam: true })[] = [
    ...teams.flatMap((team): Reihe[] => [
      { zeile: { art: "team", id: team.id }, art: "team",
        kopf: <TeamKopf team={team} mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} darf={darf} offen={!zu.includes(team.id)} onKlappen={() => umklappen(team.id)} onBus={(id) => void busWechseln(team, id)} /> },
      ...(zu.includes(team.id) ? [] : team.mitglieder.map((id) => mitarbeiter.find((m) => m.id === id)).filter((m): m is Profil => !!m).map((m): Reihe => ({
        zeile: { art: "person", id: m.id }, art: "person", eingerueckt: true,
        kopf: <PersonKopf m={m} darf={darf} onGriff={(e) => beginne({ art: "person", id: m.id }, e)} />,
      }))),
    ]),
    ...(darf ? [{ neuesTeam: true as const }] : []),
    ...(mitarbeiter.some((m) => !inTeam.has(m.id)) ? [{ titel: "Ohne Team" }] : []),
    ...mitarbeiter.filter((m) => !inTeam.has(m.id)).map((m): Reihe => ({
      zeile: { art: "person", id: m.id }, art: "person",
      kopf: <PersonKopf m={m} darf={darf} onGriff={(e) => beginne({ art: "person", id: m.id }, e)} />,
    })),
    ...(geraete.length || darf ? [{
      titel: "Geräte & Fahrzeuge", offen: !geraeteZu, klappen: () => umklappen(GERAETE),
      rechts: darf ? (
        <button type="button" onClick={() => setNeuesGeraet(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> Gerät
        </button>
      ) : undefined,
    }] : []),
    ...(geraeteZu ? [] : geraete.map((f): Reihe => ({
      zeile: { art: "fahrzeug", id: f.id }, art: "fahrzeug",
      kopf: <FahrzeugKopf f={f} darf={darf} onGriff={(e) => beginne({ art: "fahrzeug", id: f.id }, e)} />,
    }))),
    { zeile: { art: "offen" }, art: "offen", kopf: <span className="text-sm font-medium text-muted-foreground">Nicht eingeteilt</span> },
  ];

  const sichtbar = (t: Termin) => !!balkenLage(t.datum, t.bis_datum ?? t.datum, start, tage.length);
  // Während des Ziehens bleibt der gezogene Balken in seiner Zeile (Vorschau verschiebt nur den Tag)
  const zielZeile = !ziehen?.bewegt ? null
    : ziehen.inhalt.art === "balken" ? (ziehen.inhalt.griff === "mitte" ? ziehen.ziel : null)
    : ziehen.inhalt.art === "person" || ziehen.inhalt.art === "fahrzeug" ? (!ziehen.balken && ziehen.ziel?.startsWith("team:") ? ziehen.ziel : null)
    : ziehen.ziel;
  const freiIndex = (i: number) => frei(tage[i] ?? tageDazu(start, i));

  const reiheZeichnen = (r: Reihe) => {
    const s = zeileSchluessel(r.zeile);
    const team = r.zeile.art === "person" ? teams.find((t) => t.mitglieder.includes((r.zeile as { id: string }).id)) : undefined;
    const alle = termine.filter((t) => inZeile(t, r.zeile)).map(vorschau).filter(sichtbar);
    // Einsätze des eigenen Teams stehen oben voll — in der Personenzeile nur als dünner Strich
    const mitTeam = (t: Termin) => r.zeile.art === "person" && !!t.team_id && t.team_id === team?.id;
    const liste = alle.filter((t) => !mitTeam(t));
    const striche = alle.filter(mitTeam);
    const { bahn, anzahl } = bahnen(liste);
    const hoch = r.art === "team" ? 30 : 26;
    const hoehe = Math.max(1, anzahl) * hoch + 6;
    const weg = r.zeile.art === "person" ? abwesend.filter((x) => x.user_id === (r.zeile as { id: string }).id) : [];
    const istZiel = zielZeile === s;
    return (
      <div key={s} className={cn("flex", r.art === "team" ? "border-t border-border" : "border-t border-dashed border-border/70")} style={{ width: LINKS + gesamt, minHeight: hoehe }}>
        <div className={cn("sticky left-0 z-20 flex shrink-0 items-center border-r px-2", r.art === "team" ? "bg-muted" : "bg-card", r.eingerueckt && "pl-8", istZiel && "ring-2 ring-inset ring-primary")}
          style={{ width: LINKS }} data-reihe={s}>{r.kopf}</div>
        <div className={cn("relative", r.art === "team" && "bg-muted/30", istZiel && "bg-primary/10 ring-2 ring-inset ring-primary")} style={{ width: gesamt }} data-reihe={s}
          onPointerDown={darf ? (e) => { if (e.target !== e.currentTarget) return; setInfo(null); const t = tagBei(e.clientX); if (t) beginne({ art: "neu", zeile: r.zeile, tag: t }, e); } : undefined}
          title={darf ? "Leere Tage aufziehen = neuer Einsatz" : undefined}>
          {weg.map((x) => {
            const lage = x.von && x.bis ? balkenLage(x.von, x.bis, start, tage.length) : null;
            if (!lage) return null;
            const art = ABWESENHEIT_ART[x.art as AbwesenheitArt];
            return arbeitsStuecke(lage, freiIndex).map((st) => (
              <div key={`${x.id}${st.links}`} className="pointer-events-none absolute inset-y-[3px] z-[5] flex items-center overflow-hidden rounded border border-dashed border-slate-400 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,hsl(var(--card))_6px_12px)] px-1.5 text-[11px] font-semibold text-slate-600"
                style={{ left: st.links * breite + 1, width: st.laenge * breite - 2 }}>
                {st.laenge * breite > 60 ? art?.text ?? "Abwesend" : art?.kurz ?? "–"}
              </div>
            ));
          })}
          {striche.map((t) => arbeitsStuecke(balkenLage(t.datum, t.bis_datum ?? t.datum, start, tage.length)!, freiIndex).map((st) => (
            <div key={`${t.id}${st.links}`} data-balken={t.id} title={`${t.titel} · mit dem Team`} onPointerDown={(e) => beginne({ art: "balken", id: t.id, griff: "mitte", zeile: { art: "team", id: t.team_id! }, tag: tagBei(e.clientX) ?? t.datum }, e)}
              className="absolute bottom-1 z-[4] h-1.5 cursor-pointer rounded-full opacity-60 hover:opacity-100"
              style={{ left: st.links * breite + 4, width: st.laenge * breite - 8, backgroundColor: projektFarbe(projekte.find((p) => p.id === t.projekt_id)) }} />
          )))}
          {liste.map((t) => (
            <Balken key={t.id} t={t} lage={balkenLage(t.datum, t.bis_datum ?? t.datum, start, tage.length)!} freiIndex={freiIndex} breite={breite} top={3 + (bahn.get(t.id) ?? 0) * hoch} hoehe={hoch - 4}
              projekt={projekte.find((p) => p.id === t.projekt_id)} konflikt={konfliktIds.has(t.id)} darf={darf} offen={info?.id === t.id}
              gezogen={!!ziehen?.bewegt && ziehen.inhalt.art === "balken" && ziehen.inhalt.id === t.id}
              ziel={!!ziehen?.bewegt && (ziehen.inhalt.art === "person" || ziehen.inhalt.art === "fahrzeug") && ziehen.balken === t.id}
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

  // Kopf: Monat, KW, Tage (mit „x frei“)
  const gruppen = (schluessel: (t: string) => string, text: (t: string) => string) => {
    const liste: { s: string; text: string; laenge: number }[] = [];
    for (const t of tage) {
      const s = schluessel(t);
      const letzte = liste.at(-1);
      if (letzte?.s === s) letzte.laenge++;
      else liste.push({ s, text: text(t), laenge: 1 });
    }
    return liste;
  };
  const monate = gruppen((t) => t.slice(0, 7), (t) => isoZuDatum(t).toLocaleDateString("de-AT", { month: "long", year: "numeric" }));
  const wochen = gruppen((t) => `${kw(t)}`, (t) => `KW ${kw(t)}`);
  const freiAm = (tag: string) => {
    const belegt = new Set(termine.filter((t) => amTag(t, tag)).flatMap((t) => t.mitarbeiter));
    const weg = new Set(abwesend.filter((x) => x.von && x.bis && x.von <= tag && x.bis >= tag).map((x) => x.user_id));
    return mitarbeiter.filter((m) => !belegt.has(m.id) && !weg.has(m.id));
  };
  const heuteIndex = tage.indexOf(heute);

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
      const zeile = z.ziel ? zeileName(zeileAus(z.ziel)) : "auf ein Team oder eine Person ziehen";
      return `${p?.nummer ?? ""} → ${zeile}${tag ? ` ab ${kurz(tag)}` : ""}`;
    }
    if (i.art === "fahrzeug") {
      const f = fahrzeuge.find((x) => x.id === i.id);
      const t = termine.find((x) => x.id === z.balken);
      if (t) return `${f?.name} → ${t.titel}`;
      const team = z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
      if (team && (f?.art === "bus" || f?.art === "pkw")) return `${f.name} → Bus von Team ${team.name}`;
      return `${f?.name} → auf einen Einsatz ziehen`;
    }
    const wer = name(mitarbeiter.find((m) => m.id === i.id));
    if (z.neuTeam) return `${wer} → neues Team`;
    const t = termine.find((x) => x.id === z.balken);
    if (t) return `${wer} → ${t.titel}`;
    const team = z.ziel?.startsWith("team:") ? teams.find((x) => x.id === z.ziel!.slice(5)) : undefined;
    if (team) return `${wer} → ins Team ${team.name}`;
    return `${wer} → auf einen Einsatz oder ein Team ziehen`;
  })();

  const infoTermin = info ? termine.find((t) => t.id === info.id) : undefined;

  return (
    <div className={cn("flex min-h-0 flex-col", ziehen && "select-none", className)}>
      <Streifen projekte={projekte} eingeplant={eingeplant} darf={darf} onZiehen={(id, e) => beginne({ art: "projekt", id }, e)}
        rechts={(
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => zuSetzen(alleZu ? [] : teams.map((t) => t.id))}>
              {alleZu ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}{alleZu ? "Leute zeigen" : "Nur Teams"}
            </Button>
            {darf && (
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" disabled={!rueck.length} onClick={() => void rueckgaengig()} title={rueck.length ? `${rueck.at(-1)?.text} (Strg+Z)` : "Nichts zurückzunehmen"}>
                <Undo2 className="h-4 w-4" /> Rückgängig
              </Button>
            )}
            <span className="text-muted-foreground" title="Balken antippen = Details · ziehen = verschieben (mit Strg: kopieren) · Ränder = länger/kürzer · leere Tage aufziehen = neuer Einsatz · Projekt von oben auf ein Team ziehen · Person am Griff ⋮⋮ auf einen Einsatz, ein Team oder „Neues Team“ ziehen · Gerät am Griff ⋮⋮ auf einen Einsatz ziehen (Bus auf ein Team = Bus des Teams)">
              <HelpCircle className="h-4 w-4" aria-label="Bedienung" />
            </span>
          </div>
        )} />
      <div ref={bahnRef} className="relative min-h-0 flex-1 overflow-auto border-t bg-card" data-plantafel onScroll={() => info && setInfo(null)}>
        <div className="relative" style={{ width: LINKS + gesamt }}>
          {/* Kopf */}
          <div className="sticky top-0 z-30 border-b-2 border-foreground/15 bg-card">
            <div className="flex h-6 text-xs font-semibold">
              <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LINKS }} />
              {monate.map((m) => <div key={m.s} className="shrink-0 truncate border-r px-2 leading-6" style={{ width: m.laenge * breite }}>{m.laenge * breite > 70 ? m.text : ""}</div>)}
            </div>
            <div className="flex h-5 border-t text-[11px] text-muted-foreground">
              <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LINKS }} />
              {wochen.map((w) => <div key={w.s} className="shrink-0 truncate border-r px-2 leading-5" style={{ width: w.laenge * breite }}>{w.laenge * breite > 36 ? w.text : ""}</div>)}
            </div>
            <div className="flex border-t">
              <div className="sticky left-0 z-20 flex shrink-0 items-end border-r bg-card px-3 pb-1 text-xs font-medium text-muted-foreground" style={{ width: LINKS }}>Teams, Leute, Geräte</div>
              <div ref={kopfRef} className="flex">
                {tage.map((t, i) => {
                  const f = freiAm(t);
                  return (
                    <div key={t} title={[feiertagName(t), !frei(t) && f.length ? `Frei: ${f.map((m) => m.vorname || name(m)).join(", ")}` : ""].filter(Boolean).join(" · ") || undefined}
                      className={cn("relative shrink-0 border-r py-0.5 text-center leading-tight", frei(t) && "bg-amber-50 text-amber-900/70", wochentag(t) === 6 && "border-r-foreground/25")}
                      style={{ width: breite }}>
                      <span className={cn("block text-[10px] uppercase", t === heute && "font-bold text-red-600")}>{breite >= 40 ? WT[wochentag(t)] : WT[wochentag(t)][0]}</span>
                      <span className={cn("block text-sm font-semibold", t === heute && "mx-auto w-7 rounded-full bg-red-600 text-white")}>{Number(t.slice(8))}</span>
                      {!frei(t) && breite >= 28 && (
                        <span className={cn("block text-[10px] font-medium", f.length ? "text-status-gruen-fg" : "text-muted-foreground/60")}>
                          {f.length ? (breite >= 56 ? `${f.length} frei` : f.length) : "–"}
                        </span>
                      )}
                      {frei(t) && breite >= 28 && <span className="block text-[10px]">&nbsp;</span>}
                      {i === heuteIndex && <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-red-600" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Wochenende, Feiertag, Tageslinien und heute als Hintergrund */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: LINKS, width: gesamt }}>
            {tage.map((t, i) => frei(t) ? <div key={t} className={cn("absolute bottom-0 top-0", feiertagName(t) && wochentag(t) < 5 ? "bg-rose-50" : "bg-amber-50")} style={{ left: i * breite, width: breite }} /> : null)}
            {breite >= 24 && tage.map((t, i) => i > 0 ? <div key={`l${t}`} className={cn("absolute bottom-0 top-0 border-l", wochentag(t) === 0 ? "border-foreground/20" : "border-dotted border-border")} style={{ left: i * breite }} /> : null)}
            {breite < 24 && tage.map((t, i) => wochentag(t) === 0 && i > 0 ? <div key={`w${t}`} className="absolute bottom-0 top-0 border-l border-foreground/20" style={{ left: i * breite }} /> : null)}
            {heuteIndex >= 0 && <div className="absolute bottom-0 top-0 z-[8] w-0.5 bg-red-500/80" style={{ left: heuteIndex * breite + breite / 2 }} />}
          </div>
          <div className="relative z-[1] border-b">
            {reihen.map((r) => ("neuesTeam" in r ? (
              <div key="neues-team" className="flex border-t border-dashed" style={{ width: LINKS + gesamt }} data-neues-team>
                <div className={cn("sticky left-0 z-20 flex shrink-0 items-center border-r bg-card px-2", ziehen?.bewegt && ziehen.neuTeam && "ring-2 ring-inset ring-primary")} style={{ width: LINKS }}>
                  <NeuesTeam ziehen={!!ziehen?.bewegt && ziehen.inhalt.art === "person"} onAnlegen={teamAnlegen} />
                </div>
                <div className={cn(ziehen?.bewegt && ziehen.neuTeam && "bg-primary/10")} style={{ width: gesamt }} />
              </div>
            ) : "titel" in r ? (
              <div key={r.titel} className="flex border-t" style={{ width: LINKS + gesamt }}>
                <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r bg-card px-2 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground" style={{ width: LINKS }}>
                  {r.klappen ? (
                    <button type="button" onClick={r.klappen} aria-expanded={r.offen} className="flex items-center gap-1 rounded px-1 hover:text-foreground">
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !r.offen && "-rotate-90")} />{r.titel}
                    </button>
                  ) : <span className="px-1">{r.titel}</span>}
                  {r.rechts && <span className="ml-auto">{r.rechts}</span>}
                </div>
              </div>
            ) : reiheZeichnen(r)))}
          </div>
        </div>
      </div>

      {infoTermin && info && (
        <BalkenInfo t={infoTermin} x={info.x} y={info.y} projekt={projekte.find((p) => p.id === infoTermin.projekt_id)} team={teams.find((x) => x.id === infoTermin.team_id)}
          mitarbeiter={mitarbeiter} fahrzeuge={fahrzeuge} darf={darf} konflikt={konfliktIds.has(infoTermin.id)}
          onZu={() => setInfo(null)}
          onBearbeiten={() => { setInfo(null); onBearbeiten(infoTermin); }}
          onErledigt={() => void aendern(infoTermin, { status: infoTermin.status === "erledigt" ? "geplant" : "erledigt" }, `${infoTermin.titel}: ${infoTermin.status === "erledigt" ? "wieder offen" : "erledigt"}`)}
          onGeraet={(id) => void aendern(infoTermin, { fahrzeuge: infoTermin.fahrzeuge.includes(id) ? infoTermin.fahrzeuge.filter((x) => x !== id) : [...infoTermin.fahrzeuge, id] }, `${infoTermin.titel}: Geräte`)}
          onPersonWeg={(id) => void aendern(infoTermin, { mitarbeiter: infoTermin.mitarbeiter.filter((x) => x !== id) }, `${name(mitarbeiter.find((m) => m.id === id))} aus ${infoTermin.titel}`)}
          onLoeschen={() => void loeschen(infoTermin)} />
      )}

      <FahrzeugDialog open={neuesGeraet} onOpenChange={setNeuesGeraet} fahrzeug={null} neueArt="steiger" />

      {z?.bewegt && (
        <div ref={chipRef} className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md border-2 border-primary bg-card px-2 py-1 text-xs font-semibold"
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
  t, lage, freiIndex, breite, top, hoehe, projekt, konflikt, darf, offen, gezogen, ziel, onGriff,
}: {
  t: Termin;
  lage: { links: number; laenge: number; offenLinks: boolean; offenRechts: boolean };
  freiIndex: (i: number) => boolean;
  breite: number;
  top: number;
  hoehe: number;
  projekt?: Projekt;
  konflikt: boolean;
  darf: boolean;
  offen: boolean;
  gezogen: boolean;
  ziel: boolean;
  onGriff: (g: Griff, e: React.PointerEvent) => void;
}) {
  const farbe = projektFarbe(projekt);
  const erledigt = t.status === "erledigt";
  const hinter = erledigt ? `${farbe}80` : farbe;
  const schrift = textAuf(farbe);
  const stuecke = arbeitsStuecke(lage, freiIndex);
  const breitestes = stuecke.reduce((b, s, i) => (s.laenge > stuecke[b].laenge ? i : b), 0);
  const text = `${konflikt ? "⚠ " : ""}${t.dringend && !erledigt ? "! " : ""}${erledigt ? "✓ " : ""}${projekt ? `${projekt.nummer.slice(-4)} ` : ""}${t.titel}`;
  const titel = [t.titel, projekt && `${projekt.nummer} ${projekt.name}`, `${datumText(t.datum).slice(0, 6)}${t.bis_datum ? ` – ${datumText(t.bis_datum).slice(0, 6)}` : ""}`, zeitText(t), `${t.mitarbeiter.length} Leute`].filter(Boolean).join(" · ");
  return (
    <>
      {stuecke.map((s, i) => {
        const w = s.laenge * breite;
        const erstes = i === 0, letztes = i === stuecke.length - 1;
        return (
          <div key={s.links} data-balken={t.id} title={titel} onPointerDown={(e) => onGriff("mitte", e)}
            className={cn("absolute z-[6] flex items-center overflow-hidden px-1.5 text-xs font-semibold leading-tight",
              erstes && !lage.offenLinks ? "rounded-l-md" : "rounded-l-sm", letztes && !lage.offenRechts ? "rounded-r-md" : "rounded-r-sm",
              konflikt && "ring-2 ring-red-600", offen && "ring-2 ring-foreground",
              gezogen && "z-20 ring-2 ring-foreground/60", ziel && "ring-2 ring-primary",
              darf ? (gezogen ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer")}
            style={{ left: s.links * breite + 2, width: w - 4, top, height: hoehe, backgroundColor: hinter, color: schrift,
              backgroundImage: erledigt ? "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,.25) 6px 12px)" : undefined }}>
            {i === breitestes && w > 22 && <span className="min-w-0 truncate">{text}{w > 230 && <span className="font-normal opacity-80"> · {zeitText(t)}</span>}</span>}
            {darf && erstes && w > 20 && <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => onGriff("links", e)} aria-hidden />}
            {darf && letztes && w > 20 && <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => onGriff("rechts", e)} aria-hidden />}
          </div>
        );
      })}
    </>
  );
}

/** Kleines Fenster direkt am Balken — erst „Bearbeiten“ öffnet das große Formular */
function BalkenInfo({
  t, x, y, projekt, team, mitarbeiter, fahrzeuge, darf, konflikt, onZu, onBearbeiten, onErledigt, onGeraet, onPersonWeg, onLoeschen,
}: {
  t: Termin; x: number; y: number; projekt?: Projekt; team?: Team; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; darf: boolean; konflikt: boolean;
  onZu: () => void; onBearbeiten: () => void; onErledigt: () => void; onGeraet: (id: string) => void; onPersonWeg: (id: string) => void; onLoeschen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState({ left: x + 8, top: y + 12 });
  const [loeschFrage, setLoeschFrage] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setLage({
      left: Math.max(8, Math.min(x + 8, window.innerWidth - r.width - 8)),
      top: y + 12 + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 12) : y + 12,
    });
  }, [x, y, t.id]);
  useEffect(() => {
    const weg = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-balken]")) onZu(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    document.addEventListener("pointerdown", weg, true);
    window.addEventListener("keydown", taste);
    return () => { document.removeEventListener("pointerdown", weg, true); window.removeEventListener("keydown", taste); };
  }, [onZu]);
  const farbe = projektFarbe(projekt);
  const leute = t.mitarbeiter.map((id) => mitarbeiter.find((m) => m.id === id)).filter((m): m is Profil => !!m);
  const geraete = fahrzeuge.filter((f) => f.aktiv !== false);
  return (
    <div ref={ref} role="dialog" aria-label={t.titel} data-balken-info
      className="fixed z-50 w-[22rem] max-w-[calc(100vw-1rem)] rounded-lg border-2 bg-card text-sm shadow-xl" style={{ ...lage, borderColor: farbe }}>
      <div className="flex items-start gap-2 border-b px-3 py-2.5" style={{ background: `${farbe}14` }}>
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: farbe }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{t.dringend && t.status !== "erledigt" ? "! " : ""}{t.titel}</p>
          {projekt && <Link to={`/projekte/${projekt.id}`} className="text-xs font-medium text-primary hover:underline">{projekt.nummer} · {projekt.name}</Link>}
        </div>
        <button type="button" onClick={onZu} className="-mr-1 -mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Schließen"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <p className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          {kurz(t.datum)}{t.bis_datum ? ` – ${kurz(t.bis_datum)}` : ""} · {zeitText(t)}
          {t.status === "erledigt" && <span className="ml-auto rounded-full bg-status-gruen px-2 text-xs font-semibold text-status-gruen-fg">Erledigt</span>}
        </p>
        {t.ort && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{t.ort}</span></p>}
        {konflikt && <p className="rounded bg-status-rot px-2 py-1 text-xs font-medium text-status-rot-fg">⚠ Jemand ist doppelt eingeteilt oder abwesend</p>}
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-wrap gap-1">
            {team && <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">Team {team.name}</span>}
            {leute.map((m) => (
              <span key={m.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs">
                <Avatar profil={m} className="h-5 w-5 text-[9px]" />{m.vorname || name(m)}
                {darf && <button type="button" onClick={() => onPersonWeg(m.id)} className="-mr-1 rounded-full p-0.5 hover:bg-background" aria-label={`${name(m)} herausnehmen`}><X className="h-3 w-3" /></button>}
              </span>
            ))}
            {!team && !leute.length && <span className="text-xs text-muted-foreground">Noch niemand — Person am Griff ⋮⋮ hereinziehen</span>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-wrap gap-1">
            {geraete.filter((f) => t.fahrzeuge.includes(f.id) || darf).map((f) => {
              const dabei = t.fahrzeuge.includes(f.id);
              return darf ? (
                <button key={f.id} type="button" onClick={() => onGeraet(f.id)} aria-pressed={dabei}
                  className={cn("rounded-full border px-2 py-0.5 text-xs", dabei ? "border-primary bg-primary-soft font-semibold text-primary" : "text-muted-foreground hover:bg-muted")}>
                  {dabei && <Check className="mr-0.5 inline h-3 w-3" />}{f.name}
                </button>
              ) : <span key={f.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{f.name}</span>;
            })}
          </div>
        </div>
        {t.beschreibung && <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{t.beschreibung}</p>}
      </div>
      {darf && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          <Button size="sm" className="h-9 gap-1.5" onClick={onBearbeiten}><Pencil className="h-4 w-4" /> Bearbeiten</Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onErledigt}><Check className="h-4 w-4" /> {t.status === "erledigt" ? "Wieder offen" : "Erledigt"}</Button>
          {loeschFrage ? (
            <Button size="sm" variant="destructive" className="ml-auto h-9" onClick={onLoeschen}>Wirklich löschen</Button>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto h-9 gap-1.5 text-destructive hover:text-destructive" onClick={() => setLoeschFrage(true)}><Trash2 className="h-4 w-4" /> Löschen</Button>
          )}
        </div>
      )}
    </div>
  );
}

function TeamKopf({ team, mitarbeiter, fahrzeuge, darf, offen, onKlappen, onBus }: {
  team: Team; mitarbeiter: Profil[]; fahrzeuge: Fahrzeug[]; darf: boolean; offen: boolean; onKlappen: () => void; onBus: (id: string | null) => void;
}) {
  const leiter = mitarbeiter.find((m) => m.id === team.leiter_id);
  const busse = fahrzeuge.filter((f) => f.art === "bus" || f.art === "pkw" || f.id === team.fahrzeug_id);
  const bus = fahrzeuge.find((f) => f.id === team.fahrzeug_id);
  return (
    <span className="flex w-full min-w-0 items-center gap-1.5 py-1">
      <button type="button" onClick={onKlappen} aria-label={offen ? `${team.name} zuklappen` : `${team.name} aufklappen`} aria-expanded={offen}
        className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-background">
        <ChevronDown className={cn("h-4 w-4 transition-transform", !offen && "-rotate-90")} />
      </button>
      <span className={cn("h-3 w-3 shrink-0 rounded-full", TEAM_FARBEN[team.farbe]?.punkt ?? "bg-slate-500")} />
      <span className="min-w-0 truncate text-sm font-bold" title={leiter ? `Team ${team.name} · Leitung ${name(leiter)}` : `Team ${team.name}`}>{team.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md border bg-card px-1.5 text-xs" title="Bus des Teams — Einsätze ab heute fahren mit">
        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
        {darf ? (
          <select value={team.fahrzeug_id ?? ""} onChange={(e) => onBus(e.target.value || null)} aria-label={`Bus von ${team.name}`}
            className="h-6 max-w-[6.5rem] truncate bg-transparent font-medium outline-none" onPointerDown={(e) => e.stopPropagation()}>
            <option value="">kein Bus</option>
            {busse.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        ) : <span className="py-0.5 font-medium">{bus?.name ?? "kein Bus"}</span>}
      </span>
    </span>
  );
}

function PersonKopf({ m, darf, onGriff }: { m: Profil; darf: boolean; onGriff: (e: React.PointerEvent) => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {darf && <span className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" onPointerDown={onGriff} title={`${name(m)} auf einen Einsatz oder ein Team ziehen`}><GripVertical className="h-4 w-4" /></span>}
      <Avatar profil={m} className="h-5 w-5 text-[9px]" />
      <span className="truncate text-sm">{name(m)}</span>
    </span>
  );
}

function FahrzeugKopf({ f, darf, onGriff }: { f: Fahrzeug; darf: boolean; onGriff: (e: React.PointerEvent) => void }) {
  const Icon = FAHRZEUG_ICON[f.art] ?? Truck;
  return (
    <span className="flex w-full min-w-0 items-center gap-1.5" data-geraet={f.id}>
      {darf && <span className="shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" onPointerDown={onGriff} title={`${f.name} auf einen Einsatz ziehen`}><GripVertical className="h-4 w-4" /></span>}
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{f.name}</span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{f.gemietet ? "Miete" : FAHRZEUG_ART[f.art]?.text}</span>
    </span>
  );
}

/** „+ Neues Team“: antippen und Namen tippen — oder eine Person hereinziehen */
function NeuesTeam({ ziehen, onAnlegen }: { ziehen: boolean; onAnlegen: (titel: string) => Promise<boolean> }) {
  const [offen, setOffen] = useState(false);
  const [titel, setTitel] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const fertig = async () => {
    const t = titel.trim();
    if (!t) { setOffen(false); return; }
    setLaeuft(true);
    if (await onAnlegen(t)) { setTitel(""); setOffen(false); }
    setLaeuft(false);
  };
  if (ziehen) return <span className="flex h-8 items-center gap-1.5 text-sm font-medium text-primary"><Plus className="h-4 w-4" /> Hier loslassen = neues Team</span>;
  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="flex h-8 items-center gap-1.5 rounded px-1 text-sm font-medium text-primary hover:bg-muted">
        <Plus className="h-4 w-4" /> Neues Team
      </button>
    );
  }
  return (
    <form className="flex w-full items-center gap-1 py-1" onSubmit={(e) => { e.preventDefault(); void fertig(); }}>
      <input autoFocus value={titel} onChange={(e) => setTitel(e.target.value)} disabled={laeuft} aria-label="Name des neuen Teams" placeholder="Name, z. B. Lisa"
        onKeyDown={(e) => { if (e.key === "Escape") { setTitel(""); setOffen(false); } }} onBlur={() => { if (!titel.trim()) setOffen(false); }}
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" />
      <Button type="submit" size="sm" className="h-8" disabled={laeuft || !titel.trim()}>Anlegen</Button>
    </form>
  );
}

/** Oben: Projekte ohne Einsatz ab heute — zum Hereinziehen. Suche findet alle laufenden. */
function Streifen({ projekte, eingeplant, darf, onZiehen, rechts }: {
  projekte: Projekt[]; eingeplant: Set<string>; darf: boolean; onZiehen: (id: string, e: React.PointerEvent) => void; rechts: ReactNode;
}) {
  const [offen, setOffen] = useState(() => { try { return localStorage.getItem(STREIFEN_KEY) !== "zu"; } catch { return true; } });
  const [suche, setSuche] = useState("");
  const umschalten = () => { setOffen(!offen); try { localStorage.setItem(STREIFEN_KEY, offen ? "zu" : "auf"); } catch { /* egal */ } };
  const laufend = projekte.filter((p) => p.status === "aktiv" || p.status === "angebot");
  const q = suche.trim().toLowerCase();
  const liste = (q ? laufend.filter((p) => `${p.nummer} ${p.name} ${p.ort ?? ""}`.toLowerCase().includes(q)) : laufend.filter((p) => !eingeplant.has(p.id))).slice(0, 30);
  const ungeplant = laufend.filter((p) => !eingeplant.has(p.id)).length;
  return (
    <div className="flex min-h-11 items-center gap-2 bg-card px-3 py-1.5" data-streifen>
      {darf && (
        <button type="button" onClick={umschalten} aria-expanded={offen} className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          Noch nicht eingeplant
          <span className={cn("rounded-full px-1.5 text-xs", ungeplant ? "bg-status-gelb text-status-gelb-fg" : "bg-muted text-muted-foreground")}>{ungeplant}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !offen && "-rotate-90")} />
        </button>
      )}
      {darf && offen ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Projekt suchen …" aria-label="Projekt suchen"
              className="h-8 w-40 rounded-md border bg-background pl-7 pr-2 text-sm" />
          </label>
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
            {liste.map((p) => {
              const farbe = projektFarbe(p);
              return (
                <span key={p.id} onPointerDown={(e) => onZiehen(p.id, e)} data-projekt-ziehen={p.id} title={`${p.nummer} ${p.name} — auf ein Team oder eine Person ziehen`}
                  className="flex h-8 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-md border bg-card px-2 text-xs hover:border-foreground/40"
                  style={{ borderLeft: `4px solid ${farbe}` }}>
                  <span className="font-semibold">{p.nummer.slice(-4)}</span>
                  <span className="max-w-[12rem] truncate">{p.name}</span>
                </span>
              );
            })}
            {!liste.length && <span className="self-center text-xs text-muted-foreground">{q ? "Kein Projekt gefunden." : "Alle laufenden Projekte sind eingeplant."}</span>}
          </div>
        </div>
      ) : <div className="flex-1" />}
      {rechts}
    </div>
  );
}
