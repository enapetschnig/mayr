import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Copy, CornerDownRight, FileText, Link2, Minus, MoreVertical, Pencil, Plus, Rows3, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Leer } from "@/components/Bausteine";
import { euro, zahl } from "@/lib/format";
import { aufschlagAus } from "@/lib/kalkulation";
import { RAUM_VORSCHLAEGE } from "@/lib/sprachParser";
import { EINHEITEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  aufschlagVon, duplizieren, entfernen, gruppenGroesse, kannVerschieben, mengeVon, mitAufschlag, mitEinkauf, ohneBetrag, positionGesamt,
  positionsNummern, preisVon, preisText, titelPosition, verschieben, zahlText, zwischensummen, type EditorPosition,
} from "./editor";
import { ZahlFeld } from "./Eingabezeile";
import { PositionDialog } from "./PositionDialog";

type Setzen = (f: (alt: EditorPosition[]) => EditorPosition[]) => void;

/** Langtext-Feld am PC so hoch wie der Text (grob: ~90 Zeichen je Zeile), 2–6 Zeilen */
const langtextZeilen = (t: string) =>
  Math.min(6, Math.max(2, t.split("\n").reduce((n, z) => n + Math.max(1, Math.ceil(z.length / 90)), 0)));

/**
 * Positionsliste: am Handy Karten mit großem −/+, am PC eine Tabelle mit
 * Eingabefeldern. Titel (Räume) gliedern; ein angetippter Titel ist der
 * „aktive“ — neue Leistungen landen darunter.
 */
