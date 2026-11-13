import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BellRing, Bus, CalendarClock, Check, CheckCircle2, ChevronDown, ClipboardSignature, Clock, FolderKanban, Navigation, Phone, ScanBarcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Gruppentitel, StatusPille } from "@/components/Bausteine";
import { EinsatzDetails } from "@/components/einsatz/EinsatzDetails";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { Button } from "@/components/ui/button";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, isoTag, tageDazu, uhrzeit } from "@/lib/format";
import { ABWESENHEIT_ART, EINSATZ_STATUS, TEAM_FARBEN, type AbwesenheitArt, type Termin } from "@/lib/types";
import { istArbeitstag } from "@/lib/zeitkonto";
import { cn } from "@/lib/utils";

type Einsatz = Termin & { projekte: { nummer: string; name: string; kunden: { name: string; telefon: string | null } | null } | null };

const GESEHEN = "elektro.termine.gesehen";
const gesehenLesen = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(GESEHEN) ?? "{}") as Record<string, string>; } catch { return {}; }
};

const zeitText = (t: Termin) => (t.ganztags || !t.von ? "ganztägig" : `${uhrzeit(t.von)}${t.bis ? `–${uhrzeit(t.bis)}` : ""}`);
const amTag = (t: Termin, tag: string) => t.datum <= tag && (t.bis_datum ?? t.datum) >= tag;
/** Dringendes zuerst, Erledigtes zuletzt, sonst nach Uhrzeit */
const reihung = (a: Termin, b: Termin) => Number(b.dringend) - Number(a.dringend)
  || Number(a.status === "erledigt") - Number(b.status === "erledigt")
  || (a.von ?? "").localeCompare(b.von ?? "");

