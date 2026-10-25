import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormularDialog } from "@/components/FormularDialog";
import { useDiktat } from "@/components/DiktatKnopf";
import { zahlLesen } from "@/lib/format";
import { sprachZerlegen, type KatalogEintrag, type SprachPosten } from "@/lib/sprachParser";
import { TON_KLASSE } from "@/lib/types";
import { cn } from "@/lib/utils";
import { zahlText, type KatalogLeistung } from "./editor";

/** Was der Mensch bestätigt hat — daraus macht der Editor Positionen */
export type SprachUebernahme = {
  raum: string | null;
  leistung: KatalogLeistung | null;
  menge: number;
  einheit: string | null;
  /** Bezeichnung einer freien Position (wenn keine Leistung) */
  text: string;
};

type Aenderung = { aktiv?: boolean; menge?: string; leistungId?: string | null };
const FREI = "__frei__";

/**
 * Angebot per Sprache: diktieren (oder tippen), der Parser schlägt Räume,
 * Mengen und Leistungen vor, der Mensch hakt ab und korrigiert —
 * übernommen wird erst mit dem Knopf.
 */
export function SpracheDialog({
  open, onOpenChange, katalog, autoStart, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  katalog: KatalogLeistung[];
  autoStart: boolean;
  onUebernehmen: (posten: SprachUebernahme[]) => void;
}) {
  const [text, setText] = useState("");
  const [aenderungen, setAenderungen] = useState<Record<string, Aenderung>>({});
  const diktat = useDiktat((t) => setText((alt) => (alt.trim() ? `${alt.trimEnd()}\n${t}` : t)));
  const gestartet = useRef(false);

  // Beim Öffnen gleich zuhören (einmal je Öffnen); beim Schließen aufhören
  const { moeglich, aktiv, start, stop } = diktat;
  useEffect(() => {
    if (open && autoStart && !gestartet.current && moeglich) {
      gestartet.current = true;
      start();
    }
    if (!open) {
      gestartet.current = false;
      if (aktiv) stop();
    }
  }, [open, autoStart, moeglich, aktiv, start, stop]);

  const eintraege = useMemo<KatalogEintrag[]>(
    () => katalog.map((l) => ({ id: l.id, kurztext: l.kurztext, suchwoerter: l.suchwoerter, einheit: l.einheit, reihenfolge: l.reihenfolge })),
    [katalog],
  );
  const posten = useMemo(() => sprachZerlegen(text, eintraege), [text, eintraege]);
  const nachId = useMemo(() => new Map(katalog.map((l) => [l.id, l])), [katalog]);
  const kategorien = useMemo(() => {
    const m = new Map<string, KatalogLeistung[]>();
    katalog.forEach((l) => m.set(l.kategorie || "Sonstiges", [...(m.get(l.kategorie || "Sonstiges") ?? []), l]));
    return [...m.entries()];
  }, [katalog]);

  const stand = (p: SprachPosten) => {
    const a = aenderungen[p.key] ?? {};
    const leistungId = a.leistungId !== undefined ? a.leistungId : p.leistungId;
    return {
      aktiv: a.aktiv ?? p.leistungId != null,
      menge: a.menge ?? zahlText(p.menge),
      leistungId,
    };
  };
  const aendern = (key: string, a: Aenderung) => setAenderungen((alt) => ({ ...alt, [key]: { ...alt[key], ...a } }));

  const gewaehlt = posten.filter((p) => stand(p).aktiv && zahlLesen(stand(p).menge) > 0);

  const uebernehmen = () => {
    diktat.stop();
    onUebernehmen(gewaehlt.map((p) => {
      const s = stand(p);
      const beschreibung = (p.beschreibung || p.text).trim();
      return {
        raum: p.raum,
        leistung: s.leistungId ? nachId.get(s.leistungId) ?? null : null,
        menge: zahlLesen(s.menge),
        einheit: p.einheit,
        text: beschreibung.charAt(0).toUpperCase() + beschreibung.slice(1),
      };
    }));
    setText("");
    setAenderungen({});
    onOpenChange(false);
  };

  // Vorschläge nach Raum gruppieren, Reihenfolge wie gesagt
  const gruppen: { raum: string | null; liste: SprachPosten[] }[] = [];
  posten.forEach((p) => {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.raum === p.raum) letzte.liste.push(p);
    else gruppen.push({ raum: p.raum, liste: [p] });
  });

  return (
    <FormularDialog
      open={open}
      onOpenChange={(o) => { if (!o) diktat.stop(); onOpenChange(o); }}
      titel="Per Sprache erfassen"
      beschreibung="Räume und Mengen sagen — z. B. „Küche: 6 Steckdosen, 2 Wechselschalter, 1 Herdanschluss“"
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button className="h-12" disabled={!gewaehlt.length} onClick={uebernehmen}>
            {!gewaehlt.length ? "Übernehmen" : gewaehlt.length === 1 ? "1 Position übernehmen" : `${gewaehlt.length} Positionen übernehmen`}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col items-center gap-2 pt-1">
        <button
          type="button"
          onClick={diktat.aktiv ? diktat.stop : diktat.start}
          aria-label={diktat.aktiv ? "Diktat beenden" : "Diktieren"}
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95",
            diktat.aktiv && "ring-8 ring-primary/25",
          )}
        >
          {diktat.aktiv && <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />}
          {diktat.aktiv ? <MicOff className="relative h-8 w-8" /> : <Mic className="relative h-8 w-8" />}
        </button>
        <p className="text-sm font-medium">
          {diktat.aktiv ? "Ich höre zu … zum Beenden antippen" : diktat.moeglich ? "Zum Sprechen antippen" : "Mikrofon der Tastatur verwenden"}
        </p>
        {diktat.aktiv && diktat.zwischen && <p className="max-w-md text-center text-sm italic text-muted-foreground">„{diktat.zwischen}“</p>}
        {diktat.fehler && <p className="max-w-md text-center text-sm text-destructive">{diktat.fehler}</p>}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"Gesagtes erscheint hier — oder einfach tippen:\nKüche: 6 Steckdosen, 2 Wechselschalter\nBad: 1 Lüfter, Potentialausgleich"}
        className="text-base"
      />

      {posten.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Vorschläge — bitte prüfen</p>
          {gruppen.map((g, gi) => (
            <section key={`${g.raum ?? "-"}-${gi}`} className="space-y-1.5">
              <h3 className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{g.raum ?? "Ohne Raum"}</h3>
              <ul className="divide-y rounded-lg border bg-card">
                {g.liste.map((p) => {
                  const s = stand(p);
                  return (
                    <li key={p.key} className={cn("space-y-1.5 p-2.5", !s.aktiv && "bg-muted/40")}>
                      <div className="flex items-center gap-2">
                        <label className="flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center">
                          <Checkbox
                            checked={s.aktiv}
                            onCheckedChange={(v) => aendern(p.key, { aktiv: !!v })}
                            className="h-5 w-5"
                            aria-label="übernehmen"
                          />
                        </label>
                        <Input
                          value={s.menge}
                          onChange={(e) => aendern(p.key, { menge: e.target.value, aktiv: true })}
                          inputMode="decimal"
                          className="zahl h-11 w-16 shrink-0 text-right"
                          aria-label="Menge"
                        />
                        <Select
                          value={s.leistungId ?? FREI}
                          onValueChange={(v) => aendern(p.key, { leistungId: v === FREI ? null : v, aktiv: true })}
                        >
                          <SelectTrigger className="h-11 min-w-0 flex-1 text-left">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[60dvh]">
                            {/* Auch ein eindeutiger Treffer braucht seinen Eintrag — sonst bleibt die Auswahl leer */}
                            {(p.leistungId || p.alternativen.length > 0) && (
                              <SelectGroup>
                                <SelectLabel>{p.alternativen.length ? "Passt vielleicht" : "Erkannt"}</SelectLabel>
                                {[p.leistungId, ...p.alternativen].filter((x): x is string => !!x && nachId.has(x)).map((id) => (
                                  <SelectItem key={`v-${id}`} value={id}>{nachId.get(id)!.kurztext}</SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              <SelectItem value={FREI}>Freie Position: „{p.beschreibung || p.text}“</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            {kategorien.map(([k, liste]) => (
                              <SelectGroup key={k}>
                                <SelectLabel>{k}</SelectLabel>
                                {liste
                                  .filter((l) => l.id !== p.leistungId && !p.alternativen.includes(l.id))
                                  .map((l) => <SelectItem key={l.id} value={l.id}>{l.kurztext}</SelectItem>)}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pl-11 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">„{p.text}“</span>
                        {p.leistungId == null && s.leistungId == null && (
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-semibold", TON_KLASSE.gelb)}>nicht erkannt</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Nicht Erkanntes ist nicht angehakt — Leistung wählen oder als freie Position übernehmen (Preis danach eintragen).
          </p>
        </div>
      )}
    </FormularDialog>
  );
}
