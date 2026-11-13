import { stundensaetzeLesen } from "@/lib/kalkulation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Building2, ImagePlus, KeyRound, Loader2, LogOut, Plus, Smartphone, Trash2, User, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, Karte, StatusPille } from "@/components/Bausteine";
import { InstallAnleitung } from "@/components/Installieren";
import { LohnSaetze, WhatsAppVorlagenKarte } from "@/components/projekt/ProjektEinstellungen";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { useQuery } from "@tanstack/react-query";
import { bildVerkleinern, logoAdresse } from "@/lib/upload";
import { dezimalLesen } from "@/lib/format";
import { bicPruefen, ibanLesbar, ibanPruefen, uidPruefen } from "@/lib/bank";
import { fehlerText } from "@/components/stamm/stammDaten";
import { authFehler, vorlaeufigesPasswort } from "@/lib/konto";
import { name, type Firma, type Profil, type Rolle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KUNDE } from "@/kunde.config";

type Bereich = "betrieb" | "mitarbeiter" | "konto" | "app";

const BEREICHE: { wert: Bereich; text: string; icon: typeof User; nurChef?: boolean }[] = [
  { wert: "betrieb", text: "Betrieb", icon: Building2, nurChef: true },
  { wert: "mitarbeiter", text: "Mitarbeiter", icon: Users, nurChef: true },
  { wert: "konto", text: "Mein Konto", icon: User },
  { wert: "app", text: "Handy", icon: Smartphone },
];

/** Farben für die Kürzel der Mitarbeiter — kräftig genug für weiße Schrift */
const PERSONENFARBEN = ["#1D4ED8", "#059669", "#EA580C", "#7C3AED", "#BE123C", "#4D7C0F", "#0369A1", "#525252"];

/** Stundensätze im Formular: Satz bleibt Text, bis gespeichert wird */
type SatzZeile = { name: string; satz: string | number };
const saetzeRoh = (j: Firma["stundensaetze"]): SatzZeile[] =>
  Array.isArray(j) ? j.map((x) => (x && typeof x === "object" && !Array.isArray(x)
    ? { name: String(x.name ?? ""), satz: (x.satz as string | number | null) ?? "" }
    : { name: "", satz: "" })) : [];
const saetzeAendern = (j: Firma["stundensaetze"], i: number, teil: Partial<SatzZeile>): Firma["stundensaetze"] =>
  saetzeRoh(j).map((z, k) => (k === i ? { ...z, ...teil } : z));

export default function Einstellungen() {
  const { istChef } = useSitzung();
  const [params, setParams] = useSearchParams();
  const erlaubt = BEREICHE.filter((b) => !b.nurChef || istChef);
  const bereich = (erlaubt.find((b) => b.wert === params.get("bereich"))?.wert ?? erlaubt[0].wert) as Bereich;

  return (
    <Seite titel="Einstellungen" zurueckPfad="/">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {erlaubt.map(({ wert, text, icon: I }) => (
          <button key={wert} type="button" onClick={() => setParams({ bereich: wert }, { replace: true })} aria-pressed={bereich === wert}
            className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
              bereich === wert ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
            <I className="h-4 w-4" /> {text}
          </button>
        ))}
      </div>

      {bereich === "betrieb" && <Betrieb />}
      {bereich === "mitarbeiter" && <Mitarbeiter />}
      {bereich === "konto" && <Konto />}
      {bereich === "app" && (
        <Karte titel={`${KUNDE.kurzname} als App`}>
          <p className="mb-4 text-sm text-muted-foreground">Auf den Startbildschirm legen — dann startet sie wie jede andere App, ohne Adresszeile.</p>
          <InstallAnleitung />
        </Karte>
      )}
    </Seite>
  );
}

