import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Gruppentitel, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Feld, leerNull, useBeimOeffnen, zahlFeld, Zusatz } from "@/components/stamm/Felder";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useLagerorte, useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, dezimalLesen, euro, isoTag } from "@/lib/format";
import { faelligkeiten, faelligText, pruefungText } from "@/lib/fuhrpark";
import { FAHRZEUG_ART, FAHRZEUG_EINTRAG, name, type Fahrzeug, type FahrzeugArt, type FahrzeugEintrag } from "@/lib/types";
import { datumKurz } from "@/lib/format";
import { cn } from "@/lib/utils";

type Werte = {
  name: string; art: FahrzeugArt; kennzeichen: string; typ: string; baujahr: string; km_stand: string;
  pickerl_bis: string; service_bis: string; pruefung_bis: string; lagerort_id: string; gemietet: boolean; notiz: string;
};

const werteAus = (f: Fahrzeug | null, art: FahrzeugArt): Werte => ({
  name: f?.name ?? "",
  art: (f?.art as FahrzeugArt) ?? art,
  kennzeichen: f?.kennzeichen ?? "",
  typ: f?.typ ?? "",
  baujahr: f?.baujahr ? String(f.baujahr) : "",
  km_stand: f?.km_stand != null ? String(f.km_stand) : "",
  pickerl_bis: f?.pickerl_bis ?? "",
  service_bis: f?.service_bis ?? "",
  pruefung_bis: f?.pruefung_bis ?? "",
  lagerort_id: f?.lagerort_id ?? "",
  gemietet: f?.gemietet ?? false,
  notiz: f?.notiz ?? "",
});

/**
 * Fahrzeug oder Gerät: Stammdaten (nur Chef), Fälligkeiten und Bordbuch.
 * Monteure sehen alles und melden Schäden.
 */
