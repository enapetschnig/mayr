import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarOff, CalendarPlus, CheckCircle2, FilePlus2, FolderPlus,
  BellRing, AlertTriangle, Banknote, Bus, Camera, ChevronRight, ClipboardSignature, Clock, FileText, FolderKanban, Inbox, Mic, Plus, Receipt,
  ScanBarcode, ShieldCheck, ShoppingCart, UserCheck, Wrench,
  PhoneCall,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WunschKnopf } from "@/components/wunsch/WunschMelden";
import { KontoMenue } from "@/components/KontoMenue";
import { EinsatzBereich } from "@/components/einsatz/EinsatzBereich";
import { useAntraege } from "@/components/zeiten/personalDaten";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { Gruppentitel, Karte, ListenZeile, ProjektStatusBadge } from "@/components/Bausteine";
import { useIstPc } from "@/components/AppLayout";
import { useProjekte, useProjektZahlen } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, euro, isoTag, stunden, tageDazu } from "@/lib/format";
import { sichtbareNavigation, type NavEintrag } from "@/lib/navigation";
import { useEingangsrechnungen } from "@/components/eingang/eingangDaten";
import { ablauf, zuordnung, zuZahlen } from "@/components/eingang/eingangLogik";
import { useOffeneSchaeden } from "@/components/fuhrpark/fuhrparkDaten";
import { useFahrzeuge } from "@/hooks/useDaten";
import { faelligkeiten } from "@/lib/fuhrpark";
import { useOffenePosten } from "@/components/op/opDaten";
import { useAnlagen } from "@/components/anlagen/anlagenDaten";
import { useBestellungen } from "@/components/bestellung/bestellDaten";
import { istOffen } from "@/components/bestellung/bestellLogik";
import { faelligkeit } from "@/components/anlagen/pruefLogik";
import { mahnFristAbgelaufen, mahnVorschlag } from "@/components/op/opLogik";
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
 * Startseite: Am Handy IST sie das Menü. Oben die
 * häufigsten Handgriffe als große Knöpfe, darunter (Chef) „Zu erledigen“
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
  const [zeitProjekt, setZeitProjekt] = useState<string | undefined>();
  const [projektOffen, setProjektOffen] = useState(false);
  const [terminOffen, setTerminOffen] = useState(false);

  const heute = isoTag();
  const montag = wochenbeginn(heute);
  const sonntag = tageDazu(montag, 6);

  // Letzte und diese Woche — nicht weiter: eine (versehentlich) vorausgebuchte
  // Stunde zählt nicht zur Woche und steht nicht oben in „Zuletzt gebucht“
  const { data: woche } = useQuery({
    queryKey: ["zeiten", "start", profil?.id, montag],
    enabled: !!profil,
    queryFn: async () => {
      const { data, error } = await supabase.from("zeiten")
        .select("id, datum, stunden, taetigkeit, projekt_id, projekte(nummer, name)")
        .eq("user_id", profil!.id).gte("datum", tageDazu(montag, -7)).lte("datum", sonntag)
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
        supabase.from("belege").select("id, typ, status, brutto, faellig_am, gueltig_bis").in("status", ["entwurf", "offen"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("aktiv", false).eq("gesperrt", false),
      ]);
      const liste = belege ?? [];
      const rechnungen = liste.filter((b) => b.typ === "rechnung" && b.status === "offen");
      return {
        offenSumme: rechnungen.reduce((s, b) => s + Number(b.brutto), 0),
        offen: rechnungen.length,
        ueberfaellig: rechnungen.filter((b) => belegStatus(b, heute) === "ueberfaellig").length,
        angebote: liste.filter((b) => b.typ === "angebot" && b.status === "offen").length,
        // Gültigkeit läuft in einer Woche ab oder ist vorbei — nachtelefonieren
        nachfassen: liste.filter((b) => b.typ === "angebot" && b.status === "offen" && b.gueltig_bis && b.gueltig_bis <= tageDazu(heute, 7)).length,
        entwuerfeAngebote: liste.filter((b) => b.typ === "angebot" && b.status === "entwurf").length,
        entwuerfeRechnungen: liste.filter((b) => b.typ === "rechnung" && b.status === "entwurf").length,
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
    return [...gebucht, ...rest].slice(0, 6);
  })();

  const regieOffen = Object.values(zahlen).reduce((s, z) => s + Number(z.regie_offen ?? 0), 0);
  const zuVerrechnen = projekte.filter((p) => {
    const z = zahlen[p.id];
    return p.status !== "abgeschlossen" && z && (Number(z.stunden_offen) > 0 || Number(z.material_offen_ek) > 0 || Number(z.regie_offen) > 0);
  }).length;

  type Punkt = { icon: typeof Receipt; text: string; to: string; warn?: boolean };
  // Eingangsrechnungen: noch keinem Projekt (oder dem Betrieb) zugeordnet
  const { data: eingang = [] } = useEingangsrechnungen(istChef);
  const eingangZuordnen = eingang.filter((r) => zuordnung(r, r.eingang_anteile) !== "zugeordnet").length;
  const eingangPruefen = eingang.filter((r) => ablauf(r) === "pruefen").length;
  const zuUeberweisen = eingang.filter((r) => ablauf(r) === "freigegeben");
  const ueberweisenSumme = zuUeberweisen.reduce((s, r) => s + zuZahlen(r, isoTag()).betrag, 0);
  // Skonto läuft in den nächsten 3 Tagen ab (auch noch ungeprüfte)
  const skontoBald = eingang.filter((r) => !r.bezahlt_am && r.freigabe !== "abgelehnt" && r.skonto_bis && r.skonto_bis >= isoTag() && r.skonto_bis <= tageDazu(isoTag(), 3)).length;
  // Fuhrpark: Pickerl, Service, Prüfung fällig — und gemeldete Schäden
  const { data: fahrzeuge = [] } = useFahrzeuge();
  const { data: schaeden = {} } = useOffeneSchaeden();
  const fuhrparkFaellig = fahrzeuge.flatMap((f) => faelligkeiten(f, isoTag()));
  const fuhrparkUeber = fuhrparkFaellig.filter((x) => x.ueberfaellig).length;
  const schaedenOffen = Object.values(schaeden).reduce((s, n) => s + n, 0);
  // Offene Posten: überfällig, und die Frist der letzten Mahnung ist vorbei
  const { data: op = [] } = useOffenePosten(istChef);
  const heuteIso = isoTag();
  const zuMahnen = firma ? op.filter((b) => mahnVorschlag(b, b.zahlungen, b.mahnungen, firma, heuteIso) && mahnFristAbgelaufen(b.mahnungen, heuteIso)).length : 0;

  // Anlagen: überfällig oder in den nächsten 30 Tagen zu prüfen
  const { data: anlagen = [] } = useAnlagen();
  const pruefFaellig = anlagen.filter((a) => a.aktiv && ["ueberfaellig", "bald"].includes(faelligkeit(a.naechste_pruefung, heuteIso).stufe));
  const pruefUeber = pruefFaellig.filter((a) => faelligkeit(a.naechste_pruefung, heuteIso).stufe === "ueberfaellig").length;

  // Bestellungen: unterwegs, davon Liefertermin vorbei
  const { data: bestellungen = [] } = useBestellungen(istChef);
  const unterwegs = bestellungen.filter((b) => istOffen(b.status));
  const spaet = unterwegs.filter((b) => b.liefertermin && b.liefertermin < heuteIso).length;

  // Monteur meldet erledigt, im Projekt ist noch nicht alles verrechnet
  const { data: antraege = [] } = useAntraege(istChef);
  const { data: erledigte = [] } = useQuery({
    queryKey: ["termine", "erledigt"],
    enabled: istChef,
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("id, projekt_id").eq("status", "erledigt").not("projekt_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const erledigtOffen = [...new Set(erledigte.map((t) => t.projekt_id as string))].filter((id) => {
    const z = zahlen[id];
    return z && (Number(z.stunden_offen) > 0 || Number(z.regie_offen) > 0);
  });

  const offenePunkte: Punkt[] = istChef && buero ? ([
    antraege.length > 0 && { icon: CalendarOff, text: `${antraege.length} ${antraege.length === 1 ? "Antrag wartet" : "Anträge warten"} auf Entscheidung`, to: "/zeiten" },
    erledigtOffen.length > 0 && {
      icon: CheckCircle2,
      text: `${erledigtOffen.length} ${erledigtOffen.length === 1 ? "Projekt" : "Projekte"} mit erledigtem Einsatz, noch nicht verrechnet`,
      to: erledigtOffen.length === 1 ? `/projekte/${erledigtOffen[0]}` : "/projekte",
    },
    buero.wartend > 0 && { icon: UserCheck, text: `${buero.wartend} ${buero.wartend === 1 ? "Mitarbeiter wartet" : "Mitarbeiter warten"} auf Freischaltung`, to: "/einstellungen?bereich=mitarbeiter", warn: true },
    buero.ueberfaellig > 0 && { icon: AlertTriangle, text: `${buero.ueberfaellig} ${buero.ueberfaellig === 1 ? "Rechnung ist" : "Rechnungen sind"} überfällig`, to: "/offene-posten?filter=ueberfaellig", warn: true },
    zuMahnen > 0 && { icon: BellRing, text: `${zuMahnen} ${zuMahnen === 1 ? "Rechnung" : "Rechnungen"} zu mahnen`, to: "/offene-posten", warn: true },
    buero.offen > 0 && { icon: Receipt, text: `${buero.offen} offene ${buero.offen === 1 ? "Rechnung" : "Rechnungen"} · ${euro(buero.offenSumme)}`, to: "/offene-posten?filter=alle" },
    pruefFaellig.length > 0 && {
      icon: ShieldCheck,
      text: `${pruefFaellig.length} ${pruefFaellig.length === 1 ? "Anlage" : "Anlagen"} zu prüfen${pruefUeber ? ` · ${pruefUeber} überfällig` : ""}`,
      to: "/anlagen",
      warn: pruefUeber > 0,
    },
    unterwegs.length > 0 && {
      icon: ShoppingCart,
      text: `${unterwegs.length} ${unterwegs.length === 1 ? "Bestellung" : "Bestellungen"} unterwegs${spaet ? ` · ${spaet} Liefertermin vorbei` : ""}`,
      to: "/bestellungen",
      warn: spaet > 0,
    },
    regieOffen > 0 && { icon: ClipboardSignature, text: `${regieOffen} ${regieOffen === 1 ? "Regiebericht" : "Regieberichte"} unterschrieben, nicht verrechnet`, to: "/regie?filter=offen" },
    skontoBald > 0 && { icon: Banknote, text: `${skontoBald} ${skontoBald === 1 ? "Rechnung" : "Rechnungen"}: Skonto läuft in 3 Tagen ab`, to: "/eingang?filter=freigegeben", warn: true },
    eingangPruefen > 0 && { icon: Inbox, text: `${eingangPruefen} ${eingangPruefen === 1 ? "Eingangsrechnung" : "Eingangsrechnungen"} prüfen und freigeben`, to: "/eingang" },
    zuUeberweisen.length > 0 && { icon: Banknote, text: `${zuUeberweisen.length} ${zuUeberweisen.length === 1 ? "Rechnung" : "Rechnungen"} überweisen · ${euro(ueberweisenSumme)}`, to: "/eingang?filter=freigegeben" },
    fuhrparkFaellig.length > 0 && {
      icon: Bus,
      text: `Fuhrpark: ${fuhrparkFaellig.length} ${fuhrparkFaellig.length === 1 ? "Termin" : "Termine"} fällig (Pickerl, Service, Prüfung)${fuhrparkUeber ? ` · ${fuhrparkUeber} überfällig` : ""}`,
      to: "/fuhrpark",
      warn: fuhrparkUeber > 0,
    },
    schaedenOffen > 0 && { icon: Wrench, text: `${schaedenOffen} ${schaedenOffen === 1 ? "Schaden" : "Schäden"} an Fahrzeugen gemeldet`, to: "/fuhrpark", warn: true },
    eingangZuordnen > 0 && { icon: Inbox, text: `${eingangZuordnen} ${eingangZuordnen === 1 ? "Eingangsrechnung" : "Eingangsrechnungen"} zuordnen`, to: "/eingang?filter=zuzuordnen" },
    zuVerrechnen > 0 && { icon: FolderKanban, text: `${zuVerrechnen} ${zuVerrechnen === 1 ? "Projekt hat" : "Projekte haben"} offene Stunden oder Material`, to: "/projekte?filter=offen" },
    buero.nachfassen > 0 && { icon: PhoneCall, text: `${buero.nachfassen} ${buero.nachfassen === 1 ? "Angebot" : "Angebote"} nachfassen — Gültigkeit läuft ab`, to: "/angebote?filter=nachfassen", warn: true },
    buero.angebote > buero.nachfassen && { icon: FileText, text: `${buero.angebote} ${buero.angebote === 1 ? "Angebot wartet" : "Angebote warten"} auf Antwort`, to: "/angebote?filter=offen" },
    buero.entwuerfeAngebote > 0 && { icon: FileText, text: `${buero.entwuerfeAngebote} ${buero.entwuerfeAngebote === 1 ? "Angebot" : "Angebote"} noch Entwurf`, to: "/angebote?filter=entwurf" },
    buero.entwuerfeRechnungen > 0 && { icon: Receipt, text: `${buero.entwuerfeRechnungen} ${buero.entwuerfeRechnungen === 1 ? "Rechnung" : "Rechnungen"} noch Entwurf`, to: "/rechnungen?filter=entwurf" },
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
          <WunschKnopf />
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

        {/* PC: was man am häufigsten neu anlegt, gleich unter dem Gruß */}
        {pc && (
          <div className={cn("grid gap-3", istChef ? "grid-cols-3" : "grid-cols-2")}>
            <SchnellAktion icon={FolderPlus} titel="Neues Projekt" onClick={() => setProjektOffen(true)} />
            {istChef && <SchnellAktion icon={FilePlus2} titel="Neue Rechnung" onClick={() => navigate("/belege/neu?typ=rechnung")} />}
            <SchnellAktion icon={CalendarPlus} titel="Termin eintragen" onClick={() => setTerminOffen(true)} />
          </div>
        )}

        {/* Handy: erst der Einsatz und die Handgriffe. PC: oben laufende Projekte, darunter Zu erledigen */}
        {!pc && (
          <>
            <EinsatzBereich onStunden={(id) => { setZeitProjekt(id); setZeitOffen(true); }} />

            {/* Die häufigsten Handgriffe — groß, mit dem Daumen erreichbar */}
            <section>
              <Gruppentitel>Schnell festhalten</Gruppentitel>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SchnellKnopf icon={Camera} titel="Foto" unter="zum Projekt" primaer onClick={() => setFotoOffen(true)} />
                <SchnellKnopf icon={Clock} titel="Stunden" unter="buchen" onClick={() => { setZeitProjekt(undefined); setZeitOffen(true); }} />
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

          </>
        )}

        {/* minmax(0,…): sonst macht eine lange, abgeschnittene Zeile die Spalte breiter als das Handy */}
        {/* Am Handy nur „Zu erledigen“ (Chef) — laufende Projekte und zuletzt
            Gebuchtes stehen in Projekte und Stunden, die Startseite bleibt das Menü */}
        {(pc || istChef) && (
        <div className="grid grid-cols-1 gap-6">
          {pc && (
          <Karte titel="Laufende Projekte" alle={{ to: "/projekte", text: "Alle Projekte" }} ohnePolster>
            {zuletzt.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground">
                Noch kein laufendes Projekt.{" "}
                <button type="button" className="min-h-11 font-medium text-primary hover:underline" onClick={() => setProjektOffen(true)}>Projekt anlegen</button>
              </div>
            ) : (
              <ul className="grid grid-cols-1 divide-y xl:grid-cols-2 xl:divide-y-0">
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
          )}

          {/* Chef: was im Büro liegt. Monteur am PC: zuletzt gebucht. */}
          {istChef ? (
            <Karte titel="Zu erledigen">
              {offenePunkte.length === 0 ? (
                <p className="text-sm text-muted-foreground">Alles erledigt — nichts offen.</p>
              ) : (
                <ul className={cn("gap-2", pc ? "grid grid-cols-2 xl:grid-cols-3" : "space-y-2")}>
                  {offenePunkte.map((o) => (
                    <li key={o.text}>
                      <Link to={o.to} className={cn(
                        "flex h-full items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:border-primary/50",
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
        )}

        {pc && (
          <>
            <EinsatzBereich onStunden={(id) => { setZeitProjekt(id); setZeitOffen(true); }} />

            {/* Die häufigsten Handgriffe — groß, mit dem Daumen erreichbar */}
            <section>
              <Gruppentitel>Schnell festhalten</Gruppentitel>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SchnellKnopf icon={Camera} titel="Foto" unter="zum Projekt" primaer onClick={() => setFotoOffen(true)} />
                <SchnellKnopf icon={Clock} titel="Stunden" unter="buchen" onClick={() => { setZeitProjekt(undefined); setZeitOffen(true); }} />
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

          </>
        )}

        {/* Am Handy und Tablet ist die Startseite das Menü — große Karten */}
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
                      className="group flex min-h-20 w-full flex-col justify-center rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50 active:scale-[0.99]">
                      <span className="flex items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <e.icon className="h-6 w-6" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-semibold leading-tight">{e.titel}</span>
                          <span className="block text-sm text-muted-foreground">{(!istChef && e.textMonteur) || e.text}</span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      </main>

      <FotoDialog open={fotoOffen} onOpenChange={setFotoOffen} />
      <ZeitDialog open={zeitOffen} onOpenChange={setZeitOffen} projektId={zeitProjekt} />
      <ProjektDialog open={projektOffen} onOpenChange={setProjektOffen} />
      <TerminDialog open={terminOffen} onOpenChange={setTerminOffen} />
    </div>
  );
}

function SchnellAktion({ icon: I, titel, onClick }: { icon: typeof Camera; titel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-12 items-center gap-2.5 rounded-lg border bg-card px-4 text-left font-medium transition-colors hover:border-primary/50">
      <I className="h-5 w-5 text-primary" /> {titel}
    </button>
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
