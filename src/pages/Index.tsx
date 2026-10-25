import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Camera, ChevronRight, ClipboardSignature, Clock, FileText, FolderKanban, Mic, Plus, Receipt,
  ScanBarcode, UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KontoMenue } from "@/components/KontoMenue";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { Gruppentitel, Karte, ListenZeile, ProjektStatusBadge } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useProjekte, useProjektZahlen } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, euro, isoTag, stunden, tageDazu } from "@/lib/format";
import { sichtbareNavigation, type NavEintrag } from "@/lib/navigation";
import { belegStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KUNDE } from "@/kunde.config";

/** „Guten Morgen“ / „Guten Tag“ / „Guten Abend“ nach der Uhrzeit. */
function gruss(jetzt = new Date()): string {
  const h = jetzt.getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

/** Montag der laufenden Woche als ISO-Tag */
function wochenbeginn(heute: string): string {
  const tag = (new Date(`${heute}T12:00:00`).getDay() + 6) % 7;
  return tageDazu(heute, -tag);
}

/** Die Menü-Gruppen der Startseite: Baustelle, Büro, Sonstiges */
const START_GRUPPEN: { titel: string; gruppen: NavEintrag["gruppe"][] }[] = [
  { titel: "Baustelle", gruppen: ["haupt", "baustelle"] },
  { titel: "Büro", gruppen: ["buero"] },
  { titel: "Sonstiges", gruppen: ["system"] },
];

/**
 * Startseite wie bei Schrettl: Am Handy IST sie das Menü. Oben die
 * häufigsten Handgriffe als große Knöpfe, darunter „Weiter, wo du warst“
 * und die großen Menü-Karten. Am PC steht das Menü links, hier dafür die
 * Übersicht (offene Punkte, aktive Projekte).
 */
export default function Index() {
  const navigate = useNavigate();
  const pc = useIstPc();
  const { profil, firma, istChef } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: zahlen = {} } = useProjektZahlen();
  const [fotoOffen, setFotoOffen] = useState(false);
  const [zeitOffen, setZeitOffen] = useState(false);
  const [projektOffen, setProjektOffen] = useState(false);

  const heute = isoTag();
  const montag = wochenbeginn(heute);

  const { data: woche } = useQuery({
    queryKey: ["zeiten", "start", profil?.id, montag],
    enabled: !!profil,
    queryFn: async () => {
      const { data, error } = await supabase.from("zeiten")
        .select("id, datum, stunden, taetigkeit, projekt_id, projekte(nummer, name)")
        .eq("user_id", profil!.id).gte("datum", tageDazu(montag, -7))
        .order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const dieseWoche = (woche ?? []).filter((z) => z.datum >= montag).reduce((s, z) => s + Number(z.stunden), 0);
  const heuteStunden = (woche ?? []).filter((z) => z.datum === heute).reduce((s, z) => s + Number(z.stunden), 0);

  // Was für den Chef liegt: offene Rechnungen, Angebote, wartende Zugänge
  const { data: buero } = useQuery({
    queryKey: ["belege", "start"],
    enabled: istChef,
    queryFn: async () => {
      const [{ data: belege }, { count: wartend }] = await Promise.all([
        supabase.from("belege").select("id, typ, status, brutto, faellig_am").in("status", ["entwurf", "offen"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("aktiv", false),
      ]);
      const liste = belege ?? [];
      const rechnungen = liste.filter((b) => b.typ === "rechnung" && b.status === "offen");
      return {
        offenSumme: rechnungen.reduce((s, b) => s + Number(b.brutto), 0),
        offen: rechnungen.length,
        ueberfaellig: rechnungen.filter((b) => belegStatus(b, heute) === "ueberfaellig").length,
        angebote: liste.filter((b) => b.typ === "angebot" && b.status === "offen").length,
        entwuerfe: liste.filter((b) => b.status === "entwurf").length,
        wartend: wartend ?? 0,
      };
    },
  });

  const laufend = projekte.filter((p) => p.status === "aktiv" || p.status === "verrechnen");
  const zuletzt = (() => {
    const ids: string[] = [];
    (woche ?? []).forEach((z) => { if (z.projekt_id && !ids.includes(z.projekt_id)) ids.push(z.projekt_id); });
    const gebucht = ids.map((id) => projekte.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
    const rest = laufend.filter((p) => !ids.includes(p.id));
    return [...gebucht, ...rest].slice(0, pc ? 6 : 3);
  })();

  const regieOffen = Object.values(zahlen).reduce((s, z) => s + Number(z.regie_offen ?? 0), 0);
  const zuVerrechnen = projekte.filter((p) => {
    const z = zahlen[p.id];
    return p.status !== "abgeschlossen" && z && (Number(z.stunden_offen) > 0 || Number(z.material_offen_ek) > 0 || Number(z.regie_offen) > 0);
  }).length;

  type Punkt = { icon: typeof Receipt; text: string; to: string; warn?: boolean };
  const offenePunkte: Punkt[] = istChef && buero ? ([
    buero.wartend > 0 && { icon: UserCheck, text: `${buero.wartend} ${buero.wartend === 1 ? "Mitarbeiter wartet" : "Mitarbeiter warten"} auf Freischaltung`, to: "/einstellungen?bereich=mitarbeiter", warn: true },
    buero.ueberfaellig > 0 && { icon: AlertTriangle, text: `${buero.ueberfaellig} ${buero.ueberfaellig === 1 ? "Rechnung ist" : "Rechnungen sind"} überfällig`, to: "/belege?filter=ueberfaellig", warn: true },
    buero.offen > 0 && { icon: Receipt, text: `${buero.offen} offene ${buero.offen === 1 ? "Rechnung" : "Rechnungen"} · ${euro(buero.offenSumme)}`, to: "/belege?filter=offen" },
    regieOffen > 0 && { icon: ClipboardSignature, text: `${regieOffen} ${regieOffen === 1 ? "Regiebericht" : "Regieberichte"} unterschrieben, nicht verrechnet`, to: "/regie?filter=offen" },
    zuVerrechnen > 0 && { icon: FolderKanban, text: `${zuVerrechnen} ${zuVerrechnen === 1 ? "Projekt hat" : "Projekte haben"} offene Stunden oder Material`, to: "/projekte?filter=offen" },
    buero.angebote > 0 && { icon: FileText, text: `${buero.angebote} ${buero.angebote === 1 ? "Angebot wartet" : "Angebote warten"} auf Antwort`, to: "/belege?filter=angebote" },
    buero.entwuerfe > 0 && { icon: FileText, text: `${buero.entwuerfe} ${buero.entwuerfe === 1 ? "Entwurf" : "Entwürfe"} noch nicht fertig`, to: "/belege?filter=entwurf" },
  ] as (Punkt | false)[]).filter((x): x is Punkt => !!x) : [];

  const menue = sichtbareNavigation(istChef).filter((n) => n.pfad !== "/");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-card" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-2.5 px-3 py-1.5 sm:px-4 lg:px-6">
          <img src={KUNDE.logo} alt="" className="h-9 w-9 shrink-0 rounded-md lg:hidden" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold leading-tight">{firma?.name || KUNDE.kurzname}</p>
            <p className="truncate text-xs text-muted-foreground">
              {new Date().toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
            </p>
          </div>
          <KontoMenue />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-3 py-4 sm:px-4 lg:px-6 lg:py-6"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{gruss()}, {profil?.vorname || "willkommen"}</h1>
          <p className="text-sm text-muted-foreground">
            Heute <span className="zahl font-semibold text-foreground">{stunden(heuteStunden)}</span>
            <span className="mx-1.5">·</span>
            Woche <span className="zahl font-semibold text-foreground">{stunden(dieseWoche)}</span>
          </p>
        </div>

        {/* Die häufigsten Handgriffe — groß, mit dem Daumen erreichbar */}
        <section>
          <Gruppentitel>Schnell festhalten</Gruppentitel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <SchnellKnopf icon={Camera} titel="Foto" unter="zum Projekt" primaer onClick={() => setFotoOffen(true)} />
            <SchnellKnopf icon={Clock} titel="Stunden" unter="buchen" onClick={() => setZeitOffen(true)} />
            <SchnellKnopf icon={ScanBarcode} titel="Material" unter="scannen" onClick={() => navigate("/scan")} />
            <SchnellKnopf icon={ClipboardSignature} titel="Regiebericht" unter="mit Unterschrift" onClick={() => navigate("/regie/neu")} />
          </div>
          {istChef && (
            <Link to="/belege/neu?typ=angebot&sprache=1"
              className="mt-2.5 flex min-h-16 items-center gap-3 rounded-lg border border-primary/30 bg-primary-soft p-3 transition-colors hover:border-primary active:scale-[0.99]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Mic className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">Angebot vor Ort</span>
                <span className="block truncate text-xs text-muted-foreground">„3 Steckdosen, 2 Schalter, 1 FI“ — sprechen, fertig</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
            </Link>
          )}
        </section>

        <div className={cn("grid gap-6", pc && "grid-cols-[1fr_22rem] items-start")}>
          {/* Weiter, wo du warst */}
          <Karte titel={pc ? "Laufende Projekte" : "Weiter, wo du warst"} alle={{ to: "/projekte", text: "Alle Projekte" }} ohnePolster>
            {zuletzt.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground">
                Noch kein laufendes Projekt.{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setProjektOffen(true)}>Projekt anlegen</button>
              </div>
            ) : (
              <ul className="divide-y">
                {zuletzt.map((p) => {
                  const z = zahlen[p.id];
                  return (
                    <li key={p.id}>
                      <Link to={`/projekte/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 lg:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{p.nummer}</span>
                            <ProjektStatusBadge status={p.status} />
                          </div>
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p.kunden?.name, p.ort].filter(Boolean).join(" · ") || "—"}
                            {z && Number(z.stunden) > 0 && <> · <span className="zahl">{stunden(Number(z.stunden))}</span></>}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Karte>

          {/* Chef: was im Büro liegt. Monteur: zuletzt gebucht. */}
          {istChef ? (
            <Karte titel="Zu erledigen">
              {offenePunkte.length === 0 ? (
                <p className="text-sm text-muted-foreground">Alles erledigt — nichts offen.</p>
              ) : (
                <ul className="space-y-2">
                  {offenePunkte.map((o) => (
                    <li key={o.text}>
                      <Link to={o.to} className={cn(
                        "flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:border-primary/50",
                        o.warn && "border-status-rot bg-status-rot/40",
                      )}>
                        <o.icon className={cn("h-4 w-4 shrink-0", o.warn ? "text-status-rot-fg" : "text-primary")} />
                        <span className="min-w-0 flex-1">{o.text}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Karte>
          ) : (
            <Karte titel="Zuletzt gebucht" alle={{ to: "/zeiten", text: "Meine Stunden" }} ohnePolster>
              {(woche ?? []).length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">Diese und letzte Woche noch nichts gebucht.</p>
              ) : (
                <ul className="divide-y">
                  {(woche ?? []).slice(0, 5).map((z) => (
                    <li key={z.id} className="flex items-center gap-3 px-4 py-2.5 text-sm lg:px-5">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{datumKurz(z.datum)}</span>
                      <span className="min-w-0 flex-1 truncate">{z.projekte ? `${z.projekte.nummer} ${z.projekte.name}` : "Ohne Projekt"}</span>
                      <span className="zahl shrink-0 font-semibold">{stunden(Number(z.stunden))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Karte>
          )}
        </div>

        {/* Am Handy und Tablet ist die Startseite das Menü — große Karten wie bei Schrettl */}
        {!pc && START_GRUPPEN.map((g) => {
          const eintraege = menue.filter((n) => g.gruppen.includes(n.gruppe));
          if (!eintraege.length) return null;
          return (
            <section key={g.titel}>
              <Gruppentitel>{g.titel}</Gruppentitel>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {eintraege.map((e) => (
                  <li key={e.pfad}>
                    <Link to={e.pfad} data-kachel={e.titel}
                      className="group flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 active:scale-[0.99]">
                      <span className="flex items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <e.icon className="h-6 w-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-semibold leading-tight">{e.titel}</span>
                          <span className="block text-sm text-muted-foreground">{(!istChef && e.textMonteur) || e.text}</span>
                        </span>
                      </span>
                      <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground group-hover:bg-primary-hover">
                        {e.titel} öffnen <ChevronRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {pc && (
          <div className="grid grid-cols-3 gap-3">
            <ListenZeile to="/projekte?neu=1"><span className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4 text-primary" /> Neues Projekt</span></ListenZeile>
            {istChef && <ListenZeile to="/belege/neu?typ=rechnung"><span className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4 text-primary" /> Neue Rechnung</span></ListenZeile>}
            <ListenZeile to="/kalender"><span className="flex items-center gap-2 font-medium"><Plus className="h-4 w-4 text-primary" /> Termin eintragen</span></ListenZeile>
          </div>
        )}
      </main>

      <FotoDialog open={fotoOffen} onOpenChange={setFotoOffen} />
      <ZeitDialog open={zeitOffen} onOpenChange={setZeitOffen} />
      <ProjektDialog open={projektOffen} onOpenChange={setProjektOffen} />
    </div>
  );
}

function SchnellKnopf({
  icon: I, titel, unter, onClick, primaer = false,
}: { icon: typeof Camera; titel: string; unter: string; onClick: () => void; primaer?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex min-h-[5.5rem] flex-col items-start justify-between gap-2 rounded-lg p-3 text-left transition-colors active:scale-[0.98]",
        primaer ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border bg-card hover:border-primary/50",
      )}>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", primaer ? "bg-white/15" : "bg-primary-soft text-primary")}>
        <I className="h-5 w-5" />
      </span>
      <span>
        <span className="flex items-center gap-1 font-semibold leading-tight"><Plus className="h-3.5 w-3.5" />{titel}</span>
        <span className={cn("block text-xs", primaer ? "opacity-80" : "text-muted-foreground")}>{unter}</span>
      </span>
    </button>
  );
}
