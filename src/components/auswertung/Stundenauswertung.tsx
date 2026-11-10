import { Fragment, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Clock, Download, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { alleZeilen, csvHerunterladen } from "@/lib/abfrage";
import { datum, isoTag, stunden, tageDazu, zahl } from "@/lib/format";
import { pdfDateiname, pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { filtern, gruppieren, tagesnachweis, type Gruppierung, type ZeitZeile } from "@/lib/stundenAuswertung";
import { VonBis } from "@/components/auswertung/VonBis";
import { stundenPdf } from "@/lib/stundenPdf";
import { abwesenheitStunden, abwesenheitsTage, lohnSumme } from "@/lib/zeitkonto";
import { name, STUNDEN_ART, type StundenArt } from "@/lib/types";
import { cn } from "@/lib/utils";

const ARTEN = Object.keys(STUNDEN_ART) as StundenArt[];
const ART_KURZ: Record<StundenArt, string> = { arbeit: "Arbeit", fahrt: "Fahrt", ue50: "Ü 50 %", ue100: "Ü 100 %", garantie: "Garantie" };
/** „zeiten“ = Von–Bis je Mitarbeiter und Tag (Zeitleiste), sonst Summen je Gruppe */
const GRUPPEN: [Gruppierung | "zeiten", string][] = [["person", "Mitarbeiter"], ["projekt", "Projekt"], ["woche", "Woche"], ["tag", "Tag"], ["art", "Art"], ["zeiten", "Von–Bis je Tag"]];

/** Montag der Woche */
const montag = (iso: string) => {
  const [j, m, t] = iso.split("-").map(Number);
  const wt = new Date(j, m - 1, t).getDay() || 7;
  return tageDazu(iso, 1 - wt);
};
function zeitraeume(heute: string) {
  const [j, m] = heute.split("-").map(Number);
  const mo = montag(heute);
  const monatAnfang = (jj: number, mm: number) => `${jj}-${String(mm).padStart(2, "0")}-01`;
  const vorMonat = m === 1 ? [j - 1, 12] : [j, m - 1];
  return [
    { text: "Diese Woche", von: mo, bis: tageDazu(mo, 6) },
    { text: "Letzte Woche", von: tageDazu(mo, -7), bis: tageDazu(mo, -1) },
    { text: "Dieser Monat", von: monatAnfang(j, m), bis: tageDazu(m === 12 ? monatAnfang(j + 1, 1) : monatAnfang(j, m + 1), -1) },
    { text: "Letzter Monat", von: monatAnfang(vorMonat[0], vorMonat[1]), bis: tageDazu(monatAnfang(j, m), -1) },
    { text: "Dieses Jahr", von: `${j}-01-01`, bis: `${j}-12-31` },
  ];
}

/**
 * Alle Stunden aller Mitarbeiter — frei filtern (Zeitraum, Leute, Team,
 * Projekt, Art, verrechnet) und gruppieren. Jede Gruppe klappt auf bis zur
 * einzelnen Buchung. Export als CSV und als Stundennachweis (PDF) je Person.
 */
export function Stundenauswertung() {
  const { firma } = useSitzung();
  const heute = isoTag();
  const vorlagen = useMemo(() => zeitraeume(heute), [heute]);
  const [von, setVon] = useState(vorlagen[2].von);
  const [bis, setBis] = useState(vorlagen[2].bis);
  const [personen, setPersonen] = useState<string[]>([]);
  const [projekt, setProjekt] = useState("");
  const [arten, setArten] = useState<string[]>([]);
  const [verrechnet, setVerrechnet] = useState<"alle" | "ja" | "nein">("alle");
  const [nach, setNach] = useState<Gruppierung | "zeiten">("person");
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const { data: teams = [] } = useTeams();
  const { data: projekte = [] } = useProjekte();
  const gueltig = !!von && !!bis && von <= bis;

  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ["mitarbeiter", "alle"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("vorname");
      if (error) throw error;
      return data ?? [];
    },
  });
  const zeitenQ = useQuery({
    queryKey: ["zeiten", "stundenauswertung", von, bis],
    enabled: gueltig,
    placeholderData: keepPreviousData,
    queryFn: () => alleZeilen((a, b) => supabase.from("zeiten")
      .select("id, user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, rechnung_id, art, km, projekte(nummer, name), profiles(vorname, nachname, farbe), regieberichte(nummer, rechnung_id)")
      .gte("datum", von).lte("datum", bis).order("id").range(a, b)),
  });
  const roh = useMemo(() => zeitenQ.data ?? [], [zeitenQ.data]);
  const zeilen: ZeitZeile[] = useMemo(() => roh.map((z) => ({
    id: z.id, user_id: z.user_id, person: name(z.profiles), projekt_id: z.projekt_id,
    projekt: z.projekte ? `${z.projekte.nummer} ${z.projekte.name}` : null, datum: z.datum, stunden: Number(z.stunden),
    art: z.art ?? "arbeit", km: z.km == null ? null : Number(z.km), verrechnet: !!(z.rechnung_id || z.regieberichte?.rechnung_id),
    von: z.von, bis: z.bis, pause_minuten: z.pause_minuten, taetigkeit: z.taetigkeit,
  })), [roh]);
  const gefiltert = useMemo(() => filtern(zeilen, { personen, projekte: projekt ? [projekt] : [], arten, verrechnet }), [zeilen, personen, projekt, arten, verrechnet]);
  const gruppen = useMemo(() => (nach === "zeiten" ? [] : gruppieren(gefiltert, nach, (a) => STUNDEN_ART[a as StundenArt]?.text ?? a)), [gefiltert, nach]);
  const tage = useMemo(() => (nach === "zeiten" ? tagesnachweis(gefiltert) : []), [gefiltert, nach]);
  const gesamt = gruppieren(gefiltert, "art").reduce((s, g) => s + g.stunden, 0);
  const jeArtGesamt = Object.fromEntries(gruppieren(gefiltert, "art").map((g) => [g.schluessel, g.stunden]));
  const kmGesamt = gefiltert.reduce((s, z) => s + (z.km ?? 0), 0);
  const sichtbareArten = ARTEN.filter((a) => jeArtGesamt[a]);
  const leute = mitarbeiter.filter((m) => m.aktiv || zeilen.some((z) => z.user_id === m.id));
  const nachId = new Map(roh.map((z) => [z.id, z]));

  const umschalten = <T,>(liste: T[], x: T) => (liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x]);
  const teamAktiv = (mitglieder: string[]) => mitglieder.length > 0 && mitglieder.length === personen.length && mitglieder.every((m) => personen.includes(m));

  const csv = () => {
    if (nach === "zeiten") {
      csvHerunterladen(`von-bis-${von}-bis-${bis}.csv`, [
        ["Mitarbeiter", "Datum", "Beginn", "Ende", "Pause (Min.)", "Stunden", "Ohne Uhrzeit", "Baustellen", "Hinweise"],
        ...tage.map((t) => [t.person, datum(t.datum), t.beginn ?? "", t.ende ?? "", t.pause || null, t.stunden, t.ohneZeit || null, t.projekte.join(", "), t.hinweise.join(", ")]),
      ]);
      return;
    }
    csvHerunterladen(`stunden-${von}-bis-${bis}.csv`, [
      ["Mitarbeiter", "Datum", "Von", "Bis", "Pause (Min.)", "Stunden", "Art", "km", "Projekt", "Tätigkeit", "Verrechnet"],
      ...gefiltert.sort((a, b) => a.person.localeCompare(b.person, "de") || a.datum.localeCompare(b.datum)).map((z) => {
        const r = nachId.get(z.id);
        return [z.person, datum(z.datum), r?.von?.slice(0, 5) ?? "", r?.bis?.slice(0, 5) ?? "", r?.pause_minuten || null, z.stunden,
          STUNDEN_ART[z.art as StundenArt]?.text ?? z.art, z.km, z.projekt ?? "", r?.taetigkeit ?? "", z.verrechnet ? "ja" : "nein"];
      }),
    ]);
  };

  // Stundennachweis je Person (gleiches PDF wie für die Lohnverrechnung), nur die gefilterten Buchungen
  const pdf = async () => {
    if (!firma) return;
    setPdfLaeuft(true);
    try {
      const { data: ab, error } = await supabase.from("abwesenheiten").select("user_id, art, von, bis, stunden, status")
        .eq("status", "genehmigt").lte("von", bis).gte("bis", von);
      if (error) throw error;
      const ids = [...new Set(gefiltert.map((z) => z.user_id))];
      const liste = ids.map((id) => {
        const m = mitarbeiter.find((x) => x.id === id);
        const eigene = gefiltert.filter((z) => z.user_id === id).map((z) => nachId.get(z.id)!).filter(Boolean);
        const abw = (ab ?? []).filter((a) => a.user_id === id);
        const wochen = Number(m?.wochenstunden ?? 38.5);
        return {
          name: m ? name(m) : "?",
          summe: lohnSumme(wochen, von, bis, eigene, abw, { taggeld: firma.taggeld_satz, km: firma.km_satz }),
          abwesend: abw.flatMap((a) => abwesenheitsTage(a, von, bis).map((d) => ({ datum: d, art: a.art, stunden: abwesenheitStunden(a, d, wochen) }))),
          zeilen: eigene.map((z) => ({
            datum: z.datum, von: z.von, bis: z.bis, pause_minuten: z.pause_minuten, stunden: Number(z.stunden), taetigkeit: z.taetigkeit, art: z.art,
            projekt: z.projekte ? `${z.projekte.nummer} ${z.projekte.name}` : "", regiebericht: z.regieberichte?.nummer ?? "",
          })),
        };
      }).sort((a, b) => a.name.localeCompare(b.name, "de"));
      const blob = await stundenPdf(firma, `${datum(von)} – ${datum(bis)}`, liste);
      await pdfTeilenOderLaden(blob, pdfDateiname("Stundennachweis", `${von}_${bis}`));
    } catch (e) {
      toast.error("PDF nicht erstellt", { description: (e as Error).message });
    } finally {
      setPdfLaeuft(false);
    }
  };

  const chip = (aktiv: boolean) => cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
    aktiv ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-4">
      {/* Zeitraum */}
      <section className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2">
          {vorlagen.map((v) => (
            <button key={v.text} type="button" className={chip(von === v.von && bis === v.bis)} onClick={() => { setVon(v.von); setBis(v.bis); }}>{v.text}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label="Von" className="h-11 w-44" value={von} onChange={(e) => setVon(e.target.value)} />
          <span>bis</span>
          <Input type="date" aria-label="Bis" className="h-11 w-44" value={bis} onChange={(e) => setBis(e.target.value)} />
          {!gueltig && <span className="text-destructive">„Bis“ liegt vor „Von“.</span>}
        </div>
      </section>

      {/* Wer, was, wo */}
      <section className="space-y-3 rounded-lg border bg-card p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mitarbeiter</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(!personen.length)} onClick={() => setPersonen([])}>Alle</button>
            {teams.map((t) => (
              <button key={t.id} type="button" className={chip(teamAktiv(t.mitglieder))} onClick={() => setPersonen(teamAktiv(t.mitglieder) ? [] : t.mitglieder)}>
                Team {t.name}
              </button>
            ))}
            {leute.map((m) => (
              <button key={m.id} type="button" className={chip(personen.includes(m.id))} onClick={() => setPersonen(umschalten(personen, m.id))}>
                <Avatar profil={m} className="-ml-1.5 h-6 w-6 text-[10px]" /> {m.vorname}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Art</p>
            <div className="flex flex-wrap gap-2">
              {ARTEN.map((a) => <button key={a} type="button" className={chip(arten.includes(a))} onClick={() => setArten(umschalten(arten, a))}>{ART_KURZ[a]}</button>)}
              <span className="mx-1 w-px self-stretch bg-border" />
              {([["alle", "Alle"], ["nein", "Nicht verrechnet"], ["ja", "Verrechnet"]] as const).map(([w, t]) => (
                <button key={w} type="button" className={chip(verrechnet === w)} onClick={() => setVerrechnet(w)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projekt</p>
            <select value={projekt} onChange={(e) => setProjekt(e.target.value)} aria-label="Projekt"
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm lg:w-72">
              <option value="">Alle Projekte</option>
              <option value="-">Ohne Projekt (Lager, Werkstatt …)</option>
              {projekte.map((p) => <option key={p.id} value={p.id}>{p.nummer} {p.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Ergebnis */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Gruppiert nach</span>
            {GRUPPEN.map(([w, t]) => <button key={w} type="button" className={chip(nach === w)} onClick={() => { setNach(w); setOffen(new Set()); }}>{t}</button>)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 gap-1.5" disabled={!gefiltert.length} onClick={csv}><Download className="h-4 w-4" /> CSV</Button>
            <Button className="h-10 gap-1.5" disabled={!gefiltert.length || pdfLaeuft} onClick={() => void pdf()}>
              {pdfLaeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Stundennachweis
            </Button>
          </div>
        </div>

        {zeitenQ.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !gefiltert.length ? (
          <Leer icon={Clock} text="Keine Stunden für diese Auswahl." />
        ) : nach === "zeiten" ? (
          <div className={cn(zeitenQ.isPlaceholderData && "opacity-60")}><VonBis tage={tage} profile={mitarbeiter} /></div>
        ) : (
          <div className={cn("overflow-x-auto rounded-lg border bg-card", zeitenQ.isPlaceholderData && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{GRUPPEN.find(([w]) => w === nach)?.[1]}</th>
                  {sichtbareArten.map((a) => <th key={a} className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{ART_KURZ[a]}</th>)}
                  {kmGesamt > 0 && <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">km</th>}
                  <th className="px-4 py-2.5 text-right font-medium">Stunden</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {gruppen.map((g) => {
                  const auf = offen.has(g.schluessel);
                  return (
                    <Fragment key={g.schluessel}>
                      <tr className="cursor-pointer hover:bg-muted/50" aria-expanded={auf}
                        onClick={() => setOffen((alt) => { const n = new Set(alt); if (auf) n.delete(g.schluessel); else n.add(g.schluessel); return n; })}>
                        <td className="px-4 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !auf && "-rotate-90")} />
                            {nach === "tag" ? datum(g.titel) : g.titel}
                            <span className="text-xs font-normal text-muted-foreground">· {g.zeilen.length}</span>
                          </span>
                          {nach !== "art" && (
                            <span className="block pl-[1.375rem] text-xs font-normal text-muted-foreground sm:hidden">
                              {sichtbareArten.filter((a) => g.jeArt[a]).map((a) => `${ART_KURZ[a]} ${zahl(g.jeArt[a])}`).join(" · ")}
                              {g.km ? ` · ${zahl(g.km)} km` : ""}
                            </span>
                          )}
                        </td>
                        {sichtbareArten.map((a) => <td key={a} className="zahl hidden px-3 py-2.5 text-right text-muted-foreground sm:table-cell">{g.jeArt[a] ? zahl(g.jeArt[a]) : ""}</td>)}
                        {kmGesamt > 0 && <td className="zahl hidden px-3 py-2.5 text-right text-muted-foreground sm:table-cell">{g.km ? zahl(g.km) : ""}</td>}
                        <td className="zahl whitespace-nowrap px-4 py-2.5 text-right font-semibold">{stunden(g.stunden)}</td>
                      </tr>
                      {auf && g.zeilen.map((z) => {
                        const r = nachId.get(z.id);
                        return (
                          <tr key={z.id} className="bg-muted/30 text-xs">
                            <td className="py-2 pl-10 pr-4">
                              <span className="zahl">{datum(z.datum)}</span>
                              {r?.von && <span className="zahl text-muted-foreground"> {r.von.slice(0, 5)}–{r.bis?.slice(0, 5)}</span>}
                              {nach !== "person" && <> · {z.person}</>}
                              {nach !== "projekt" && <> · {z.projekt ?? "ohne Projekt"}</>}
                              {nach !== "art" && z.art !== "arbeit" && <> · {ART_KURZ[z.art as StundenArt] ?? z.art}</>}
                              {r?.taetigkeit && <span className="text-muted-foreground"> · {r.taetigkeit}</span>}
                              {z.verrechnet && <span className="text-muted-foreground"> · verrechnet</span>}
                            </td>
                            {sichtbareArten.length + (kmGesamt > 0 ? 1 : 0) > 0 && <td className="hidden sm:table-cell" colSpan={sichtbareArten.length + (kmGesamt > 0 ? 1 : 0)} />}
                            <td className="zahl px-4 py-2 text-right align-top">{stunden(z.stunden)}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2">
                <tr className="font-semibold">
                  <td className="px-4 py-2.5">Summe · {gefiltert.length} Buchungen</td>
                  {sichtbareArten.map((a) => <td key={a} className="zahl hidden px-3 py-2.5 text-right sm:table-cell">{zahl(jeArtGesamt[a])}</td>)}
                  {kmGesamt > 0 && <td className="zahl hidden px-3 py-2.5 text-right sm:table-cell">{zahl(kmGesamt)}</td>}
                  <td className="zahl whitespace-nowrap px-4 py-2.5 text-right">{stunden(gesamt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
