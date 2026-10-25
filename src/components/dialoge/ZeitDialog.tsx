import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { darfZeitAendern } from "@/components/regie/regieLogik";
import { ProjektWahl } from "@/components/ProjektWahl";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { useMitarbeiter, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, stunden as stundenText, stundenAusVonBis, ueberMitternacht, zahlLesen } from "@/lib/format";
import { name, type Zeit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fehlerText } from "@/components/stamm/stammDaten";

/**
 * Stunden buchen — so knapp wie möglich.
 *
 * Standard ist „8 Stunden auf Projekt X“: ein Tipp auf eine Schnellwahl,
 * die zuletzt benutzten Projekte stehen als Knöpfe oben. Wer es genauer
 * will, schaltet auf Von–Bis um; die App merkt sich die zuletzt benutzte Art.
 * Der Chef kann auch für einen Monteur buchen.
 */

const SCHNELLWAHL = [4, 6, 7, 8, 8.5, 9, 10];
const MODUS_KEY = "elektro.zeitmodus";
type Modus = "stunden" | "vonbis";

/** Die letzten drei Projekte, auf die ich gebucht habe */
export function useLetzteProjekte(userId: string | undefined) {
  return useQuery({
    queryKey: ["zeiten", "letzte-projekte", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("zeiten").select("projekt_id").eq("user_id", userId!)
        .not("projekt_id", "is", null).order("created_at", { ascending: false }).limit(40);
      return [...new Set((data ?? []).map((z) => z.projekt_id as string))].slice(0, 3);
    },
  });
}

