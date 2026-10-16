import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileText, Inbox, Receipt, Search, Send, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormularDialog } from "@/components/FormularDialog";
import { Leer } from "@/components/Bausteine";
import { BelegZeile, istUeberfaellig, useBelege } from "@/components/belege/BelegListe";
import { useSitzung } from "@/hooks/useSitzung";
import { euro } from "@/lib/format";
import { cn } from "@/lib/utils";

type Ansicht = "rechnung" | "angebot" | "eingang";

export default function Belege() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { firma, firmen } = useSitzung();
  const { data: belege = [], isLoading } = useBelege();
  const ansicht = (params.get("ansicht") as Ansicht) || "rechnung";
  const [status, setStatus] = useState("alle");
  const [suche, setSuche] = useState("");
  const [neuOffen, setNeuOffen] = useState(false);

  const eigene = belege.filter((b) => b.firma_id === firma?.id);
  const eingang = belege.filter((b) => b.empfaenger_firma_id === firma?.id);

  const liste = useMemo(() => {
    const basis = ansicht === "eingang" ? eingang : eigene.filter((b) => b.typ === ansicht);
    const s = suche.trim().toLowerCase();
    return basis.filter((b) =>
      (status === "alle" || (status === "ueberfaellig" ? istUeberfaellig(b) : b.status === status))
      && (!s || [b.nummer, b.kunde_name, b.betreff, b.projekte?.name].some((x) => x?.toLowerCase().includes(s))));
  }, [ansicht, eigene, eingang, status, suche]);

  const offene = eigene.filter((b) => b.typ === "rechnung" && b.status === "offen");
  const offenSumme = offene.reduce((s, b) => s + Number(b.reverse_charge ? b.netto : b.brutto), 0);
  const ueberSumme = offene.filter(istUeberfaellig).reduce((s, b) => s + Number(b.reverse_charge ? b.netto : b.brutto), 0);
  const jahr = String(new Date().getFullYear());
  const umsatzJahr = eigene.filter((b) => b.typ === "rechnung" && ["offen", "bezahlt"].includes(b.status) && b.datum.startsWith(jahr))
    .reduce((s, b) => s + Number(b.netto), 0);
  const eingangOffen = eingang.filter((b) => b.typ === "rechnung" && b.status === "offen");

  const statusListe = ansicht === "angebot"
    ? ["entwurf", "offen", "angenommen", "abgelehnt"]
    : ["entwurf", "offen", "ueberfaellig", "bezahlt", "storniert"];
  const statusText: Record<string, string> = { entwurf: "Entwurf", offen: ansicht === "angebot" ? "Versendet" : "Offen", ueberfaellig: "Überfällig", bezahlt: "Bezahlt", storniert: "Storniert", angenommen: "Angenommen", abgelehnt: "Abgelehnt" };

  const ANSICHTEN: [Ansicht, string, number][] = [
    ["rechnung", "Rechnungen", eigene.filter((b) => b.typ === "rechnung").length],
    ["angebot", "Angebote", eigene.filter((b) => b.typ === "angebot").length],
    ["eingang", "Von Kollegen", eingang.length],
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Rechnungen & Angebote" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-[1400px]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className={ueberSumme > 0 ? "border-red-200" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Offene Forderungen</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl tabular-nums">{euro(offenSumme)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {offene.length} {offene.length === 1 ? "Rechnung" : "Rechnungen"} offen
              {ueberSumme > 0 && <p className="text-red-600 font-medium">{euro(ueberSumme)} überfällig</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Umsatz {jahr} (netto)</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl tabular-nums">{euro(umsatzJahr)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className={cn("cursor-pointer", eingangOffen.length > 0 && "border-sky-200 bg-sky-50/50")} onClick={() => setParams({ ansicht: "eingang" })}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Inbox className="h-4 w-4" /> Von Kollegen offen</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl tabular-nums">{euro(eingangOffen.reduce((s, b) => s + Number(b.reverse_charge ? b.netto : b.brutto), 0))}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">{eingangOffen.length} Subunternehmer-Rechnungen</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex rounded-lg border overflow-x-auto w-full sm:w-fit">
                {ANSICHTEN.map(([a, text, n], i) => (
                  <button key={a} onClick={() => { setParams({ ansicht: a }); setStatus("alle"); }}
                    className={cn("flex-1 sm:flex-none whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors", i > 0 && "border-l",
                      ansicht === a ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                    {text} <span className="opacity-70">({n})</span>
                  </button>
                ))}
              </div>
              <Button onClick={() => setNeuOffen(true)} className="gap-2"><Receipt className="h-4 w-4" /> Neu erstellen</Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nummer, Kunde, Projekt" value={suche} onChange={(e) => setSuche(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  {statusListe.map((s) => <SelectItem key={s} value={s}>{statusText[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            {isLoading ? <p className="text-center py-8 text-muted-foreground">Lädt…</p>
              : liste.length === 0 ? (
                <Leer icon={ansicht === "eingang" ? Inbox : Receipt}
                  text={ansicht === "eingang" ? "Noch keine Rechnungen von Kollegen." : "Noch nichts erstellt."}>
                  {ansicht !== "eingang" && <Button onClick={() => setNeuOffen(true)}>Jetzt erstellen</Button>}
                </Leer>
              ) : <div className="border-y sm:border sm:rounded-lg divide-y">{liste.map((b) => <BelegZeile key={b.id} b={b} />)}</div>}
          </CardContent>
        </Card>
      </main>

      {/* Erste Frage beim Erstellen: an wen? */}
      <FormularDialog open={neuOffen} onOpenChange={setNeuOffen} titel="Was möchtest du erstellen?">
        <div className="max-w-xl space-y-3">
          {[
            { icon: Receipt, titel: "Rechnung an Kunden", text: "Endkunde oder Auftraggeber", ziel: "/rechnungen/neu?typ=rechnung" },
            { icon: FileText, titel: "Angebot", text: "Für einen Kunden", ziel: "/rechnungen/neu?typ=angebot" },
          ].map((o) => (
            <button key={o.ziel} onClick={() => navigate(o.ziel)} className="w-full flex items-center gap-4 rounded-lg border-2 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors">
              <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><o.icon className="h-5 w-5 text-primary" /></div>
              <div><p className="font-semibold">{o.titel}</p><p className="text-sm text-muted-foreground">{o.text}</p></div>
            </button>
          ))}
          <p className="text-sm font-semibold pt-3">Rechnung an Kollegen (als Subunternehmer)</p>
          {firmen.filter((f) => f.id !== firma?.id).map((f) => (
            <button key={f.id} onClick={() => navigate(`/rechnungen/neu?typ=rechnung&an=${f.id}`)}
              className="w-full flex items-center gap-4 rounded-lg border-2 p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors">
              <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${f.farbe}18` }}>
                <Send className="h-5 w-5" style={{ color: f.farbe }} />
              </div>
              <div><p className="font-semibold">An {f.name}</p><p className="text-sm text-muted-foreground">Reverse Charge, Material als Pauschale möglich</p></div>
            </button>
          ))}
        </div>
      </FormularDialog>
    </div>
  );
}
