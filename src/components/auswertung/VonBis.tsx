import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Bausteine";
import { datum, isoZuDatum, stunden } from "@/lib/format";
import { schnitt, type Tag } from "@/lib/stundenAuswertung";
import { STUNDEN_ART, type StundenArt } from "@/lib/types";
import { cn } from "@/lib/utils";

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// Zeitleiste von 6 bis 19 Uhr; was davor oder danach liegt, wird an den Rand gesetzt
const AB = 6 * 60, BIS = 19 * 60;
const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const pos = (hhmm: string) => `${(Math.min(BIS, Math.max(AB, min(hhmm))) - AB) / (BIS - AB) * 100}%`;
/** Datenfarben der Blöcke je Art (keine Aktionsfarbe) */
const FARBE: Record<string, string> = {
  arbeit: "bg-sky-500/80", fahrt: "bg-slate-400", ue50: "bg-amber-500", ue100: "bg-orange-600", garantie: "bg-violet-500",
};
const STRICHE = [6, 8, 10, 12, 14, 16, 18];

/**
 * Von–Bis je Mitarbeiter und Tag: Beginn, Ende, Pause, Stunden und eine
 * Zeitleiste 6–19 Uhr mit den einzelnen Buchungen. Je Person Ø Beginn/Ende.
 */
export function VonBis({ tage, profile }: { tage: Tag[]; profile: { id: string; vorname: string | null; nachname: string | null; farbe: string | null }[] }) {
  const leute = [...new Set(tage.map((t) => t.user_id))];
  // Eine Person: gleich offen; mehrere: zugeklappt, jede zum Aufklappen
  const [umgeklappt, setUmgeklappt] = useState<Set<string>>(new Set());
  const istAuf = (u: string) => (leute.length === 1) !== umgeklappt.has(u);
  const arten = [...new Set(tage.flatMap((t) => t.bloecke.map((b) => b.art)))];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {arten.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-4 rounded-sm", FARBE[a] ?? "bg-slate-400")} />{STUNDEN_ART[a as StundenArt]?.text ?? a}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-status-rot-fg" /> auffällig (früh, spät, über 10 h, Lücke, Überschneidung)</span>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-28 px-3 py-2.5 font-medium sm:w-32">Tag</th>
              <th className="w-[5.5rem] px-2 py-2.5 font-medium sm:w-32">Von – Bis</th>
              <th className="hidden w-16 px-2 py-2.5 text-right font-medium sm:table-cell">Pause</th>
              <th className="w-16 px-2 py-2.5 text-right font-medium">Std.</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">
                <span className="relative block h-4">
                  {STRICHE.map((h) => <span key={h} className="zahl absolute -translate-x-1/2" style={{ left: pos(`${h}:00`) }}>{h}</span>)}
                </span>
              </th>
              <th className="hidden w-56 px-3 py-2.5 font-medium xl:table-cell">Baustelle</th>
            </tr>
          </thead>
          <tbody>
            {leute.map((u) => {
              const seine = tage.filter((t) => t.user_id === u);
              const auf = istAuf(u);
              const sn = schnitt(seine);
              const summe = seine.reduce((s, t) => s + t.stunden, 0);
              const auffaellig = seine.filter((t) => t.hinweise.length).length;
              return (
                <Fragment key={u}>
                  <tr className="cursor-pointer border-b bg-muted/30 hover:bg-muted/60" aria-expanded={auf}
                    onClick={() => setUmgeklappt((alt) => { const n = new Set(alt); if (n.has(u)) n.delete(u); else n.add(u); return n; })}>
                    <td colSpan={2} className="px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !auf && "-rotate-90")} />
                        <Avatar profil={profile.find((p) => p.id === u)} className="h-6 w-6 text-[10px]" />
                        <span className="truncate">{seine[0].person}</span>
                      </span>
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="zahl whitespace-nowrap px-2 py-2.5 text-right font-semibold">{stunden(summe)}</td>
                    <td colSpan={2} className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                      {seine.length} {seine.length === 1 ? "Tag" : "Tage"}
                      {sn.beginn && <> · Ø <span className="zahl font-medium text-foreground">{sn.beginn}–{sn.ende}</span></>}
                      {auffaellig > 0 && <span className="text-status-rot-fg"> · {auffaellig} auffällig</span>}
                    </td>
                  </tr>
                  {auf && seine.map((t) => {
                    const wt = WT[isoZuDatum(t.datum).getDay()];
                    return (
                      <tr key={t.datum} className={cn("border-b align-top last:border-b-0", (wt === "Sa" || wt === "So") && "bg-muted/20")}>
                        <td className="px-3 py-2">
                          <span className="zahl">{wt} {datum(t.datum).slice(0, 6)}</span>
                          {t.hinweise.length > 0 && (
                            <span className="ml-1 inline-flex align-[-2px] text-status-rot-fg" title={t.hinweise.join(", ")}><AlertTriangle className="h-3.5 w-3.5" /></span>
                          )}
                        </td>
                        <td className="zahl whitespace-nowrap px-2 py-2 font-medium">
                          {t.beginn ? `${t.beginn}–${t.ende}` : <span className="font-normal text-muted-foreground">ohne Zeit</span>}
                        </td>
                        <td className="zahl hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">{t.pause ? `${t.pause} min` : "–"}</td>
                        <td className="zahl whitespace-nowrap px-2 py-2 text-right">{stunden(t.stunden)}</td>
                        <td className="hidden px-3 py-2 md:table-cell">
                          <span className="relative block h-5 rounded bg-muted/60">
                            {STRICHE.map((h) => <span key={h} className="absolute inset-y-0 border-l border-background" style={{ left: pos(`${h}:00`) }} />)}
                            {t.bloecke.map((b, i) => (
                              <span key={i} title={`${b.von}–${b.bis} · ${STUNDEN_ART[b.art as StundenArt]?.text ?? b.art} · ${b.projekt ?? "ohne Projekt"}${b.taetigkeit ? ` · ${b.taetigkeit}` : ""}`}
                                className={cn("absolute inset-y-0.5 rounded-sm", FARBE[b.art] ?? "bg-slate-400")}
                                style={{ left: pos(b.von), width: `calc(${pos(b.bis)} - ${pos(b.von)})` }} />
                            ))}
                          </span>
                          {t.hinweise.length > 0 && <span className="mt-0.5 block text-xs text-status-rot-fg">{t.hinweise.join(" · ")}</span>}
                        </td>
                        <td className="hidden truncate px-3 py-2 text-xs text-muted-foreground xl:table-cell" title={t.projekte.join(", ")}>{t.projekte.join(", ")}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
