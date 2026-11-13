import { useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKunden, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahl } from "@/lib/format";
import { TON_KLASSE, type Kunde } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Feld, leerNull, useBeimOeffnen, Zusatz } from "./Felder";
import { fehlerText } from "./stammDaten";
import { brauchtGeo, KONTAKT_ART, kontaktArt, namenLesen, type KontaktArt } from "@/components/kontakte/kontaktLogik";
import { geoSuchen } from "@/components/kontakte/kontaktDaten";

type Grunddaten = Pick<Kunde, "name" | "strasse" | "plz" | "ort" | "telefon" | "email">;
type Zusatzdaten = { art: KontaktArt; ansprechpartner: string; uid: string; notiz: string; kundennummer_extern: string; namen: string };

/**
 * Kontaktfelder eines Kunden — im Kundenformular, ob aus der Kundenliste
 * oder über „Neuer Kunde“ im Projekt bzw. Beleg.
 * fokus=false beim Bearbeiten: sonst springt am Handy sofort die Tastatur auf.
 */
export function KundeFelder({ wert, onChange, fokus = true }: { wert: Grunddaten; onChange: (k: Grunddaten) => void; fokus?: boolean }) {
  const feld = (k: keyof Grunddaten, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`k-${k}`}>{label}</Label>
      <Input id={`k-${k}`} className="h-11" value={wert[k] ?? ""} onChange={(e) => onChange({ ...wert, [k]: e.target.value })} {...props} />
    </div>
  );
  return (
    <div className="grid gap-3">
      {feld("name", "Name / Firma", { placeholder: "z. B. Familie Huber", autoFocus: fokus })}
      {feld("strasse", "Straße")}
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        {feld("plz", "PLZ", { inputMode: "numeric" })}
        {feld("ort", "Ort")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {feld("telefon", "Telefon", { inputMode: "tel", type: "tel" })}
        {feld("email", "E-Mail", { inputMode: "email", type: "email" })}
      </div>
    </div>
  );
}

