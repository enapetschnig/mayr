import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, FolderKanban, Loader2, Plus, Receipt, Search, Users, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { useIstPc } from "@/components/AppLayout";
import { navPasst, sichtbareNavigation } from "@/lib/navigation";
import { projekteSuchen } from "@/lib/projektSuche";
import { useProjekte } from "@/hooks/useDaten";
import { cn } from "@/lib/utils";
import { neuStarten, useNeuAktionen } from "./NeuMenue";

/*
  Suche mit Strg+K wie bei Lengauer Stockner: Projekte, Kontakte, Belege
  (nur Chef), Seiten und „Neu anlegen“. Die Datenbank prüft ohnehin mit
  (RLS). Projekte aus der geladenen Liste wie jede Projektwahl (`projekteSuchen`:
  Nummer, Name, Kunde, Ort, alle Wörter, Umlaute egal), Kunden und Belege per
  ilike, je Gruppe höchstens 5 Treffer.
  Am Handy öffnet die Lupe im Kopf der Startseite dieselbe Suche.
*/

type Treffer = { schluessel: string; titel: string; zusatz?: string; icon: LucideIcon; los: () => void };
type Gruppe = { titel: string; treffer: Treffer[] };

/** Sonderzeichen, die in PostgREST-or()-Filtern stören, entfernen */
const sauber = (s: string) => s.replace(/[%,()*\\.]/g, " ").trim();

const EREIGNIS = "mayr:suche";
export function sucheOeffnen() {
  window.dispatchEvent(new Event(EREIGNIS));
}

type DbTreffer = { kunden: Treffer[]; belege: Treffer[] };
const LEER: DbTreffer = { kunden: [], belege: [] };

