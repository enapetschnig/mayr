import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ImagePlus, Loader2, Save, Smartphone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BenutzerVerwaltung } from "@/components/BenutzerVerwaltung";
import { InstallAnleitung } from "@/components/Installieren";
import { useSitzung } from "@/hooks/useSitzung";
import { logoAdresse } from "@/lib/upload";
import { zahlLesen } from "@/lib/format";
import type { Firma } from "@/lib/types";

type Feld = [keyof Firma, string, string?];

const STAMM: Feld[] = [
  ["name", "Firmenname (wie auf der Rechnung)"], ["kurzname", "Kurzname (Kalender, Abzeichen)"], ["inhaber", "Inhaber"],
  ["strasse", "Straße"], ["plz", "PLZ"], ["ort", "Ort"], ["telefon", "Telefon", "tel"], ["email", "E-Mail", "email"],
  ["website", "Website"], ["uid", "UID-Nummer"], ["firmenbuch", "Firmenbuch / GISA (optional)"],
];
const BANK: Feld[] = [["kontoinhaber", "Kontoinhaber"], ["bank_name", "Bank"], ["iban", "IBAN"], ["bic", "BIC"]];

function MeineFirma() {
  const { firma, profil, firmen, neuLaden } = useSitzung();
  const [wahlId, setWahlId] = useState(firma?.id ?? "");
  const ziel = firmen.find((f) => f.id === wahlId) ?? firma!;
  const [f, setF] = useState<Firma>(ziel);
  const [speichert, setSpeichert] = useState(false);
  const datei = useRef<HTMLInputElement>(null);

  useEffect(() => { setF(ziel); }, [ziel]);

  const setze = (k: keyof Firma, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const speichern = async () => {
    if (!f.name.trim() || !f.kurzname.trim()) return toast.error("Name und Kurzname sind Pflicht.");
    setSpeichert(true);
    const { id, created_at: _c, updated_at: _u, ...rest } = f;
    const { error } = await supabase.from("firmen").update({
      ...rest,
      stundensatz: zahlLesen(f.stundensatz as unknown as string),
      material_aufschlag: zahlLesen(f.material_aufschlag as unknown as string),
      zahlungsziel_tage: Math.round(zahlLesen(f.zahlungsziel_tage as unknown as string)),
    }).eq("id", id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success("Firmendaten gespeichert");
    await neuLaden();
  };

  const logoHochladen = async (file: File | undefined) => {
    if (!file) return;
    const pfad = `${f.id}/logo-${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "png"}`;
    const { error } = await supabase.storage.from("firmen-logos").upload(pfad, file, { contentType: file.type, upsert: true });
    if (error) return toast.error(error.message);
    if (f.logo_pfad) await supabase.storage.from("firmen-logos").remove([f.logo_pfad]);
    await supabase.from("firmen").update({ logo_pfad: pfad }).eq("id", f.id);
    setF((x) => ({ ...x, logo_pfad: pfad }));
    toast.success("Logo gespeichert — erscheint auf jedem PDF");
    await neuLaden();
  };

  const logoEntfernen = async () => {
    if (!f.logo_pfad) return;
    await supabase.storage.from("firmen-logos").remove([f.logo_pfad]);
    await supabase.from("firmen").update({ logo_pfad: null }).eq("id", f.id);
    setF((x) => ({ ...x, logo_pfad: null }));
    await neuLaden();
  };

  const eingabe = ([k, text, typ]: Feld) => (
    <div key={k} className="space-y-1">
      <Label htmlFor={`f-${k}`} className="text-xs">{text}</Label>
      <Input id={`f-${k}`} type={typ || "text"} value={(f[k] as string) ?? ""} onChange={(e) => setze(k, e.target.value)} />
    </div>
  );

  const logo = logoAdresse(f.logo_pfad);

  return (
    <div className="space-y-4">
      {profil?.ist_admin && firmen.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {firmen.map((x) => (
            <Button key={x.id} size="sm" variant={x.id === wahlId ? "default" : "outline"} onClick={() => setWahlId(x.id)}>{x.kurzname}</Button>
          ))}
          <span className="text-xs text-muted-foreground self-center">Als Admin kannst du alle drei Firmen pflegen.</span>
        </div>
      )}
      {f.ist_demo && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Das ist eine <strong>Demo-Firma</strong>. Sobald der echte Partner feststeht, hier einfach Name und Daten überschreiben.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Briefkopf</CardTitle><CardDescription>Diese Daten stehen auf Rechnungen und Angeboten.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-40 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
              {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">kein Logo</span>}
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => datei.current?.click()}><ImagePlus className="h-4 w-4" /> Logo hochladen</Button>
              {logo && <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={logoEntfernen}><Trash2 className="h-4 w-4" /> Entfernen</Button>}
            </div>
            <input ref={datei} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => logoHochladen(e.target.files?.[0])} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{STAMM.map(eingabe)}</div>
          <div className="flex items-center gap-3">
            <Label htmlFor="f-farbe" className="text-sm">Firmenfarbe</Label>
            <input id="f-farbe" type="color" value={f.farbe} onChange={(e) => setze("farbe", e.target.value)} className="h-9 w-14 rounded border cursor-pointer" />
            <span className="text-xs text-muted-foreground">Kalender, Abzeichen und Linien im PDF</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Bank</CardTitle><CardDescription>Für Zahlungstext und Bezahl-QR-Code auf der Rechnung.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">{BANK.map(eingabe)}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Rechnungen & Kalkulation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {eingabe(["rechnung_praefix", "Kürzel Rechnungsnr."])}
            {eingabe(["angebot_praefix", "Kürzel Angebotsnr."])}
            {eingabe(["zahlungsziel_tage", "Zahlungsziel (Tage)"])}
            {eingabe(["stundensatz", "Stundensatz € netto"])}
            {eingabe(["material_aufschlag", "Materialaufschlag %"])}
          </div>
          <p className="text-xs text-muted-foreground">Rechnungsnummern: {f.rechnung_praefix}-{new Date().getFullYear()}-001, fortlaufend je Jahr.</p>
          <div className="flex items-center gap-3">
            <Switch id="f-klein" checked={f.kleinunternehmer} onCheckedChange={(v) => setze("kleinunternehmer", v)} />
            <Label htmlFor="f-klein">Kleinunternehmer (ohne USt)</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-fuss" className="text-xs">Eigene Fußzeile (optional, sonst automatisch)</Label>
            <Textarea id="f-fuss" rows={2} value={f.fusszeile ?? ""} onChange={(e) => setze("fusszeile", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={speichern} disabled={speichert} size="lg" className="w-full sm:w-auto gap-2">
        {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Firmendaten speichern
      </Button>
    </div>
  );
}

function MeinKonto() {
  const { profil, session, neuLaden } = useSitzung();
  const [vorname, setVorname] = useState(profil?.vorname ?? "");
  const [nachname, setNachname] = useState(profil?.nachname ?? "");
  const speichern = async () => {
    const { error } = await supabase.from("profiles").update({ vorname: vorname.trim(), nachname: nachname.trim() }).eq("id", profil!.id);
    if (error) return toast.error(error.message);
    toast.success("Gespeichert");
    await neuLaden();
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Mein Konto</CardTitle><CardDescription>{session?.user.email}</CardDescription></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="k-vor" className="text-xs">Vorname</Label><Input id="k-vor" value={vorname} onChange={(e) => setVorname(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="k-nach" className="text-xs">Nachname</Label><Input id="k-nach" value={nachname} onChange={(e) => setNachname(e.target.value)} /></div>
        </div>
        <Button onClick={speichern}>Speichern</Button>
      </CardContent>
    </Card>
  );
}

function Installieren() {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Smartphone className="h-5 w-5" /> App auf den Startbildschirm</CardTitle></CardHeader>
      <CardContent><InstallAnleitung /></CardContent>
    </Card>
  );
}

export default function Einstellungen() {
  const { profil } = useSitzung();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "firma";
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Einstellungen" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
          <div className="overflow-x-auto -mx-3 px-3">
            <TabsList className="w-max">
              <TabsTrigger value="firma">Meine Firma</TabsTrigger>
              <TabsTrigger value="konto">Mein Konto</TabsTrigger>
              {profil?.ist_admin && <TabsTrigger value="zugaenge">Zugänge</TabsTrigger>}
              <TabsTrigger value="installieren">Handy</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="firma" className="mt-4"><MeineFirma /></TabsContent>
          <TabsContent value="konto" className="mt-4"><MeinKonto /></TabsContent>
          {profil?.ist_admin && <TabsContent value="zugaenge" className="mt-4"><BenutzerVerwaltung /></TabsContent>}
          <TabsContent value="installieren" className="mt-4"><Installieren /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
