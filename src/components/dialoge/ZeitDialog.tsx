import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { darfZeitAendern } from "@/components/regie/regieLogik";
import { ProjektWahl } from "@/components/ProjektWahl";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { PersonenWahl } from "@/components/PersonenWahl";
import { useMitarbeiter, useNeuLaden, useProjekte, useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum as datumText, isoTag, stunden as stundenText, stundenAusVonBis, ueberMitternacht, zahlLesen } from "@/lib/format";
import { ersteUeberschneidung, naechsterBlock, ueberschneiden } from "@/lib/zeitBloecke";
import { name, PROJEKT_STATUS, type ProjektStatus, type Zeit } from "@/lib/types";
import { STUNDEN_ART, type StundenArt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fehlerText } from "@/components/stamm/stammDaten";

/**
 * Stunden buchen — so knapp wie möglich.
 *
 * Standard ist „8 Stunden auf Projekt X“: ein Tipp auf eine Schnellwahl,
 * die zuletzt benutzten Projekte stehen als Knöpfe oben. Wer es genauer
 * will, schaltet auf Von–Bis um; die App merkt sich die zuletzt benutzte Art.
 * Der Chef (und die Teamleitung für ihr Team) bucht auch für andere — für
 * mehrere auf einmal („ganzes Team 7–16 Uhr“), je Person eine Zeile.
 * „Intern“ = ohne Projekt mit Art (Büro, Lager …), zählt als unproduktiv.
 */

