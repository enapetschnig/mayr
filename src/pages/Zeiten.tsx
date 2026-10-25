import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Avatar, Leer } from "@/components/Bausteine";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { ZeitenListe, useZeitenListe, type ZeitMitInfo } from "@/components/zeiten/ZeitenListe";
import { useMitarbeiter } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, isoTag, isoZuDatum, stunden, tageDazu } from "@/lib/format";
import { cn } from "@/lib/utils";

const SOLL_WOCHE = 40;
const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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
 */
export default function Zeiten() {
  const navigate = useNavigate();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const [montag, setMontag] = useState(() => montagVon(isoTag()));
  const [person, setPerson] = useState<string>(() => (istChef ? "alle" : ""));
  const [dialog, setDialog] = useState<{ eintrag?: ZeitMitInfo | null; datum?: string } | null>(null);

  const sonntag = tageDazu(montag, 6);
  const userId = person === "alle" ? undefined : person || profil?.id;
  const { data: zeiten = [], isLoading } = useZeitenListe({ von: montag, bis: sonntag, userId });
  const tage = Array.from({ length: 7 }, (_, i) => tageDazu(montag, i));
  const summe = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const jeTag = (iso: string, uid?: string) =>
    zeiten.filter((z) => z.datum === iso && (!uid || z.user_id === uid)).reduce((s, z) => s + Number(z.stunden), 0);
  const heute = isoTag();
  const alle = istChef && person === "alle";
  const max = Math.max(9, ...tage.map((t) => jeTag(t)));

  const waehlen = (z: ZeitMitInfo) => {
    // Stunden aus einem Regiebericht gehören dorthin — dort werden sie geändert
    if (z.regiebericht_id) navigate(`/regie/${z.regiebericht_id}`);
    else setDialog({ eintrag: z });
  };

  return (
    <Seite titel="Stunden" untertitel={`KW ${kalenderwoche(montag)} · ${datum(montag).slice(0, 6)} – ${datum(sonntag)}`}
      aktionen={<Button onClick={() => setDialog({})} className="gap-1.5"><Plus className="h-4 w-4" /> Stunden</Button>}>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMontag(tageDazu(montag, -7))} aria-label="Woche zurück">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setMontag(montagVon(heute))} disabled={montag === montagVon(heute)}>
          Diese Woche
        </Button>
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMontag(tageDazu(montag, 7))} aria-label="Woche vor">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {istChef && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: "alle", label: "Alle" }, ...mitarbeiter.map((m) => ({ id: m.id, label: m.vorname || m.nachname, m }))].map((x) => {
            const an = person === x.id || (!person && x.id === profil?.id);
            return (
              <button key={x.id} type="button" onClick={() => setPerson(x.id)} aria-pressed={an}
                className={cn("flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  "m" in x && "pl-1.5",
                  an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                {"m" in x && <Avatar profil={x.m} className="h-7 w-7 text-[11px]" />}
                {x.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Wochenüberblick: Balken je Tag, beim Chef „Alle“ als Raster Person × Tag */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-muted-foreground">{alle ? "Alle Mitarbeiter" : "Woche"}</p>
          <p className="zahl text-xl font-bold">
            {stunden(summe)}
            {!alle && <span className="text-sm font-normal text-muted-foreground"> / {SOLL_WOCHE} h</span>}
          </p>
        </div>

        {alle ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium" />
                  {tage.map((t, i) => <th key={t} className={cn("pb-1.5 text-right font-medium", t === heute && "text-primary")}>{TAGE[i]}</th>)}
                  <th className="pb-1.5 text-right font-medium">Σ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mitarbeiter.map((m) => {
                  const s = tage.reduce((x, t) => x + jeTag(t, m.id), 0);
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-2">
                        <button type="button" className="flex items-center gap-2 font-medium hover:text-primary" onClick={() => setPerson(m.id)}>
                          <Avatar profil={m} className="h-6 w-6 text-[10px]" />{m.vorname}
                        </button>
                      </td>
                      {tage.map((t) => {
                        const h = jeTag(t, m.id);
                        return <td key={t} className={cn("zahl py-2 text-right", !h && "text-muted-foreground/50")}>{h ? String(h).replace(".", ",") : "–"}</td>;
                      })}
                      <td className={cn("zahl py-2 text-right font-semibold", s < SOLL_WOCHE && montag < montagVon(heute) && "text-status-rot-fg")}>
                        {String(s).replace(".", ",")}
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
              return (
                <button key={t} type="button" onClick={() => setDialog({ datum: t })}
                  className="group flex flex-col items-center gap-1" aria-label={`${TAGE[i]}: ${stunden(h)} — Stunden buchen`}>
                  <span className="zahl text-xs font-semibold">{h ? String(h).replace(".", ",") : ""}</span>
                  <span className="flex h-20 w-full items-end overflow-hidden rounded-md bg-muted">
                    <span className={cn("w-full rounded-md transition-all", h ? "bg-primary" : "")} style={{ height: `${(h / max) * 100}%` }} />
                  </span>
                  <span className={cn("text-xs", t === heute ? "font-bold text-primary" : "text-muted-foreground")}>{TAGE[i]}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {!isLoading && zeiten.length === 0 ? (
        <Leer icon={Clock} text="In dieser Woche ist nichts gebucht.">
          <Button onClick={() => setDialog({})} className="gap-2"><Plus className="h-4 w-4" /> Stunden buchen</Button>
        </Leer>
      ) : (
        <ZeitenListe zeiten={zeiten} onWahl={waehlen} mitPerson={alle} />
      )}

      <ZeitDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        eintrag={dialog?.eintrag ?? null}
        datum={dialog?.datum}
      />
    </Seite>
  );
}
