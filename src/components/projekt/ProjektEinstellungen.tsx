import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Euro, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Karte } from "@/components/Bausteine";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, euro, isoTag } from "@/lib/format";
import { satzAm } from "@/lib/nachkalkulation";
import { runden2 } from "@/lib/preise";
import { name, type Profil } from "@/lib/types";
import { PLATZHALTER, VORLAGEN_VORGABE, vorlagenLesen, type Vorlage } from "@/lib/whatsapp";

// ── Lohnkosten und Verrechnungssatz je Mitarbeiter (Einstellungen → Mitarbeiter) ──

type SatzRoh = { id?: string; gueltig_ab: string; lohnkosten: string; verrechnungssatz: string };
const text = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/** Alle Sätze (nur der Chef darf sie lesen) */
function useSaetzeAlle() {
  return useQuery({
    queryKey: ["mitarbeiter_saetze", "alle"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mitarbeiter_saetze").select("*").order("gueltig_ab");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Kurzanzeige im Mitarbeiter-Eintrag: was heute gilt, Knopf „Sätze“.
 * Lohnkosten zählen in der Nachkalkulation, der Verrechnungssatz auf
 * Rechnung und Regie (vor Lohnart und Projekt-/Betriebssatz).
 */
export function LohnSaetze({ p }: { p: Profil }) {
  const { data: alle = [] } = useSaetzeAlle();
  const [offen, setOffen] = useState(false);
  const eigene = alle.filter((s) => s.user_id === p.id);
  const heute = satzAm(eigene.map((s) => ({ ...s, lohnkosten: s.lohnkosten == null ? null : Number(s.lohnkosten), verrechnungssatz: s.verrechnungssatz == null ? null : Number(s.verrechnungssatz) })), p.id, isoTag());
  return (
    <>
      <button type="button" onClick={() => setOffen(true)} className="flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted" aria-label={`Lohnkosten und Stundensatz ${name(p)}`}>
        <Euro className="h-4 w-4 text-primary" />
        {heute
          ? <span className="zahl">{heute.lohnkosten != null ? `Kosten ${euro(heute.lohnkosten)}` : "Kosten —"} · {heute.verrechnungssatz != null ? `Satz ${euro(heute.verrechnungssatz)}` : "Satz Standard"}</span>
          : <span className="text-muted-foreground">Lohnkosten / Satz</span>}
      </button>
      <SaetzeDialog open={offen} onOpenChange={setOffen} p={p} eigene={eigene} />
    </>
  );
}

function SaetzeDialog({ open, onOpenChange, p, eigene }: {
  open: boolean; onOpenChange: (o: boolean) => void; p: Profil;
  eigene: { id: string; gueltig_ab: string; lohnkosten: number | null; verrechnungssatz: number | null }[];
}) {
  const neuLaden = useNeuLaden();
  const { firma } = useSitzung();
  const [zeilen, setZeilen] = useState<SatzRoh[]>([]);
  const [speichert, setSpeichert] = useState(false);
  useBeimOeffnen(open ? p.id : null, () => setZeilen(eigene.length
    ? eigene.map((s) => ({ id: s.id, gueltig_ab: s.gueltig_ab, lohnkosten: text(s.lohnkosten), verrechnungssatz: text(s.verrechnungssatz) }))
    : [{ gueltig_ab: isoTag(), lohnkosten: "", verrechnungssatz: "" }]));
  const setze = (i: number, t: Partial<SatzRoh>) => setZeilen((z) => z.map((x, k) => (k === i ? { ...x, ...t } : x)));

  const speichern = async () => {
    const daten: { id?: string; gueltig_ab: string; lohnkosten: number | null; verrechnungssatz: number | null }[] = [];
    for (const z of zeilen) {
      const lk = z.lohnkosten.trim() ? dezimalLesen(z.lohnkosten) : null;
      const vs = z.verrechnungssatz.trim() ? dezimalLesen(z.verrechnungssatz) : null;
      if (!z.gueltig_ab) return toast.error("Jede Zeile braucht „gültig ab“.");
      if (z.lohnkosten.trim() && (lk === null || lk < 0 || lk >= 1000)) return toast.error(`Lohnkosten „${z.lohnkosten}“ bitte prüfen.`);
      if (z.verrechnungssatz.trim() && (vs === null || vs <= 0 || vs >= 1000)) return toast.error(`Stundensatz „${z.verrechnungssatz}“ bitte prüfen.`);
      if (lk === null && vs === null) continue; // leere Zeile fällt weg
      daten.push({ id: z.id, gueltig_ab: z.gueltig_ab, lohnkosten: lk === null ? null : runden2(lk), verrechnungssatz: vs === null ? null : runden2(vs) });
    }
    if (new Set(daten.map((d) => d.gueltig_ab)).size < daten.length) return toast.error("Zwei Zeilen haben dasselbe „gültig ab“.");
    setSpeichert(true);
    // Erst weg, was nicht mehr da ist, dann ändern, dann neu — sonst stößt „gültig ab“ an die alte Zeile
    const bleiben = new Set(daten.flatMap((d) => (d.id ? [d.id] : [])));
    const weg = eigene.filter((s) => !bleiben.has(s.id)).map((s) => s.id);
    let fehler = weg.length ? (await supabase.from("mitarbeiter_saetze").delete().in("id", weg)).error : null;
    for (const d of daten.filter((x) => x.id)) {
      if (fehler) break;
      fehler = (await supabase.from("mitarbeiter_saetze").update({ gueltig_ab: d.gueltig_ab, lohnkosten: d.lohnkosten, verrechnungssatz: d.verrechnungssatz }).eq("id", d.id!)).error;
    }
    const neu = daten.filter((x) => !x.id).map((d) => ({ user_id: p.id, gueltig_ab: d.gueltig_ab, lohnkosten: d.lohnkosten, verrechnungssatz: d.verrechnungssatz }));
    if (!fehler && neu.length) fehler = (await supabase.from("mitarbeiter_saetze").insert(neu)).error;
    setSpeichert(false);
    await neuLaden("mitarbeiter_saetze");
    if (fehler) return toast.error("Nicht gespeichert", { description: fehlerText(fehler) });
    toast.success(`Sätze von ${name(p)} gespeichert`);
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel={`Lohnkosten und Stundensatz · ${name(p)}`}
      beschreibung="Nur der Chef sieht diese Zahlen." gesperrt={speichert}
      fuss={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="gap-2">{speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern</Button>
        </>
      }>
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Lohnkosten</strong> = was eine Stunde den Betrieb kostet (Lohn samt Nebenkosten) — zählt in der Nachkalkulation.
          Leer = {firma?.kostensatz ? `Betriebswert ${euro(Number(firma.kostensatz))}` : "unbekannt"}.{" "}
          <strong className="text-foreground">Stundensatz</strong> = was der Kunde je Stunde zahlt — Rechnung und Regie nehmen ihn statt Lohnart und Betriebssatz.
          Leer = {p.lohnart ? `Lohnart „${p.lohnart}“` : "Standard"}.
        </p>
        {zeilen.map((z, i) => (
          <div key={z.id ?? `neu-${i}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
            <div className="col-span-3 space-y-1 sm:col-span-1">
              <Label htmlFor={`ab-${i}`} className="text-xs">Gültig ab</Label>
              <Input id={`ab-${i}`} type="date" className="h-11" value={z.gueltig_ab} onChange={(e) => setze(i, { gueltig_ab: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lk-${i}`} className="text-xs">Lohnkosten €/h</Label>
              <Input id={`lk-${i}`} className="h-11" inputMode="decimal" value={z.lohnkosten} onChange={(e) => setze(i, { lohnkosten: e.target.value })} placeholder="z. B. 38" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`vs-${i}`} className="text-xs">Stundensatz €/h</Label>
              <Input id={`vs-${i}`} className="h-11" inputMode="decimal" value={z.verrechnungssatz} onChange={(e) => setze(i, { verrechnungssatz: e.target.value })} placeholder="Standard" />
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setZeilen((x) => x.filter((_, k) => k !== i))} aria-label="Zeile entfernen">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setZeilen((x) => [...x, { gueltig_ab: isoTag(), lohnkosten: x.at(-1)?.lohnkosten ?? "", verrechnungssatz: x.at(-1)?.verrechnungssatz ?? "" }])}>
          <Plus className="h-4 w-4" /> Neuer Satz ab …
        </Button>
        {eigene.length > 0 && <p className="text-xs text-muted-foreground">Ältere Stunden rechnen mit dem Satz, der an ihrem Tag galt (zuletzt geändert: gültig ab {datum(eigene.at(-1)!.gueltig_ab)}).</p>}
      </div>
    </FormularDialog>
  );
}

// ── WhatsApp-Vorlagen (Einstellungen → Betrieb) ──────────────────────────

/** Vorlagen für „WhatsApp an Kunde“ — eigener Speichern-Knopf, unabhängig vom Betrieb */
export function WhatsAppVorlagenKarte() {
  const { firma, neuLaden } = useSitzung();
  const [liste, setListe] = useState<Vorlage[] | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const aktuell = liste ?? vorlagenLesen(firma?.whatsapp_vorlagen);
  const setze = (i: number, t: Partial<Vorlage>) => setListe(aktuell.map((v, k) => (k === i ? { ...v, ...t } : v)));

  const speichern = async (neu: Vorlage[] | null) => {
    const sauber = neu?.map((v) => ({ name: v.name.trim(), text: v.text })).filter((v) => v.name && v.text.trim()) ?? null;
    if (sauber && new Set(sauber.map((v) => v.name)).size < sauber.length) return toast.error("Zwei Vorlagen heißen gleich.");
    setSpeichert(true);
    const { error } = await supabase.from("firma").update({ whatsapp_vorlagen: sauber }).eq("id", 1);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(sauber ? "Vorlagen gespeichert" : "Vorlagen zurückgesetzt");
    setListe(null);
    await neuLaden();
  };

  return (
    <Karte titel="WhatsApp an Kunden — Vorlagen">
      <p className="text-sm text-muted-foreground">
        Im Projekt unter „WhatsApp an Kunde“. Platzhalter füllt die App aus:{" "}
        {Object.keys(PLATZHALTER).map((k) => <code key={k} className="mr-1 rounded bg-muted px-1 text-xs" title={PLATZHALTER[k]}>{`{${k}}`}</code>)}
      </p>
      <div className="mt-3 space-y-3">
        {aktuell.map((v, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="flex gap-2">
              <Input className="h-11" value={v.name} onChange={(e) => setze(i, { name: e.target.value })} aria-label="Name der Vorlage" />
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => setListe(aktuell.filter((_, k) => k !== i))} aria-label={`Vorlage ${v.name} löschen`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <Textarea rows={4} value={v.text} onChange={(e) => setze(i, { text: e.target.value })} aria-label={`Text der Vorlage ${v.name}`} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setListe([...aktuell, { name: "Neue Vorlage", text: "Grüß Gott {kunde},\n\nFreundliche Grüße\n{absender}, {firma}" }])}>
          <Plus className="h-4 w-4" /> Vorlage
        </Button>
        {Array.isArray(firma?.whatsapp_vorlagen) && (
          <Button variant="ghost" className="h-11 gap-1.5" disabled={speichert} onClick={() => void speichern(null)}>
            <RotateCcw className="h-4 w-4" /> Vorgaben ({VORLAGEN_VORGABE.length})
          </Button>
        )}
        <Button className="ml-auto h-11 gap-2" disabled={speichert || !liste} onClick={() => void speichern(aktuell)}>
          {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Vorlagen speichern
        </Button>
      </div>
    </Karte>
  );
}
