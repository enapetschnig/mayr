import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, StatusPille } from "@/components/Bausteine";
import { useKalenderAbwesenheit } from "@/components/zeiten/personalDaten";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useBeimOeffnen } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useFahrzeuge, useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { isoTag } from "@/lib/format";
import { EINSATZ_STATUS, FAHRZEUG_ART, TEAM_FARBEN, type FahrzeugArt, type Termin } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TerminWerte = {
  titel: string;
  datum: string;
  bisDatum: string;
  ganztags: boolean;
  von: string;
  bis: string;
  projektId: string;
  ort: string;
  beschreibung: string;
  dabei: string[];
  dringend: boolean;
  teamId: string;
  fahrzeuge: string[];
};

/** Was am Termin nicht stimmt — null, wenn er so gespeichert werden kann */
export function terminFehler(w: Pick<TerminWerte, "titel" | "datum" | "bisDatum" | "ganztags" | "von" | "bis">): string | null {
  if (!w.titel.trim()) return "Bitte einen Titel eingeben";
  if (!w.datum) return "Bitte ein Datum wählen";
  if (w.bisDatum && w.bisDatum < w.datum) return "„Bis“ liegt vor dem Datum";
  if (w.ganztags) return null;
  if (!w.von) return "Bitte eine Uhrzeit eintragen — oder „Ganztägig“ wählen";
  // Über mehrere Tage darf das Ende am letzten Tag früher sein als der Beginn am ersten
  const mehrtaegig = !!w.bisDatum && w.bisDatum > w.datum;
  if (w.bis && w.bis <= w.von && !mehrtaegig) return "Das Ende liegt vor dem Beginn";
  return null;
}

/**
 * Termin im Kalender — mit Einteilung: Wer ist dabei? Ein Projekt füllt
 * Titel und Ort vor, solange dort noch nichts steht.
 */
