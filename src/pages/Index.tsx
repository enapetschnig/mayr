import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BarChart3, Bell, CalendarDays, Clock, FolderKanban, Info, LogOut, Package,
  Receipt, Settings, User as UserIcon, Users, Lock, Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import SchnellErfassung from "@/components/SchnellErfassung";
import { FirmaBadge } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { rolleVon, useProjekte } from "@/hooks/useDaten";
import { datumKurz, euro, isoTag, tageDazu, uhrzeit } from "@/lib/format";

type Karte = {
  titel: string; text: string; pfad: string; icon: typeof Clock; knopf: string;
  farbe?: string; variante?: "default" | "outline" | "secondary"; zahl?: number;
};

export default function Index() {
  const navigate = useNavigate();
  const { profil, firma, firmaVon } = useSitzung();
  const { data: projekte = [] } = useProjekte();

  const heute = isoTag();
  const { data: termine = [] } = useQuery({
    queryKey: ["termine", "dashboard", heute],
    queryFn: async () => {
      const { data } = await supabase.from("termine").select("*")
        .gte("datum", tageDazu(heute, -14)).lte("datum", tageDazu(heute, 7))
        .order("datum").order("von", { nullsFirst: true });
      // mehrtägige Termine, die heute noch laufen, gehören dazu
      return (data ?? []).filter((t) => (t.bis_datum ?? t.datum) >= heute).slice(0, 6);
    },
  });

  const { data: belege } = useQuery({
    queryKey: ["rechnungen", "dashboard", firma?.id],
    enabled: !!firma,
    queryFn: async () => {
      const { data } = await supabase.from("rechnungen")
        .select("id, firma_id, empfaenger_firma_id, brutto, status, typ")
        .eq("typ", "rechnung").eq("status", "offen");
      const alle = data ?? [];
      const ausgang = alle.filter((r) => r.firma_id === firma!.id);
      const eingang = alle.filter((r) => r.empfaenger_firma_id === firma!.id);
      return {
        offenAus: ausgang.reduce((s, r) => s + Number(r.brutto), 0), anzahlAus: ausgang.length,
        offenEin: eingang.reduce((s, r) => s + Number(r.brutto), 0), anzahlEin: eingang.length,
      };
    },
  });

  const { data: wartende = 0 } = useQuery({
    queryKey: ["profiles", "wartend"],
    enabled: !!profil?.ist_admin,
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("ist_aktiv", false);
      return count ?? 0;
    },
  });

  const abmelden = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  const aktive = projekte.filter((p) => p.status === "aktiv").slice(0, 6);

  const karten: Karte[] = [
    { titel: "Projekte", text: "Eigene und gemeinsame Projekte, Fotos, GU/SU", pfad: "/projekte", icon: FolderKanban, knopf: "Projekte öffnen", zahl: projekte.filter((p) => p.status === "aktiv").length },
    { titel: "Rechnungen & Angebote", text: "An Kunden oder an Kollegen — mit Materialpauschale", pfad: "/rechnungen", icon: Receipt, knopf: "Rechnungen öffnen" },
    { titel: "Kalender", text: "Gemeinsame und eigene Termine", pfad: "/kalender", icon: CalendarDays, knopf: "Kalender öffnen", farbe: "sky" },
    { titel: "Zeiterfassung", text: "Stunden auf Projekte buchen", pfad: "/zeiten", icon: Clock, knopf: "Stunden erfassen" },
    { titel: "Material", text: "Material auf Projekte buchen", pfad: "/material", icon: Package, knopf: "Material öffnen", variante: "secondary" },
    { titel: "Stundenauswertung", text: "Stunden je Projekt, Monat und Partner", pfad: "/auswertung", icon: BarChart3, knopf: "Auswerten", variante: "outline" },
    { titel: "Einstellungen", text: "Firmendaten, Briefkopf, Logo, Zugänge", pfad: "/einstellungen", icon: Settings, knopf: "Öffnen", variante: "outline" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex justify-between items-center gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm text-muted-foreground">Hallo</span>
              <span className="text-sm sm:text-base font-semibold truncate">
                {`${profil?.vorname ?? ""} ${profil?.nachname ?? ""}`.trim() || "Benutzer"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FirmaBadge firma={firma} lang className="hidden sm:inline-flex" />
              <FirmaBadge firma={firma} className="sm:hidden" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserIcon className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Menü</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>{firma?.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/einstellungen")}>
                    <Settings className="mr-2 h-4 w-4" /> Einstellungen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/einstellungen?tab=installieren")}>
                    <Info className="mr-2 h-4 w-4" /> App zum Startbildschirm
                  </DropdownMenuItem>
                  <ChangePasswordDialog />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={abmelden}>
                    <LogOut className="mr-2 h-4 w-4" /> Abmelden
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {profil?.ist_admin && wartende > 0 && (
        <button className="w-full bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors text-left"
          onClick={() => navigate("/einstellungen?tab=zugaenge")}>
          <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm sm:text-base">
                {wartende === 1 ? "1 neuer Zugang wartet auf Freischaltung" : `${wartende} neue Zugänge warten auf Freischaltung`}
              </p>
              <p className="text-xs text-amber-700">Tippe hier, um ihn freizuschalten</p>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-600 shrink-0" />
          </div>
        </button>
      )}

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 space-y-6">
        <SchnellErfassung />

        {belege && belege.anzahlEin > 0 && (
          <Card className="border-sky-200 bg-sky-50/60 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/rechnungen?ansicht=eingang")}>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                <Inbox className="h-5 w-5 text-sky-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base">
                  {belege.anzahlEin} offene {belege.anzahlEin === 1 ? "Rechnung" : "Rechnungen"} von Kollegen
                </p>
                <p className="text-xs text-muted-foreground">Gesamt {euro(belege.offenEin)} — zum Weiterverrechnen an den Kunden</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {karten.map((k) => (
            <Card key={k.pfad} className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50" onClick={() => navigate(k.pfad)}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between">
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${k.farbe === "sky" ? "bg-sky-500/10" : "bg-primary/10"}`}>
                    <k.icon className={`h-6 w-6 ${k.farbe === "sky" ? "text-sky-600" : "text-primary"}`} />
                  </div>
                  {k.pfad === "/rechnungen" && belege && belege.anzahlAus > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">{euro(belege.offenAus)} offen</Badge>
                  )}
                  {k.zahl !== undefined && k.zahl > 0 && <Badge variant="secondary">{k.zahl} aktiv</Badge>}
                </div>
                <CardTitle className="text-lg sm:text-xl">{k.titel}</CardTitle>
                <CardDescription className="text-sm">{k.text}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className={`w-full ${k.farbe === "sky" ? "bg-sky-600 hover:bg-sky-700" : ""}`} size="sm" variant={k.variante ?? "default"}>
                  {k.knopf}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl sm:text-2xl font-bold">Nächste Termine</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/kalender")}>
                Kalender <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {termine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Termine in den nächsten 7 Tagen.</p>
            ) : (
              <div className="space-y-2">
                {termine.map((t) => {
                  const f = firmaVon(t.firma_id);
                  return (
                    <Card key={t.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/kalender?datum=${t.datum}`)}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: f?.farbe }} />
                        <div className="w-16 shrink-0 text-xs">
                          <p className="font-semibold">{t.datum === heute ? "Heute" : datumKurz(t.datum)}</p>
                          <p className="text-muted-foreground">{t.ganztags ? "ganztägig" : uhrzeit(t.von)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{t.titel}</p>
                          {t.ort && <p className="text-xs text-muted-foreground truncate">{t.ort}</p>}
                        </div>
                        {t.sichtbarkeit === "gemeinsam" ? <Users className="h-4 w-4 text-primary shrink-0" /> : <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl sm:text-2xl font-bold">Aktive Projekte</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/projekte")}>
                Alle <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {aktive.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Projekte — oben auf „+ Projekt“ tippen.</p>
            ) : (
              <div className="space-y-2">
                {aktive.map((p) => {
                  const rolle = rolleVon(p, firma?.id);
                  return (
                    <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/projekte/${p.id}`)}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {p.sichtbarkeit === "gemeinsam" ? <Users className="h-5 w-5 text-primary" /> : <FolderKanban className="h-5 w-5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.sichtbarkeit === "gemeinsam" ? "Gemeinsam" : "Nur ich"}
                            {p.ort ? ` · ${p.ort}` : ""}
                            {p.firma_id !== firma?.id ? ` · von ${firmaVon(p.firma_id)?.kurzname}` : ""}
                          </p>
                        </div>
                        {rolle && <Badge variant={rolle === "GU" ? "default" : "secondary"}>{rolle}</Badge>}
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
