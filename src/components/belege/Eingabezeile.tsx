import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, ListChecks, Package, PenLine, Plus, Rows3, Search, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArtikelSuche } from "@/components/material/ArtikelSuche";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, euro, zahl } from "@/lib/format";
import { artikelVk, leistungPreis } from "@/lib/preise";
import { normalisieren } from "@/lib/sprachParser";
import type { Artikel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { schnellLesen, type KatalogLeistung } from "./editor";

type Treffer =
  | { art: "leistung"; l: KatalogLeistung }
  | { art: "artikel"; a: Artikel }
  | { art: "frei"; text: string }
  | { art: "titel"; name: string };

/**
 * Die leere Zeile unter den Positionen: tippen und Enter. Sucht im
 * Leistungskatalog und im Artikelstamm (auch Datanorm); ohne Treffer wird es
 * eine freie Position. „#Küche“ legt einen Titel an, „3 Steckdose“ = 3 Stück.
 */
export function Eingabezeile({
  katalog, stundensatz, ziel, onLeistung, onArtikel, onFrei, onTitel, onText,
}: {
  katalog: KatalogLeistung[];
  stundensatz: number;
  /** Name des Titels, unter dem neue Positionen landen */
  ziel: string | null;
  onLeistung: (l: KatalogLeistung, menge: number) => void;
  onArtikel: (a: Artikel, menge: number) => void;
  onFrei: (text: string, menge: number) => void;
  onTitel: (name: string) => void;
  onText: () => void;
}) {
  const { firma } = useSitzung();
  const [text, setText] = useState("");
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const feld = useRef<HTMLInputElement>(null);
  const eingabe = schnellLesen(text);
  const such = eingabe && "text" in eingabe ? eingabe.text : "";
  const menge = eingabe && "menge" in eingabe ? eingabe.menge : 1;
  const { data: artikel = [], isFetching, wartet } = useArtikelSuche(such.length >= 2 ? such : "", 6);
  const sucht = such.length >= 2 && wartet;
  // Enter, bevor die Artikel da sind: nicht still eine freie Position (0 €) anlegen,
  // sondern auf die Treffer warten und dann den ersten nehmen
  const [enterWartet, setEnterWartet] = useState(false);

  const treffer = useMemo<Treffer[]>(() => {
    if (!eingabe) return [];
    if ("titel" in eingabe) return [{ art: "titel", name: eingabe.titel }];
    const woerter = normalisieren(eingabe.text).split(/\s+/).filter(Boolean);
    const leistungen = katalog
      .filter((l) => woerter.every((w) => normalisieren(`${l.nummer ?? ""} ${l.kurztext} ${l.suchwoerter ?? ""} ${l.kategorie}`).includes(w)))
      .slice(0, 6)
      .map((l): Treffer => ({ art: "leistung", l }));
    const art = eingabe.text.length >= 2 && !sucht ? artikel.slice(0, 6).map((a): Treffer => ({ art: "artikel", a })) : [];
    return [...leistungen, ...art, { art: "frei", text: eingabe.text }];
  }, [eingabe, katalog, artikel, sucht]);

  const waehlen = (t: Treffer) => {
    if (t.art === "leistung") onLeistung(t.l, menge);
    else if (t.art === "artikel") onArtikel(t.a, menge);
    else if (t.art === "titel") onTitel(t.name);
    else onFrei(t.text, menge);
    setText("");
    setMarkiert(0);
    // Freie Position: der Fokus springt in deren Preis — sonst gleich weitertippen
    if (t.art !== "frei") window.setTimeout(() => feld.current?.focus(), 0);
  };

  const taste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && treffer.length) { e.preventDefault(); setOffen(true); setMarkiert((m) => Math.min(m + 1, treffer.length - 1)); }
    else if (e.key === "ArrowUp" && treffer.length) { e.preventDefault(); setMarkiert((m) => Math.max(m - 1, 0)); }
    else if (e.key === "Enter" && treffer.length) {
      e.preventDefault();
      const t = treffer[Math.min(markiert, treffer.length - 1)];
      if (t.art === "frei" && sucht) setEnterWartet(true);
      else waehlen(t);
    }
    else if (e.key === "Escape") { setOffen(false); setText(""); }
  };

  useEffect(() => {
    if (!enterWartet || sucht) return;
    setEnterWartet(false);
    if (treffer.length) waehlen(treffer[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterWartet, sucht, treffer]);

  const zeigen = offen && treffer.length > 0;
  const titelVorher = (i: number) => i === 0 || treffer[i - 1].art !== treffer[i].art;

  return (
    <div className="rounded-lg border border-dashed bg-card p-2" data-eingabezeile>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={feld}
            value={text}
            onChange={(e) => { setText(e.target.value); setOffen(true); setMarkiert(0); setEnterWartet(false); }}
            onFocus={() => setOffen(true)}
            onBlur={() => window.setTimeout(() => setOffen(false), 150)}
            onKeyDown={taste}
            placeholder="Position eingeben — Leistung oder Artikel suchen, freier Text, #Titel"
            className="h-10 border-0 bg-muted/50 pl-9 shadow-none focus-visible:ring-1"
            aria-label="Position eingeben"
            aria-expanded={zeigen}
            role="combobox"
            aria-controls="eingabe-treffer"
            autoComplete="off"
          />
          {zeigen && (
            <ul id="eingabe-treffer" role="listbox"
              className="absolute inset-x-0 top-full z-40 mt-1 max-h-[26rem] overflow-y-auto rounded-lg border bg-popover p-1 text-sm">
              {treffer.map((t, i) => (
                <li key={t.art === "leistung" ? `l${t.l.id}` : t.art === "artikel" ? `a${t.a.id}` : t.art}>
                  {t.art === "frei" && sucht && (
                    <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Artikel werden gesucht …</p>
                  )}
                  {titelVorher(i) && t.art !== "frei" && t.art !== "titel" && (
                    <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.art === "leistung" ? "Leistungen" : `Artikel${isFetching ? " …" : ""}`}
                    </p>
                  )}
                  <button type="button" role="option" aria-selected={i === markiert}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(t)} onMouseEnter={() => setMarkiert(i)}
                    className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left", i === markiert && "bg-primary-soft")}>
                    {t.art === "leistung" && (
                      <>
                        <ListChecks className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">{t.l.kurztext}</span>
                        <span className="zahl shrink-0 text-muted-foreground">{euro(leistungPreis(t.l, t.l.leistung_material ?? [], firma, stundensatz))} / {t.l.einheit}</span>
                      </>
                    )}
                    {t.art === "artikel" && (
                      <>
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{t.a.bezeichnung}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[t.a.hersteller, t.a.artikelnummer].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="zahl shrink-0 text-muted-foreground">{euro(artikelVk(t.a, firma))} / {t.a.einheit || "Stk"}</span>
                      </>
                    )}
                    {t.art === "frei" && (
                      <>
                        <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">„{t.text}“ als freie Position{menge !== 1 ? ` · ${zahl(menge)} Stk` : ""} — Preis selbst eintragen</span>
                      </>
                    )}
                    {t.art === "titel" && (
                      <>
                        <Rows3 className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate">Titel „{t.name}“ anlegen</span>
                      </>
                    )}
                    {i === markiert && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button variant="outline" className="h-10 gap-1.5" onClick={() => onTitel("")}><Plus className="h-4 w-4" /> Titel</Button>
        <Button variant="outline" className="h-10 gap-1.5" onClick={onText}><Type className="h-4 w-4" /> Text</Button>
      </div>
      <p className="px-1 pt-1.5 text-xs text-muted-foreground">
        {menge !== 1 && such ? <>Menge <span className="zahl font-medium text-foreground">{zahl(menge)}</span> · </> : null}
        {ziel ? <>Landet unter „{ziel}“ · </> : null}
        ↑↓ wählen, Enter übernimmt · „3 Steckdose“ = 3 Stück · „#Küche“ = Titel
      </p>
    </div>
  );
}

/**
 * Zahl in einer Tabellenzelle: beim Tippen bleibt der Text („1,“), außerhalb
 * steht der gerechnete Wert. Leer = null.
 */
export function ZahlFeld({
  wert, onWert, className, nachkomma = 2, ...rest
}: {
  wert: number | null;
  onWert: (n: number | null) => void;
  nachkomma?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState<string | null>(null);
  const anzeige = wert == null ? "" : wert.toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: nachkomma, useGrouping: false });
  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text ?? anzeige}
      onFocus={(e) => { setText(anzeige); rest.onFocus?.(e); }}
      onBlur={(e) => { setText(null); rest.onBlur?.(e); }}
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.trim();
        if (!t) onWert(null);
        else {
          const n = dezimalLesen(t);
          if (n != null) onWert(n);
        }
      }}
      className={cn("zahl text-right", className)}
    />
  );
}
