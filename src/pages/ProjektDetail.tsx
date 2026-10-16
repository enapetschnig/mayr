import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive, ArchiveRestore, CalendarPlus, Camera, Clock, MapPin, MoreVertical, Package, Pencil, Phone,
  Mail, Receipt, Send, Trash2, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FirmaBadge, Leer, SichtbarkeitBadge } from "@/components/Bausteine";
import { RollenWahl, type RollenMap } from "@/components/RollenWahl";
import { FotosTab } from "@/components/projekt/FotosTab";
import { MaterialListe, ZeitenListe } from "@/components/Buchungslisten";
import { ProjektDialog, rollenSpeichern } from "@/components/dialoge/ProjektDialog";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { MaterialDialog } from "@/components/dialoge/MaterialDialog";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { TerminDialog } from "@/components/dialoge/TerminDialog";
import { BelegListe } from "@/components/belege/BelegListe";
import { rolleVon, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, datumKurz, isoTag, uhrzeit } from "@/lib/format";
import type { Termin } from "@/lib/types";

export default function ProjektDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const neuLaden = useNeuLaden();
  const { firma, firmen, firmaVon } = useSitzung();
  const { data: projekte = [], isLoading } = useProjekte();
  const projekt = projekte.find((p) => p.id === id);
  const [dialog, setDialog] = useState<null | "bearbeiten" | "zeit" | "material" | "foto" | "termin" | "loeschen">(null);
  const [termin, setTermin] = useState<Termin | null>(null);
  const [rollenEdit, setRollenEdit] = useState<RollenMap | null>(null);
  const tab = params.get("tab") || "uebersicht";

  const { data: termine = [] } = useQuery({
    queryKey: ["termine", "projekt", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("termine").select("*").eq("projekt_id", id).order("datum").order("von");
      return data ?? [];
    },
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt…</div>;
  if (!projekt) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Projekt" backPath="/projekte" />
        <Leer icon={Users} text="Dieses Projekt gibt es nicht (mehr) oder es ist nicht für dich freigegeben." />
      </div>
    );
  }

  const eigen = projekt.firma_id === firma?.id;
  const gemeinsam = projekt.sichtbarkeit === "gemeinsam";
  const meineRolle = rolleVon(projekt, firma?.id);
  const gu = projekt.projekt_rollen.find((r) => r.rolle === "GU");
  const guFirma = firmaVon(gu?.firma_id);
  const zu = (o: boolean) => { if (!o) { setDialog(null); setTermin(null); } };

  const statusUmschalten = async () => {
    const neu = projekt.status === "aktiv" ? "abgeschlossen" : "aktiv";
    const { error } = await supabase.from("projekte").update({ status: neu }).eq("id", projekt.id);
    if (error) return toast.error(error.message);
    toast.success(neu === "abgeschlossen" ? "Projekt abgeschlossen" : "Projekt wieder aktiv");
    await neuLaden("projekte");
  };

  const loeschen = async () => {
    const { error } = await supabase.from("projekte").delete().eq("id", projekt.id);
    if (error) return toast.error("Nicht gelöscht", { description: error.message });
    toast.success("Projekt gelöscht");
    await neuLaden("projekte");
    navigate("/projekte");
  };

  const rollenUebernehmen = async () => {
    if (!rollenEdit) return;
    try {
      await rollenSpeichern(projekt.id, rollenEdit);
      await neuLaden("projekte");
      toast.success("Rollen gespeichert");
      setRollenEdit(null);
    } catch (e) {
      toast.error((e as { message?: string }).message ?? "Fehler");
    }
  };

  const kartenAdresse = [projekt.adresse, projekt.plz, projekt.ort].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={projekt.name} backPath="/projekte" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4">
        {/* Kopf */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SichtbarkeitBadge wert={projekt.sichtbarkeit} />
            {meineRolle && <Badge variant={meineRolle === "GU" ? "default" : "secondary"}>{meineRolle === "GU" ? "Ich bin GU" : "Ich bin SU"}</Badge>}
            {!eigen && <span className="text-xs text-muted-foreground">angelegt von</span>}
            {!eigen && <FirmaBadge firma={firmaVon(projekt.firma_id)} />}
            {projekt.status === "abgeschlossen" && <Badge variant="outline">Abgeschlossen</Badge>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Projekt-Menü"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialog("bearbeiten")}><Pencil className="mr-2 h-4 w-4" /> Bearbeiten</DropdownMenuItem>
              <DropdownMenuItem onClick={statusUmschalten}>
                {projekt.status === "aktiv"
                  ? <><Archive className="mr-2 h-4 w-4" /> Abschließen</>
                  : <><ArchiveRestore className="mr-2 h-4 w-4" /> Wieder aktiv</>}
              </DropdownMenuItem>
              {eigen && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDialog("loeschen")}>
                    <Trash2 className="mr-2 h-4 w-4" /> Löschen
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Schnellaktionen */}
        <div className="grid grid-cols-4 gap-2">
          {([
            ["foto", Camera, "Foto"],
            ["zeit", Clock, "Stunden"],
            ["material", Package, "Material"],
            ["termin", CalendarPlus, "Termin"],
          ] as const).map(([d, Icon, text]) => (
            <Button key={d} variant={d === "foto" ? "default" : "outline"} className="h-auto flex-col gap-1 py-3"
              onClick={() => setDialog(d)}>
              <Icon className="h-5 w-5" /><span className="text-xs sm:text-sm">+ {text}</span>
            </Button>
          ))}
        </div>

        {/* Rechnung an den GU — der häufigste Weg für Subunternehmer */}
        {meineRolle === "SU" && guFirma && (
          <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-3"
            onClick={() => navigate(`/rechnungen/neu?projekt=${projekt.id}&an=${guFirma.id}`)}>
            <Send className="h-4 w-4 shrink-0" />
            <span className="text-left">Rechnung an GU <strong>{guFirma.name}</strong> schreiben</span>
          </Button>
        )}

        <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
          <div className="overflow-x-auto -mx-3 px-3">
            <TabsList className="w-max">
              <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
              <TabsTrigger value="fotos">Fotos & Dateien</TabsTrigger>
              <TabsTrigger value="stunden">Stunden</TabsTrigger>
              <TabsTrigger value="material">Material</TabsTrigger>
              <TabsTrigger value="termine">Termine</TabsTrigger>
              <TabsTrigger value="rechnungen">Rechnungen</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="uebersicht" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Auftraggeber</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {projekt.kunde_name ? (
                    <>
                      <p className="font-semibold">{projekt.kunde_name}</p>
                      {projekt.kunde_strasse && <p>{projekt.kunde_strasse}</p>}
                      {(projekt.kunde_plz || projekt.kunde_ort) && <p>{projekt.kunde_plz} {projekt.kunde_ort}</p>}
                      {projekt.kunde_telefon && <a href={`tel:${projekt.kunde_telefon}`} className="flex items-center gap-2 text-primary pt-1"><Phone className="h-4 w-4" />{projekt.kunde_telefon}</a>}
                      {projekt.kunde_email && <a href={`mailto:${projekt.kunde_email}`} className="flex items-center gap-2 text-primary"><Mail className="h-4 w-4" />{projekt.kunde_email}</a>}
                    </>
                  ) : (
                    <button className="text-primary hover:underline" onClick={() => setDialog("bearbeiten")}>Kundendaten eintragen</button>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Baustelle</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {kartenAdresse ? (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kartenAdresse)}`} target="_blank" rel="noreferrer"
                      className="flex items-start gap-2 text-primary">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{projekt.adresse}<br />{projekt.plz} {projekt.ort}</span>
                    </a>
                  ) : <p className="text-muted-foreground">Keine Adresse</p>}
                  {(projekt.start_datum || projekt.end_datum) && (
                    <p className="text-muted-foreground pt-1">Zeitraum: {datum(projekt.start_datum)} – {datum(projekt.end_datum)}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {gemeinsam && (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">General- & Subunternehmer</CardTitle>
                  {!rollenEdit && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      const r: RollenMap = {};
                      firmen.forEach((f) => { r[f.id] = (projekt.projekt_rollen.find((x) => x.firma_id === f.id)?.rolle as "GU" | "SU") ?? null; });
                      setRollenEdit(r);
                    }}>
                      <Pencil className="h-4 w-4 mr-1" /> Einteilen
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {rollenEdit ? (
                    <div className="space-y-3">
                      <RollenWahl rollen={rollenEdit} onChange={setRollenEdit} />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setRollenEdit(null)}>Abbrechen</Button>
                        <Button onClick={rollenUebernehmen}>Speichern</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {firmen.map((f) => {
                        const r = projekt.projekt_rollen.find((x) => x.firma_id === f.id)?.rolle;
                        return (
                          <div key={f.id} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 min-w-0"><FirmaBadge firma={f} /><span className="text-sm truncate">{f.name}</span></span>
                            {r ? <Badge variant={r === "GU" ? "default" : "secondary"}>{r === "GU" ? "Generalunternehmer" : "Subunternehmer"}</Badge>
                              : <span className="text-xs text-muted-foreground">nicht beteiligt</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {projekt.beschreibung && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Beschreibung</CardTitle></CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">{projekt.beschreibung}</CardContent>
              </Card>
            )}

            <Button variant="outline" className="w-full gap-2" onClick={() => navigate(`/rechnungen/neu?projekt=${projekt.id}`)}>
              <Receipt className="h-4 w-4" /> Rechnung / Angebot zu diesem Projekt
            </Button>
          </TabsContent>

          <TabsContent value="fotos" className="mt-4"><FotosTab projektId={projekt.id} /></TabsContent>

          <TabsContent value="stunden" className="mt-4 space-y-3">
            <Button onClick={() => setDialog("zeit")} className="gap-2"><Clock className="h-4 w-4" /> Stunden buchen</Button>
            <ZeitenListe filter={{ projektId: projekt.id }} />
          </TabsContent>

          <TabsContent value="material" className="mt-4 space-y-3">
            <Button onClick={() => setDialog("material")} className="gap-2"><Package className="h-4 w-4" /> Material buchen</Button>
            <MaterialListe filter={{ projektId: projekt.id }} />
          </TabsContent>

          <TabsContent value="termine" className="mt-4 space-y-3">
            <Button onClick={() => setDialog("termin")} className="gap-2"><CalendarPlus className="h-4 w-4" /> Termin anlegen</Button>
            {termine.length === 0 ? <Leer icon={CalendarPlus} text="Keine Termine zu diesem Projekt." /> : (
              <div className="rounded-lg border divide-y bg-card">
                {termine.map((t) => (
                  <button key={t.id} className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50" onClick={() => { setTermin(t); setDialog("termin"); }}>
                    <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: firmaVon(t.firma_id)?.farbe }} />
                    <div className="w-24 shrink-0 text-xs">
                      <p className="font-semibold">{t.datum === isoTag() ? "Heute" : datumKurz(t.datum)}</p>
                      <p className="text-muted-foreground">{t.ganztags ? "ganztägig" : `${uhrzeit(t.von)}–${uhrzeit(t.bis)}`}</p>
                    </div>
                    <p className="flex-1 text-sm font-semibold truncate">{t.titel}</p>
                    <SichtbarkeitBadge wert={t.sichtbarkeit} />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rechnungen" className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/rechnungen/neu?projekt=${projekt.id}`)} className="gap-2"><Receipt className="h-4 w-4" /> Rechnung an Kunden</Button>
              {gemeinsam && firmen.filter((f) => f.id !== firma?.id).map((f) => (
                <Button key={f.id} variant="outline" className="gap-2" onClick={() => navigate(`/rechnungen/neu?projekt=${projekt.id}&an=${f.id}`)}>
                  <Send className="h-4 w-4" /> An {f.kurzname}
                </Button>
              ))}
            </div>
            <BelegListe projektId={projekt.id} />
          </TabsContent>
        </Tabs>
      </main>

      <ProjektDialog open={dialog === "bearbeiten"} onOpenChange={zu} projekt={projekt} />
      <ZeitDialog open={dialog === "zeit"} onOpenChange={zu} projektId={projekt.id} />
      <MaterialDialog open={dialog === "material"} onOpenChange={zu} projektId={projekt.id} />
      <FotoDialog open={dialog === "foto"} onOpenChange={zu} projektId={projekt.id} />
      <TerminDialog open={dialog === "termin"} onOpenChange={zu} projektId={projekt.id} termin={termin} />

      <AlertDialog open={dialog === "loeschen"} onOpenChange={zu}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{projekt.name}“ wird mit allen Stunden, Material, Fotos und Terminen gelöscht — auch die der Partner.
              Rechnungen bleiben erhalten. Meist ist <strong>Abschließen</strong> die bessere Wahl.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={loeschen}>Endgültig löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