const grundAus = (k: Partial<Kunde> | null): Grunddaten => ({
  name: k?.name ?? "", strasse: k?.strasse ?? "", plz: k?.plz ?? "", ort: k?.ort ?? "", telefon: k?.telefon ?? "", email: k?.email ?? "",
});
const zusatzAus = (k: Partial<Kunde> | null, art?: KontaktArt): Zusatzdaten => ({
  art: k?.art ? kontaktArt(k.art) : art ?? "kunde",
  ansprechpartner: k?.ansprechpartner ?? "", uid: k?.uid ?? "", notiz: k?.notiz ?? "",
  kundennummer_extern: k?.kundennummer_extern ?? "", namen: (k?.namen ?? []).join(", "),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Kontakt anlegen/bearbeiten — Kunde, Lieferant oder Partner. Alle dürfen
 * das (RLS). Löschen nur der Chef, und nur, solange keine Projekte oder
 * Belege daran hängen.
 */
export function KundeDialog({
  open, onOpenChange, kunde, vorgabeName, vorgabeArt, onGespeichert, onGeloescht,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = neuer Kunde */
  kunde: Kunde | null;
  vorgabeName?: string;
  /** Art für einen neuen Kontakt (aus dem Filter der Liste) */
  vorgabeArt?: KontaktArt;
  onGespeichert?: (k: Kunde) => void;
  onGeloescht?: () => void;
}) {
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const { data: kunden = [] } = useKunden();
  const [grund, setGrund] = useState<Grunddaten>(grundAus(null));
  const [zusatz, setZusatz] = useState<Zusatzdaten>(zusatzAus(null));
  const [speichert, setSpeichert] = useState(false);
  const [loeschInfo, setLoeschInfo] = useState<{ projekte: number; belege: number } | null>(null);
  const [basis, setBasis] = useState("");

  useBeimOeffnen(open ? kunde?.id ?? "neu" : null, () => {
    const g = grundAus(kunde ?? { name: vorgabeName ?? "" });
    const z = zusatzAus(kunde, vorgabeArt);
    setGrund(g);
    setZusatz(z);
    setBasis(JSON.stringify([g, z]));
    setLoeschInfo(null);
  });

  const name = grund.name.trim();
  const doppelt = name ? kunden.find((k) => k.id !== kunde?.id && k.name.trim().toLowerCase() === name.toLowerCase()) : undefined;

  const speichern = async () => {
    if (!name) return toast.error("Bitte einen Namen eingeben.");
    const email = (grund.email ?? "").trim();
    if (email && !EMAIL.test(email)) return toast.error(`E-Mail: „${email}“ sieht nicht wie eine Adresse aus.`);
    setSpeichert(true);
    const daten = {
      name,
      strasse: leerNull(grund.strasse),
      plz: leerNull(grund.plz),
      ort: leerNull(grund.ort),
      telefon: leerNull(grund.telefon),
      email: email || null,
      ansprechpartner: leerNull(zusatz.ansprechpartner),
      uid: leerNull(zusatz.uid.replace(/\s/g, "").toUpperCase()),
      notiz: leerNull(zusatz.notiz),
      art: zusatz.art,
      kundennummer_extern: leerNull(zusatz.kundennummer_extern),
      namen: namenLesen(zusatz.namen, name),
    };
    const { data, error } = kunde
      ? await supabase.from("kunden").update(daten).eq("id", kunde.id).select().single()
      : await supabase.from("kunden").insert(daten).select().single();
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("kunden", "projekte");
    // Lage für die Karte im Hintergrund — nur wenn die Adresse neu ist
    if (brauchtGeo(data)) void geoSuchen(data).then(() => neuLaden("kunden")).catch(() => undefined);
    toast.success(`${KONTAKT_ART[zusatz.art].text} ${kunde ? "gespeichert" : "angelegt"}`);
    onGespeichert?.(data);
    onOpenChange(false);
  };

  const loeschenPruefen = async () => {
    if (!kunde) return;
    setSpeichert(true);
    const [p, b] = await Promise.all([
      supabase.from("projekte").select("id", { count: "exact", head: true }).eq("kunde_id", kunde.id),
      supabase.from("belege").select("id", { count: "exact", head: true }).eq("kunde_id", kunde.id),
    ]);
    setSpeichert(false);
    if (p.error || b.error) return toast.error("Nicht geprüft", { description: fehlerText(p.error ?? b.error) });
    setLoeschInfo({ projekte: p.count ?? 0, belege: b.count ?? 0 });
  };

  const loeschen = async () => {
    if (!kunde) return;
    setSpeichert(true);
    const { error } = await supabase.from("kunden").delete().eq("id", kunde.id);
    setSpeichert(false);
    setLoeschInfo(null);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    await neuLaden("kunden", "projekte");
    toast.success("Kontakt gelöscht");
    onGeloescht?.();
    onOpenChange(false);
  };

  const haengtDran = !!loeschInfo && loeschInfo.projekte + loeschInfo.belege > 0;
  const dranText = loeschInfo ? [
    loeschInfo.projekte && `${zahl(loeschInfo.projekte)} Projekt${loeschInfo.projekte === 1 ? "" : "e"}`,
    loeschInfo.belege && `${zahl(loeschInfo.belege)} Angebot${loeschInfo.belege === 1 ? "" : "e"}/Rechnung${loeschInfo.belege === 1 ? "" : "en"}`,
  ].filter(Boolean).join(" und ") : "";

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={kunde ? `${KONTAKT_ART[zusatz.art].text} bearbeiten` : KONTAKT_ART[zusatz.art].neu}
      beschreibung={kunde ? `K${kunde.nummer}` : undefined}
      gesperrt={speichert}
      ungespeichert={JSON.stringify([grund, zusatz]) !== basis}
      fuss={
        <>
          {kunde && istChef && (
            <Button variant="ghost" className="h-11 text-destructive sm:mr-auto" onClick={loeschenPruefen} disabled={speichert}>
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-11 min-w-40" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />}{kunde ? "Speichern" : `${KONTAKT_ART[zusatz.art].text} anlegen`}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-2xl space-y-7">
        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Kontakt</Gruppentitel>
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Art des Kontakts">
            {(Object.keys(KONTAKT_ART) as KontaktArt[]).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={zusatz.art === a}
                onClick={() => setZusatz((z) => ({ ...z, art: a }))}
                className={cn("h-10 rounded-md text-sm font-medium transition-colors",
                  zusatz.art === a ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                {KONTAKT_ART[a].text}
              </button>
            ))}
          </div>
          <KundeFelder wert={grund} onChange={setGrund} fokus={!kunde} />
          {doppelt && (
            <div className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm", TON_KLASSE.gelb)}>
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Es gibt schon „{doppelt.name}“ (K{doppelt.nummer}{doppelt.ort ? ` · ${doppelt.ort}` : ""}). Gleicher Kunde? Dann besser den bestehenden nehmen.
              </span>
            </div>
          )}
          <Feld id="k-ansprech" label={<>Ansprechpartner<Zusatz>(optional)</Zusatz></>}>
            <Input id="k-ansprech" className="h-11" value={zusatz.ansprechpartner}
              onChange={(e) => setZusatz((z) => ({ ...z, ansprechpartner: e.target.value }))} placeholder="z. B. bei Firmen oder Hausverwaltungen" />
          </Feld>
        </section>
        {zusatz.art === "lieferant" && (
          <section className="space-y-3">
            <Gruppentitel className="px-0 pb-0">Lieferant</Gruppentitel>
            <Feld id="k-kdnr" label={<>Unsere Kundennummer<Zusatz>(bei diesem Lieferanten)</Zusatz></>}>
              <Input id="k-kdnr" className="h-11 font-mono sm:max-w-xs" value={zusatz.kundennummer_extern} autoComplete="off"
                onChange={(e) => setZusatz((z) => ({ ...z, kundennummer_extern: e.target.value }))} />
            </Feld>
            <Feld id="k-namen" label={<>Weitere Schreibweisen<Zusatz>(optional)</Zusatz></>}
              hinweis="Wie der Lieferant auf Rechnungen, Lieferscheinen und Bestellungen heißt, mit Komma getrennt — z. B. „Sonepar Österreich GmbH, Sonepar Graz“. So findet der Kontakt seine Belege.">
              <Input id="k-namen" className="h-11" value={zusatz.namen} autoComplete="off"
                onChange={(e) => setZusatz((z) => ({ ...z, namen: e.target.value }))} />
            </Feld>
          </section>
        )}
        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Rechnung</Gruppentitel>
          <Feld id="k-uid" label={<>UID-Nummer<Zusatz>(nur bei Firmen)</Zusatz></>} hinweis="Steht auf der Rechnung, z. B. ATU12345678.">
            <Input id="k-uid" className="h-11 font-mono sm:max-w-xs" value={zusatz.uid} onChange={(e) => setZusatz((z) => ({ ...z, uid: e.target.value }))}
              autoCapitalize="characters" autoComplete="off" />
          </Feld>
        </section>
        <section className="space-y-3">
          <Gruppentitel className="px-0 pb-0">Notiz</Gruppentitel>
          <Textarea aria-label="Notiz" rows={4} value={zusatz.notiz} onChange={(e) => setZusatz((z) => ({ ...z, notiz: e.target.value }))}
            placeholder="z. B. Schlüssel beim Nachbarn, Hund im Garten, Zahlungsziel …" />
        </section>
      </div>

      <AlertDialog open={!!loeschInfo} onOpenChange={(o) => !o && setLoeschInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{haengtDran ? "Kontakt wird verwendet" : "Kontakt löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {haengtDran
                ? `An „${kunde?.name}“ hängen ${dranText}. Deshalb lässt er sich nicht löschen.`
                : `„${kunde?.name}“ wird endgültig gelöscht.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">{haengtDran ? "Verstanden" : "Abbrechen"}</AlertDialogCancel>
            {!haengtDran && (
              <Button variant="destructive" className="h-11" onClick={loeschen} disabled={speichert}>Endgültig löschen</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}
