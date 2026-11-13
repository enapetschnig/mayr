import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarOff, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Avatar, Leer } from "@/components/Bausteine";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { AbwesenheitDialog } from "@/components/zeiten/AbwesenheitDialog";
import { AbwesenheitListe, AntraegeKarte, KontoKarte } from "@/components/zeiten/Personal";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { ABWESENHEIT_ART, type AbwesenheitArt } from "@/lib/types";
import { abwesenheitStunden, feiertagName, sollZeitraum } from "@/lib/zeitkonto";
import { ZeitenListe, useZeitenListe, type ZeitMitInfo } from "@/components/zeiten/ZeitenListe";
import { MonatAlle, MonatsAnsicht } from "@/components/zeiten/MonatsAnsicht";
import { useMitarbeiter } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, isoTag, isoZuDatum, stunden, tageDazu, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ANSICHT_KEY = "elektro.zeiten.ansicht";
type Ansicht = "woche" | "monat";

function montagVon(iso: string): string {
  return tageDazu(iso, -((isoZuDatum(iso).getDay() + 6) % 7));
}

/** Kalenderwoche nach ISO 8601 */
function kalenderwoche(iso: string): number {
  const d = isoZuDatum(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const erste = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d.getTime() - erste.getTime()) / 86400000 - 3 + ((erste.getDay() + 6) % 7)) / 7);
}

/**
 * Stunden: Monteur sieht seine Woche, der Chef zusätzlich alle — als
 * Wochenraster (wer hat wann wie viel) und darunter die Buchungen.
 * Umschaltbar auf den Monat (Kalenderblatt je Person, gemerkt im Gerät).
 */