const SCHNELLWAHL = [1, 2, 4, 6, 7, 8, 8.5, 9, 10];
const MODUS_KEY = "elektro.zeitmodus";
type Modus = "stunden" | "vonbis";
type Weiterer = { id: string; von: string; bis: string; pause: string; projektId: string };
type Ziel = "projekt" | "intern";

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
  const { profil, istChef, firma } = useSitzung();
  const { data: projekte = [] } = useProjekte();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const { data: teams = [] } = useTeams();
  const { data: letzte = [] } = useLetzteProjekte(profil?.id);
  // Für wen gebucht wird — neu auch mehrere, beim Bearbeiten genau einer
  const [wer, setWer] = useState<string[]>([]);
  const userId = wer[0] ?? "";
  const [projektId, setProjektId] = useState("");
  const [ziel, setZiel] = useState<Ziel>("projekt");
  const [intern, setIntern] = useState("");
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
  const [art, setArt] = useState<StundenArt>("arbeit");
  // Weitere Von–Bis-Blöcke am selben Tag, jeder auch auf ein anderes Projekt
  const [weitere, setWeitere] = useState<Weiterer[]>([]);
  const [mehr, setMehr] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gemerkt: Modus = "stunden";
    try { if (localStorage.getItem(MODUS_KEY) === "vonbis") gemerkt = "vonbis"; } catch { /* egal */ }
    if (eintrag) {
      setWer([eintrag.user_id]);
      setProjektId(eintrag.projekt_id ?? "");
      setZiel(eintrag.projekt_id ? "projekt" : "intern");
      setIntern(eintrag.intern ?? "");
      setDatum(eintrag.datum);
      setModus(eintrag.von && eintrag.bis ? "vonbis" : "stunden");
      setStd(String(eintrag.stunden).replace(".", ","));
      setStdGetippt(false);
      setVon(eintrag.von?.slice(0, 5) || "07:00");
      setBis(eintrag.bis?.slice(0, 5) || "16:00");
      setPause(String(eintrag.pause_minuten ?? 0));
      setTaetigkeit(eintrag.taetigkeit || "");
      setArt((eintrag.art as StundenArt) || "arbeit");
      setMehr(!!eintrag.art && eintrag.art !== "arbeit");
    } else {
      setWer(profil?.id ? [profil.id] : []);
      setProjektId(vorProjekt || "");
      setZiel("projekt");
      setIntern("");
      setDatum(vorDatum || isoTag());
      setModus(gemerkt);
      setStd("");
      setStdGetippt(false);
      setTaetigkeit("");
      setArt("arbeit");
      setMehr(false);
    }
    setWeitere([]);
  }, [open, eintrag, vorProjekt, vorDatum, profil?.id]);

  // Buchbar ist nur „In Arbeit“; Garantie auch danach, aber nie auf ein Angebot (wie der DB-Trigger)
  const buchbar = (id: string) => {
    const p = projekte.find((x) => x.id === id);
    return !!p && (p.status === "aktiv" || (art === "garantie" && p.status !== "angebot"));
  };
  const letzteBuchbar = letzte.filter((id) => projekte.some((p) => p.id === id && p.status !== "abgeschlossen"))
    .filter((id) => buchbar(id));

  // Ohne Vorgabe: zuletzt benutztes Projekt vorbelegen — nur eines, auf das man noch buchen kann
  useEffect(() => {
    if (open && !eintrag && !vorProjekt && !projektId && letzteBuchbar[0]) setProjektId(letzteBuchbar[0]);
  }, [open, eintrag, vorProjekt, projektId, letzteBuchbar[0]]);

  const gesperrt = !!eintrag?.rechnung_id;
  // Wen ich buchen darf: Chef alle, Teamleitung ihr Team (Trigger zeit_person_schutz)
  const meineTeams = teams.filter((t) => t.leiter_id === profil?.id);
  const waehlbar = istChef ? mitarbeiter
    : mitarbeiter.filter((m) => m.id === profil?.id || meineTeams.some((t) => t.mitglieder.includes(m.id)));
  // Andere Person einer Buchung zuordnen darf nur der Chef
  const werWaehlbar = waehlbar.length > 1 && (!eintrag || istChef);
  const istIntern = ziel === "intern";
  const internArten = firma?.intern_arten?.length ? firma.intern_arten : ["Büro", "Lager/Werkstatt", "Sonstiges"];
  // Fremde Stunden: nur ansehen (die Datenbank lehnt Ändern ab — still)
  const nurAnsehen = !!eintrag && !gesperrt && !darfZeitAendern(eintrag, profil?.id, istChef);
  const vonBis = modus === "vonbis";
  const bloecke = vonBis ? [{ von, bis, pause, projektId }, ...weitere] : [];
  const blockStunden = (b: { von: string; bis: string; pause: string }) => stundenAusVonBis(b.von, b.bis, zahlLesen(b.pause));
  const ersterBlock = stundenAusVonBis(von, bis, zahlLesen(pause));
  const ergebnis = vonBis ? Math.round(bloecke.reduce((s, b) => s + blockStunden(b), 0) * 100) / 100 : zahlLesen(std);
  const pauseZuLang = vonBis && stundenAusVonBis(von, bis, 0) > 0 && ersterBlock === 0;
  const nacht = vonBis && ueberMitternacht(von, bis);
  const blockPlus = () => {
    const letzter = bloecke[bloecke.length - 1];
    setWeitere((w) => [...w, { id: Math.random().toString(36).slice(2), ...naechsterBlock(letzter), pause: "0", projektId }]);
  };
  const weiterAendern = (id: string, werte: Partial<Weiterer>) => setWeitere((w) => w.map((b) => (b.id === id ? { ...b, ...werte } : b)));

  // Was an diesem Tag schon gebucht ist — Doppelbuchungen fallen sonst erst in der Abrechnung auf
  const werSicht = eintrag?.user_id ?? (userId || profil?.id);
  const { data: tagZeiten = [] } = useQuery({
    queryKey: ["zeiten", "tag", werSicht, datum],
    enabled: open && !!werSicht && !!datum,
    queryFn: async () => {
      const { data, error } = await supabase.from("zeiten").select("id, stunden, projekt_id, von, bis").eq("user_id", werSicht!).eq("datum", datum);
      if (error) throw error;
      return data ?? [];
    },
  });
  const andere = tagZeiten.filter((z) => z.id !== eintrag?.id);
  const tagSumme = andere.reduce((s, z) => s + Number(z.stunden), 0);
  const aufProjekt = andere.filter((z) => z.projekt_id === projektId).reduce((s, z) => s + Number(z.stunden), 0);
  // Schon gebuchte Zeiten, die ein neuer Block überdeckt
  const deckt = andere.find((z) => z.von && z.bis && bloecke.some((b) => b.von && b.bis && ueberschneiden(b, { von: z.von!, bis: z.bis! })));
  const tagHinweis = tagSumme <= 0 || nurAnsehen || gesperrt ? null
    : `An diesem Tag schon ${stundenText(tagSumme)} gebucht${aufProjekt > 0 ? `, davon ${stundenText(aufProjekt)} auf diesem Projekt` : ""}${tagSumme + (ergebnis > 0 ? ergebnis : 0) > 12 ? " — zusammen über 12 Stunden" : ""}.`
      + (deckt ? ` ${deckt.von!.slice(0, 5)}–${deckt.bis!.slice(0, 5)} ist schon gebucht — überschneidet sich.` : "");

  const modusWechseln = (m: Modus) => {
    setModus(m);
    try { localStorage.setItem(MODUS_KEY, m); } catch { /* egal */ }
  };

  const speichern = async () => {
    if (!wer.length) return toast.error("Bitte wählen, für wen gebucht wird.");
    if (!istIntern && !projektId) return toast.error("Bitte ein Projekt wählen.");
    if (istIntern && !intern) return toast.error("Bitte wählen, was intern gemacht wurde (Büro, Lager …).");
    if (!datum) return toast.error("Bitte ein Datum eintragen.");
    // Neue Buchung oder anderes Projekt: vorher sagen, warum es nicht geht (die Datenbank lehnt sonst ab)
    const nichtBuchbar = istIntern ? undefined : [eintrag?.projekt_id === projektId ? "" : projektId, ...(vonBis ? weitere.map((w) => w.projektId) : [])]
      .find((id) => id && !buchbar(id));
    if (nichtBuchbar) {
      const p = projekte.find((x) => x.id === nichtBuchbar);
      const stand = p ? PROJEKT_STATUS[p.status as ProjektStatus]?.text ?? p.status : "unbekannt";
      return toast.error(`Auf ${p ? `${p.nummer} ${p.name}` : "dieses Projekt"} kann nicht gebucht werden — es ist nicht „In Arbeit“ (${stand}).`, {
        description: istChef ? "Im Projekt den Status auf „In Arbeit“ stellen, dann buchen." : "Der Chef stellt es auf „In Arbeit“ — oder ein anderes Projekt wählen.",
      });
    }
    if (datum > isoTag()) return toast.error("Das Datum liegt in der Zukunft — Stunden erst buchen, wenn gearbeitet ist.");
    if (vonBis) {
      for (const [i, b] of bloecke.entries()) {
        const welcher = bloecke.length > 1 ? `${i + 1}. Block: ` : "";
        if (!b.von || !b.bis) return toast.error(`${welcher}Bitte Von und Bis eintragen.`);
        if (zahlLesen(b.pause) < 0) return toast.error(`${welcher}Die Pause kann nicht negativ sein.`);
        if (b.von === b.bis) return toast.error(`${welcher}Von und Bis sind gleich.`);
        if (blockStunden(b) === 0) return toast.error(`${welcher}Die Pause ist länger als die Arbeitszeit.`);
        if (!istIntern && !b.projektId) return toast.error(`${welcher}Bitte ein Projekt wählen.`);
        if (datum === isoTag() && (!eintrag || i > 0)) {
          const jetzt = new Date();
          const inEinerStunde = `${String(Math.min(jetzt.getHours() + 1, 23)).padStart(2, "0")}:${String(jetzt.getMinutes()).padStart(2, "0")}`;
          if (ueberMitternacht(b.von, b.bis) || b.bis > inEinerStunde) return toast.error(`Die Arbeit endet erst um ${b.bis} — Stunden buchen, wenn gearbeitet ist.`);
        }
      }
      const paar = ersteUeberschneidung(bloecke);
      if (paar) return toast.error(`Block ${paar[0] + 1} und ${paar[1] + 1} überschneiden sich.`);
    }
    if (!(ergebnis > 0 && ergebnis <= 24)) return toast.error("Bitte die Stunden eintragen — mehr als 0 und höchstens 24.");
    setSpeichert(true);
    // Mehr als 24 h an einem Tag für eine Person geht nicht — meist doppelt gebucht
    let tagQ = supabase.from("zeiten").select("user_id, stunden").in("user_id", wer).eq("datum", datum);
    if (eintrag) tagQ = tagQ.neq("id", eintrag.id);
    const { data: tag } = await tagQ;
    for (const u of wer) {
      const schon = (tag ?? []).filter((z) => z.user_id === u).reduce((s, z) => s + Number(z.stunden), 0);
      if (schon + ergebnis > 24) {
        setSpeichert(false);
        const m = mitarbeiter.find((x) => x.id === u);
        return toast.error(`${wer.length > 1 && m ? `${m.vorname}: a` : "A"}m ${datumText(datum)} sind schon ${stundenText(schon)} gebucht — zusammen mehr als 24 h.`);
      }
    }
    // Eine Zeile je Block und Person — alle Felder in jeder Zeile (Sammel-Insert setzt fehlende sonst auf NULL)
    const zeile = (b: { von: string; bis: string; pause: string; projektId: string } | null, fuer = wer[0]) => ({
      user_id: fuer,
      projekt_id: istIntern ? null : b?.projektId ?? projektId,
      intern: istIntern ? intern : null,
      datum,
      stunden: b ? blockStunden(b) : ergebnis,
      von: b ? b.von : null,
      bis: b ? b.bis : null,
      pause_minuten: b ? Math.round(zahlLesen(b.pause)) : 0,
      taetigkeit: taetigkeit.trim() || null,
      art,
    });
    const erste = zeile(vonBis ? bloecke[0] : null);
    const { data: zeilen, error } = eintrag
      ? await supabase.from("zeiten").update(erste).eq("id", eintrag.id).select("id")
      : await supabase.from("zeiten").insert(erste).select("id");
    if (error) { setSpeichert(false); return toast.error("Nicht gespeichert", { description: fehlerText(error) }); }
    if (!zeilen?.length) { setSpeichert(false); return toast.error("Nicht gespeichert — ändern kann das nur, wer gebucht hat, oder der Chef."); }
    // Weitere Blöcke der ersten Person, dann alle Blöcke der übrigen Personen
    const rest = [
      ...(vonBis ? weitere.map((b) => zeile(b)) : []),
      ...(eintrag ? [] : wer.slice(1).flatMap((u) => (vonBis ? bloecke.map((b) => zeile(b, u)) : [zeile(null, u)]))),
    ];
    if (rest.length) {
      const { error: e2 } = await supabase.from("zeiten").insert(rest);
      if (e2) {
        setSpeichert(false);
        await neuLaden("zeiten", "projekt_zahlen");
        return toast.error(`Der erste Eintrag ist gebucht, die weiteren nicht: ${fehlerText(e2)}`);
      }
    }
    setSpeichert(false);
    toast.success(`Gebucht · ${stundenText(ergebnis)}${vonBis && weitere.length ? ` in ${bloecke.length} Blöcken` : ""}${wer.length > 1 ? ` für ${wer.length} Personen` : ""}`);
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

        {werWaehlbar && !gesperrt && (
          <div className="space-y-2">
            <Label>Für wen?{!eintrag && <span className="font-normal text-muted-foreground"> — mehrere antippen: je Person eine Buchung</span>}</Label>
            <PersonenWahl personen={waehlbar} teams={istChef ? teams : meineTeams} gewaehlt={wer} onChange={setWer}
              ich={profil?.id} einzeln={!!eintrag} label="Für wen" />
          </div>
        )}
        {eintrag && !werWaehlbar && eintrag.user_id !== profil?.id && (
          <p className="text-sm text-muted-foreground">Für {name(mitarbeiter.find((m) => m.id === eintrag.user_id))}</p>
        )}

        <div className="inline-flex rounded-md border bg-secondary p-0.5" role="group" aria-label="Projekt oder intern">
          {([["projekt", "Projekt"], ["intern", "Intern (Büro, Lager …)"]] as [Ziel, string][]).map(([z, t]) => (
            <button key={z} type="button" onClick={() => setZiel(z)} aria-pressed={ziel === z} disabled={gesperrt || nurAnsehen}
              className={cn("min-h-11 rounded px-4 py-2 text-sm font-medium transition-colors",
                ziel === z ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground")}>
              {t}
            </button>
          ))}
        </div>

        {istIntern ? (
          <div className="space-y-2">
            <Label>Was wurde intern gemacht?</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Interne Art">
              {[...internArten, ...(intern && !internArten.includes(intern) ? [intern] : [])].map((a) => (
                <button key={a} type="button" role="radio" aria-checked={intern === a} onClick={() => setIntern(a)}
                  className={cn("min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    intern === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                  {a}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Zählt als unproduktive Zeit — nicht auf einem Projekt, nie auf einer Rechnung.</p>
          </div>
        ) : (
        <div className="space-y-2">
          <Label htmlFor="z-projekt">Projekt</Label>
          {!eintrag && letzteBuchbar.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {letzteBuchbar.map((id) => {
                const p = projekte.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button key={id} type="button" onClick={() => setProjektId(id)}
                    className={cn("min-h-11 max-w-full truncate rounded-full border px-3.5 py-2 text-sm",
                      projektId === id ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-muted")}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          <ProjektWahl id="z-projekt" nurInArbeit={art !== "garantie"} wert={projektId} onChange={(id) => setProjektId(id)} />
        </div>
        )}

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
                className={cn("min-h-11 rounded px-4 py-2 text-sm font-medium transition-colors",
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
              {weitere.map((b, i) => (
                <div key={b.id} className="col-span-3 space-y-2 border-t pt-3" data-block={i + 2}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{i + 2}. Block · {stundenText(blockStunden(b))}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={`${i + 2}. Block entfernen`}
                      onClick={() => setWeitere((w) => w.filter((x) => x.id !== b.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="time" className="h-12" aria-label={`Von, ${i + 2}. Block`} value={b.von} onChange={(e) => weiterAendern(b.id, { von: e.target.value })} />
                    <Input type="time" className="h-12" aria-label={`Bis, ${i + 2}. Block`} value={b.bis} onChange={(e) => weiterAendern(b.id, { bis: e.target.value })} />
                    <Input inputMode="numeric" className="h-12" aria-label={`Pause in Minuten, ${i + 2}. Block`} value={b.pause} onChange={(e) => weiterAendern(b.id, { pause: e.target.value })} />
                  </div>
                  {!istIntern && <select aria-label={`Projekt, ${i + 2}. Block`} value={b.projektId} onChange={(e) => weiterAendern(b.id, { projektId: e.target.value })}
                    className="h-11 w-full rounded-md border border-input bg-background px-2 text-base md:[@media(pointer:fine)]:text-sm">
                    {!projekte.some((p) => p.id === b.projektId) && <option value={b.projektId}>Projekt wählen</option>}
                    {projekte.filter((p) => p.status === "aktiv" || (art === "garantie" && p.status !== "angebot") || p.id === b.projektId).map((p) => (
                      <option key={p.id} value={p.id}>{p.id === projektId ? "Gleiches Projekt — " : ""}{p.nummer} {p.name}</option>
                    ))}
                  </select>}
                </div>
              ))}
              {!gesperrt && !nurAnsehen && (
                <Button type="button" variant="outline" className="col-span-3 h-11 gap-1.5" onClick={blockPlus}>
                  <Plus className="h-4 w-4" /> Weiterer Block <span className="font-normal text-muted-foreground">{istIntern ? "(z. B. nach Mittag)" : "(z. B. nach Mittag, anderes Projekt)"}</span>
                </Button>
              )}
              <p className={cn("col-span-3 text-sm", pauseZuLang ? "text-destructive" : "text-muted-foreground")}>
                {pauseZuLang
                  ? "Die Pause ist länger als die Arbeitszeit."
                  : <>{weitere.length ? "Zusammen" : "Ergibt"} <strong className="text-foreground">{stundenText(ergebnis)}</strong>{nacht && " — über Mitternacht"}</>}
              </p>
            </div>
          )}
        </div>

        {tagHinweis && <p className="rounded-md border border-status-gelb bg-status-gelb/40 px-3 py-2 text-sm" role="status">{tagHinweis}</p>}

        <div className="space-y-2">
          {mehr ? (
            <>
              <Label>Art der Stunden</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Art der Stunden">
                {(Object.keys(STUNDEN_ART) as StundenArt[]).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={art === a} onClick={() => setArt(a)}
                    className={cn("min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                    {STUNDEN_ART[a].text}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={() => setMehr(true)}>
              Fahrzeit, Überstunden, Garantie …
            </button>
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