export function FahrzeugDialog({
  open, onOpenChange, fahrzeug, neueArt = "bus",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = neu */
  fahrzeug: Fahrzeug | null;
  neueArt?: FahrzeugArt;
}) {
  const neuLaden = useNeuLaden();
  const { istChef } = useSitzung();
  const { data: lagerorte = [] } = useLagerorte();
  const [w, setW] = useState<Werte>(werteAus(null, neueArt));
  const [basis, setBasis] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [eintrag, setEintrag] = useState<"neu" | null>(null);
  const setz = (teil: Partial<Werte>) => setW((x) => ({ ...x, ...teil }));

  useBeimOeffnen(open ? fahrzeug?.id ?? `neu-${neueArt}` : null, () => {
    const v = werteAus(fahrzeug, neueArt);
    setW(v);
    setBasis(JSON.stringify(v));
    setEintrag(null);
  });

  const { data: eintraege = [] } = useQuery({
    queryKey: ["fahrzeuge", "bordbuch", fahrzeug?.id],
    enabled: open && !!fahrzeug,
    queryFn: async () => {
      const { data, error } = await supabase.from("fahrzeug_eintraege").select("*").eq("fahrzeug_id", fahrzeug!.id)
        .order("datum", { ascending: false }).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as FahrzeugEintrag[];
    },
  });
  const { data: mitarbeiter = [] } = useMitarbeiter();

  const mitKennzeichen = FAHRZEUG_ART[w.art].mitKennzeichen;
  const darf = istChef;

  const speichern = async () => {
    if (!w.name.trim()) return toast.error("Bitte einen Namen eingeben, z. B. „Bus 3“ oder „Steiger 12 m“.");
    const baujahr = w.baujahr.trim() ? Number(w.baujahr) : null;
    if (baujahr !== null && (!Number.isInteger(baujahr) || baujahr < 1950 || baujahr > 2100)) return toast.error("Baujahr bitte als Jahreszahl, z. B. 2021.");
    const km = w.km_stand.trim() ? dezimalLesen(w.km_stand) : null;
    if (km !== null && km < 0) return toast.error("Der Kilometerstand kann nicht negativ sein.");
    setSpeichert(true);
    const daten = {
      name: w.name.trim(),
      art: w.art,
      kennzeichen: mitKennzeichen ? leerNull(w.kennzeichen)?.toUpperCase() ?? null : null,
      typ: leerNull(w.typ),
      baujahr,
      km_stand: km === null ? null : Math.round(km),
      pickerl_bis: mitKennzeichen ? w.pickerl_bis || null : null,
      service_bis: w.service_bis || null,
      pruefung_bis: w.pruefung_bis || null,
      lagerort_id: w.art === "bus" ? w.lagerort_id || null : null,
      gemietet: w.gemietet,
      notiz: leerNull(w.notiz),
    };
    const { error } = fahrzeug
      ? await supabase.from("fahrzeuge").update(daten).eq("id", fahrzeug.id)
      : await supabase.from("fahrzeuge").insert(daten);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(fahrzeug ? "Gespeichert" : `${FAHRZEUG_ART[w.art].text} angelegt`);
    await neuLaden("fahrzeuge");
    onOpenChange(false);
  };

  const stilllegen = async () => {
    if (!fahrzeug) return;
    setSpeichert(true);
    const { error } = await supabase.from("fahrzeuge").update({ aktiv: !fahrzeug.aktiv }).eq("id", fahrzeug.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(fahrzeug.aktiv ? "Stillgelegt — erscheint nicht mehr auf der Plantafel" : "Wieder in Betrieb");
    await neuLaden("fahrzeuge");
    onOpenChange(false);
  };

  const faellig = fahrzeug ? faelligkeiten(fahrzeug, isoTag()) : [];

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={fahrzeug ? fahrzeug.name : `${FAHRZEUG_ART[w.art].text} anlegen`}
      beschreibung={fahrzeug ? [FAHRZEUG_ART[fahrzeug.art as FahrzeugArt]?.text, fahrzeug.kennzeichen, fahrzeug.typ].filter(Boolean).join(" · ") : undefined}
      gesperrt={speichert}
      ungespeichert={darf && JSON.stringify(w) !== basis}
      fuss={darf ? (
        <>
          {fahrzeug && (
            <Button variant="ghost" className="h-12 sm:mr-auto" onClick={stilllegen} disabled={speichert}>
              {fahrzeug.aktiv ? "Stilllegen" : "Wieder in Betrieb"}
            </Button>
          )}
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-32" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      ) : (
        <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Schließen</Button>
      )}
    >
      <div className="max-w-2xl space-y-5">
        {faellig.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {faellig.map((x) => <StatusPille key={x.was} eintrag={{ ton: x.ueberfaellig ? "rot" : "gelb", text: faelligText(x, datumKurz) }} />)}
          </div>
        )}

        <fieldset disabled={!darf} className="space-y-4">
          <div className="space-y-2">
            <Label>Art</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FAHRZEUG_ART) as FahrzeugArt[]).map((a) => (
                <button key={a} type="button" aria-pressed={w.art === a} onClick={() => setz({ art: a })}
                  className={cn("min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    w.art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                  {FAHRZEUG_ART[a].text}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld id="f-name" label="Name">
              <Input id="f-name" className="h-11" value={w.name} onChange={(e) => setz({ name: e.target.value })}
                placeholder={w.art === "steiger" ? "z. B. Steiger 14 m" : w.art === "bus" ? "z. B. Bus 3" : "z. B. Kernbohrgerät"} />
            </Feld>
            {mitKennzeichen && (
              <Feld id="f-kz" label="Kennzeichen">
                <Input id="f-kz" className="h-11 uppercase" value={w.kennzeichen} onChange={(e) => setz({ kennzeichen: e.target.value })} placeholder="z. B. KL-123 AB" />
              </Feld>
            )}
            <Feld id="f-typ" label={<>Marke und Typ<Zusatz>(optional)</Zusatz></>}>
              <Input id="f-typ" className="h-11" value={w.typ} onChange={(e) => setz({ typ: e.target.value })} />
            </Feld>
            <div className="grid grid-cols-2 gap-2">
              <Feld id="f-bj" label="Baujahr">
                <Input id="f-bj" className="zahl h-11" inputMode="numeric" value={w.baujahr} onChange={(e) => setz({ baujahr: e.target.value })} />
              </Feld>
              {mitKennzeichen && (
                <Feld id="f-km" label="km-Stand">
                  <Input id="f-km" className="zahl h-11" inputMode="numeric" value={w.km_stand} onChange={(e) => setz({ km_stand: e.target.value })} />
                </Feld>
              )}
            </div>
          </div>

          <Gruppentitel className="pb-0">Fällig</Gruppentitel>
          <div className="grid gap-3 sm:grid-cols-3">
            {mitKennzeichen && (
              <Feld id="f-pickerl" label="Pickerl (§57a) bis">
                <Input id="f-pickerl" type="date" className="h-11" value={w.pickerl_bis} onChange={(e) => setz({ pickerl_bis: e.target.value })} />
              </Feld>
            )}
            <Feld id="f-service" label="Service bis">
              <Input id="f-service" type="date" className="h-11" value={w.service_bis} onChange={(e) => setz({ service_bis: e.target.value })} />
            </Feld>
            <Feld id="f-pruef" label={`${pruefungText(w.art)} bis`}>
              <Input id="f-pruef" type="date" className="h-11" value={w.pruefung_bis} onChange={(e) => setz({ pruefung_bis: e.target.value })} />
            </Feld>
          </div>

          {w.art === "bus" && (
            <Feld id="f-lager" label="Lager im Bus" hinweis="Das Material im Bus steht im Lager unter diesem Lagerort.">
              <Select value={w.lagerort_id || "_"} onValueChange={(v) => setz({ lagerort_id: v === "_" ? "" : v })}>
                <SelectTrigger id="f-lager" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">Kein Lager</SelectItem>
                  {lagerorte.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Feld>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <Label htmlFor="f-miete" className="cursor-pointer">
              <span className="block text-sm font-medium">Gemietet</span>
              <span className="block text-xs font-normal text-muted-foreground">z. B. Steiger vom Verleih — auf der Plantafel, ohne Service und Pickerl</span>
            </Label>
            <Switch id="f-miete" checked={w.gemietet} onCheckedChange={(gemietet) => setz({ gemietet })} />
          </div>

          <Feld id="f-notiz" label={<>Notiz<Zusatz>(optional, z. B. Reifen, Werkzeug an Bord)</Zusatz></>}>
            <Textarea id="f-notiz" rows={2} value={w.notiz} onChange={(e) => setz({ notiz: e.target.value })} />
          </Feld>
        </fieldset>

        {fahrzeug && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Gruppentitel className="pb-0">Bordbuch</Gruppentitel>
              <Button variant="outline" className="h-11 gap-1.5" onClick={() => setEintrag("neu")}>
                <Plus className="h-4 w-4" /> {istChef ? "Eintrag" : "Schaden melden"}
              </Button>
            </div>
            {eintraege.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Noch nichts eingetragen.</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {eintraege.map((e) => (
                  <EintragZeile key={e.id} e={e} von={name(mitarbeiter.find((m) => m.id === e.erstellt_von))} istChef={istChef} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {fahrzeug && (
        <EintragDialog open={eintrag !== null} onOpenChange={(o) => !o && setEintrag(null)} fahrzeug={fahrzeug} />
      )}
    </FormularDialog>
  );
}

function EintragZeile({ e, von, istChef }: { e: FahrzeugEintrag; von: string; istChef: boolean }) {
  const neuLaden = useNeuLaden();
  const umschalten = async () => {
    const { error } = await supabase.from("fahrzeug_eintraege").update({ erledigt: !e.erledigt }).eq("id", e.id);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("fahrzeuge");
  };
  const loeschen = async () => {
    const { error } = await supabase.from("fahrzeug_eintraege").delete().eq("id", e.id);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    await neuLaden("fahrzeuge");
  };
  return (
    <li className="flex items-start gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPille eintrag={FAHRZEUG_EINTRAG[e.art]} />
          {e.art === "schaden" && !e.erledigt && <StatusPille eintrag={{ ton: "gelb", text: "Offen" }} />}
          <span className="text-xs text-muted-foreground">{datum(e.datum)}{von ? ` · ${von}` : ""}{e.km != null ? ` · ${e.km.toLocaleString("de-AT")} km` : ""}</span>
        </div>
        <p className="whitespace-pre-line">{e.text}</p>
      </div>
      {e.kosten != null && <span className="zahl shrink-0 font-medium">{euro(Number(e.kosten))}</span>}
      {istChef && (
        <span className="flex shrink-0 gap-1">
          {e.art === "schaden" && (
            <Button variant="outline" className="h-9 px-2.5 text-xs" onClick={umschalten}>{e.erledigt ? "Wieder offen" : "Behoben"}</Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Eintrag löschen" onClick={loeschen}><Trash2 className="h-4 w-4" /></Button>
        </span>
      )}
    </li>
  );
}

/** Neuer Bordbuch-Eintrag. Monteure: nur Schaden oder Tanken. */
function EintragDialog({ open, onOpenChange, fahrzeug }: { open: boolean; onOpenChange: (o: boolean) => void; fahrzeug: Fahrzeug }) {
  const neuLaden = useNeuLaden();
  const { istChef, profil } = useSitzung();
  const arten = istChef ? Object.keys(FAHRZEUG_EINTRAG) : ["schaden", "tanken"];
  const [art, setArt] = useState(istChef ? "service" : "schaden");
  const [text, setText] = useState("");
  const [tag, setTag] = useState(isoTag());
  const [km, setKm] = useState("");
  const [kosten, setKosten] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useBeimOeffnen(open ? "offen" : null, () => {
    setArt(istChef ? "service" : "schaden");
    setText("");
    setTag(isoTag());
    setKm(fahrzeug.km_stand != null ? String(fahrzeug.km_stand) : "");
    setKosten("");
  });

  const speichern = async () => {
    if (!text.trim()) return toast.error(art === "schaden" ? "Bitte kurz beschreiben, was kaputt ist." : "Bitte kurz beschreiben, was gemacht wurde.");
    const kmZahl = km.trim() ? dezimalLesen(km) : null;
    const kostenZahl = kosten.trim() ? dezimalLesen(kosten) : null;
    if ((kmZahl !== null && kmZahl < 0) || (kostenZahl !== null && kostenZahl < 0)) return toast.error("Kilometer und Kosten können nicht negativ sein.");
    setSpeichert(true);
    const { error } = await supabase.from("fahrzeug_eintraege").insert({
      fahrzeug_id: fahrzeug.id, art, text: text.trim(), datum: tag, km: kmZahl === null ? null : Math.round(kmZahl),
      kosten: kostenZahl, erledigt: art !== "schaden", erstellt_von: profil?.id,
    });
    // km-Stand mitziehen, wenn er höher ist (nur Chef darf das Fahrzeug ändern)
    if (!error && istChef && kmZahl !== null && kmZahl > (fahrzeug.km_stand ?? 0)) {
      await supabase.from("fahrzeuge").update({ km_stand: Math.round(kmZahl) }).eq("id", fahrzeug.id);
    }
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(art === "schaden" ? "Schaden gemeldet — der Chef sieht es" : "Eingetragen");
    await neuLaden("fahrzeuge");
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel={istChef ? "Bordbuch-Eintrag" : "Schaden melden"} beschreibung={fahrzeug.name}
      gesperrt={speichert} ungespeichert={!!text.trim()}
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
          <Button className="h-12 min-w-32" onClick={speichern} disabled={speichert}>
            {speichert && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern
          </Button>
        </>
      )}>
      <div className="max-w-xl space-y-4">
        <div className="flex flex-wrap gap-2">
          {arten.map((a) => (
            <button key={a} type="button" aria-pressed={art === a} onClick={() => setArt(a)}
              className={cn("min-h-11 rounded-full border px-3.5 text-sm font-medium", art === a ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
              {FAHRZEUG_EINTRAG[a].text}
            </button>
          ))}
        </div>
        <Feld id="b-text" label={art === "schaden" ? "Was ist kaputt?" : "Was wurde gemacht?"}>
          <Textarea id="b-text" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={art === "schaden" ? "z. B. Seitenspiegel rechts gebrochen" : "z. B. Ölwechsel, Bremsen vorne"} />
        </Feld>
        <div className="grid grid-cols-3 gap-2">
          <Feld id="b-datum" label="Datum"><Input id="b-datum" type="date" className="h-11" value={tag} onChange={(e) => setTag(e.target.value)} /></Feld>
          <Feld id="b-km" label="km"><Input id="b-km" className="zahl h-11" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Feld>
          <Feld id="b-kosten" label="Kosten €"><Input id="b-kosten" className="zahl h-11 text-right" inputMode="decimal" value={kosten} onChange={(e) => setKosten(e.target.value)} placeholder={zahlFeld(null)} /></Feld>
        </div>
      </div>
    </FormularDialog>
  );
}