export function ZeitDialog({
  open, onOpenChange, eintrag, projektId: vorProjekt, datum: vorDatum,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eintrag?: Zeit | null;
  projektId?: string;
  datum?: string;
}) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: letzte = [] } = useLetzteProjekte(profil?.id);
  const [userId, setUserId] = useState("");
  const [projektId, setProjektId] = useState("");
  const [datum, setDatum] = useState(isoTag());
  const [modus, setModus] = useState<Modus>("stunden");
  const [std, setStd] = useState("");
  // „andere“ getippt: sonst leert sich das Feld, sobald die Teileingabe eine
  // Schnellwahl ist („4“ von „4,5“) — und die nächste Taste fängt neu an
  const [stdGetippt, setStdGetippt] = useState(false);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [von, setVon] = useState("07:00");
  const [bis, setBis] = useState("16:00");
  const [pause, setPause] = useState("30");
  const [taetigkeit, setTaetigkeit] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gemerkt: Modus = "stunden";
    try { if (localStorage.getItem(MODUS_KEY) === "vonbis") gemerkt = "vonbis"; } catch { /* egal */ }
    if (eintrag) {
      setUserId(eintrag.user_id);
      setProjektId(eintrag.projekt_id ?? "");
      setDatum(eintrag.datum);
      setModus(eintrag.von && eintrag.bis ? "vonbis" : "stunden");
      setStd(String(eintrag.stunden).replace(".", ","));
      setStdGetippt(false);
      setVon(eintrag.von?.slice(0, 5) || "07:00");
      setBis(eintrag.bis?.slice(0, 5) || "16:00");
      setPause(String(eintrag.pause_minuten ?? 0));
      setTaetigkeit(eintrag.taetigkeit || "");
    } else {
      setUserId(profil?.id ?? "");
      setProjektId(vorProjekt || "");
      setDatum(vorDatum || isoTag());
      setModus(gemerkt);
      setStd("");
      setStdGetippt(false);
      setTaetigkeit("");
    }
  }, [open, eintrag, vorProjekt, vorDatum, profil?.id]);

  // Ohne Vorgabe: zuletzt benutztes Projekt vorbelegen
  useEffect(() => {
    if (open && !eintrag && !vorProjekt && !projektId && letzte[0]) setProjektId(letzte[0]);
  }, [open, eintrag, vorProjekt, projektId, letzte]);

  const gesperrt = !!eintrag?.rechnung_id;
  // Fremde Stunden: nur ansehen (die Datenbank lehnt Ändern ab — still)
  const nurAnsehen = !!eintrag && !gesperrt && !darfZeitAendern(eintrag, profil?.id, istChef);
  const ergebnis = modus === "stunden" ? zahlLesen(std) : stundenAusVonBis(von, bis, zahlLesen(pause));
  const pauseZuLang = modus === "vonbis" && stundenAusVonBis(von, bis, 0) > 0 && ergebnis === 0;
  const nacht = modus === "vonbis" && ueberMitternacht(von, bis);

  const modusWechseln = (m: Modus) => {
    setModus(m);
    try { localStorage.setItem(MODUS_KEY, m); } catch { /* egal */ }
  };

  const speichern = async () => {
    if (!projektId) return toast.error("Bitte ein Projekt wählen.");
    if (!datum) return toast.error("Bitte ein Datum eintragen.");
    if (datum > isoTag()) return toast.error("Das Datum liegt in der Zukunft — Stunden erst buchen, wenn gearbeitet ist.");
    if (modus === "vonbis" && zahlLesen(pause) < 0) return toast.error("Die Pause kann nicht negativ sein.");
    if (modus === "vonbis" && von === bis) return toast.error("Von und Bis sind gleich.");
    if (pauseZuLang) return toast.error("Die Pause ist länger als die Arbeitszeit.");
    if (!(ergebnis > 0 && ergebnis <= 24)) return toast.error("Bitte die Stunden eintragen — mehr als 0 und höchstens 24.");
    const wer = userId || profil!.id;
    setSpeichert(true);
    // Mehr als 24 h an einem Tag für eine Person geht nicht — meist doppelt gebucht
    let tagQ = supabase.from("zeiten").select("stunden").eq("user_id", wer).eq("datum", datum);
    if (eintrag) tagQ = tagQ.neq("id", eintrag.id);
    const { data: tag } = await tagQ;
    const schon = (tag ?? []).reduce((s, z) => s + Number(z.stunden), 0);
    if (schon + ergebnis > 24) {
      setSpeichert(false);
      return toast.error(`Am ${datumText(datum)} sind schon ${stundenText(schon)} gebucht — zusammen mehr als 24 h.`);
    }
    const daten = {
      user_id: wer,
      projekt_id: projektId,
      datum,
      stunden: ergebnis,
      von: modus === "vonbis" ? von : null,
      bis: modus === "vonbis" ? bis : null,
      pause_minuten: modus === "vonbis" ? Math.round(zahlLesen(pause)) : 0,
      taetigkeit: taetigkeit.trim() || null,
    };
    const { data: zeilen, error } = eintrag
      ? await supabase.from("zeiten").update(daten).eq("id", eintrag.id).select("id")
      : await supabase.from("zeiten").insert(daten).select("id");
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    if (!zeilen?.length) return toast.error("Nicht gespeichert — ändern kann das nur, wer gebucht hat, oder der Chef.");
    toast.success(`Gebucht · ${stundenText(ergebnis)}`);
    await neuLaden("zeiten", "projekt_zahlen");
    onOpenChange(false);
  };

  const loeschen = async () => {
    if (!eintrag) return;
    setLoeschenFrage(false);
    setSpeichert(true);
    const { data: weg, error } = await supabase.from("zeiten").delete().eq("id", eintrag.id).select("id");
    setSpeichert(false);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    if (!weg?.length) return toast.error("Nicht gelöscht — löschen kann das nur, wer gebucht hat, oder der Chef.");
    toast.success("Eintrag gelöscht");
    await neuLaden("zeiten", "projekt_zahlen");
    onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={eintrag ? "Stunden bearbeiten" : "Stunden buchen"}
      gesperrt={speichert}
      fuss={
        <>
          {eintrag && !gesperrt && !nurAnsehen && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setLoeschenFrage(true)} disabled={speichert}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>{nurAnsehen ? "Schließen" : "Abbrechen"}</Button>
          {!gesperrt && !nurAnsehen && (
            <Button onClick={speichern} disabled={speichert} className="min-w-40">
              {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {ergebnis > 0 ? `${stundenText(ergebnis)} buchen` : "Stunden buchen"}
            </Button>
          )}
        </>
      }
    >
      <div className="max-w-xl space-y-5">
        {gesperrt && (
          <p className="rounded-md border border-status-lila bg-status-lila p-3 text-sm text-status-lila-fg">
            Diese Stunden sind schon verrechnet und können nicht mehr geändert werden.
          </p>
        )}
        {nurAnsehen && (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            Ändern oder löschen kann diese Stunden nur, wer sie gebucht hat — oder der Chef.
          </p>
        )}
        {eintrag?.regiebericht_id && !gesperrt && (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">Gehört zu einem Regiebericht.</p>
        )}

        {istChef && mitarbeiter.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="z-wer">Für wen?</Label>
            <Select value={userId} onValueChange={setUserId} disabled={gesperrt}>
              <SelectTrigger id="z-wer" className="h-12"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
              <SelectContent>
                {mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{name(m)}{m.id === profil?.id ? " (ich)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="z-projekt">Projekt</Label>
          {!eintrag && letzte.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {letzte.map((id) => {
                const p = projekte.find((x) => x.id === id);
                if (!p || p.status === "abgeschlossen") return null;
                return (
                  <button key={id} type="button" onClick={() => setProjektId(id)}
                    className={cn("max-w-full truncate rounded-full border px-3 py-1.5 text-sm",
                      projektId === id ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-muted")}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          <ProjektWahl id="z-projekt" wert={projektId} onChange={(id) => setProjektId(id)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="z-datum">Datum</Label>
          <Input id="z-datum" type="date" className="h-12" value={datum} onChange={(e) => setDatum(e.target.value)} disabled={gesperrt} />
        </div>

        <div className="space-y-3">
          <div className="inline-flex rounded-md border bg-secondary p-0.5">
            {(["stunden", "vonbis"] as Modus[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => modusWechseln(m)}
                className={cn("rounded px-4 py-2 text-sm font-medium transition-colors",
                  modus === m ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground")}
              >
                {m === "stunden" ? "Stunden" : "Von – Bis"}
              </button>
            ))}
          </div>

          {modus === "stunden" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {SCHNELLWAHL.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={!stdGetippt && zahlLesen(std) === h ? "default" : "outline"}
                    className="h-12 text-base"
                    onClick={() => { setStd(String(h).replace(".", ",")); setStdGetippt(false); }}
                  >
                    {String(h).replace(".", ",")} h
                  </Button>
                ))}
                <Input
                  inputMode="decimal"
                  className="h-12 text-center text-base"
                  placeholder="andere"
                  value={stdGetippt || !SCHNELLWAHL.includes(zahlLesen(std)) ? std : ""}
                  onChange={(e) => { setStd(e.target.value); setStdGetippt(true); }}
                  aria-label="Andere Stundenzahl"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="z-von" className="text-xs">Von</Label>
                <Input id="z-von" type="time" className="h-12" value={von} onChange={(e) => setVon(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="z-bis" className="text-xs">Bis</Label>
                <Input id="z-bis" type="time" className="h-12" value={bis} onChange={(e) => setBis(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="z-pause" className="text-xs">Pause (Min.)</Label>
                <Input id="z-pause" inputMode="numeric" className="h-12" value={pause} onChange={(e) => setPause(e.target.value)} />
              </div>
              <p className={cn("col-span-3 text-sm", pauseZuLang ? "text-destructive" : "text-muted-foreground")}>
                {pauseZuLang
                  ? "Die Pause ist länger als die Arbeitszeit."
                  : <>Ergibt <strong className="text-foreground">{stundenText(ergebnis)}</strong>{nacht && " — über Mitternacht"}</>}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="z-taetigkeit">Was wurde gemacht? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <DiktatKnopf onText={(t) => setTaetigkeit((alt) => `${alt}${alt && !alt.endsWith(" ") ? " " : ""}${t}`)} />
          </div>
          <Textarea id="z-taetigkeit" rows={2} value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)}
            placeholder="z. B. Verteiler gesetzt, Leitungen eingezogen" />
        </div>
      </div>

      <AlertDialog open={loeschenFrage} onOpenChange={setLoeschenFrage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stunden löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {eintrag ? `${stundenText(Number(eintrag.stunden))} am ${datumText(eintrag.datum)}` : ""} — das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={loeschen}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}