export function TerminDialog({
  open, onOpenChange, termin, datum: vorDatum, projektId: vorProjekt, mitarbeiterId, teamId, fahrzeugId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  termin?: Termin | null;
  datum?: string;
  projektId?: string;
  /** Aus der Einteilung: dieser Mitarbeiter ist vorausgewählt */
  mitarbeiterId?: string;
  /** Aus der Plantafel: dieses Team / Fahrzeug ist vorausgewählt */
  teamId?: string;
  fahrzeugId?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: fahrzeugListe = [] } = useFahrzeuge();
  const [w, setW] = useState<TerminWerte>(() => leer(isoTag()));
  const [basis, setBasis] = useState<TerminWerte>(w);
  const [speichert, setSpeichert] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const setze = (teil: Partial<TerminWerte>) => setW((x) => ({ ...x, ...teil }));

  // Nur beim Öffnen füllen: Nachladen (Projekte, Profil) setzt keine Eingabe zurück
  useBeimOeffnen(open ? termin?.id ?? `neu|${vorDatum ?? ""}|${vorProjekt ?? ""}|${mitarbeiterId ?? ""}|${teamId ?? ""}|${fahrzeugId ?? ""}` : null, () => {
    let v: TerminWerte;
    if (termin) {
      v = {
        titel: termin.titel,
        datum: termin.datum,
        bisDatum: termin.bis_datum || "",
        ganztags: termin.ganztags,
        von: termin.von?.slice(0, 5) || "07:00",
        bis: termin.bis?.slice(0, 5) || "15:30",
        projektId: termin.projekt_id || "",
        ort: termin.ort || "",
        beschreibung: termin.beschreibung || "",
        dabei: termin.mitarbeiter ?? [],
        dringend: termin.dringend,
        teamId: termin.team_id ?? "",
        fahrzeuge: termin.fahrzeuge ?? [],
      };
    } else {
      const p = projekte.find((x) => x.id === vorProjekt);
      v = {
        ...leer(vorDatum || isoTag()),
        titel: p?.name ?? "",
        projektId: p?.id ?? "",
        ort: p ? [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
        dabei: mitarbeiterId ? [mitarbeiterId] : profil && !teamId && !fahrzeugId ? [profil.id] : [],
        fahrzeuge: fahrzeugId ? [fahrzeugId] : [],
      };
      const team = teams.find((x) => x.id === teamId);
      if (team) {
        v.teamId = team.id;
        v.dabei = [...team.mitglieder];
        if (team.fahrzeug_id && !v.fahrzeuge.includes(team.fahrzeug_id)) v.fahrzeuge.push(team.fahrzeug_id);
      }
    }
    setW(v);
    setBasis(v);
    setLoeschFrage(false);
  });

  const { data: abwesend = [] } = useKalenderAbwesenheit(open ? w.datum : undefined, open ? w.bisDatum || w.datum : undefined);
  const abwesendeNamen = mitarbeiter.filter((m) => w.dabei.includes(m.id) && abwesend.some((a) => a.user_id === m.id)).map((m) => m.vorname || m.nachname);

  const teamWaehlen = (id: string) => setW((x) => {
    const alt = teams.find((t) => t.id === x.teamId);
    const neu = id === x.teamId ? undefined : teams.find((t) => t.id === id);
    let dabei = x.dabei.filter((m) => !alt?.mitglieder.includes(m));
    let fz = x.fahrzeuge.filter((f) => f !== alt?.fahrzeug_id);
    if (neu) {
      dabei = [...dabei, ...neu.mitglieder.filter((m) => !dabei.includes(m))];
      if (neu.fahrzeug_id && !fz.includes(neu.fahrzeug_id)) fz = [...fz, neu.fahrzeug_id];
    }
    return { ...x, teamId: neu?.id ?? "", dabei, fahrzeuge: fz };
  });

  const projektWaehlen = (id: string) => {
    const p = projekte.find((x) => x.id === id);
    setW((x) => ({
      ...x,
      projektId: id,
      ...(p && !x.ort ? { ort: [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") } : {}),
      ...(p && !x.titel ? { titel: p.name } : {}),
    }));
  };

  const speichern = async () => {
    const fehler = terminFehler(w);
    if (fehler) return toast.error(fehler);
    setSpeichert(true);
    const daten = {
      titel: w.titel.trim(),
      datum: w.datum,
      bis_datum: w.bisDatum && w.bisDatum > w.datum ? w.bisDatum : null,
      ganztags: w.ganztags,
      von: w.ganztags ? null : w.von || null,
      bis: w.ganztags ? null : w.bis || null,
      projekt_id: w.projektId || null,
      ort: w.ort.trim() || null,
      beschreibung: w.beschreibung.trim() || null,
      mitarbeiter: w.dabei,
      dringend: w.dringend,
      team_id: w.teamId || null,
      fahrzeuge: w.fahrzeuge,
    };
    const { error } = termin
      ? await supabase.from("termine").update(daten).eq("id", termin.id)
      : await supabase.from("termine").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success("Termin gespeichert");
    await neuLaden("termine");
    onOpenChange(false);
  };

  const statusSetzen = async (status: string) => {
    if (!termin) return;
    setSpeichert(true);
    const { error } = await supabase.from("termine").update({ status }).eq("id", termin.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(EINSATZ_STATUS[status].text);
    await neuLaden("termine");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!termin) return;
    setLoeschFrage(false);
    setSpeichert(true);
    const { data: weg, error } = await supabase.from("termine").delete().eq("id", termin.id).select("id");
    setSpeichert(false);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    if (!weg?.length) return toast.error("Nicht gelöscht", { description: "Löschen kann nur, wer den Termin eingetragen hat, oder der Chef." });
    toast.success("Termin gelöscht");
    await neuLaden("termine");
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={termin ? "Termin bearbeiten" : "Neuer Termin"}
      gesperrt={speichert}
      ungespeichert={JSON.stringify(w) !== JSON.stringify(basis)}
      fuss={
        <>
          {termin && (istChef || termin.user_id === profil?.id) && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setLoeschFrage(true)} disabled={speichert}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert} className="min-w-32 gap-2">
            {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {termin && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2.5">
            <StatusPille eintrag={EINSATZ_STATUS[termin.status]} />
            {termin.erledigt_am && <span className="text-xs text-muted-foreground">{new Date(termin.erledigt_am).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</span>}
            <span className="flex-1" />
            {termin.status !== "erledigt" && <Button variant="outline" className="h-11 bg-card" disabled={speichert} onClick={() => void statusSetzen("erledigt")}>Erledigt</Button>}
            {termin.status === "geplant" && <Button variant="outline" className="h-11 bg-card" disabled={speichert} onClick={() => void statusSetzen("begonnen")}>Beginnen</Button>}
            {termin.status !== "geplant" && <Button variant="ghost" className="h-11" disabled={speichert} onClick={() => void statusSetzen("geplant")}>Zurücksetzen</Button>}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="t-projekt">Projekt <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <ProjektWahl id="t-projekt" wert={w.projektId} onChange={projektWaehlen} leerText="Kein Projekt" />
          {w.projektId && (
            <button type="button" className="min-h-11 text-xs text-muted-foreground hover:text-foreground" onClick={() => setze({ projektId: "" })}>
              Projekt entfernen
            </button>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-titel">Titel</Label>
          <Input id="t-titel" className="h-12" value={w.titel} onChange={(e) => setze({ titel: e.target.value })} placeholder="z. B. Abnahme, Baubesprechung, Urlaub" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="t-datum" className="text-xs">Datum</Label>
            <Input id="t-datum" type="date" className="h-12" value={w.datum} onChange={(e) => setze({ datum: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-bisdatum" className="text-xs">Bis (mehrtägig)</Label>
            <Input id="t-bisdatum" type="date" className="h-12" min={w.datum} value={w.bisDatum} onChange={(e) => setze({ bisDatum: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="t-ganztags" checked={w.ganztags} onCheckedChange={(ganztags) => setze({ ganztags })} />
          <Label htmlFor="t-ganztags">Ganztägig</Label>
        </div>
        {!w.ganztags && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="t-von" className="text-xs">Von</Label>
              <Input id="t-von" type="time" className="h-12" value={w.von} onChange={(e) => setze({ von: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-bis" className="text-xs">Bis</Label>
              <Input id="t-bis" type="time" className="h-12" value={w.bis} onChange={(e) => setze({ bis: e.target.value })} />
            </div>
          </div>
        )}

        {teams.length > 0 && (
          <div className="space-y-2">
            <Label>Team</Label>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => {
                const an = w.teamId === t.id;
                return (
                  <button key={t.id} type="button" aria-pressed={an} onClick={() => teamWaehlen(t.id)}
                    className={cn("flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                    <span className={cn("h-2.5 w-2.5 rounded-full", TEAM_FARBEN[t.farbe]?.punkt ?? "bg-slate-500")} />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Wer ist dabei?</Label>
          <div className="flex flex-wrap gap-2">
            {mitarbeiter.map((m) => {
              const an = w.dabei.includes(m.id);
              return (
                <button key={m.id} type="button" aria-pressed={an}
                  onClick={() => setze({ dabei: an ? w.dabei.filter((x) => x !== m.id) : [...w.dabei, m.id] })}
                  className={cn("flex h-11 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-colors",
                    an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                  <Avatar profil={m} className={cn("h-7 w-7 text-[11px]", !an && "opacity-50")} />
                  {m.vorname || m.nachname}
                </button>
              );
            })}
          </div>
        </div>

        {fahrzeugListe.length > 0 && (
          <div className="space-y-2">
            <Label>Bus, Steiger, Geräte</Label>
            <div className="flex flex-wrap gap-2">
              {fahrzeugListe.map((f) => {
                const an = w.fahrzeuge.includes(f.id);
                return (
                  <button key={f.id} type="button" aria-pressed={an}
                    onClick={() => setze({ fahrzeuge: an ? w.fahrzeuge.filter((x) => x !== f.id) : [...w.fahrzeuge, f.id] })}
                    className={cn("flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      an ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
                    {f.name}
                    <span className="text-xs font-normal opacity-70">{FAHRZEUG_ART[f.art as FahrzeugArt]?.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {abwesendeNamen.length > 0 && (
          <p className="rounded-md border border-status-gelb bg-status-gelb/40 px-3 py-2 text-sm" role="status">
            {abwesendeNamen.join(", ")} {abwesendeNamen.length === 1 ? "ist" : "sind"} in dieser Zeit abwesend.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Switch id="t-dringend" checked={w.dringend} onCheckedChange={(dringend) => setze({ dringend })} />
          <Label htmlFor="t-dringend">Dringend (Kundendienst, Störung)</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-ort">Ort</Label>
          <Input id="t-ort" className="h-12" value={w.ort} onChange={(e) => setze({ ort: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-beschr">Notiz</Label>
          <Textarea id="t-beschr" rows={3} value={w.beschreibung} onChange={(e) => setze({ beschreibung: e.target.value })} />
        </div>
      </div>

      <AlertDialog open={loeschFrage} onOpenChange={setLoeschFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Termin löschen?</AlertDialogTitle>
            <AlertDialogDescription>„{termin?.titel}“ verschwindet aus dem Kalender — für alle, die eingeteilt sind.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschen}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}

function leer(datum: string): TerminWerte {
  return { titel: "", datum, bisDatum: "", ganztags: false, von: "07:00", bis: "15:30", projektId: "", ort: "", beschreibung: "", dabei: [], dringend: false, teamId: "", fahrzeuge: [] };
}
