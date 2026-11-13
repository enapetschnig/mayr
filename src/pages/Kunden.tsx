import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, List, Map as KarteIcon, Pencil, Plus, Search, SearchX, UserRound, Users } from "lucide-react";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useAnlagen, type AnlageMitKunde } from "@/components/anlagen/anlagenDaten";
import { KONTAKT_ART, kontaktArt, merkmale, type KontaktArt } from "@/components/kontakte/kontaktLogik";
import { KundeDetail } from "@/components/stamm/KundeDetail";
import { KundeDialog } from "@/components/stamm/KundeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKunden, useProjekte, type ProjektMitKunde } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahl } from "@/lib/format";
import type { Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";

// Leaflet nur laden, wenn jemand die Karte öffnet
const KontakteKarte = lazy(() => import("@/components/kontakte/KontakteKarte"));

/** Alle Wörter müssen vorkommen — Name, Ort, Nummer (mit oder ohne „K“), Ansprechpartner, Straße, Telefon, E-Mail, UID, Schreibweisen */
function passt(k: Kunde, suchtext: string) {
  const woerter = suchtext.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woerter.length) return true;
  const text = [k.name, k.ort, k.plz, k.strasse, k.ansprechpartner, k.telefon, k.email, `k${k.nummer}`, String(k.nummer), k.uid,
    k.kundennummer_extern, ...(k.namen ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  return woerter.every((w) => text.includes(w));
}

type ArtFilter = "alle" | KontaktArt;
const ART_FILTER: ArtFilter[] = ["alle", "kunde", "lieferant", "partner"];

/**
 * Kontakte: Kunden, Lieferanten, Partner — Liste mit Suche oder Karte. Ein
 * Kontakt zeigt Anschrift, beim Kunden Projekte/Anlagen/Belege, beim
 * Lieferanten seine Belege. Am PC Liste links, Kontakt rechts; am Handy
 * eigene Ansicht über `?k=<id>` — so führt „Zurück“ wieder zur Liste.
 * Filter `?art=`, Karte `?ansicht=karte`.
 */
export default function KundenSeite() {
  const { istChef } = useSitzung();
  const pc = useIstPc();
  const [params, setParams] = useSearchParams();
  const gewaehltId = params.get("k");
  const artParam = params.get("art");
  const art: ArtFilter = ART_FILTER.includes(artParam as ArtFilter) ? artParam as ArtFilter : "alle";
  const karte = params.get("ansicht") === "karte";
  const { data: kunden = [], isLoading } = useKunden();
  const { data: projekte = [] } = useProjekte();
  const { data: anlagen = [] } = useAnlagen();
  const [text, setText] = useState("");
  const [dialog, setDialog] = useState<{ kunde: Kunde | null; name?: string }>({ kunde: null });
  const [dialogOffen, setDialogOffen] = useState(false);

  const oeffnen = (kunde: Kunde | null, name?: string) => {
    setDialog({ kunde, name });
    setDialogOffen(true);
  };
  const setze = (werte: Record<string, string | null>, ersetzen: boolean) => {
    const neu = new URLSearchParams(params);
    for (const [k, v] of Object.entries(werte)) {
      if (v) neu.set(k, v);
      else neu.delete(k);
    }
    setParams(neu, { replace: ersetzen });
  };
  // Am Handy ein neuer Verlaufseintrag (Zurück → Liste/Karte), am PC nur umschalten
  const waehlen = (id: string | null) => setze({ k: id }, pc);
  // Aus der Karte: am PC zur Liste mit dem Kontakt rechts
  const ausKarte = (id: string) => setze({ k: id, ansicht: pc ? null : "karte" }, false);

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

  const anlagenJeKunde = useMemo(() => {
    const m = new Map<string, AnlageMitKunde[]>();
    for (const a of anlagen) {
      if (!a.kunde_id || !a.aktiv) continue;
      const l = m.get(a.kunde_id);
      if (l) l.push(a);
      else m.set(a.kunde_id, [a]);
    }
    return m;
  }, [anlagen]);

  const anzahl = useMemo(() => {
    const z: Record<ArtFilter, number> = { alle: kunden.length, kunde: 0, lieferant: 0, partner: 0 };
    for (const k of kunden) z[kontaktArt(k.art)]++;
    return z;
  }, [kunden]);

  const treffer = useMemo(
    () => kunden.filter((k) => (art === "alle" || kontaktArt(k.art) === art) && passt(k, text)),
    [kunden, text, art],
  );
  const gewaehlt = kunden.find((k) => k.id === gewaehltId) ?? null;
  const gewaehltArt = gewaehlt ? kontaktArt(gewaehlt.art) : "kunde";
  const neuArt: KontaktArt = art === "alle" ? "kunde" : art;

  const dialogElement = (
    <KundeDialog open={dialogOffen} onOpenChange={setDialogOffen} kunde={dialog.kunde} vorgabeName={dialog.name} vorgabeArt={neuArt}
      onGespeichert={(k) => setze({ k: k.id, ansicht: null }, pc)} onGeloescht={() => waehlen(null)} />
  );

  // ── Handy: ein Kontakt ────────────────────────────────────────────
  if (!pc && gewaehltId) {
    return (
      <Seite
        titel={gewaehlt?.name ?? "Kontakt"}
        untertitel={gewaehlt
          ? `${gewaehltArt === "lieferant" ? "Lieferant" : `K${gewaehlt.nummer}`}${gewaehlt.ort ? ` · ${gewaehlt.ort}` : ""}`
          : undefined}
        zurueckPfad={`/kunden${karte ? "?ansicht=karte" : art !== "alle" ? `?art=${art}` : ""}`}
        aktionen={gewaehlt && (
          <Button variant="outline" className="h-11 px-3" onClick={() => oeffnen(gewaehlt)} aria-label="Kontakt bearbeiten">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      >
        {gewaehlt ? (
          <KundeDetail kunde={gewaehlt} projekte={projekteJeKunde.get(gewaehlt.id) ?? []} istChef={istChef} onBearbeiten={() => oeffnen(gewaehlt)} />
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
        ) : (
          <Leer icon={UserRound} text="Diesen Kontakt gibt es nicht mehr." />
        )}
        {dialogElement}
      </Seite>
    );
  }

  const kopfleiste = (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Suchen – Name, Ort, Nummer, UID …"
            className="h-12 pl-9 text-base" inputMode="search" enterKeyHint="search" autoComplete="off" aria-label="Kontakte suchen" />
        </div>
        <div className="flex shrink-0 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Ansicht">
          {([[false, List, "Liste"], [true, KarteIcon, "Karte"]] as const).map(([istKarte, I, t]) => (
            <button key={t} type="button" role="radio" aria-checked={karte === istKarte} aria-label={t} title={t}
              onClick={() => setze({ ansicht: istKarte ? "karte" : null, k: istKarte ? null : gewaehltId }, true)}
              className={cn("flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                karte === istKarte ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
              <I className="h-4 w-4" /><span className="hidden sm:inline">{t}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ART_FILTER.map((a) => (
          <button key={a} type="button" aria-pressed={art === a} onClick={() => setze({ art: a === "alle" ? null : a }, true)}
            className={cn("h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
              art === a ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
            {a === "alle" ? "Alle" : KONTAKT_ART[a].mehrzahl} <span className="zahl opacity-70">{zahl(anzahl[a])}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const liste = (
    <div className="space-y-3">
      {kopfleiste}
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
      ) : kunden.length === 0 ? (
        <Leer icon={Users} text="Noch keine Kontakte.">
          <Button className="h-11" onClick={() => oeffnen(null)}><Plus className="h-4 w-4" /> {KONTAKT_ART[neuArt].neu}</Button>
        </Leer>
      ) : treffer.length === 0 ? (
        <Leer icon={SearchX} text={text.trim() ? `Nichts passt zu „${text.trim()}“` : `Noch keine ${KONTAKT_ART[neuArt].mehrzahl}.`}>
          <Button variant="outline" className="h-11" onClick={() => oeffnen(null, text.trim())}>
            <Plus className="h-4 w-4" /> {text.trim() ? `„${text.trim()}“ als ${KONTAKT_ART[neuArt].text} anlegen` : KONTAKT_ART[neuArt].neu}
          </Button>
        </Leer>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {treffer.map((k) => {
            const kArt = kontaktArt(k.art);
            const anzahlP = projekteJeKunde.get(k.id)?.length ?? 0;
            const m = merkmale(anlagenJeKunde.get(k.id) ?? []);
            const aktiv = pc && k.id === gewaehltId;
            return (
              <li key={k.id}>
                <button type="button" onClick={() => waehlen(k.id)} aria-current={aktiv || undefined}
                  className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    aktiv ? "bg-primary-soft" : "hover:bg-muted/50 active:bg-muted/40")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-medium", aktiv && "text-primary")}>{k.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[kArt === "lieferant" ? null : `K${k.nummer}`, k.ort].filter(Boolean).join(" · ") || "–"}
                      {anzahlP > 0 && ` · ${zahl(anzahlP)} Projekt${anzahlP === 1 ? "" : "e"}`}
                      {m.kwp > 0 && ` · ${zahl(Math.round(m.kwp * 10) / 10)} kWp`}
                      {m.speicher && " · Speicher"}
                    </p>
                  </div>
                  {kArt !== "kunde" && <StatusPille eintrag={KONTAKT_ART[kArt]} />}
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
      titel="Kontakte"
      untertitel={kunden.length
        ? [anzahl.kunde && `${zahl(anzahl.kunde)} Kunden`, anzahl.lieferant && `${zahl(anzahl.lieferant)} Lieferanten`, anzahl.partner && `${zahl(anzahl.partner)} Partner`].filter(Boolean).join(" · ")
        : undefined}
      breit={pc || karte}
      aktionen={
        <Button className="h-11 px-3" onClick={() => oeffnen(null)} aria-label={KONTAKT_ART[neuArt].neu}>
          <Plus className="h-4 w-4" /><span className="hidden sm:inline">{KONTAKT_ART[neuArt].neu}</span>
        </Button>
      }
    >
      {karte ? (
        <div className="space-y-3">
          {kopfleiste}
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">Karte lädt…</p>}>
            <KontakteKarte kontakte={treffer} projekte={projekte} anlagen={anlagen} onOeffnen={ausKarte} />
          </Suspense>
        </div>
      ) : pc ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          {liste}
          {gewaehlt ? (
            <KundeDetail kunde={gewaehlt} projekte={projekteJeKunde.get(gewaehlt.id) ?? []} istChef={istChef}
              onBearbeiten={() => oeffnen(gewaehlt)} mitKopf />
          ) : (
            <div className="rounded-lg border border-dashed">
              <Leer icon={UserRound} text={kunden.length ? "Links einen Kontakt wählen." : "Lege den ersten Kontakt an."} />
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
