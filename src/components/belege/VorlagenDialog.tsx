import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, LayoutTemplate, Loader2, MoreVertical, Pencil, Search, Trash2 } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Leer } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLeistungsKatalog } from "./daten";
import { mengeVon, ohneBetrag, preisVon, type EditorPosition } from "./editor";
import { kategorienAus, nettoVon, vorlagenFiltern, vorlageUmfang, type Abweichung, type Vorlage } from "./vorlagen";
import { useVorlagen, vorlageBerechnen, vorlageLoeschen, vorlageUmbenennen, type VorlageBerechnet } from "./vorlagenDaten";

export type VorlageWahl = { vorlage: Vorlage; positionen: EditorPosition[]; abweichungen: Abweichung[]; nachgezogen: boolean };

/**
 * Angebotsvorlagen: suchen, nach Kategorie filtern, ansehen und übernehmen —
 * und verwalten (umbenennen, löschen; ersetzen über „Als Vorlage speichern“).
 * Beim Ansehen rechnet die Vorlage mit den heutigen Preisen aus Artikelstamm
 * und Leistungskatalog; was abweicht, steht da, und der Chef entscheidet.
 */
export function VorlagenDialog({
  open, onOpenChange, ziel, stundensatz, knopfText, onWahl,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** aktiver Titel im Angebot (Hinweis „landet unter …“) */
  ziel?: string | null;
  stundensatz?: number;
  /** z. B. „Neues Angebot anlegen“ statt „Einfügen“ */
  knopfText?: string;
  onWahl: (w: VorlageWahl) => void;
}) {
  const qc = useQueryClient();
  const { firma } = useSitzung();
  const satz = stundensatz ?? Number(firma?.stundensatz ?? 0);
  const { data: vorlagen = [], isLoading, error } = useVorlagen(open);
  const { data: katalog = [], isLoading: katalogLaedt } = useLeistungsKatalog();
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [gewaehltId, setGewaehltId] = useState<string | null>(null);
  const [rechnung, setRechnung] = useState<VorlageBerechnet | null>(null);
  const [rechnet, setRechnet] = useState(false);
  const [nachziehen, setNachziehen] = useState(true);
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string; kategorie: string } | null>(null);
  const [loeschen, setLoeschen] = useState<Vorlage | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Beim Öffnen von vorn
  useEffect(() => {
    if (!open) return;
    setSuche("");
    setKategorie(null);
    setGewaehltId(null);
    setRechnung(null);
  }, [open]);

  const gewaehlt = vorlagen.find((v) => v.id === gewaehltId) ?? null;
  const kategorien = useMemo(() => kategorienAus(vorlagen), [vorlagen]);
  const liste = useMemo(() => vorlagenFiltern(vorlagen, suche, kategorie), [vorlagen, suche, kategorie]);

  // Gewählt: mit heutigen Preisen rechnen (Artikel laden, Katalog ist schon da)
  useEffect(() => {
    if (!gewaehlt || katalogLaedt) return;
    let aus = false;
    setRechnet(true);
    setRechnung(null);
    vorlageBerechnen(gewaehlt, katalog, firma, satz)
      .then((r) => { if (!aus) { setRechnung(r); setNachziehen(true); } })
      .catch((e) => { if (!aus) toast.error((e as Error).message); })
      .finally(() => { if (!aus) setRechnet(false); });
    return () => { aus = true; };
  }, [gewaehlt, katalog, katalogLaedt, firma, satz]);

  const fassung = rechnung ? (nachziehen ? rechnung.heute : rechnung.wieVorlage) : null;

  const uebernehmen = () => {
    if (!gewaehlt || !fassung || !rechnung) return;
    onWahl({ vorlage: gewaehlt, positionen: fassung.positionen, abweichungen: rechnung.heute.abweichungen, nachgezogen: nachziehen });
    onOpenChange(false);
  };

  const neuLaden = () => qc.invalidateQueries({ queryKey: ["angebot_vorlagen"] });
  const umbenennenSpeichern = async () => {
    if (!umbenennen || !umbenennen.name.trim()) return;
    setLaeuft(true);
    try {
      await vorlageUmbenennen(umbenennen.id, umbenennen.name, umbenennen.kategorie || null);
      await neuLaden();
      setUmbenennen(null);
      toast.success("Vorlage umbenannt");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };
  const loeschenAusfuehren = async () => {
    if (!loeschen) return;
    setLaeuft(true);
    try {
      await vorlageLoeschen(loeschen.id);
      await neuLaden();
      if (gewaehltId === loeschen.id) setGewaehltId(null);
      toast.success(`Vorlage „${loeschen.name}“ gelöscht`);
      setLoeschen(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  const zeilenMenue = (v: Vorlage) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Vorlage ${v.name} verwalten`}>
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="h-11 gap-2" onClick={() => setUmbenennen({ id: v.id, name: v.name, kategorie: v.kategorie ?? "" })}>
          <Pencil className="h-4 w-4" /> Umbenennen / Kategorie
        </DropdownMenuItem>
        <DropdownMenuItem className="h-11 gap-2 text-destructive focus:text-destructive" onClick={() => setLoeschen(v)}>
          <Trash2 className="h-4 w-4" /> Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={gewaehlt ? gewaehlt.name : "Angebotsvorlagen"}
      beschreibung={gewaehlt
        ? [gewaehlt.kategorie, vorlageUmfang(gewaehlt.positionen)].filter(Boolean).join(" · ")
        : ziel ? `Landet unter „${ziel}“` : "Vorlage antippen zum Ansehen"}
      breite="breit"
      fuss={gewaehlt ? (
        <>
          <Button variant="outline" className="h-12" onClick={() => setGewaehltId(null)}>
            <ArrowLeft className="h-4 w-4" /> Alle Vorlagen
          </Button>
          <Button className="h-12 sm:min-w-56" disabled={!fassung} onClick={uebernehmen}>
            {rechnet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {knopfText ?? (ziel ? `Unter „${ziel}“ einfügen` : "Einfügen")}
          </Button>
        </>
      ) : <Button variant="outline" className="h-12 sm:min-w-40" onClick={() => onOpenChange(false)}>Schließen</Button>}
    >
      {!gewaehlt ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen – PV, Speicher, Wallbox, Befund …"
              className="h-12 pl-9 text-base" inputMode="search" enterKeyHint="search" aria-label="Vorlagen suchen" />
          </div>
          {kategorien.length > 0 && (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              <div className="flex w-max gap-2 pb-1" role="group" aria-label="Kategorie">
                {[null, ...kategorien].map((k) => {
                  const n = k ? vorlagen.filter((v) => (v.kategorie ?? "").toLowerCase() === k.toLowerCase()).length : vorlagen.length;
                  return (
                    <button key={k ?? "alle"} type="button" onClick={() => setKategorie(k)} aria-pressed={kategorie === k}
                      className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                        kategorie === k ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                      {k ?? "Alle"} <span className="zahl text-xs opacity-70">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error ? <Leer icon={AlertTriangle} text={`Vorlagen nicht geladen: ${(error as Error).message}`} />
            : isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Lädt …</p>
              : !liste.length ? (
                <Leer icon={LayoutTemplate} text={vorlagen.length
                  ? "Keine Vorlage gefunden."
                  : "Noch keine Vorlagen. Im fertigen Angebot über ⋮ → „Als Vorlage speichern“ anlegen."} />
              ) : (
                <ul className="grid gap-2 lg:grid-cols-2">
                  {liste.map((v) => (
                    <li key={v.id} className="flex items-center gap-1 rounded-lg border bg-card pr-1 transition-colors hover:border-primary/50">
                      <button type="button" onClick={() => setGewaehltId(v.id)} className="min-w-0 flex-1 p-3 text-left">
                        <span className="block truncate font-semibold leading-tight">{v.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[v.kategorie, vorlageUmfang(v.positionen)].filter(Boolean).join(" · ")}
                        </span>
                        <span className="zahl mt-1 block text-sm font-medium">{euro(v.netto)} <span className="text-xs font-normal text-muted-foreground">netto beim Speichern</span></span>
                      </button>
                      {zeilenMenue(v)}
                    </li>
                  ))}
                </ul>
              )}
        </div>
      ) : (
        <div className="space-y-4">
          {gewaehlt.betreff && <p className="text-sm"><span className="text-muted-foreground">Betreff:</span> {gewaehlt.betreff}</p>}
          {rechnet || !rechnung ? (
            <p className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preise mit Artikelstamm und Leistungskatalog vergleichen …
            </p>
          ) : (
            <PreisVergleich rechnung={rechnung} nachziehen={nachziehen} setNachziehen={setNachziehen} />
          )}
          {fassung && <Vorschau positionen={fassung.positionen} />}
        </div>
      )}

      <AlertDialog open={!!umbenennen} onOpenChange={(o) => { if (!o) setUmbenennen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage umbenennen</AlertDialogTitle>
            <AlertDialogDescription>Name und Kategorie — die Positionen bleiben.</AlertDialogDescription>
          </AlertDialogHeader>
          {umbenennen && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vu-name">Name</Label>
                <Input id="vu-name" className="h-11 text-base" value={umbenennen.name} maxLength={120}
                  onChange={(e) => setUmbenennen({ ...umbenennen, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vu-kat">Kategorie</Label>
                <Input id="vu-kat" className="h-11 text-base" value={umbenennen.kategorie} maxLength={60} list="vorlage-kategorien-u"
                  onChange={(e) => setUmbenennen({ ...umbenennen, kategorie: e.target.value })} />
                <datalist id="vorlage-kategorien-u">{kategorienAus(vorlagen, true).map((k) => <option key={k} value={k} />)}</datalist>
              </div>
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button className="h-11" disabled={laeuft || !umbenennen?.name.trim()} onClick={() => void umbenennenSpeichern()}>Speichern</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!loeschen} onOpenChange={(o) => { if (!o) setLoeschen(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage „{loeschen?.name}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>Angebote, die damit geschrieben wurden, bleiben, wie sie sind.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" disabled={laeuft} onClick={() => void loeschenAusfuehren()}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}

function PreisVergleich({ rechnung, nachziehen, setNachziehen }: { rechnung: VorlageBerechnet; nachziehen: boolean; setNachziehen: (v: boolean) => void }) {
  const { abweichungen, fehlt } = rechnung.heute;
  const nettoHeute = nettoVon(rechnung.heute.positionen);
  const nettoAlt = nettoVon(rechnung.wieVorlage.positionen);
  if (!abweichungen.length && !fehlt.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
        <Check className="h-4 w-4 shrink-0 text-primary" /> Alle Preise wie heute im Artikelstamm und Leistungskatalog.
      </p>
    );
  }
  return (
    <section className="space-y-2.5 rounded-lg border bg-card p-3">
      {abweichungen.length > 0 && (
        <>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-semibold">
                {abweichungen.length} {abweichungen.length === 1 ? "Preis weicht" : "Preise weichen"} vom Artikelstamm / Leistungskatalog ab
              </span>
              <span className="block text-sm text-muted-foreground">
                Heutige Preise: <span className="zahl font-medium text-foreground">{euro(nettoHeute)}</span> · wie in der Vorlage: <span className="zahl">{euro(nettoAlt)}</span> netto
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
              Heutige Preise <Switch checked={nachziehen} onCheckedChange={setNachziehen} aria-label="Heutige Preise verwenden" />
            </span>
          </label>
          <ul className="divide-y rounded-md border text-sm">
            {abweichungen.slice(0, 8).map((a, i) => (
              <li key={`${a.bezeichnung}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{a.bezeichnung}</span>
                <span className="zahl shrink-0 text-xs">
                  <span className="text-muted-foreground line-through">{euro(a.alt)}</span> → <span className="font-semibold">{euro(a.neu)}</span>
                </span>
              </li>
            ))}
            {abweichungen.length > 8 && <li className="px-3 py-2 text-xs text-muted-foreground">und {abweichungen.length - 8} weitere</li>}
          </ul>
        </>
      )}
      {fehlt.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {fehlt.length === 1 ? `„${fehlt[0]}“ gibt es` : `${fehlt.length} Positionen gibt es`} nicht mehr im Stamm — Preis aus der Vorlage, bitte prüfen.
        </p>
      )}
    </section>
  );
}