/** Wo muss ich heute hin? Einsätze von heute und vom nächsten Arbeitstag, Erledigt mit einem Tipp. */
export function EinsatzBereich({ onStunden }: { onStunden: (projektId?: string) => void }) {
  const neuLaden = useNeuLaden();
  const { profil } = useSitzung();
  const heute = isoTag();
  const naechster = useMemo(() => {
    let t = tageDazu(heute, 1);
    while (!istArbeitstag(t)) t = tageDazu(t, 1);
    return t;
  }, [heute]);
  const [gesehen, setGesehen] = useState(gesehenLesen);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  /** Aufgeklappte Einsätze (Projekt, Kunde, Adresse …) */
  const [auf, setAuf] = useState<string[]>([]);
  const klappen = (id: string) => setAuf((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: teams = [] } = useTeams();
  const { data: mitarbeiter = [] } = useMitarbeiter();

  const { data: einsaetze = [] } = useQuery({
    queryKey: ["termine", "einsaetze", profil?.id, heute],
    enabled: !!profil?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*, projekte(nummer, name, kunden(name, telefon))")
        .contains("mitarbeiter", [profil!.id]).or(`bis_datum.gte.${heute},datum.gte.${heute}`).order("datum").limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Einsatz[];
    },
  });
  const { data: abwesend = [] } = useKalenderAbwesenheit(heute, heute);
  const ichAbwesend = abwesend.find((a) => a.user_id === profil?.id);

  const heuteListe = einsaetze.filter((t) => amTag(t, heute)).sort(reihung);
  const morgenListe = einsaetze.filter((t) => amTag(t, naechster) && t.status !== "erledigt").sort(reihung);
  const geaendert = einsaetze.filter((t) => t.status !== "erledigt" && t.geaendert_am && t.geaendert_von !== profil?.id && gesehen[t.id] !== t.geaendert_am);

  const statusSetzen = async (t: Einsatz, status: "erledigt") => {
    setLaeuft(t.id);
    const { error } = await supabase.from("termine").update({ status }).eq("id", t.id);
    setLaeuft(null);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    await neuLaden("termine");
    if (status === "erledigt") {
      toast.success("Erledigt — der Chef sieht es im Büro", t.projekt_id
        ? { action: { label: "Stunden buchen", onClick: () => onStunden(t.projekt_id ?? undefined) }, duration: 10_000 }
        : undefined);
    }
  };
  const verstanden = () => {
    const neu = { ...gesehen };
    geaendert.forEach((t) => { neu[t.id] = t.geaendert_am!; });
    try { localStorage.setItem(GESEHEN, JSON.stringify(neu)); } catch { /* egal */ }
    setGesehen(neu);
  };

  /** Team, Bus/Steiger und wer noch mitfährt */
  const Einteilung = ({ t }: { t: Termin }) => {
    const team = teams.find((x) => x.id === t.team_id);
    const fz = t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean);
    const kollegen = t.mitarbeiter.filter((id) => id !== profil?.id).map((id) => mitarbeiter.find((m) => m.id === id)?.vorname).filter(Boolean);
    if (!team && !fz.length && !kollegen.length) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
        {team && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", TEAM_FARBEN[team.farbe]?.klasse)}>Team {team.name}</span>
        )}
        {fz.map((n) => <span key={n} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-medium"><Bus className="h-3 w-3" />{n}</span>)}
        {kollegen.length > 0 && <span className="py-0.5 text-muted-foreground">mit {kollegen.join(", ")}</span>}
      </div>
    );
  };

  if (!heuteListe.length && !morgenListe.length && !geaendert.length && !ichAbwesend) return null;

  return (
    <section aria-label="Heute eingeteilt" className="space-y-2.5">
      {geaendert.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-status-gelb bg-status-gelb/40 p-3 text-sm" role="status">
          <BellRing className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{geaendert.length === 1 ? "Termin geändert" : `${geaendert.length} Termine geändert`}</p>
            {geaendert.slice(0, 3).map((t) => (
              <p key={t.id} className="truncate">{t.titel} — jetzt {t.datum === heute ? "heute" : datumKurz(t.datum)}, {zeitText(t)}</p>
            ))}
          </div>
          <Button variant="outline" className="h-11 bg-card" onClick={verstanden}>Verstanden</Button>
        </div>
      )}

      <Gruppentitel>Heute</Gruppentitel>
      {ichAbwesend && (
        <p className="rounded-lg border bg-card p-3 text-sm font-medium">
          {ABWESENHEIT_ART[ichAbwesend.art as AbwesenheitArt]?.text ?? "Abwesend"} — heute nicht eingeplant.
        </p>
      )}
      {!heuteListe.length && !ichAbwesend && <p className="rounded-lg border border-dashed bg-card p-3 text-sm text-muted-foreground">Heute kein Einsatz eingeteilt.</p>}
      <ul className="space-y-2.5">
        {heuteListe.map((t) => {
          const telefon = t.projekte?.kunden?.telefon;
          return (
            <li key={t.id} className={cn("rounded-lg border bg-card p-3", t.dringend && t.status !== "erledigt" && "border-status-rot-fg/50")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{t.titel}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{zeitText(t)}{t.ort && ` · ${t.ort}`}
                  </p>
                  {t.projekte?.kunden?.name && <p className="text-sm text-muted-foreground">{t.projekte.kunden.name}</p>}
                  <Einteilung t={t} />
                  {t.beschreibung && <p className="mt-1 text-sm">{t.beschreibung}</p>}
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {t.dringend && t.status !== "erledigt" && <StatusPille eintrag={{ ton: "rot", text: "Dringend" }} />}
                  {t.status !== "geplant" && <StatusPille eintrag={EINSATZ_STATUS[t.status]} />}
                </span>
              </div>
              {t.status !== "erledigt" && (
                <Button variant="outline" className="mt-2.5 h-12 w-full gap-2" disabled={!!laeuft} onClick={() => void statusSetzen(t, "erledigt")}><Check className="h-4 w-4" /> Erledigt</Button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {t.ort && (
                  <Button asChild variant="outline" className="h-11">
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.ort)}`} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Hinfahren</a>
                  </Button>
                )}
                {telefon && <Button asChild variant="outline" className="h-11"><a href={`tel:${telefon.replace(/\s/g, "")}`}><Phone className="h-4 w-4" /> Anrufen</a></Button>}
                {t.projekt_id && (
                  <>
                    <Button variant="outline" className="h-11" onClick={() => onStunden(t.projekt_id ?? undefined)}><Clock className="h-4 w-4" /> Stunden</Button>
                    <Button asChild variant="outline" className="h-11"><Link to={`/scan?projekt=${t.projekt_id}`}><ScanBarcode className="h-4 w-4" /> Material</Link></Button>
                    <Button asChild variant="outline" className="h-11"><Link to={`/regie/neu?projekt=${t.projekt_id}`}><ClipboardSignature className="h-4 w-4" /> Regie</Link></Button>
                    <Button asChild variant="outline" className="h-11"><Link to={`/projekte/${t.projekt_id}`}><FolderKanban className="h-4 w-4" /> Projekt</Link></Button>
                  </>
                )}
              </div>
              <button type="button" onClick={() => klappen(t.id)} aria-expanded={auf.includes(t.id)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium text-primary hover:bg-muted">
                {auf.includes(t.id) ? "Weniger" : "Projekt, Kunde, Adresse"}
                <ChevronDown className={cn("h-4 w-4 transition-transform", auf.includes(t.id) && "rotate-180")} />
              </button>
              {auf.includes(t.id) && <EinsatzDetails t={t} />}
            </li>
          );
        })}
      </ul>

      {morgenListe.length > 0 && (
        <>
          <Gruppentitel>{naechster === tageDazu(heute, 1) ? "Morgen" : datumKurz(naechster)}</Gruppentitel>
          <ul className="divide-y rounded-lg border bg-card">
            {morgenListe.map((t) => (
              <li key={t.id} className="text-sm">
                <button type="button" onClick={() => klappen(t.id)} aria-expanded={auf.includes(t.id)} className="flex min-h-12 w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                  {t.dringend ? <AlertTriangle className="h-4 w-4 shrink-0 text-status-rot-fg" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.titel}</span>
                    <span className="block truncate text-xs text-muted-foreground">{zeitText(t)}{t.ort && ` · ${t.ort}`}{t.fahrzeuge.length ? ` · ${t.fahrzeuge.map((id) => fahrzeuge.find((f) => f.id === id)?.name).filter(Boolean).join(", ")}` : ""}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", auf.includes(t.id) && "rotate-180")} />
                </button>
                {auf.includes(t.id) && <div className="px-3 pb-3"><EinsatzDetails t={t} /></div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
