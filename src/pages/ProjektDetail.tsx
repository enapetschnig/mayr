import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays, CalendarPlus, Camera, ClipboardSignature, Clock, FileText, FolderOpen, Images, LayoutList,
  Mail, MapPin, MoreVertical, Package, Pencil, Phone, Receipt, ScanBarcode, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, Karte, Kennzahl, Leer, ProjektStatusBadge } from "@/components/Bausteine";
import { ProjektDialog } from "@/components/dialoge/ProjektDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { FotosTab } from "@/components/projekt/FotosTab";
import { ZeitenListe, useZeitenListe, type ZeitMitInfo } from "@/components/zeiten/ZeitenListe";
import { ProjektMaterial } from "@/components/material/ProjektMaterial";
import { ProjektRegie } from "@/components/regie/ProjektRegie";
import { ProjektBelege } from "@/components/belege/ProjektBelege";
import { useNeuLaden, useProjekt, useProjektZahlen } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, euro, isoTag, stunden, uhrzeit } from "@/lib/format";
import { artikelVk, runden2, stundensatzFuer } from "@/lib/preise";
import { PROJEKT_STATUS, name, type ProjektStatus, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

type Ordner = "uebersicht" | "fotos" | "dokumente" | "stunden" | "material" | "regie" | "termine" | "belege";

const ORDNER: { wert: Ordner; text: string; icon: typeof Clock; nurChef?: boolean }[] = [
  { wert: "uebersicht", text: "Übersicht", icon: LayoutList },
  { wert: "fotos", text: "Fotos", icon: Images },
  { wert: "stunden", text: "Stunden", icon: Clock },
  { wert: "material", text: "Material", icon: Package },
  { wert: "regie", text: "Regie", icon: ClipboardSignature },
  { wert: "dokumente", text: "Dokumente", icon: FileText },
  { wert: "termine", text: "Termine", icon: CalendarDays },
  { wert: "belege", text: "Belege", icon: Receipt, nurChef: true },
];

/** Anzahl je Ordner für die Kacheln. Die Schlüssel beginnen mit dem Bereich,
 *  damit sie nach jedem Speichern mit neu geladen werden. */
function useZaehler(projektId: string, istChef: boolean): Partial<Record<Ordner, number>> {
  const zaehlen = (bereich: string, tabelle: "zeiten" | "material_buchungen" | "regieberichte" | "termine" | "belege", aktiv = true) => ({
    queryKey: [bereich, "zahl", projektId, tabelle],
    enabled: !!projektId && aktiv,
    queryFn: async () => {
      const { count } = await supabase.from(tabelle).select("id", { count: "exact", head: true }).eq("projekt_id", projektId);
      return count ?? 0;
    },
  });
  const dateien = useQuery({
    queryKey: ["dateien", "zahl", projektId],
    enabled: !!projektId,
    queryFn: async () => {
      const { data } = await supabase.from("dateien").select("art").eq("projekt_id", projektId);
      const fotos = (data ?? []).filter((d) => d.art === "foto").length;
      return { fotos, dokumente: (data ?? []).length - fotos };
    },
  });
  const zeiten = useQuery(zaehlen("zeiten", "zeiten"));
  const material = useQuery(zaehlen("material", "material_buchungen"));
  const regie = useQuery(zaehlen("regieberichte", "regieberichte"));
  const termine = useQuery(zaehlen("termine", "termine"));
  const belege = useQuery(zaehlen("belege", "belege", istChef));
  return {
    fotos: dateien.data?.fotos, dokumente: dateien.data?.dokumente, stunden: zeiten.data, material: material.data,
    regie: regie.data, termine: termine.data, belege: belege.data,
  };
}

export default function ProjektDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const { data: projekt, isLoading } = useProjekt(id);
  const [dialog, setDialog] = useState<null | "bearbeiten" | "zeit" | "foto" | "termin" | "loeschen">(null);
  const [zeit, setZeit] = useState<ZeitMitInfo | null>(null);
  const [termin, setTermin] = useState<Termin | null>(null);
  const zaehler = useZaehler(id, istChef);
  const ordnerParam = params.get("ordner") as Ordner | null;
  const ordner: Ordner = ordnerParam && ORDNER.some((o) => o.wert === ordnerParam && (!o.nurChef || istChef)) ? ordnerParam : "uebersicht";

  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Lädt…</div>;
  if (!projekt) {
    return (
      <Seite titel="Projekt" zurueckPfad="/projekte">
        <Leer icon={FolderOpen} text="Dieses Projekt gibt es nicht (mehr)." />
      </Seite>
    );
  }

  const oeffnen = (o: Ordner) => setParams(o === "uebersicht" ? {} : { ordner: o }, { replace: true });
  const zu = (o: boolean) => { if (!o) { setDialog(null); setZeit(null); setTermin(null); } };

  const statusSetzen = async (s: ProjektStatus) => {
    const { error } = await supabase.from("projekte").update({ status: s }).eq("id", projekt.id);
    if (error) return toast.error("Nicht geändert", { description: error.message });
    toast.success(`Status: ${PROJEKT_STATUS[s].text}`);
    await neuLaden("projekte");
  };

  const loeschen = async () => {
    const { error } = await supabase.from("projekte").delete().eq("id", projekt.id);
    if (error) return toast.error("Nicht gelöscht", { description: error.message });
    toast.success("Projekt gelöscht");
    await neuLaden("projekte", "projekt_zahlen");
    navigate("/projekte");
  };

  const adresse = [projekt.strasse, [projekt.plz, projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const kunde = projekt.kunden;

  return (
    <Seite
      titel={projekt.name}
      untertitel={<><span className="font-mono">{projekt.nummer}</span>{kunde && ` · ${kunde.name}`}</>}
      zurueckPfad="/projekte"
      aktionen={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Projekt-Menü"><MoreVertical className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setDialog("bearbeiten")}><Pencil className="mr-2 h-4 w-4" /> Bearbeiten</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Status</DropdownMenuLabel>
            {(Object.keys(PROJEKT_STATUS) as ProjektStatus[]).map((s) => (
              <DropdownMenuItem key={s} disabled={projekt.status === s} onClick={() => statusSetzen(s)}>
                <ProjektStatusBadge status={s} />
              </DropdownMenuItem>
            ))}
            {istChef && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => setDialog("loeschen")}>
                  <Trash2 className="mr-2 h-4 w-4" /> Löschen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {/* Kopf: Status, Kunde, Baustelle — anrufen und navigieren mit einem Tipp */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ProjektStatusBadge status={projekt.status} />
          {projekt.stundensatz != null && istChef && (
            <span className="text-xs text-muted-foreground">eigener Stundensatz {euro(Number(projekt.stundensatz))}</span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Kunde</p>
            {kunde ? (
              <>
                <p className="font-semibold">{kunde.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {kunde.telefon && <a href={`tel:${kunde.telefon}`} className="inline-flex items-center gap-1.5 text-primary"><Phone className="h-4 w-4" />{kunde.telefon}</a>}
                  {kunde.email && <a href={`mailto:${kunde.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-primary"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{kunde.email}</span></a>}
                </div>
              </>
            ) : (
              <button type="button" className="text-primary hover:underline" onClick={() => setDialog("bearbeiten")}>Kunde zuordnen</button>
            )}
          </div>
          <div className="min-w-0 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Baustelle</p>
            {adresse ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`} target="_blank" rel="noreferrer"
                className="inline-flex items-start gap-1.5 text-primary">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{adresse}</span>
              </a>
            ) : <p className="text-muted-foreground">Keine Adresse</p>}
          </div>
        </div>
      </section>

      {/* Die Handgriffe auf der Baustelle */}
      <div className="grid grid-cols-4 gap-2">
        <AktionsKnopf icon={Camera} text="Foto" primaer onClick={() => setDialog("foto")} />
        <AktionsKnopf icon={Clock} text="Stunden" onClick={() => setDialog("zeit")} />
        <AktionsKnopf icon={ScanBarcode} text="Material" onClick={() => navigate(`/scan?projekt=${projekt.id}&modus=ausfassung`)} />
        <AktionsKnopf icon={ClipboardSignature} text="Regie" onClick={() => navigate(`/regie/neu?projekt=${projekt.id}`)} />
      </div>

      {/* Projektordner als Kacheln: alles auf einen Blick, mit Anzahl */}
      <nav className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Projektordner">
        {ORDNER.filter((o) => !o.nurChef || istChef).map(({ wert, text, icon: I }) => {
          const aktiv = ordner === wert;
          const n = zaehler[wert];
          return (
            <button key={wert} type="button" onClick={() => oeffnen(wert)} aria-current={aktiv ? "page" : undefined}
              className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 transition-colors",
                aktiv ? "border-primary bg-primary-soft text-primary" : "bg-card hover:border-primary/50")}>
              <I className="h-5 w-5" />
              <span className="text-center text-[11px] font-semibold leading-tight sm:text-xs">{text}</span>
              {!!n && (
                <span className={cn("zahl absolute right-1 top-1 min-w-5 rounded-full px-1 text-center text-[10px] font-bold leading-5",
                  aktiv ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{n}</span>
              )}
            </button>
          );
        })}
      </nav>

      {ordner === "uebersicht" && <Uebersicht projektId={projekt.id} beschreibung={projekt.beschreibung} stundensatz={projekt.stundensatz} />}
      {ordner === "fotos" && <FotosTab projektId={projekt.id} art="foto" />}
      {ordner === "dokumente" && <FotosTab projektId={projekt.id} art="dokument" />}
      {ordner === "stunden" && (
        <ProjektStunden projektId={projekt.id} onNeu={() => setDialog("zeit")}
          onWahl={(z) => (z.regiebericht_id ? navigate(`/regie/${z.regiebericht_id}`) : (setZeit(z), setDialog("zeit")))} />
      )}
      {ordner === "material" && <ProjektMaterial projekt={projekt} />}
      {ordner === "regie" && <ProjektRegie projekt={projekt} />}
      {ordner === "termine" && (
        <ProjektTermine projektId={projekt.id} onNeu={() => setDialog("termin")} onWahl={(t) => { setTermin(t); setDialog("termin"); }} />
      )}
      {ordner === "belege" && istChef && <ProjektBelege projekt={projekt} />}

      <ProjektDialog open={dialog === "bearbeiten"} onOpenChange={zu} projekt={projekt} />
      <ZeitDialog open={dialog === "zeit"} onOpenChange={zu} projektId={projekt.id} eintrag={zeit} />
      <FotoDialog open={dialog === "foto"} onOpenChange={zu} projektId={projekt.id} />
      <TerminDialog open={dialog === "termin"} onOpenChange={zu} projektId={projekt.id} termin={termin} />

      <AlertDialog open={dialog === "loeschen"} onOpenChange={zu}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{projekt.name}“ wird mit allen Stunden, Materialbuchungen, Regieberichten, Fotos und Terminen gelöscht.
              Angebote und Rechnungen bleiben erhalten. Meist ist <strong>Abgeschlossen</strong> die bessere Wahl.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={loeschen}>Endgültig löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}

function AktionsKnopf({ icon: I, text, onClick, primaer = false }: { icon: typeof Clock; text: string; onClick: () => void; primaer?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-sm font-semibold transition-colors active:scale-[0.98]",
        primaer ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border bg-card text-foreground hover:border-primary/50")}>
      <I className={cn("h-5 w-5", !primaer && "text-primary")} />
      <span>+ {text}</span>
    </button>
  );
}

/**
 * Übersicht: Stunden je Person, Material, offene Regieberichte — für den
 * Chef zusätzlich die Nachkalkulation (Angebot gegen bisher geleistet).
 */
function Uebersicht({ projektId, beschreibung, stundensatz }: { projektId: string; beschreibung: string | null; stundensatz: number | null }) {
  const { firma, istChef } = useSitzung();
  const { data: zahlen = {} } = useProjektZahlen();
  const z = zahlen[projektId];
  const { data: zeiten = [] } = useZeitenListe({ projektId });
  const heute = isoTag();

  const { data: material } = useQuery({
    queryKey: ["material", "projekt-wert", projektId],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_buchungen")
        .select("art, menge, ek_preis, artikel(ek_preis, vk_preis, listenpreis)")
        .eq("projekt_id", projektId).in("art", ["ausfassung", "rueckgabe", "direkt"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: belege = [] } = useQuery({
    queryKey: ["belege", "projekt-summen", projektId],
    enabled: istChef,
    queryFn: async () => {
      const { data, error } = await supabase.from("belege").select("typ, status, netto").eq("projekt_id", projektId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: naechste = [] } = useQuery({
    queryKey: ["termine", "projekt-naechste", projektId, heute],
    queryFn: async () => {
      const { data } = await supabase.from("termine").select("*").eq("projekt_id", projektId)
        .or(`datum.gte.${heute},bis_datum.gte.${heute}`).order("datum").limit(3);
      return data ?? [];
    },
  });

  // Stunden je Person
  const jePerson = new Map<string, { profil: ZeitMitInfo["profiles"]; h: number }>();
  zeiten.forEach((t) => {
    const e = jePerson.get(t.user_id) ?? { profil: t.profiles, h: 0 };
    e.h += Number(t.stunden);
    jePerson.set(t.user_id, e);
  });
  const personen = [...jePerson.values()].sort((a, b) => b.h - a.h);

  const satz = stundensatzFuer({ stundensatz }, firma);
  const materialVk = runden2((material ?? []).reduce((s, m) => {
    const vz = m.art === "rueckgabe" ? -1 : 1;
    const vk = m.artikel ? artikelVk(m.artikel, firma) : runden2(Number(m.ek_preis ?? 0) * (1 + Number(firma?.material_aufschlag ?? 0) / 100));
    return s + vz * Number(m.menge) * vk;
  }, 0));
  const stundenGesamt = Number(z?.stunden ?? 0);
  const geleistet = runden2(stundenGesamt * satz + materialVk);
  const angebot = belege.filter((b) => b.typ === "angebot" && (b.status === "offen" || b.status === "angenommen")).reduce((s, b) => s + Number(b.netto), 0);
  const verrechnet = belege.filter((b) => b.typ === "rechnung" && (b.status === "offen" || b.status === "bezahlt")).reduce((s, b) => s + Number(b.netto), 0);
  const anteil = angebot > 0 ? Math.min(100, (geleistet / angebot) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kennzahl titel="Stunden" wert={stunden(stundenGesamt)} unter={z && Number(z.stunden_offen) > 0 ? `${stunden(Number(z.stunden_offen))} offen` : undefined} />
        <Kennzahl titel="Material" wert={euro(materialVk)} unter="Verkaufswert" />
        <Kennzahl titel="Regieberichte" wert={String(Number(z?.regie_offen ?? 0) + Number(z?.regie_entwurf ?? 0))}
          unter={z ? `${z.regie_entwurf} Entwurf · ${z.regie_offen} unterschrieben` : undefined} />
        {istChef
          ? <Kennzahl titel="Verrechnet" wert={euro(verrechnet)} unter="netto" />
          : <Kennzahl titel="Personen" wert={String(personen.length)} unter="auf dem Projekt" />}
      </div>

      {istChef && (angebot > 0 || geleistet > 0) && (
        <Karte titel="Nachkalkulation">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Angebot (netto)</span><span className="zahl font-medium">{angebot > 0 ? euro(angebot) : "—"}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bisher geleistet</span>
              <span className="zahl font-medium">{euro(geleistet)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{stunden(stundenGesamt)} × {euro(satz)} + Material {euro(materialVk)}</p>
            {angebot > 0 && (
              <div className="pt-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", geleistet > angebot ? "bg-destructive" : "bg-primary")} style={{ width: `${anteil}%` }} />
                </div>
                <p className={cn("mt-1 text-xs", geleistet > angebot ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {geleistet > angebot ? `${euro(geleistet - angebot)} über dem Angebot` : `${Math.round(anteil)} % des Angebots`}
                </p>
              </div>
            )}
          </div>
        </Karte>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Karte titel="Wer war dabei">
          {personen.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Stunden gebucht.</p> : (
            <ul className="space-y-2">
              {personen.map((p) => (
                <li key={name(p.profil)} className="flex items-center gap-2.5 text-sm">
                  <Avatar profil={p.profil} className="h-7 w-7 text-[11px]" />
                  <span className="flex-1">{name(p.profil)}</span>
                  <span className="zahl font-semibold">{stunden(p.h)}</span>
                </li>
              ))}
            </ul>
          )}
        </Karte>
        <Karte titel="Nächste Termine">
          {naechste.length === 0 ? <p className="text-sm text-muted-foreground">Keine Termine geplant.</p> : (
            <ul className="space-y-2 text-sm">
              {naechste.map((t) => (
                <li key={t.id} className="flex gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{t.datum === heute ? "Heute" : datumKurz(t.datum)}<br />{t.ganztags ? "ganztägig" : uhrzeit(t.von)}</span>
                  <span className="font-medium">{t.titel}</span>
                </li>
              ))}
            </ul>
          )}
        </Karte>
      </div>

      {beschreibung && (
        <Karte titel="Beschreibung"><p className="whitespace-pre-wrap text-sm">{beschreibung}</p></Karte>
      )}
    </div>
  );
}

function ProjektStunden({ projektId, onNeu, onWahl }: { projektId: string; onNeu: () => void; onWahl: (z: ZeitMitInfo) => void }) {
  const { data: zeiten = [], isLoading } = useZeitenListe({ projektId });
  const summe = zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const offen = zeiten.filter((z) => !z.rechnung_id).reduce((s, z) => s + Number(z.stunden), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onNeu} className="h-12 gap-2"><Clock className="h-4 w-4" /> Stunden buchen</Button>
        {summe > 0 && (
          <p className="text-sm text-muted-foreground">
            Gesamt <span className="zahl font-semibold text-foreground">{stunden(summe)}</span>
            {offen < summe && <> · offen <span className="zahl font-semibold text-foreground">{stunden(offen)}</span></>}
          </p>
        )}
      </div>
      {!isLoading && zeiten.length === 0
        ? <Leer icon={Clock} text="Noch keine Stunden auf diesem Projekt." />
        : <ZeitenListe zeiten={zeiten} onWahl={onWahl} mitPerson mitProjekt={false} />}
    </div>
  );
}

function ProjektTermine({ projektId, onNeu, onWahl }: { projektId: string; onNeu: () => void; onWahl: (t: Termin) => void }) {
  const heute = isoTag();
  const { data: termine = [], isLoading } = useQuery({
    queryKey: ["termine", "projekt", projektId],
    queryFn: async () => {
      const { data, error } = await supabase.from("termine").select("*").eq("projekt_id", projektId).order("datum").order("von");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onNeu} className="h-12 gap-2"><CalendarPlus className="h-4 w-4" /> Termin eintragen</Button>
        <Button variant="outline" className="h-12" asChild><Link to="/kalender">Zum Kalender</Link></Button>
      </div>
      {!isLoading && termine.length === 0 ? <Leer icon={CalendarDays} text="Keine Termine zu diesem Projekt." /> : (
        <ul className="divide-y rounded-lg border bg-card">
          {termine.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onWahl(t)}
                className={cn("flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50", (t.bis_datum ?? t.datum) < heute && "opacity-60")}>
                <div className="w-24 shrink-0 text-xs">
                  <p className="font-semibold">{t.datum === heute ? "Heute" : datumKurz(t.datum)}</p>
                  <p className="text-muted-foreground">{t.ganztags ? "ganztägig" : `${uhrzeit(t.von)}–${uhrzeit(t.bis)}`}</p>
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t.titel}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
