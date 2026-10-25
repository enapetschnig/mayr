import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, Pencil, Plus, Search, SearchX, UserRound, Users } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { KundeDetail } from "@/components/stamm/KundeDetail";
import { KundeDialog } from "@/components/stamm/KundeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKunden, useProjekte, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahl } from "@/lib/format";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Alle Wörter müssen vorkommen — Name, Ort, Nummer (mit oder ohne „K“), Ansprechpartner, Straße, Telefon, E-Mail, UID */
function passt(k: Kunde, suchtext: string) {
  const woerter = suchtext.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = [k.name, k.ort, k.plz, k.strasse, k.ansprechpartner, k.telefon, k.email, `k${k.nummer}`, String(k.nummer), k.uid]
    .filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

/**
 * Kunden: Liste mit Suche; ein Kunde zeigt Kontakt, Projekte und (Chef)
 * Belege. Am PC Liste links, Kunde rechts; am Handy eigene Ansicht
 * über `?k=<id>` — so führt „Zurück“ wieder zur Liste.
 */
export default function KundenSeite() {
  const { istChef } = useSitzung();
  const pc = useIstPc();
  const [params, setParams] = useSearchParams();
  const gewaehltId = params.get("k");
  const { data: kunden = [], isLoading } = useKunden();
  const { data: projekte = [] } = useProjekte();
  const [text, setText] = useState("");
  const [dialog, setDialog] = useState<{ kunde: Kunde | null; name?: string }>({ kunde: null });
  const [dialogOffen, setDialogOffen] = useState(false);

  const oeffnen = (kunde: Kunde | null, name?: string) => {
    setDialog({ kunde, name });
    setDialogOffen(true);
  };
  // Am Handy ein neuer Verlaufseintrag (Zurück → Liste), am PC nur umschalten
  const waehlen = (id: string | null) => setParams(id ? { k: id } : {}, { replace: pc });

  const projekteJeKunde = useMemo(() => {
    const m = new Map<string, ProjektMitKunde[]>();
    for (const p of projekte) {
      if (!p.kunde_id) continue;
      const l = m.get(p.kunde_id);
      if (l) l.push(p);
      else m.set(p.kunde_id, [p]);
    }
    return m;
  }, [projekte]);

  const treffer = useMemo(() => kunden.filter((k) => passt(k, text)), [kunden, text]);
  const gewaehlt = kunden.find((k) => k.id === gewaehltId) ?? null;

  const dialogElement = (
    <KundeDialog open={dialogOffen} onOpenChange={setDialogOffen} kunde={dialog.kunde} vorgabeName={dialog.name}
      onGespeichert={(k) => waehlen(k.id)} onGeloescht={() => waehlen(null)} />
  );

  // ── Handy: ein Kunde ──────────────────────────────────────────────
  if (!pc && gewaehltId) {
    return (
      <Seite
        titel={gewaehlt?.name ?? "Kunde"}
        untertitel={gewaehlt ? `K${gewaehlt.nummer}${gewaehlt.ort ? ` · ${gewaehlt.ort}` : ""}` : undefined}
        zurueckPfad="/kunden"
        aktionen={gewaehlt && (
          <Button variant="outline" className="h-11 px-3" onClick={() => oeffnen(gewaehlt)} aria-label="Kunde bearbeiten">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      >
        {gewaehlt ? (
          <KundeDetail kunde={gewaehlt} projekte={projekteJeKunde.get(gewaehlt.id) ?? []} istChef={istChef} onBearbeiten={() => oeffnen(gewaehlt)} />
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
        ) : (
          <Leer icon={UserRound} text="Diesen Kunden gibt es nicht mehr." />
        )}
        {dialogElement}
      </Seite>
    );
  }

  const liste = (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Suchen – Name, Ort, Nummer, UID …"
          className="h-12 pl-9 text-base" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Kunden suchen" />
      </div>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
      ) : kunden.length === 0 ? (
        <Leer icon={Users} text="Noch keine Kunden.">
          <Button className="h-11" onClick={() => oeffnen(null)}><Plus className="h-4 w-4" /> Neuer Kunde</Button>
        </Leer>
      ) : treffer.length === 0 ? (
        <Leer icon={SearchX} text={`Kein Kunde passt zu „${text.trim()}“`}>
          <Button variant="outline" className="h-11" onClick={() => oeffnen(null, text.trim())}>
            <Plus className="h-4 w-4" /> „{text.trim()}“ als neuen Kunden anlegen
          </Button>
        </Leer>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {treffer.map((k) => {
            const anzahl = projekteJeKunde.get(k.id)?.length ?? 0;
            const aktiv = pc && k.id === gewaehltId;
            return (
              <li key={k.id}>
                <button type="button" onClick={() => waehlen(k.id)} aria-current={aktiv || undefined}
                  className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    aktiv ? "bg-primary-soft" : "hover:bg-muted/50 active:bg-muted/40")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-medium", aktiv && "text-primary")}>{k.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      K{k.nummer}{k.ort && ` · ${k.ort}`}{anzahl > 0 && ` · ${zahl(anzahl)} Projekt${anzahl === 1 ? "" : "e"}`}
                    </p>
                  </div>
                  {!pc && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <Seite
      titel="Kunden"
      untertitel={kunden.length ? `${zahl(kunden.length)} Kunden` : undefined}
      breit={pc}
      aktionen={
        <Button className="h-11 px-3" onClick={() => oeffnen(null)} aria-label="Neuer Kunde">
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">Neuer Kunde</span>
        </Button>
      }
    >
      {pc ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          {liste}
          {gewaehlt ? (
            <KundeDetail kunde={gewaehlt} projekte={projekteJeKunde.get(gewaehlt.id) ?? []} istChef={istChef}
              onBearbeiten={() => oeffnen(gewaehlt)} mitKopf />
          ) : (
            <div className="rounded-lg border border-dashed">
              <Leer icon={UserRound} text={kunden.length ? "Links einen Kunden wählen." : "Lege den ersten Kunden an."} />
            </div>
          )}
        </div>
      ) : (
        liste
      )}
      {dialogElement}
    </Seite>
  );
}
