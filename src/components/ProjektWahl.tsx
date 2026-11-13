import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useProjekte, type ProjektMitKunde } from "@/hooks/useDaten";
import { projekteSuchen } from "@/lib/projektSuche";
import { cn } from "@/lib/utils";

const HOECHSTENS = 60;

/**
 * Auswahl eines Projekts — antippen und tippen: Nummer, Name, Kunde oder Ort
 * („huber linz“, „17“ für 2026-0017). Pfeiltasten, Enter, Esc. Die Liste
 * klappt im Formular auf (kein schwebendes Fenster) — am Handy groß, die
 * Tastatur verdeckt nichts.
 * Standard: nur laufende Projekte (In Arbeit, Angebot, Zu verrechnen).
 * `nurInArbeit`: zum Buchen (Stunden, Material, Regie) — die Datenbank lässt
 * nur Projekte „In Arbeit“ zu.
 */
export function ProjektWahl({
  wert,
  onChange,
  id,
  leerText = "Projekt wählen",
  mitAbgeschlossenen = false,
  nurInArbeit = false,
}: {
  wert: string;
  onChange: (id: string, projekt?: ProjektMitKunde) => void;
  id?: string;
  leerText?: string;
  mitAbgeschlossenen?: boolean;
  nurInArbeit?: boolean;
}) {
  const { data: projekte = [] } = useProjekte();
  const liste = projekte.filter((p) => p.id === wert || (nurInArbeit ? p.status === "aktiv" : mitAbgeschlossenen || p.status !== "abgeschlossen"));
  const gewaehlt = projekte.find((p) => p.id === wert);
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [markiert, setMarkiert] = useState(0);
  const eingabe = useRef<HTMLInputElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const basisId = useId();

  const rahmen = useRef<HTMLDivElement>(null);

  // Esc schließt nur die Liste, nicht das ganze Formular: das Formular hört
  // auf Esc schon in der Capture-Phase am Dokument — hier davor am Fenster.
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !rahmen.current?.contains(document.activeElement)) return;
      e.stopPropagation();
      e.preventDefault();
      setOffen(false);
      requestAnimationFrame(() => knopf.current?.focus());
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [offen]);

  const treffer = useMemo(() => projekteSuchen(liste, suche).slice(0, HOECHSTENS), [liste, suche]);

  const oeffnen = () => {
    setSuche("");
    setMarkiert(Math.max(0, treffer.findIndex((p) => p.id === wert)));
    setOffen(true);
  };
  const schliessen = (fokus = true) => {
    setOffen(false);
    if (fokus) requestAnimationFrame(() => knopf.current?.focus());
  };
  const waehlen = (p: ProjektMitKunde) => {
    onChange(p.id, p);
    schliessen();
  };
  const markieren = (i: number) => {
    const n = Math.max(0, Math.min(treffer.length - 1, i));
    setMarkiert(n);
    listeRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
  };

  if (!offen) {
    return (
      <button ref={knopf} id={id} type="button" onClick={oeffnen} aria-haspopup="listbox" aria-expanded={false}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) { e.preventDefault(); oeffnen(); if (e.key.length === 1) setSuche(e.key); } }}
        className="flex h-12 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm">
        {gewaehlt ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{gewaehlt.nummer}</span>
            <span className="truncate font-medium">{gewaehlt.name}</span>
            {(gewaehlt.kunden?.name || gewaehlt.ort) && <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {gewaehlt.kunden?.name ?? gewaehlt.ort}</span>}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{liste.length ? leerText : "Noch kein Projekt angelegt"}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
    );
  }

  const aktiv = treffer[markiert];
  return (
    <div ref={rahmen} className="rounded-md border border-primary bg-background ring-2 ring-primary/20"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) schliessen(false); }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input ref={eingabe} id={id} value={suche} autoFocus autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded aria-controls={`${basisId}-liste`} aria-autocomplete="list"
          aria-activedescendant={aktiv ? `${basisId}-${aktiv.id}` : undefined}
          placeholder="Nummer, Name, Kunde oder Ort tippen …"
          onChange={(e) => { setSuche(e.target.value); setMarkiert(0); listeRef.current?.scrollTo({ top: 0 }); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); markieren(markiert + 1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); markieren(markiert - 1); }
            else if (e.key === "PageDown") { e.preventDefault(); markieren(markiert + 8); }
            else if (e.key === "PageUp") { e.preventDefault(); markieren(markiert - 8); }
            else if (e.key === "Enter") { e.preventDefault(); if (aktiv) waehlen(aktiv); }
          }}
          className="h-12 w-full rounded-t-md bg-transparent pl-9 pr-11 text-base outline-none md:text-sm" />
        <button type="button" onClick={() => schliessen()} aria-label="Liste schließen"
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul ref={listeRef} id={`${basisId}-liste`} role="listbox" aria-label="Projekte" className="max-h-[min(20rem,50vh)] overflow-y-auto overscroll-contain border-t">
        {treffer.map((p, i) => (
          <li key={p.id} id={`${basisId}-${p.id}`} role="option" aria-selected={i === markiert}
            onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(p)} onMouseMove={() => i !== markiert && setMarkiert(i)}
            className={cn("flex min-h-12 cursor-pointer items-center gap-2 px-3 py-1.5", i === markiert && "bg-muted")}>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.nummer}</span>
                <span className="truncate font-medium">{p.name}</span>
              </span>
              {(p.kunden?.name || p.ort) && (
                <span className="block truncate text-xs text-muted-foreground">{[p.kunden?.name, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</span>
              )}
            </span>
            {p.id === wert && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </li>
        ))}
        {!treffer.length && <li className="px-3 py-3 text-sm text-muted-foreground">{suche ? `Kein Projekt zu „${suche}“` : "Noch kein Projekt angelegt"}</li>}
      </ul>
    </div>
  );
}