export function PositionenEditor({
  positionen, setPositionen, bearbeitbar, pc, aktiverTitel, setAktiverTitel, stundensatz, kalk = true, materialAufschlag = 0,
}: {
  positionen: EditorPosition[];
  setPositionen: Setzen;
  bearbeitbar: boolean;
  pc: boolean;
  aktiverTitel: string | null;
  setAktiverTitel: (id: string | null) => void;
  /** Standard-Stundensatz für „Preis kalkulieren“ */
  stundensatz?: number;
  /** Spalten EK und Aufschlag am PC */
  kalk?: boolean;
  /** Aufschlag des Betriebs — für den ersten Einkaufspreis einer Position ohne Preis */
  materialAufschlag?: number;
}) {
  const satz = stundensatz ?? 0;
  const ersetzen = (id: string, f: (p: EditorPosition) => EditorPosition) =>
    setPositionen((alt) => alt.map((p) => (p.id === id ? f(p) : p)));
  const [bearbeiten, setBearbeiten] = useState<EditorPosition | null>(null);
  const [titelLoeschen, setTitelLoeschen] = useState<EditorPosition | null>(null);
  const [langOffen, setLangOffen] = useState<Set<string>>(new Set());

  const nummern = useMemo(() => positionsNummern(positionen.map((p) => p.art)), [positionen]);
  const zs = useMemo(() => zwischensummen(positionen.map((p) => ({ art: p.art, gesamt: positionGesamt(p) }))), [positionen]);
  const titelAnzahl = positionen.filter((p) => p.art === "titel").length;

  /** „EK 10,00 · +30 %“ unter dem Preis — nur intern, nie auf dem PDF */
  const kalkText = (p: EditorPosition) => {
    if (p.ek_preis == null) return null;
    const auf = aufschlagAus({ preis: preisVon(p), ek: p.ek_preis, minuten: p.minuten, satz: stundensatz ?? 0 });
    return (
      <span title="Einkauf und Aufschlag — nur intern" className={cn("zahl block whitespace-nowrap text-[11px] leading-tight text-muted-foreground", auf != null && auf < 0 && "text-destructive")}>
        EK {preisText(p.ek_preis)}{auf != null && ` · ${auf > 0 ? "+" : ""}${Math.round(auf)} %`}
      </span>
    );
  };
  const aendern = (id: string, werte: Partial<EditorPosition>) =>
    setPositionen((alt) => alt.map((p) => (p.id === id ? { ...p, ...werte } : p)));
  const mengePlus = (p: EditorPosition, d: number) => aendern(p.id, { menge: zahlText(Math.max(0, mengeVon(p) + d)) });
  const loeschen = (p: EditorPosition) => {
    if (p.art === "titel" && gruppenGroesse(positionen, p.id) > 0) { setTitelLoeschen(p); return; }
    setPositionen((alt) => entfernen(alt, p.id));
    if (aktiverTitel === p.id) setAktiverTitel(null);
  };
  const aktion = (p: EditorPosition, was: Aktion) => {
    if (was === "bearbeiten") setBearbeiten(p);
    else if (was === "hoch") setPositionen((alt) => verschieben(alt, p.id, -1));
    else if (was === "runter") setPositionen((alt) => verschieben(alt, p.id, 1));
    else if (was === "kopieren") {
      const { liste, neueId } = duplizieren(positionen, p.id);
      setPositionen(() => liste);
      if (p.art === "titel") setAktiverTitel(neueId);
    } else if (was === "loeschen") loeschen(p);
    else if (was === "langtext") setLangOffen((s) => new Set(s).add(p.id));
    else if (was === "hier") setAktiverTitel(p.id);
    else if (was === "titelDavor") {
      const t = titelPosition("");
      setPositionen((alt) => {
        const i = alt.findIndex((x) => x.id === p.id);
        return [...alt.slice(0, i), t, ...alt.slice(i)];
      });
      setAktiverTitel(t.id);
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-titel-id="${t.id}"]`)?.focus(), 50);
    }
  };

  if (!positionen.length) {
    return (
      <section className="rounded-lg border bg-card">
        <Leer icon={FileText} text={bearbeitbar ? (pc ? "Noch keine Positionen — unten eintippen, diktieren oder aus dem Projekt übernehmen." : "Noch keine Positionen — Leistung antippen, diktieren oder aus dem Projekt übernehmen.") : "Keine Positionen."} />
      </section>
    );
  }

  const dialoge = (
    <>
      <PositionDialog
        position={bearbeiten}
        stundensatz={stundensatz}
        onOpenChange={(o) => { if (!o) setBearbeiten(null); }}
        onUebernehmen={(p) => { aendern(p.id, p); setBearbeiten(null); }}
        onLoeschen={(id) => {
          const p = positionen.find((x) => x.id === id);
          setBearbeiten(null);
          if (p) loeschen(p);
        }}
      />
      <AlertDialog open={!!titelLoeschen} onOpenChange={(o) => { if (!o) setTitelLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>„{titelLoeschen?.bezeichnung}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Unter dem Titel stehen {titelLoeschen ? gruppenGroesse(positionen, titelLoeschen.id) : 0} Positionen.
              Nur die Überschrift löschen (die Positionen rutschen zum Titel davor) oder alles?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="outline" className="h-11" onClick={() => {
              if (titelLoeschen) setPositionen((alt) => entfernen(alt, titelLoeschen.id));
              if (aktiverTitel === titelLoeschen?.id) setAktiverTitel(null);
              setTitelLoeschen(null);
            }}>Nur Überschrift</Button>
            <Button variant="destructive" className="h-11" onClick={() => {
              if (titelLoeschen) setPositionen((alt) => entfernen(alt, titelLoeschen.id, true));
              if (aktiverTitel === titelLoeschen?.id) setAktiverTitel(null);
              setTitelLoeschen(null);
            }}>Mit Positionen löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // ── PC: Tabelle ──
  // EK und Aufschlag als eigene Spalten (nur intern) — ab 1280 px, sonst klein unter dem Preis
  const kalkSpalten = kalk && positionen.some((p) => !ohneBetrag(p));
  const kalkZelle = "hidden xl:table-cell";
  if (pc) {
    return (
      <section className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="w-14 py-2.5 pl-4 text-left font-medium">Pos.</th>
              <th className="py-2.5 pr-2 text-left font-medium">Bezeichnung</th>
              <th className="w-20 py-2.5 pr-2 text-right font-medium">Menge</th>
              <th className="w-20 py-2.5 pr-2 text-left font-medium">Einheit</th>
              {kalkSpalten && <th className={cn(kalkZelle, "w-24 py-2.5 pr-2 text-right font-medium")} title="Einkaufspreis je Einheit — nur intern">EK</th>}
              {kalkSpalten && <th className={cn(kalkZelle, "w-24 py-2.5 pr-2 text-right font-medium")} title="Aufschlag auf den Einkauf — nur intern">Aufschlag</th>}
              <th className="w-28 py-2.5 pr-2 text-right font-medium">EP netto</th>
              <th className="w-28 py-2.5 pr-3 text-right font-medium">Gesamt</th>
              {bearbeitbar && <th className="w-[6.5rem] py-2.5 pr-3" aria-label="Aktionen" />}
            </tr>
          </thead>
          <tbody>
            {positionen.map((p, i) => {
              const titel = p.art === "titel";
              const text = p.art === "text";
              const aktiv = bearbeitbar && titel && p.id === aktiverTitel;
              const langtextSichtbar = !titel && (!!p.langtext || langOffen.has(p.id));
              const auf = aufschlagVon(p, satz);
              return (
                <tr
                  key={p.id}
                  className={cn("border-b align-top last:border-b-0", titel && "bg-muted/40", aktiv && "bg-primary-soft")}
                  onClick={titel && bearbeitbar ? () => setAktiverTitel(p.id) : undefined}
                >
                  <td className={cn("zahl py-2.5 pl-4 text-xs text-muted-foreground", titel && "pt-3.5 text-sm font-semibold text-foreground")}>{nummern[i]}</td>
                  {titel || text ? (
                    <>
                    <td colSpan={3} className="py-1.5 pr-2">
                      {bearbeitbar ? (
                        <Input
                          value={p.bezeichnung}
                          onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                          onFocus={titel ? () => setAktiverTitel(p.id) : undefined}
                          className={cn("h-9", titel && "font-semibold", text && "italic")}
                          placeholder={titel ? "Titel, z. B. Küche oder Verteiler" : "Hinweistext"}
                          list={titel ? "titel-vorschlaege" : undefined}
                          data-titel-id={titel ? p.id : undefined}
                          data-text-id={text ? p.id : undefined}
                          aria-label={titel ? `Titel ${nummern[i]}` : "Hinweistext"}
                        />
                      ) : (
                        <p className={cn("py-1", titel && "font-semibold", text && "italic text-muted-foreground")}>{p.bezeichnung}</p>
                      )}
                      {titel && p.langtext && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.langtext}</p>}
                      {aktiv && bearbeitbar && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</p>}
                    </td>
                    {kalkSpalten && <td className={kalkZelle} />}
                    {kalkSpalten && <td className={kalkZelle} />}
                    <td />
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar ? (
                          <Input value={p.bezeichnung} onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })} className="h-9" />
                        ) : (
                          <p className="py-1 font-medium">{p.bezeichnung}</p>
                        )}
                        {/* Langtext klein und grau — erst ein Klick macht ihn zum Bearbeiten auf, sonst wird die Tabelle lang */}
                        {langtextSichtbar && (bearbeitbar && langOffen.has(p.id) ? (
                          <Textarea
                            value={p.langtext}
                            onChange={(e) => aendern(p.id, { langtext: e.target.value })}
                            onBlur={() => setLangOffen((s) => { const n = new Set(s); n.delete(p.id); return n; })}
                            rows={langtextZeilen(p.langtext)}
                            placeholder="Langtext"
                            className="mt-1 min-h-0 text-xs"
                            autoFocus
                          />
                        ) : bearbeitbar ? (
                          <button type="button" onClick={() => setLangOffen((s) => new Set(s).add(p.id))} title="Langtext bearbeiten"
                            className="mt-0.5 line-clamp-2 w-full rounded px-3 text-left text-xs text-muted-foreground hover:bg-muted/60">
                            {p.langtext}
                          </button>
                        ) : <p className="whitespace-pre-line text-xs text-muted-foreground">{p.langtext}</p>)}
                        {p.quelle && <Herkunft />}
                      </td>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar
                          ? <Input value={p.menge} onChange={(e) => aendern(p.id, { menge: e.target.value })} inputMode="decimal" className="zahl h-9 text-right" />
                          : <p className="zahl py-1 text-right">{zahl(mengeVon(p))}</p>}
                      </td>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar ? (
                          <select
                            value={p.einheit}
                            onChange={(e) => aendern(p.id, { einheit: e.target.value })}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {(EINHEITEN.includes(p.einheit) ? EINHEITEN : [p.einheit, ...EINHEITEN]).map((e) => <option key={e} value={e}>{e}</option>)}
                          </select>
                        ) : <p className="py-1">{p.einheit}</p>}
                      </td>
                      {kalkSpalten && (
                        <td className={cn(kalkZelle, "py-1.5 pr-2")}>
                          {bearbeitbar && p.art !== "arbeit" && p.art !== "abzug" ? (
                            <ZahlFeld wert={p.ek_preis} onWert={(n) => ersetzen(p.id, (x) => mitEinkauf(x, n, satz, materialAufschlag))}
                              className="h-9 bg-muted/30" placeholder="–" aria-label={`Einkauf ${nummern[i]}`} data-ek-id={p.id} />
                          ) : <p className="zahl py-1 text-right text-muted-foreground">{p.ek_preis != null ? preisText(p.ek_preis) : ""}</p>}
                        </td>
                      )}
                      {kalkSpalten && (
                        <td className={cn(kalkZelle, "py-1.5 pr-2")}>
                          {bearbeitbar && auf != null ? (
                            <div className="relative">
                              <ZahlFeld wert={auf} nachkomma={1} onWert={(n) => { if (n != null) ersetzen(p.id, (x) => mitAufschlag(x, n, satz)); }}
                                className={cn("h-9 bg-muted/30 pr-6", auf < 0 && "text-destructive")} aria-label={`Aufschlag ${nummern[i]}`} data-auf-id={p.id} />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                          ) : <p className={cn("zahl py-1 text-right text-muted-foreground", auf != null && auf < 0 && "text-destructive")}>{auf != null ? `${zahl(auf)} %` : ""}</p>}
                        </td>
                      )}
                      <td className="py-1.5 pr-2">
                        {bearbeitbar
                          ? <Input value={p.einzelpreis} onChange={(e) => aendern(p.id, { einzelpreis: e.target.value })} inputMode="decimal" className="zahl h-9 text-right" data-preis-id={p.id} aria-label={`Einzelpreis ${nummern[i]}`} />
                          : <p className="zahl py-1 text-right">{euro(preisVon(p))}</p>}
                        <span className={cn("block pt-0.5 text-right", kalkSpalten && "xl:hidden")}>{kalkText(p)}</span>
                      </td>
                    </>
                  )}
                  <td className={cn("zahl py-2.5 pr-3 text-right", titel ? "pt-3.5 font-semibold" : "font-medium")}>
                    {titel ? (titelAnzahl > 1 ? euro(zs[i] ?? 0) : "") : text ? "" : euro(positionGesamt(p))}
                  </td>
                  {bearbeitbar && (
                    <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Nach oben" disabled={!kannVerschieben(positionen, p.id, -1)} onClick={() => aktion(p, "hoch")}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Nach unten" disabled={!kannVerschieben(positionen, p.id, 1)} onClick={() => aktion(p, "runter")}><ArrowDown className="h-4 w-4" /></Button>
                        <ZeilenMenue p={p} positionen={positionen} onAktion={(a) => aktion(p, a)} pc />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="titel-vorschlaege">
          {RAUM_VORSCHLAEGE.map((r) => <option key={r} value={r} />)}
        </datalist>
        {dialoge}
      </section>
    );
  }

  // ── Handy: Karten ──
  return (
    <section className="space-y-2">
      {positionen.map((p, i) => {
        if (p.art === "titel") {
          const aktiv = bearbeitbar && p.id === aktiverTitel;
          // Titel direkt in der Karte benennen; solange er leer ist, stehen die üblichen Räume zum Antippen da
          const vorschlaege = bearbeitbar && !p.bezeichnung.trim()
            ? RAUM_VORSCHLAEGE.filter((r) => !positionen.some((x) => x.art === "titel" && x.bezeichnung.trim().toLowerCase() === r.toLowerCase())).slice(0, 10)
            : [];
          return (
            <div key={p.id} className={cn("rounded-lg border px-3 py-2", aktiv ? "border-primary bg-primary-soft" : "bg-muted/50", i > 0 && "mt-4")}>
              <div className="flex items-center gap-2">
                <span className="zahl shrink-0 text-sm font-semibold text-muted-foreground">{nummern[i]}</span>
                {bearbeitbar ? (
                  <Input
                    value={p.bezeichnung}
                    onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                    onFocus={() => setAktiverTitel(p.id)}
                    placeholder="Titel, z. B. Küche"
                    className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-1.5 font-semibold shadow-none focus-visible:border-input focus-visible:bg-card"
                    data-titel-id={p.id}
                    aria-label={`Titel ${nummern[i]}`}
                    enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                ) : <span className="min-w-0 flex-1 truncate font-semibold">{p.bezeichnung || "Ohne Namen"}</span>}
                {titelAnzahl > 1 && <span className="zahl shrink-0 text-sm font-semibold">{euro(zs[i] ?? 0)}</span>}
                {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} onAktion={(a) => aktion(p, a)} />}
              </div>
              {vorschlaege.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pb-1">
                  {vorschlaege.map((r) => (
                    <button key={r} type="button" onClick={() => { aendern(p.id, { bezeichnung: r }); setAktiverTitel(p.id); }}
                      className="h-9 rounded-full border bg-card px-3 text-sm font-medium active:bg-primary-soft">{r}</button>
                  ))}
                </div>
              )}
              {aktiv && bearbeitbar && !vorschlaege.length && <span className="flex items-center gap-1 px-1.5 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</span>}
              {p.langtext && <span className="line-clamp-2 block px-1.5 text-xs text-muted-foreground">{p.langtext}</span>}
            </div>
          );
        }
        if (p.art === "text") {
          return (
            <div key={p.id} className="flex items-start gap-2 rounded-lg border border-dashed bg-card px-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left text-sm italic text-muted-foreground [overflow-wrap:anywhere]" onClick={() => bearbeitbar && setBearbeiten(p)} disabled={!bearbeitbar}>
                {p.bezeichnung || "Hinweistext"}
              </button>
              {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} onAktion={(a) => aktion(p, a)} />}
            </div>
          );
        }
        return (
          <div key={p.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start gap-2">
              <span className="zahl w-9 shrink-0 pt-0.5 text-xs text-muted-foreground">{nummern[i]}</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => bearbeitbar && setBearbeiten(p)} disabled={!bearbeitbar}>
                <span className="block text-sm font-medium leading-snug [overflow-wrap:anywhere]">{p.bezeichnung || <span className="text-muted-foreground">Ohne Bezeichnung</span>}</span>
                {p.langtext && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.langtext}</span>}
                {p.quelle && <Herkunft />}
              </button>
              {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} onAktion={(a) => aktion(p, a)} />}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {bearbeitbar ? (
                <div className="flex shrink-0 items-center">
                  <Button variant="outline" size="icon" className="h-11 w-11 rounded-r-none" aria-label="weniger" onClick={() => mengePlus(p, -1)}><Minus className="h-4 w-4" /></Button>
                  <Input
                    value={p.menge}
                    onChange={(e) => aendern(p.id, { menge: e.target.value })}
                    inputMode="decimal"
                    className="zahl h-11 w-16 rounded-none border-x-0 px-1 text-center"
                    aria-label="Menge"
                  />
                  <Button variant="outline" size="icon" className="h-11 w-11 rounded-l-none" aria-label="mehr" onClick={() => mengePlus(p, 1)}><Plus className="h-4 w-4" /></Button>
                </div>
              ) : (
                <span className="zahl font-medium">{zahl(mengeVon(p))}</span>
              )}
              <span className="truncate text-sm text-muted-foreground">{p.einheit}</span>
              <button
                type="button"
                className="ml-auto shrink-0 text-right"
                onClick={() => bearbeitbar && setBearbeiten(p)}
                disabled={!bearbeitbar}
                aria-label="Preis bearbeiten"
              >
                <span className="zahl block font-semibold">{euro(positionGesamt(p))}</span>
                <span className="zahl block text-xs text-muted-foreground">à {euro(preisVon(p))}</span>
                {kalkText(p)}
              </button>
            </div>
          </div>
        );
      })}
      {dialoge}
    </section>
  );
}

function Herkunft() {
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
      <Link2 className="h-3 w-3" /> aus dem Projekt übernommen
    </span>
  );
}

type Aktion = "bearbeiten" | "hoch" | "runter" | "kopieren" | "loeschen" | "langtext" | "hier" | "titelDavor";

function ZeilenMenue({ p, positionen, onAktion, pc }: { p: EditorPosition; positionen: EditorPosition[]; onAktion: (a: Aktion) => void; pc?: boolean }) {
  const titel = p.art === "titel";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("shrink-0", pc ? "h-8 w-8" : "-mr-1 -mt-1 h-10 w-10")} aria-label="Weitere Aktionen">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {titel && <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("hier")}><CornerDownRight className="h-4 w-4" /> Hier hinzufügen</DropdownMenuItem>}
        <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("bearbeiten")}><Pencil className="h-4 w-4" /> {titel ? "Umbenennen" : "Bearbeiten"}</DropdownMenuItem>
        {pc && !titel && p.art !== "text" && !p.langtext && (
          <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("langtext")}><FileText className="h-4 w-4" /> Langtext hinzufügen</DropdownMenuItem>
        )}
        {!titel && <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("titelDavor")}><Rows3 className="h-4 w-4" /> Titel darüber einfügen</DropdownMenuItem>}
        {!pc && (
          <>
            <DropdownMenuItem className="h-11 gap-2" disabled={!kannVerschieben(positionen, p.id, -1)} onClick={() => onAktion("hoch")}><ArrowUp className="h-4 w-4" /> Nach oben</DropdownMenuItem>
            <DropdownMenuItem className="h-11 gap-2" disabled={!kannVerschieben(positionen, p.id, 1)} onClick={() => onAktion("runter")}><ArrowDown className="h-4 w-4" /> Nach unten</DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className="h-11 gap-2" onClick={() => onAktion("kopieren")}><Copy className="h-4 w-4" /> {titel ? "Raum kopieren" : "Kopieren"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-11 gap-2 text-destructive focus:text-destructive" onClick={() => onAktion("loeschen")}><Trash2 className="h-4 w-4" /> Löschen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
