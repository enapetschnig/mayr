import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Copy, CornerDownRight, FileText, Link2, Minus, MoreVertical, Pencil, Plus, Trash2,
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
import { EINHEITEN } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  duplizieren, entfernen, gruppenGroesse, kannVerschieben, mengeVon, positionGesamt, positionsNummern, preisVon,
  verschieben, zahlText, zwischensummen, type EditorPosition,
} from "./editor";
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
  positionen, setPositionen, bearbeitbar, pc, aktiverTitel, setAktiverTitel,
}: {
  positionen: EditorPosition[];
  setPositionen: Setzen;
  bearbeitbar: boolean;
  pc: boolean;
  aktiverTitel: string | null;
  setAktiverTitel: (id: string | null) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState<EditorPosition | null>(null);
  const [titelLoeschen, setTitelLoeschen] = useState<EditorPosition | null>(null);
  const [langOffen, setLangOffen] = useState<Set<string>>(new Set());

  const nummern = useMemo(() => positionsNummern(positionen.map((p) => p.art)), [positionen]);
  const zs = useMemo(() => zwischensummen(positionen.map((p) => ({ art: p.art, gesamt: positionGesamt(p) }))), [positionen]);
  const titelAnzahl = positionen.filter((p) => p.art === "titel").length;

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
  };

  if (!positionen.length) {
    return (
      <section className="rounded-lg border bg-card">
        <Leer icon={FileText} text={bearbeitbar ? "Noch keine Positionen — Leistung antippen, diktieren oder aus dem Projekt übernehmen." : "Keine Positionen."} />
      </section>
    );
  }

  const dialoge = (
    <>
      <PositionDialog
        position={bearbeiten}
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
  if (pc) {
    return (
      <section className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="w-14 py-2.5 pl-4 text-left font-medium">Pos.</th>
              <th className="py-2.5 pr-2 text-left font-medium">Bezeichnung</th>
              <th className="w-24 py-2.5 pr-2 text-right font-medium">Menge</th>
              <th className="w-24 py-2.5 pr-2 text-left font-medium">Einheit</th>
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
              return (
                <tr
                  key={p.id}
                  className={cn("border-b align-top last:border-b-0", titel && "bg-muted/40", aktiv && "bg-primary-soft")}
                  onClick={titel && bearbeitbar ? () => setAktiverTitel(p.id) : undefined}
                >
                  <td className={cn("zahl py-2.5 pl-4 text-xs text-muted-foreground", titel && "pt-3.5 text-sm font-semibold text-foreground")}>{nummern[i]}</td>
                  {titel || text ? (
                    <td colSpan={4} className="py-1.5 pr-2">
                      {bearbeitbar ? (
                        <Input
                          value={p.bezeichnung}
                          onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })}
                          className={cn("h-9", titel && "font-semibold", text && "italic")}
                          placeholder={titel ? "Raum / Titel" : "Hinweistext"}
                        />
                      ) : (
                        <p className={cn("py-1", titel && "font-semibold", text && "italic text-muted-foreground")}>{p.bezeichnung}</p>
                      )}
                      {titel && p.langtext && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.langtext}</p>}
                      {aktiv && bearbeitbar && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</p>}
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">
                        {bearbeitbar ? (
                          <Input value={p.bezeichnung} onChange={(e) => aendern(p.id, { bezeichnung: e.target.value })} className="h-9" />
                        ) : (
                          <p className="py-1 font-medium">{p.bezeichnung}</p>
                        )}
                        {langtextSichtbar && (bearbeitbar ? (
                          <Textarea
                            value={p.langtext}
                            onChange={(e) => aendern(p.id, { langtext: e.target.value })}
                            rows={langtextZeilen(p.langtext)}
                            placeholder="Langtext"
                            className="mt-1 min-h-0 text-xs"
                          />
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
                      <td className="py-1.5 pr-2">
                        {bearbeitbar
                          ? <Input value={p.einzelpreis} onChange={(e) => aendern(p.id, { einzelpreis: e.target.value })} inputMode="decimal" className="zahl h-9 text-right" />
                          : <p className="zahl py-1 text-right">{euro(preisVon(p))}</p>}
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
          return (
            <div
              key={p.id}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5", aktiv ? "border-primary bg-primary-soft" : "bg-muted/50", i > 0 && "mt-4")}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => bearbeitbar && setAktiverTitel(p.id)} disabled={!bearbeitbar}>
                <span className="flex items-baseline gap-2">
                  <span className="zahl text-sm font-semibold text-muted-foreground">{nummern[i]}</span>
                  <span className="truncate font-semibold">{p.bezeichnung || "Ohne Namen"}</span>
                </span>
                {aktiv && bearbeitbar && <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary"><CornerDownRight className="h-3 w-3" /> Neue Positionen landen hier</span>}
                {p.langtext && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{p.langtext}</span>}
              </button>
              {titelAnzahl > 1 && <span className="zahl shrink-0 text-sm font-semibold">{euro(zs[i] ?? 0)}</span>}
              {bearbeitbar && <ZeilenMenue p={p} positionen={positionen} onAktion={(a) => aktion(p, a)} />}
            </div>
          );
        }
        if (p.art === "text") {
          return (
            <div key={p.id} className="flex items-start gap-2 rounded-lg border border-dashed bg-card px-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left text-sm italic text-muted-foreground" onClick={() => bearbeitbar && setBearbeiten(p)} disabled={!bearbeitbar}>
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
                <span className="block text-sm font-medium leading-snug">{p.bezeichnung || <span className="text-muted-foreground">Ohne Bezeichnung</span>}</span>
                {p.langtext && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{p.langtext}</span>}
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

type Aktion = "bearbeiten" | "hoch" | "runter" | "kopieren" | "loeschen" | "langtext" | "hier";

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