/** Die Positionen der Vorlage, wie sie ins Angebot kommen */
function Vorschau({ positionen }: { positionen: EditorPosition[] }) {
  return (
    <section className="space-y-2">
      <ul className="divide-y rounded-lg border bg-card text-sm">
        {positionen.map((p) => (
          p.art === "titel" ? (
            <li key={p.id} className="bg-muted/50 px-3 py-2 font-semibold">{p.bezeichnung || "Abschnitt"}</li>
          ) : p.art === "text" ? (
            <li key={p.id} className="px-3 py-2 text-muted-foreground">{p.bezeichnung || p.langtext}</li>
          ) : (
            <li key={p.id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="zahl w-20 shrink-0 text-right text-muted-foreground">{zahl(mengeVon(p))} {p.einheit}</span>
              <span className="min-w-0 flex-1">{p.bezeichnung}</span>
              <span className="zahl shrink-0 font-medium">{euro(mengeVon(p) * preisVon(p))}</span>
            </li>
          )
        ))}
      </ul>
      <p className="px-1 text-right text-sm">
        Summe netto <span className="zahl font-bold">{euro(nettoVon(positionen))}</span>
        <span className="ml-1 text-xs text-muted-foreground">({positionen.filter((p) => !ohneBetrag(p)).length} Positionen)</span>
      </p>
    </section>
  );
}