export default function Zeiten() {
  const navigate = useNavigate();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [montag, setMontag] = useState(() => montagVon(isoTag()));
  const [person, setPerson] = useState<string>(() => (istChef ? "alle" : ""));
  const [dialog, setDialog] = useState<{ eintrag?: ZeitMitInfo | null; datum?: string } | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>(() => { try { return localStorage.getItem(ANSICHT_KEY) === "monat" ? "monat" : "woche"; } catch { return "woche"; } });
  const ansichtWechseln = (a: Ansicht) => { setAnsicht(a); try { localStorage.setItem(ANSICHT_KEY, a); } catch { /* egal */ } };

  const sonntag = tageDazu(montag, 6);
  const userId = person === "alle" ? undefined : person || profil?.id;
  const { data: zeiten = [], isLoading } = useZeitenListe({ von: montag, bis: sonntag, userId });
  const tage = Array.from({ length: 7 }, (_, i) => tageDazu(montag, i));
  const summe = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const [abwesenheitOffen, setAbwesenheitOffen] = useState(false);
  const { data: abwesend = [] } = useKalenderAbwesenheit(montag, sonntag);
  const gewaehlt = mitarbeiter.find((m) => m.id === (userId ?? "")) ?? (userId === profil?.id ? profil : null) ?? null;
  const wochenstunden = (uid?: string) => Number((uid ? mitarbeiter.find((m) => m.id === uid) : gewaehlt)?.wochenstunden ?? 38.5);
  const abwesendAm = (iso: string, uid: string) => abwesend.find((a) => a.user_id === uid && a.von <= iso && a.bis >= iso);
  const abwesendStunden = (iso: string, uid: string) => {
    const a = abwesendAm(iso, uid);
    return a && a.art !== "zeitausgleich" ? abwesenheitStunden(a, iso, wochenstunden(uid)) : 0;
  };
  const jeTag = (iso: string, uid?: string) =>
    zeiten.filter((z) => z.datum === iso && (!uid || z.user_id === uid)).reduce((s, z) => s + Number(z.stunden), 0);
  const heute = isoTag();
  const alle = istChef && person === "alle";
  const max = Math.max(9, ...tage.map((t) => jeTag(t) + (userId ? abwesendStunden(t, userId) : 0)));
  const sollWoche = sollZeitraum(montag, sonntag, wochenstunden());
  const abwesendSumme = userId ? tage.reduce((s, t) => s + abwesendStunden(t, userId), 0) : 0;

  const waehlen = (z: ZeitMitInfo) => {
    // Stunden aus einem Regiebericht gehören dorthin — dort werden sie geändert
    if (z.regiebericht_id) navigate(`/regie/${z.regiebericht_id}`);
    else setDialog({ eintrag: z });
  };

  return (
    <Seite titel="Stunden" untertitel={ansicht === "monat" ? "Monatsansicht" : `KW ${kalenderwoche(montag)} · ${datum(montag).slice(0, 6)} – ${datum(sonntag)}`}
      aktionen={<Button onClick={() => setDialog({})} className="gap-1.5"><Plus className="h-4 w-4" /> Stunden</Button>}>
      <div className="inline-flex rounded-md border bg-secondary p-0.5" role="group" aria-label="Ansicht">
        {(["woche", "monat"] as Ansicht[]).map((a) => (
          <button key={a} type="button" onClick={() => ansichtWechseln(a)} aria-pressed={ansicht === a}
            className={cn("min-h-10 rounded px-5 text-sm font-medium transition-colors", ansicht === a ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground")}>
            {a === "woche" ? "Woche" : "Monat"}
          </button>
        ))}
      </div>
      {ansicht === "woche" && <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMontag(tageDazu(montag, -7))} aria-label="Woche zurück">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setMontag(montagVon(heute))} disabled={montag === montagVon(heute)}>
          Diese Woche
        </Button>
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMontag(tageDazu(montag, 7))} aria-label="Woche vor">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>}

      {istChef && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: "alle", label: "Alle" }, ...mitarbeiter.map((m) => ({ id: m.id, label: m.vorname || m.nachname, m }))].map((x) => {
            const an = person === x.id || (!person && x.id === profil?.id);
            return (
              <button key={x.id} type="button" onClick={() => setPerson(x.id)} aria-pressed={an}
                className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  "m" in x && "pl-1.5",
                  an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                {"m" in x && <Avatar profil={x.m} className="h-7 w-7 text-[11px]" />}
                {x.label}
              </button>
            );
          })}
        </div>
      )}

      {istChef && <AntraegeKarte />}

      {ansicht === "monat" && (alle
        ? <MonatAlle mitarbeiter={mitarbeiter} onPerson={setPerson} />
        : gewaehlt && <MonatsAnsicht key={gewaehlt.id} person={gewaehlt} onBuchen={(d) => setDialog({ datum: d })} onWahl={waehlen} />)}

      {/* Wochenüberblick: Balken je Tag, beim Chef „Alle“ als Raster Person × Tag */}
      {ansicht === "woche" && <section className="rounded-lg border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-muted-foreground">{alle ? "Alle Mitarbeiter" : "Woche"}</p>
          <p className="zahl text-xl font-bold">
            {stunden(summe + abwesendSumme)}
            {!alle && <span className="text-sm font-normal text-muted-foreground"> / {stunden(sollWoche)}</span>}
          </p>
        </div>

        {alle ? (
          <div className="mt-3 overflow-x-auto">
            {/* Am Handy klein genug, dass die Σ-Spalte ohne Wischen zu sehen ist */}
            <table className="w-full min-w-[18rem] text-xs sm:text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium" />
                  {tage.map((t, i) => <th key={t} className={cn("pb-1.5 text-right font-medium", t === heute && "text-primary")}>{TAGE[i]}</th>)}
                  <th className="pb-1.5 text-right font-medium">Σ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mitarbeiter.map((m) => {
                  const s = tage.reduce((x, t) => x + jeTag(t, m.id) + abwesendStunden(t, m.id), 0);
                  const mSoll = sollZeitraum(montag, sonntag, Number(m.wochenstunden));
                  return (
                    <tr key={m.id}>
                      <td className="pr-1">
                        <button type="button" className="flex min-h-11 items-center gap-1.5 font-medium hover:text-primary" onClick={() => setPerson(m.id)}>
                          <Avatar profil={m} className="h-6 w-6 text-[10px]" /><span className="max-w-[5rem] truncate">{m.vorname}</span>
                        </button>
                      </td>
                      {tage.map((t) => {
                        const h = jeTag(t, m.id);
                        const ab = abwesendAm(t, m.id);
                        const kurz = ab ? ABWESENHEIT_ART[ab.art as AbwesenheitArt]?.kurz ?? "–" : feiertagName(t) ? "F" : "–";
                        return <td key={t} title={ab ? ABWESENHEIT_ART[ab.art as AbwesenheitArt]?.text : feiertagName(t) ?? undefined}
                          className={cn("zahl py-2 text-right", !h && "text-muted-foreground/50", !h && ab && "font-semibold text-muted-foreground")}>{h ? zahl(h) : kurz}</td>;
                      })}
                      <td className={cn("zahl py-2 text-right font-semibold", s < mSoll && montag < montagVon(heute) && "text-status-rot-fg")}>
                        {zahl(s)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {tage.map((t, i) => {
              const h = jeTag(t);
              const abw = userId ? abwesendStunden(t, userId) : 0;
              const ft = feiertagName(t);
              const ab = userId ? abwesendAm(t, userId) : undefined;
              return (
                <button key={t} type="button" onClick={() => setDialog({ datum: t })}
                  className="group flex flex-col items-center gap-1" aria-label={`${TAGE[i]}: ${stunden(h)}${ab ? `, ${ABWESENHEIT_ART[ab.art as AbwesenheitArt]?.text ?? "abwesend"}` : ""}${ft ? `, ${ft}` : ""} — Stunden buchen`} title={ft ?? undefined}>
                  <span className="zahl text-xs font-semibold">{h ? zahl(h) : ab ? ABWESENHEIT_ART[ab.art as AbwesenheitArt]?.kurz : ft ? "F" : ""}</span>
                  <span className="flex h-20 w-full flex-col justify-end overflow-hidden rounded-md bg-muted">
                    {abw > 0 && <span className="w-full bg-muted-foreground/30" style={{ height: `${(abw / max) * 100}%` }} />}
                    <span className={cn("w-full rounded-md transition-all", h ? "bg-primary" : "")} style={{ height: `${(h / max) * 100}%` }} />
                  </span>
                  <span className={cn("text-xs", t === heute ? "font-bold text-primary" : "text-muted-foreground")}>{TAGE[i]}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>}

      {gewaehlt && !alle && <KontoKarte person={gewaehlt} onAbwesenheit={() => setAbwesenheitOffen(true)} />}
      {userId && <AbwesenheitListe userId={userId} />}
      {alle && (
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setAbwesenheitOffen(true)}>
          <CalendarOff className="h-4 w-4" /> Abwesenheit eintragen
        </Button>
      )}

      {ansicht === "monat" ? null : !isLoading && zeiten.length === 0 ? (
        <Leer icon={Clock} text="In dieser Woche ist nichts gebucht.">
          <Button onClick={() => setDialog({})} className="gap-2"><Plus className="h-4 w-4" /> Stunden buchen</Button>
        </Leer>
      ) : (
        <ZeitenListe zeiten={zeiten} onWahl={waehlen} mitPerson={alle} />
      )}

      <AbwesenheitDialog open={abwesenheitOffen} onOpenChange={setAbwesenheitOffen} userId={userId} />
      <ZeitDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        eintrag={dialog?.eintrag ?? null}
        datum={dialog?.datum}
      />
    </Seite>
  );
}