function Feld({ label, children, hinweis, warnung, className }: {
  label: string; children: ReactNode; hinweis?: string; warnung?: string | null; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
      {warnung ? <p className="text-xs font-medium text-status-gelb-fg">{warnung}</p> : hinweis && <p className="text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

/** Ganze Zahl aus dem Feld — „14,5“ oder leer ist keine */
const ganzzahl = (v: unknown) => {
  const n = dezimalLesen(String(v ?? ""));
  return n !== null && Number.isInteger(n) ? n : null;
};

const ohneLeer = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Mahnspesen je Stufe: immer drei Felder (Erinnerung, 1. Mahnung, letzte Mahnung) */
const STUFEN = ["Erinnerung", "1. Mahnung", "letzte Mahnung"];
const spesenRoh = (j: Firma["mahn_spesen"]): (string | number)[] => {
  const l = Array.isArray(j) ? (j as (string | number)[]) : [];
  return [0, 1, 2].map((i) => l[i] ?? 0);
};

/** Briefkopf, Bank, Kalkulation und Texte — alles, was auf Angeboten und Rechnungen steht. */
function Betrieb() {
  const { firma, neuLaden } = useSitzung();
  const [f, setF] = useState<Firma | null>(firma);
  const [speichert, setSpeichert] = useState(false);
  const datei = useRef<HTMLInputElement>(null);
  const basis = useRef(firma);

  // Neu geladene Betriebsdaten übernehmen (nach dem Speichern, nach dem Logo) —
  // aber nie über Eingetipptes drüber
  useEffect(() => {
    const vorher = basis.current;
    basis.current = firma;
    setF((alt) => (alt && vorher && !gleich(alt, vorher) ? alt : firma));
  }, [firma]);
  if (!f) return null;

  const text = (k: keyof Firma) => ({
    value: (f[k] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  });

  // Eine Bank- oder UID-Angabe, die schon so gespeichert ist, sperrt das
  // Speichern nicht (z. B. die Demo-IBAN) — nur neu Eingetipptes muss stimmen
  const geaendert = (k: "iban" | "bic" | "uid") => ohneLeer(f[k]) !== ohneLeer(firma?.[k]);
  const ibanFalsch = !!f.iban?.trim() && !ibanPruefen(f.iban);

  const speichern = async () => {
    if (!f.name.trim()) return toast.error("Der Firmenname fehlt");
    // Leer oder unlesbar hieß bisher 0 — ein Stundensatz von 0 € macht jede Arbeitszeit gratis
    const stundensatz = dezimalLesen(String(f.stundensatz));
    if (stundensatz === null || stundensatz <= 0 || stundensatz >= 10000) return toast.error("Stundensatz bitte prüfen — er muss über 0 € liegen.");
    const aufschlag = String(f.material_aufschlag).trim() === "" ? 0 : dezimalLesen(String(f.material_aufschlag));
    if (aufschlag === null || aufschlag < 0 || aufschlag > 1000) return toast.error("Materialaufschlag bitte prüfen — 0 bis 1000 %.");
    const ziel = ganzzahl(f.zahlungsziel_tage);
    if (ziel === null || ziel < 0 || ziel > 365) return toast.error("Zahlungsziel: ganze Tage von 0 (sofort) bis 365.");
    const gueltig = ganzzahl(f.angebot_gueltig_tage);
    if (gueltig === null || gueltig < 1 || gueltig > 365) return toast.error("Angebot gültig: ganze Tage von 1 bis 365.");
    const frist = ganzzahl(f.mahn_frist_tage);
    if (frist === null || frist < 1 || frist > 90) return toast.error("Mahnfrist: ganze Tage von 1 bis 90.");
    const zinsen = String(f.verzugszinsen).trim() === "" ? 0 : dezimalLesen(String(f.verzugszinsen));
    if (zinsen === null || zinsen < 0 || zinsen > 30) return toast.error("Verzugszinsen bitte prüfen — 0 bis 30 % im Jahr.");
    const spesen: number[] = [];
    for (const [i, roh] of spesenRoh(f.mahn_spesen).entries()) {
      const wert = String(roh).trim() === "" ? 0 : dezimalLesen(String(roh));
      if (wert === null || wert < 0 || wert > 1000) return toast.error(`Spesen für „${STUFEN[i]}“ bitte prüfen — 0 bis 1000 €.`);
      spesen.push(wert);
    }
    // Weitere Stundensätze: leere Zeilen fallen weg, der Rest braucht Name und Satz über 0 €
    const saetze: { name: string; satz: number }[] = [];
    for (const z of saetzeRoh(f.stundensaetze)) {
      const n = z.name.trim();
      if (!n && !String(z.satz).trim()) continue;
      const satz = dezimalLesen(String(z.satz));
      if (!n || satz === null || satz <= 0 || satz >= 10000) return toast.error(`Stundensatz „${n || "ohne Namen"}“ bitte prüfen — Name und Satz über 0 €.`);
      if (saetze.some((x) => x.name.toLowerCase() === n.toLowerCase())) return toast.error(`Den Stundensatz „${n}“ gibt es zweimal.`);
      saetze.push({ name: n, satz });
    }

    const leer = (s: string | null) => (s && s.trim() ? s.trim() : null);
    let iban = leer(f.iban), bic = leer(f.bic), uid = leer(f.uid);
    if (iban) {
      const geprueft = ibanPruefen(iban);
      if (geprueft) iban = ibanLesbar(geprueft);
      else if (geaendert("iban")) return toast.error("IBAN stimmt nicht — bitte prüfen (Prüfziffer oder Länge).");
    }
    if (bic) {
      const geprueft = bicPruefen(bic);
      if (geprueft) bic = geprueft;
      else if (geaendert("bic")) return toast.error("BIC stimmt nicht — 8 oder 11 Zeichen, z. B. RLNWATWW.");
    }
    if (uid) {
      const geprueft = uidPruefen(uid);
      if (geprueft) uid = geprueft;
      else if (geaendert("uid")) return toast.error("UID-Nummer stimmt nicht — in Österreich ATU und 8 Ziffern.");
    }

    const kostenText = String(f.kostensatz ?? "").trim();
    const kostensatz = kostenText ? dezimalLesen(kostenText) : null;
    if (kostenText && (kostensatz === null || kostensatz < 0 || kostensatz >= 10000)) return toast.error("Lohnkosten je Stunde bitte prüfen.");

    const satzLesen = (v: unknown) => { const x = String(v ?? "").trim(); return x ? dezimalLesen(x) : null; };
    const taggeld_satz = satzLesen(f.taggeld_satz), km_satz = satzLesen(f.km_satz);
    if ((String(f.taggeld_satz ?? "").trim() && !(taggeld_satz !== null && taggeld_satz >= 0)) || (String(f.km_satz ?? "").trim() && !(km_satz !== null && km_satz >= 0))) return toast.error("Taggeld oder Kilometergeld bitte prüfen.");

    setSpeichert(true);
    const { error } = await supabase.from("firma").update({
      name: f.name.trim(), zusatz: leer(f.zusatz), inhaber: leer(f.inhaber), strasse: leer(f.strasse), plz: leer(f.plz),
      ort: leer(f.ort), land: f.land || "Österreich", telefon: leer(f.telefon), email: leer(f.email), website: leer(f.website),
      uid, firmenbuch: leer(f.firmenbuch), bank_name: leer(f.bank_name), iban, bic,
      farbe: f.farbe, stundensatz, stundensaetze: saetze, kostensatz, taggeld_satz, km_satz, material_aufschlag: aufschlag,
      zahlungsziel_tage: ziel, angebot_gueltig_tage: gueltig,
      mahn_frist_tage: frist, mahn_spesen: spesen, verzugszinsen: zinsen,
      kleinunternehmer: f.kleinunternehmer, angebot_einleitung: leer(f.angebot_einleitung), angebot_schluss: leer(f.angebot_schluss),
      rechnung_einleitung: leer(f.rechnung_einleitung), rechnung_schluss: leer(f.rechnung_schluss), fusszeile: leer(f.fusszeile),
    }).eq("id", 1);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success("Betrieb gespeichert");
    basis.current = null; // das Gespeicherte (z. B. IBAN in Vierergruppen) zurück ins Formular
    await neuLaden();
  };

  const logoHochladen = async (roh: File | undefined) => {
    if (!roh) return;
    if (roh.type !== "image/png" && roh.type !== "image/jpeg") return toast.error("Bitte ein PNG- oder JPG-Bild wählen.");
    // Ein Handyfoto als Logo hat 4000 px — eingebettet macht es jedes PDF mehrere MB schwer
    const file = await bildVerkleinern(roh, 1200, { pngBehalten: true });
    const pfad = `betrieb/logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const { error } = await supabase.storage.from("firmen-logos").upload(pfad, file, { contentType: file.type, upsert: true });
    if (error) return toast.error("Logo nicht hochgeladen", { description: error.message });
    // Erst umstellen, dann das alte löschen — sonst zeigt der Betrieb bei einem Fehler auf nichts
    const { error: e2 } = await supabase.from("firma").update({ logo_pfad: pfad }).eq("id", 1);
    if (e2) {
      await supabase.storage.from("firmen-logos").remove([pfad]);
      return toast.error("Logo nicht gespeichert", { description: fehlerText(e2) });
    }
    if (firma?.logo_pfad) await supabase.storage.from("firmen-logos").remove([firma.logo_pfad]);
    toast.success("Logo gespeichert — erscheint auf jedem PDF");
    await neuLaden();
  };

  // Das Logo ist sofort gespeichert — es gilt der Stand aus der Datenbank, nicht das Formular
  const logoEntfernen = async () => {
    if (!firma?.logo_pfad) return;
    await supabase.storage.from("firmen-logos").remove([firma.logo_pfad]);
    await supabase.from("firma").update({ logo_pfad: null }).eq("id", 1);
    await neuLaden();
  };

  const logo = logoAdresse(firma?.logo_pfad ?? null);

  return (
    <div className="space-y-4">
      <Karte titel="Briefkopf">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center rounded-md border bg-muted/30 p-2">
              {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">kein Logo</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => datei.current?.click()}><ImagePlus className="h-4 w-4" /> Logo hochladen</Button>
              {logo && <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={logoEntfernen}><Trash2 className="h-4 w-4" /> Entfernen</Button>}
            </div>
            <input ref={datei} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { void logoHochladen(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld label="Firmenname" className="sm:col-span-2"><Input className="h-11" {...text("name")} /></Feld>
            <Feld label="Zusatz (Zeile unter dem Namen)" className="sm:col-span-2"><Input className="h-11" {...text("zusatz")} placeholder="z. B. Elektrotechnik · Photovoltaik" /></Feld>
            <Feld label="Inhaber / Geschäftsführer"><Input className="h-11" {...text("inhaber")} /></Feld>
            <Feld label="Straße"><Input className="h-11" {...text("strasse")} /></Feld>
            <div className="grid grid-cols-[6rem_1fr] gap-2 sm:col-span-2">
              <Feld label="PLZ"><Input className="h-11" inputMode="numeric" {...text("plz")} /></Feld>
              <Feld label="Ort"><Input className="h-11" {...text("ort")} /></Feld>
            </div>
            <Feld label="Telefon"><Input className="h-11" type="tel" {...text("telefon")} /></Feld>
            <Feld label="E-Mail"><Input className="h-11" type="email" {...text("email")} /></Feld>
            <Feld label="Website"><Input className="h-11" {...text("website")} /></Feld>
            <Feld label="UID-Nummer"><Input className="h-11" {...text("uid")} /></Feld>
            <Feld label="Firmenbuch"><Input className="h-11" {...text("firmenbuch")} /></Feld>
            <Feld label="Farbe im PDF">
              <div className="flex items-center gap-2">
                <input type="color" value={f.farbe} onChange={(e) => setF({ ...f, farbe: e.target.value })} className="h-11 w-14 cursor-pointer rounded-md border bg-card p-1" aria-label="Farbe im PDF" />
                <span className="font-mono text-sm text-muted-foreground">{f.farbe}</span>
              </div>
            </Feld>
          </div>
        </div>
      </Karte>

      <Karte titel="Bank">
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld label="Bank"><Input className="h-11" {...text("bank_name")} /></Feld>
          <Feld label="IBAN" hinweis="Mit IBAN druckt die Rechnung einen Bezahl-QR-Code."
            warnung={ibanFalsch ? "Prüfziffer oder Länge stimmt nicht — mit dieser IBAN klappt der Bezahl-QR-Code nicht." : null}>
            <Input className="h-11 font-mono" {...text("iban")} />
          </Feld>
          <Feld label="BIC"><Input className="h-11 font-mono" {...text("bic")} /></Feld>
        </div>
      </Karte>

      <Karte titel="Kalkulation">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Feld label="Stundensatz € netto"><Input className="h-11" inputMode="decimal" value={String(f.stundensatz).replace(".", ",")} onChange={(e) => setF({ ...f, stundensatz: e.target.value as unknown as number })} /></Feld>
          <Feld label="Lohnkosten € je Stunde"><Input className="h-11" inputMode="decimal" value={String(f.kostensatz ?? "").replace(".", ",")} onChange={(e) => setF({ ...f, kostensatz: e.target.value as unknown as number })} /></Feld>
          <Feld label="Taggeld € je Tag"><Input className="h-11" inputMode="decimal" value={String(f.taggeld_satz ?? "").replace(".", ",")} onChange={(e) => setF({ ...f, taggeld_satz: e.target.value as unknown as number })} /></Feld>
          <Feld label="Kilometergeld € je km"><Input className="h-11" inputMode="decimal" value={String(f.km_satz ?? "").replace(".", ",")} onChange={(e) => setF({ ...f, km_satz: e.target.value as unknown as number })} /></Feld>
          <Feld label="Materialaufschlag %"><Input className="h-11" inputMode="decimal" value={String(f.material_aufschlag).replace(".", ",")} onChange={(e) => setF({ ...f, material_aufschlag: e.target.value as unknown as number })} /></Feld>
          <Feld label="Zahlungsziel Tage"><Input className="h-11" inputMode="numeric" value={String(f.zahlungsziel_tage)} onChange={(e) => setF({ ...f, zahlungsziel_tage: e.target.value as unknown as number })} /></Feld>
          <Feld label="Angebot gültig Tage"><Input className="h-11" inputMode="numeric" value={String(f.angebot_gueltig_tage)} onChange={(e) => setF({ ...f, angebot_gueltig_tage: e.target.value as unknown as number })} /></Feld>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Lohnkosten sind intern, für die Nachkalkulation. Taggeld und Kilometergeld sind ein Vorschlag für die Lohnliste, leer = aus. Bitte mit dem Kollektivvertrag abgleichen.
        </p>
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Weitere Stundensätze <span className="font-normal text-muted-foreground">— z. B. Meister, Lehrling; im Angebot unter „Arbeitszeit“</span></p>
          {saetzeRoh(f.stundensaetze).map((z, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_2.75rem] gap-2">
              <Input className="h-11" placeholder="Name, z. B. Meister" aria-label="Name des Stundensatzes" value={z.name}
                onChange={(e) => setF({ ...f, stundensaetze: saetzeAendern(f.stundensaetze, i, { name: e.target.value }) })} />
              <Input className="h-11 text-right" inputMode="decimal" placeholder="€/h" aria-label="Stundensatz € netto" value={String(z.satz).replace(".", ",")}
                onChange={(e) => setF({ ...f, stundensaetze: saetzeAendern(f.stundensaetze, i, { satz: e.target.value }) })} />
              <Button variant="ghost" size="icon" aria-label="Stundensatz entfernen"
                onClick={() => setF({ ...f, stundensaetze: saetzeRoh(f.stundensaetze).filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" className="gap-1.5" onClick={() => setF({ ...f, stundensaetze: [...saetzeRoh(f.stundensaetze), { name: "", satz: "" }] })}>
            <Plus className="h-4 w-4" /> Stundensatz
          </Button>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <Switch id="klein" checked={f.kleinunternehmer} onCheckedChange={(v) => setF({ ...f, kleinunternehmer: v })} />
          <Label htmlFor="klein" className="leading-snug">
            Kleinunternehmer <span className="block text-xs font-normal text-muted-foreground">Rechnungen ohne Umsatzsteuer, mit Hinweis nach § 6 Abs. 1 Z 27 UStG</span>
          </Label>
        </div>
      </Karte>

      <Karte titel="Mahnen">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Feld label="Neue Frist Tage"><Input className="h-11" inputMode="numeric" value={String(f.mahn_frist_tage)} onChange={(e) => setF({ ...f, mahn_frist_tage: e.target.value as unknown as number })} /></Feld>
          <Feld label="Verzugszinsen % p. a." hinweis="ab der 1. Mahnung"><Input className="h-11" inputMode="decimal" value={String(f.verzugszinsen).replace(".", ",")} onChange={(e) => setF({ ...f, verzugszinsen: e.target.value as unknown as number })} /></Feld>
          {spesenRoh(f.mahn_spesen).map((wert, i) => (
            <Feld key={i} label={`Spesen ${STUFEN[i]} €`}>
              <Input className="h-11" inputMode="decimal" value={String(wert).replace(".", ",")}
                onChange={(e) => { const neu = spesenRoh(f.mahn_spesen); neu[i] = e.target.value; setF({ ...f, mahn_spesen: neu }); }} />
            </Feld>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Verzugszinsen: bei Privatkunden 4 % (§ 1000 ABGB), bei Firmen 9,2 % über dem Basiszinssatz (§ 456 UGB). Mahnspesen müssen angemessen sein.
        </p>
      </Karte>

      <Karte titel="Texte auf Angeboten und Rechnungen">
        <div className="grid gap-3 md:grid-cols-2">
          <Feld label="Angebot — Einleitung"><Textarea rows={3} {...text("angebot_einleitung")} /></Feld>
          <Feld label="Angebot — Schluss"><Textarea rows={3} {...text("angebot_schluss")} /></Feld>
          <Feld label="Rechnung — Einleitung"><Textarea rows={3} {...text("rechnung_einleitung")} /></Feld>
          <Feld label="Rechnung — Schluss"><Textarea rows={3} {...text("rechnung_schluss")} /></Feld>
          <Feld label="Fußzeile (leer = aus Briefkopf und Bank)" className="md:col-span-2"><Textarea rows={2} {...text("fusszeile")} /></Feld>
        </div>
      </Karte>

      <WhatsAppVorlagenKarte />

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button onClick={speichern} disabled={speichert} className="h-12 min-w-44 gap-2 shadow-schwebend">
          {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Betrieb speichern
        </Button>
      </div>
    </div>
  );
}

/** Neu = registriert, wartet auf Freischaltung; gesperrt = vom Chef ausgesperrt */
type Zugang = "neu" | "aktiv" | "gesperrt";
const zugang = (p: Profil): Zugang => (p.aktiv ? "aktiv" : p.gesperrt ? "gesperrt" : "neu");
const ZUGANG_REIHENFOLGE: Record<Zugang, number> = { neu: 0, aktiv: 1, gesperrt: 2 };

/** Freischalten, Rolle, Farbe, Sperren, vorläufiges Passwort. Neue Mitarbeiter registrieren sich selbst. */
function Mitarbeiter() {
  const { profil: ich } = useSitzung();
  const neuLaden = useNeuLaden();
  const [sperren, setSperren] = useState<Profil | null>(null);
  const [passwort, setPasswort] = useState<{ p: Profil; neu: string | null } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const { data: alle = [], refetch } = useQuery({
    queryKey: ["mitarbeiter", "alle"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("vorname");
      if (error) throw error;
      return ((data ?? []) as Profil[]).sort((a, b) => ZUGANG_REIHENFOLGE[zugang(a)] - ZUGANG_REIHENFOLGE[zugang(b)]);
    },
  });

  const { firma: betrieb } = useSitzung();
  const saetze = stundensaetzeLesen(betrieb?.stundensaetze);
  const aendern = async (p: Profil, daten: Partial<Pick<Profil, "aktiv" | "gesperrt" | "rolle" | "farbe" | "lohnart" | "wochenstunden" | "urlaub_tage" | "konto_ab">>, meldung?: string) => {
    const { error } = await supabase.from("profiles").update(daten).eq("id", p.id);
    if (error) {
      toast.error("Nicht geändert", { description: error.message });
      return false;
    }
    if (meldung) toast.success(meldung);
    await Promise.all([refetch(), neuLaden("mitarbeiter")]);
    return true;
  };

  const sperrenBestaetigt = async () => {
    if (!sperren) return;
    setLaeuft(true);
    const ok = await aendern(sperren, { aktiv: false, gesperrt: true }, `${name(sperren)} ist gesperrt`);
    setLaeuft(false);
    if (ok) setSperren(null);
  };

  const passwortVergeben = async () => {
    if (!passwort) return;
    const neu = vorlaeufigesPasswort();
    setLaeuft(true);
    const { error } = await supabase.rpc("passwort_setzen", { p_user: passwort.p.id, p_passwort: neu });
    setLaeuft(false);
    if (error) return toast.error("Passwort nicht vergeben", { description: error.message });
    setPasswort({ ...passwort, neu });
    await refetch();
  };

  const wartend = alle.filter((p) => zugang(p) === "neu");
  const adresse = `${window.location.origin}/auth`;

  return (
    <div className="space-y-4">
      <Karte titel="Neue Mitarbeiter">
        <p className="text-sm text-muted-foreground">
          Neue Mitarbeiter registrieren sich am Handy selbst unter <span className="font-mono text-foreground">{adresse}</span> („Registrieren“).
          Danach erscheinen sie hier und du schaltest sie mit einem Tipp frei.
        </p>
      </Karte>

      <div className="space-y-2">
        {alle.map((p) => (
          <section key={p.id} className={cn("rounded-lg border bg-card p-4",
            zugang(p) === "neu" && "border-status-gelb bg-status-gelb/30", zugang(p) === "gesperrt" && "bg-muted/40")}>
            <div className="flex items-center gap-3">
              <Avatar profil={p} className={cn("h-10 w-10 text-sm", zugang(p) === "gesperrt" && "opacity-50")} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{name(p)}{p.id === ich?.id && <span className="font-normal text-muted-foreground"> (du)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{p.email?.replace(`@${KUNDE.loginDomain}`, "")}</p>
              </div>
              {zugang(p) === "neu" && (
                <Button size="sm" className="h-10" onClick={() => aendern(p, { aktiv: true, gesperrt: false }, `${name(p)} ist freigeschaltet`)}>Freischalten</Button>
              )}
              {zugang(p) === "gesperrt" && <StatusPille eintrag={{ ton: "rot", text: "Gesperrt" }} />}
              {zugang(p) === "aktiv" && <StatusPille eintrag={{ ton: p.rolle === "chef" ? "blau" : "grau", text: p.rolle === "chef" ? "Chef" : "Monteur" }} />}
            </div>
            {zugang(p) === "gesperrt" && (
              <div className="mt-3 flex justify-end border-t pt-3">
                <Button variant="outline" size="sm" className="h-10" onClick={() => aendern(p, { aktiv: true, gesperrt: false }, `${name(p)} ist wieder freigeschaltet`)}>
                  Wieder freischalten
                </Button>
              </div>
            )}
            {p.aktiv && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-3">
                <div className="flex h-9 overflow-hidden rounded-md border text-sm">
                  {(["monteur", "chef"] as Rolle[]).map((r, i) => (
                    <button key={r} type="button" disabled={p.id === ich?.id} onClick={() => aendern(p, { rolle: r })}
                      className={cn("px-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60", i > 0 && "border-l",
                        p.rolle === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                      {r === "chef" ? "Chef" : "Monteur"}
                    </button>
                  ))}
                </div>
                {saetze.length > 0 && (
                  <div className="flex h-9 overflow-hidden rounded-md border text-sm" role="group" aria-label={`Stundensatz ${p.vorname}`}>
                    {[null, ...saetze.map((l) => l.name)].map((n, i) => (
                      <button key={n ?? "standard"} type="button" onClick={() => aendern(p, { lohnart: n })} aria-pressed={(p.lohnart ?? null) === n}
                        className={cn("px-3 font-medium transition-colors", i > 0 && "border-l",
                          (p.lohnart ?? null) === n ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                        {n ?? "Normal"}
                      </button>
                    ))}
                  </div>
                )}
                <PersonalFelder p={p} onAendern={(daten) => aendern(p, daten)} />
                <LohnSaetze p={p} />
                <div className="flex flex-wrap gap-1.5" aria-label="Farbe">
                  {PERSONENFARBEN.map((c) => (
                    <button key={c} type="button" onClick={() => aendern(p, { farbe: c })} aria-label={`Farbe ${c}`}
                      className={cn("h-7 w-7 rounded-full ring-offset-2 transition", p.farbe === c && "ring-2 ring-foreground")} style={{ backgroundColor: c }} />
                  ))}
                </div>
                {p.id !== ich?.id && (
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setPasswort({ p, neu: null })}>
                      <KeyRound className="h-4 w-4" /> Passwort vergeben
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSperren(p)}>Sperren</Button>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
      {wartend.length === 0 && <p className="px-1 text-xs text-muted-foreground">Niemand wartet auf Freischaltung.</p>}

      <AlertDialog open={!!sperren} onOpenChange={(o) => { if (!o && !laeuft) setSperren(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{sperren && name(sperren)} sperren?</AlertDialogTitle>
            <AlertDialogDescription>
              Beim Anmelden steht dann nur noch „Zugang gesperrt“ — buchen und ansehen geht nicht mehr.
              Stunden, Material und Berichte bleiben erhalten. Du kannst den Zugang jederzeit wieder freischalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={laeuft}>Abbrechen</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void sperrenBestaetigt()} disabled={laeuft}>
              {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sperren
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!passwort} onOpenChange={(o) => { if (!o && !laeuft) setPasswort(null); }}>
        <AlertDialogContent>
          {passwort?.neu ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Passwort für {name(passwort.p)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {passwort.p.vorname ? `Gib es ${passwort.p.vorname} weiter.` : "Gib es weiter."} Beim Anmelden fragt die App gleich nach einem eigenen Passwort.
                  Hier wird es nicht gespeichert — nach „Fertig“ ist es weg.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">Benutzername</p>
                <p className="font-mono text-lg font-semibold">{passwort.p.email?.replace(`@${KUNDE.loginDomain}`, "")}</p>
                <p className="pt-2 text-xs text-muted-foreground">Vorläufiges Passwort</p>
                <p className="select-all font-mono text-2xl font-bold tracking-wide">{passwort.neu}</p>
              </div>
              <AlertDialogFooter>
                <Button className="h-11" onClick={() => setPasswort(null)}>Fertig</Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Vorläufiges Passwort für {passwort && name(passwort.p)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Für den Fall, dass das Passwort vergessen ist: Die App erzeugt ein neues, du sagst es weiter.
                  Das bisherige Passwort gilt danach nicht mehr.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11" disabled={laeuft}>Abbrechen</AlertDialogCancel>
                <Button className="h-11" onClick={() => void passwortVergeben()} disabled={laeuft}>
                  {laeuft && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Passwort vergeben
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Konto() {
  const navigate = useNavigate();
  const { profil, neuLaden } = useSitzung();
  const [vorname, setVorname] = useState(profil?.vorname ?? "");
  const [nachname, setNachname] = useState(profil?.nachname ?? "");
  const [telefon, setTelefon] = useState(profil?.telefon ?? "");
  const [passwort, setPasswort] = useState("");
  const [wiederholt, setWiederholt] = useState("");
  const [laeuft, setLaeuft] = useState<null | "daten" | "passwort">(null);

  const datenSpeichern = async () => {
    if (!profil) return;
    if (!vorname.trim() || !nachname.trim()) return toast.error("Vor- und Nachname brauchen wir — sie stehen auf Stunden und Berichten");
    setLaeuft("daten");
    const { error } = await supabase.from("profiles").update({
      vorname: vorname.trim(), nachname: nachname.trim(), telefon: telefon.trim() || null,
    }).eq("id", profil.id);
    setLaeuft(null);
    if (error) return toast.error("Nicht gespeichert", { description: error.message });
    toast.success("Gespeichert");
    await neuLaden();
  };

  const passwortAendern = async () => {
    if (passwort.length < 6) return toast.error("Mindestens 6 Zeichen");
    if (passwort !== wiederholt) return toast.error("Die Passwörter stimmen nicht überein");
    setLaeuft("passwort");
    const { error } = await supabase.auth.updateUser({ password: passwort });
    setLaeuft(null);
    if (error) return toast.error("Nicht geändert", { description: authFehler(error.message) });
    setPasswort("");
    setWiederholt("");
    toast.success("Passwort geändert");
  };

  return (
    <div className="space-y-4">
      <Karte titel="Meine Daten">
        <div className="grid gap-3 sm:grid-cols-3">
          <Feld label="Vorname"><Input className="h-11" value={vorname} onChange={(e) => setVorname(e.target.value)} /></Feld>
          <Feld label="Nachname"><Input className="h-11" value={nachname} onChange={(e) => setNachname(e.target.value)} /></Feld>
          <Feld label="Telefon"><Input className="h-11" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} /></Feld>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Benutzername: <span className="font-mono">{profil?.email?.replace(`@${KUNDE.loginDomain}`, "")}</span></p>
        <Button onClick={datenSpeichern} disabled={laeuft !== null} className="mt-4 h-11 gap-2">
          {laeuft === "daten" && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
        </Button>
      </Karte>

      <Karte titel="Passwort ändern">
        <div className="grid gap-3 sm:grid-cols-2">
          <Feld label="Neues Passwort"><Input className="h-11" type="password" autoComplete="new-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} /></Feld>
          <Feld label="Wiederholen"><Input className="h-11" type="password" autoComplete="new-password" value={wiederholt} onChange={(e) => setWiederholt(e.target.value)} /></Feld>
        </div>
        <Button onClick={passwortAendern} disabled={laeuft !== null || !passwort} variant="outline" className="mt-4 h-11 gap-2">
          {laeuft === "passwort" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Passwort ändern
        </Button>
      </Karte>

      <Button variant="outline" className="h-12 w-full gap-2 text-destructive sm:w-auto"
        onClick={async () => { await supabase.auth.signOut({ scope: "local" }); navigate("/auth"); }}>
        <LogOut className="h-4 w-4" /> Abmelden
      </Button>
    </div>
  );
}

/** Sollzeit und Konto eines Mitarbeiters — gespeichert beim Verlassen des Felds */
function PersonalFelder({ p, onAendern }: { p: Profil; onAendern: (d: { wochenstunden?: number; urlaub_tage?: number; konto_ab?: string }) => void }) {
  const [wochen, setWochen] = useState(String(p.wochenstunden).replace(".", ","));
  const [urlaub, setUrlaub] = useState(String(p.urlaub_tage).replace(".", ","));
  const [ab, setAb] = useState(p.konto_ab);
  const zahlSpeichern = (text: string, alt: number, feld: "wochenstunden" | "urlaub_tage", max: number) => {
    const n = dezimalLesen(text);
    if (n === null || n < 0 || n > max) return toast.error("Bitte eine gültige Zahl eintragen.");
    if (n !== Number(alt)) onAendern({ [feld]: n });
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`w-${p.id}`} className="text-xs">Wochenstunden</Label>
        <Input id={`w-${p.id}`} className="h-9 w-24" inputMode="decimal" value={wochen} onChange={(e) => setWochen(e.target.value)}
          onBlur={() => zahlSpeichern(wochen, p.wochenstunden, "wochenstunden", 80)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`u-${p.id}`} className="text-xs">Urlaub/Jahr</Label>
        <Input id={`u-${p.id}`} className="h-9 w-20" inputMode="decimal" value={urlaub} onChange={(e) => setUrlaub(e.target.value)}
          onBlur={() => zahlSpeichern(urlaub, p.urlaub_tage, "urlaub_tage", 60)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`k-${p.id}`} className="text-xs">Konto ab</Label>
        <Input id={`k-${p.id}`} type="date" className="h-9 w-40" value={ab} onChange={(e) => setAb(e.target.value)}
          onBlur={() => { if (ab && ab !== p.konto_ab) onAendern({ konto_ab: ab }); }} />
      </div>
    </div>
  );
}
