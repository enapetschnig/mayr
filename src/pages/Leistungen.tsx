import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search, SearchX } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { LeistungDialog } from "@/components/stamm/LeistungDialog";
import { kalkulieren, nachKategorie, passtZuSuche } from "@/components/stamm/leistungHilfen";
import { useLeistungenKatalog, type LeistungMitMaterial } from "@/components/stamm/stammDaten";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, zahl } from "@/lib/format";
import type { StatusEintrag } from "@/lib/types";
import { cn } from "@/lib/utils";

const INAKTIV: StatusEintrag = { ton: "grau", text: "Inaktiv" };

/**
 * Leistungskatalog (nur Chef): nach Kategorien gruppiert, durchsuchbar,
 * Preis je Leistung fest oder berechnet (Material-VK + Montagezeit).
 */
export default function LeistungenSeite() {
  const { firma } = useSitzung();
  const pc = useIstPc();
  const { data: katalog = [], isLoading } = useLeistungenKatalog();
  const [text, setText] = useState("");
  // Auswahl bleibt beim Schließen stehen, damit der Dialog nicht mitten in der Animation umspringt
  const [auswahl, setAuswahl] = useState<{ leistung: LeistungMitMaterial | null; kategorie?: string }>({ leistung: null });
  const [offen, setOffen] = useState(false);
  const oeffnen = (leistung: LeistungMitMaterial | null, kategorie?: string) => {
    setAuswahl({ leistung, kategorie });
    setOffen(true);
  };

  const gruppen = useMemo(() => nachKategorie(katalog.filter((l) => passtZuSuche(l, text))), [katalog, text]);
  const anzahlKategorien = useMemo(() => new Set(katalog.map((l) => l.kategorie)).size, [katalog]);
  const treffer = gruppen.reduce((s, g) => s + g.leistungen.length, 0);

  const kalk = (l: LeistungMitMaterial) =>
    kalkulieren({ preis: l.preis, minuten: l.minuten }, l.leistung_material.map((m) => ({ menge: m.menge, artikel: m.artikel })), firma);

  return (
    <Seite
      titel="Leistungskatalog"
      untertitel={katalog.length ? `${zahl(katalog.length)} Leistungen · ${zahl(anzahlKategorien)} Kategorien` : undefined}
      breit
      aktionen={
        <Button className="h-11 px-3" onClick={() => oeffnen(null)} aria-label="Neue Leistung">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Neue Leistung</span>
        </Button>
      }
    >
      {katalog.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Suchen – Text, Nummer, Suchwort …"
              className="h-12 pl-9 text-base" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Leistung suchen" />
          </div>
          {text.trim() && <p className="px-1 text-sm text-muted-foreground"><span className="zahl">{zahl(treffer)}</span> Treffer</p>}
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
      ) : katalog.length === 0 ? (
        <Leer icon={ClipboardList} text="Noch keine Leistungen. Eine Leistung ist Arbeit plus Material zum fixen oder berechneten Preis — z. B. „Steckdose UP komplett“.">
          <Button className="h-11" onClick={() => oeffnen(null)}><Plus className="h-4 w-4" /> Neue Leistung</Button>
        </Leer>
      ) : gruppen.length === 0 ? (
        <Leer icon={SearchX} text={`Nichts gefunden für „${text.trim()}“`} />
      ) : (
        <div className="space-y-5">
          {gruppen.map((g) => (
            <section key={g.kategorie} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-3 border-b py-1.5 pl-4 pr-1.5">
                <h2 className="min-w-0 truncate text-[0.9375rem] font-semibold">
                  {g.kategorie} <span className="zahl font-normal text-muted-foreground">· {zahl(g.leistungen.length)}</span>
                </h2>
                <Button variant="ghost" className="h-11 shrink-0 px-3 text-muted-foreground" onClick={() => oeffnen(null, g.kategorie)}
                  aria-label={`Neue Leistung in ${g.kategorie}`}>
                  <Plus className="h-4 w-4" /><span className="hidden sm:inline">Leistung</span>
                </Button>
              </div>
              {pc ? (
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-24" />
                    <col />
                    <col className="w-20" />
                    <col className="w-20" />
                    <col className="w-28" />
                    <col className="w-28" />
                    <col className="w-28" />
                    <col className="w-28" />
                  </colgroup>
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Nr.</th>
                      <th className="px-3 py-2 font-medium">Leistung</th>
                      <th className="px-3 py-2 font-medium">Einheit</th>
                      <th className="px-3 py-2 text-right font-medium">Min.</th>
                      <th className="px-3 py-2 text-right font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Lohn</th>
                      <th className="px-3 py-2 text-right font-medium">Preis</th>
                      <th className="px-4 py-2 text-right font-medium">Rohertrag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-t">
                    {g.leistungen.map((l) => {
                      const k = kalk(l);
                      return (
                        <tr key={l.id} tabIndex={0} onClick={() => oeffnen(l)}
                          // preventDefault: sonst „klickt“ dieselbe Enter-Taste gleich den Knopf im geöffneten Dialog
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); oeffnen(l); } }}
                          className={cn("cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", !l.aktiv && "text-muted-foreground")}>
                          <td className="px-4 py-2.5 font-mono text-xs">{l.nummer || "–"}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={cn("truncate font-medium", l.aktiv && "text-foreground")}>{l.kurztext}</span>
                              {!l.aktiv && <StatusPille eintrag={INAKTIV} />}
                            </div>
                            {l.langtext && <div className="truncate text-xs text-muted-foreground">{l.langtext}</div>}
                          </td>
                          <td className="px-3 py-2.5">{l.einheit}</td>
                          <td className="zahl px-3 py-2.5 text-right">{zahl(l.minuten)}</td>
                          <td className="zahl px-3 py-2.5 text-right">
                            {l.leistung_material.length ? euro(k.materialVk) : "–"}
                          </td>
                          <td className="zahl px-3 py-2.5 text-right">{euro(k.lohn)}</td>
                          <td className="zahl px-3 py-2.5 text-right font-semibold text-foreground">
                            {euro(k.preis)}{l.preis != null && <span className="ml-1 text-xs font-normal text-muted-foreground">fest</span>}
                          </td>
                          <td className="zahl px-4 py-2.5 text-right">{k.rohertragProzent != null ? `${zahl(k.rohertragProzent)} %` : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <ul className="divide-y">
                  {g.leistungen.map((l) => {
                    const k = kalk(l);
                    return (
                      <li key={l.id}>
                        <button type="button" onClick={() => oeffnen(l)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/40">
                          <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{l.nummer}</span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("font-medium leading-snug", !l.aktiv && "text-muted-foreground")}>{l.kurztext}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              <span className="zahl">{zahl(l.minuten)}</span> min
                              {l.leistung_material.length > 0 && <> · <span className="zahl">{l.leistung_material.length}</span> Artikel</>}
                            </p>
                            {!l.aktiv && <StatusPille eintrag={INAKTIV} className="mt-1" />}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="zahl font-semibold">{euro(k.preis)}</p>
                            <p className="text-xs text-muted-foreground">{l.preis != null ? "fest · " : ""}je {l.einheit}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <LeistungDialog open={offen} onOpenChange={setOffen} leistung={auswahl.leistung} kategorieVorgabe={auswahl.kategorie} katalog={katalog} />
    </Seite>
  );
}