export function Suchpalette() {
  const navigate = useNavigate();
  const pc = useIstPc();
  const { istChef } = useSitzung();
  const neuAktionen = useNeuAktionen();
  const { data: projekte = [] } = useProjekte();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [db, setDb] = useState<DbTreffer>(LEER);
  const [laedt, setLaedt] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const lauf = useRef(0);
  const liste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const taste = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOffen((o) => !o);
      }
    };
    const auf = () => setOffen(true);
    window.addEventListener("keydown", taste);
    window.addEventListener(EREIGNIS, auf);
    return () => { window.removeEventListener("keydown", taste); window.removeEventListener(EREIGNIS, auf); };
  }, []);

  useEffect(() => { if (!offen) { setText(""); setDb(LEER); setLaedt(false); } }, [offen]);

  const gehe = (ziel: string) => { setOffen(false); navigate(ziel); };

  useEffect(() => {
    const q = sauber(text);
    if (!offen || q.length < 2) { setDb(LEER); setLaedt(false); return; }
    const nr = ++lauf.current;
    setLaedt(true);
    const t = window.setTimeout(async () => {
      const m = `%${q}%`;
      const [k, b] = await Promise.all([
        supabase.from("kunden").select("id, name, ort, ansprechpartner")
          .or(`name.ilike.${m},ort.ilike.${m},ansprechpartner.ilike.${m}`).order("name").limit(5),
        istChef
          ? supabase.from("belege").select("id, typ, nummer, betreff, empf_name")
            .or(`nummer.ilike.${m},betreff.ilike.${m},empf_name.ilike.${m}`).order("datum", { ascending: false }).limit(5)
          : Promise.resolve({ data: [] as { id: string; typ: string; nummer: string | null; betreff: string | null; empf_name: string | null }[] }),
      ]);
      if (nr !== lauf.current) return;
      setDb({
        kunden: (k.data ?? []).map((x) => ({
          schluessel: `k-${x.id}`, titel: x.name, zusatz: [x.ansprechpartner, x.ort].filter(Boolean).join(" · ") || undefined, icon: Users,
          los: () => gehe(`/kunden?k=${x.id}`),
        })),
        belege: (b.data ?? []).map((x) => ({
          schluessel: `b-${x.id}`, titel: [x.nummer || "Entwurf", x.betreff].filter(Boolean).join(" · "),
          zusatz: [x.typ === "angebot" ? "Angebot" : "Rechnung", x.empf_name].filter(Boolean).join(" · "),
          icon: x.typ === "angebot" ? FileText : Receipt,
          los: () => gehe(`/belege/${x.id}`),
        })),
      });
      setLaedt(false);
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, offen, istChef]);

  // Seiten (Titel und Stichworte: „Kalender“ → Plantafel, „Lohnzettel“ → Dokumente) und Neu-Aktionen per Teilwort
  const q = sauber(text).toLowerCase();
  const passt = (t: string) => !q || t.toLowerCase().includes(q);
  const projektTreffer: Treffer[] = useMemo(() => (text.trim().length < 2 ? [] : projekteSuchen(projekte, text).slice(0, 5).map((x) => ({
    schluessel: `p-${x.id}`, titel: `${x.nummer} · ${x.name}`, zusatz: [x.kunden?.name, x.ort].filter(Boolean).join(" · ") || undefined,
    icon: FolderKanban, los: () => gehe(`/projekte/${x.id}`),
  }))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [projekte, text]);
  const gruppen: Gruppe[] = useMemo(() => [
    { titel: "Projekte", treffer: projektTreffer },
    { titel: "Kontakte", treffer: db.kunden },
    { titel: "Belege", treffer: db.belege },
    {
      titel: "Seiten",
      treffer: sichtbareNavigation(istChef, pc).filter((s) => navPasst(s, q)).map((s) => ({
        schluessel: `s-${s.pfad}`, titel: s.titel, icon: s.icon, los: () => gehe(s.pfad),
      })),
    },
    {
      titel: "Neu anlegen",
      treffer: neuAktionen.filter((a) => passt(a.titel) || passt(`neu ${a.titel}`)).map((a) => ({
        schluessel: `n-${a.art}`, titel: a.titel, zusatz: a.text, icon: Plus,
        los: () => { setOffen(false); neuStarten(a.art); },
      })),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ].filter((g) => g.treffer.length > 0), [db, projektTreffer, q, istChef, pc, neuAktionen]);
  const alle = gruppen.flatMap((g) => g.treffer);

  useEffect(() => { setMarkiert(0); }, [text, db]);
  useEffect(() => {
    liste.current?.querySelector(`[data-index="${markiert}"]`)?.scrollIntoView({ block: "nearest" });
  }, [markiert]);

  const taste = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setMarkiert((i) => Math.min(alle.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMarkiert((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); alle[markiert]?.los(); }
  };

  let index = -1;
  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent ohneSchliessen
        className="top-[12%] max-w-[640px] translate-y-0 content-start gap-0 overflow-hidden bg-card p-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%] max-sm:top-0 max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none max-sm:border-0"
        data-suchpalette data-bildschirmfoto="aus">
        <DialogTitle className="sr-only">Suchen</DialogTitle>
        <DialogDescription className="sr-only">Projekte, Kontakte, Belege und Seiten</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={taste}
            placeholder={istChef ? "Projekte, Kontakte, Belege, Seiten …" : "Projekte, Kontakte, Seiten …"}
            aria-label="Suchbegriff" role="combobox" aria-expanded aria-controls="suche-liste"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
          {laedt && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          <button type="button" onClick={() => setOffen(false)} className="-mr-2 h-11 shrink-0 px-2 text-sm font-medium text-primary sm:hidden">Abbrechen</button>
          <kbd className="hidden shrink-0 rounded border px-1.5 text-[10px] font-medium text-muted-foreground sm:block">Esc</kbd>
        </div>
        <div ref={liste} id="suche-liste" role="listbox" className="max-h-[60vh] overflow-y-auto p-2 max-sm:max-h-[calc(100dvh-4rem)]">
          {alle.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{laedt ? "Sucht …" : "Nichts gefunden."}</p>
          )}
          {gruppen.map((g) => (
            <div key={g.titel} className="pb-1">
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{g.titel}</p>
              {g.treffer.map((t) => {
                index += 1;
                const i = index;
                return (
                  <button key={t.schluessel} type="button" role="option" aria-selected={i === markiert} data-index={i}
                    onClick={t.los} onMouseMove={() => setMarkiert(i)}
                    className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm", i === markiert && "bg-accent")}>
                    <t.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{t.titel}</span>
                    {t.zusatz && <span className="ml-auto min-w-0 truncate pl-3 text-xs text-muted-foreground">{t.zusatz}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
