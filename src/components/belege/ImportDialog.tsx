import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormularDialog } from "@/components/FormularDialog";
import { Leer, StatusBadge } from "@/components/Bausteine";
import { datum, euro, stunden, zahl, zahlLesen } from "@/lib/format";
import type { Firma } from "@/lib/types";
import { TON_KLASSE } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ohneBetrag, summen, type EditorPosition, type Quelle } from "./editor";
import { ABGEGOLTEN_TEXT, importDatenLaden, importPositionen, materialGruppen, type ImportAuswahl } from "./importieren";

export type ImportErgebnis = { positionen: EditorPosition[]; von: string | null; bis: string | null; angebotId: string | null };

/**
 * Assistent „Aus dem Projekt übernehmen“: zeigt alles Offene — Angebot,
 * unterschriebene Regieberichte, Stunden ohne Bericht, verbrauchtes
 * Material — zum Anhaken. Mit Angebot sind Stunden und Material nicht
 * vorgewählt (stecken meist im Angebotspreis) und gelten als abgegolten.
 */
export function ImportDialog({
  open, onOpenChange, projektId, belegId, belegt, angebotId, stundensatzStart, firma, vorhandeneTitel, onUebernehmen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projektId: string | null;
  belegId: string | null;
  belegt: Quelle;
  /** Angebot, das schon in diesem Entwurf steckt (auch ungespeichert) */
  angebotId: string | null;
  stundensatzStart: number;
  firma: Firma | null;
  vorhandeneTitel: boolean;
  onUebernehmen: (e: ImportErgebnis) => void;
}) {
  const belegtSchluessel = [...belegt.zeiten, ...belegt.material, ...belegt.regie, ...(belegt.eingang ?? [])].sort().join(",");
  const { data, isLoading, error } = useQuery({
    queryKey: ["belege", "import", projektId, belegId, belegtSchluessel, angebotId],
    enabled: open && !!projektId,
    staleTime: 0,
    refetchOnMount: "always",
    // sonst setzt ein Fensterwechsel die Häkchen zurück
    refetchOnWindowFocus: false,
    queryFn: () => importDatenLaden(projektId!, belegId, belegt, angebotId),
  });

  const [auswahl, setAuswahl] = useState<Required<ImportAuswahl>>({ angebote: [], regie: [], zeiten: [], material: [], eingang: [] });
  const [jeMitarbeiter, setJeMitarbeiter] = useState(true);
  const [pauschale, setPauschale] = useState(false);
  const [abgegolten, setAbgegolten] = useState(true);
  const [satz, setSatz] = useState(String(stundensatzStart).replace(".", ","));
  const [aufschlag, setAufschlag] = useState(String(firma?.material_aufschlag ?? 0).replace(".", ","));

  const gruppen = useMemo(() => (data ? materialGruppen(data.material, firma) : []), [data, firma]);

  // Vorauswahl, sobald die Daten da sind
  useEffect(() => {
    if (!data || !open) return;
    const mitAngebot = data.angebote.length > 0 || !!data.angebotImEntwurf;
    setAuswahl({
      angebote: data.angebote.map((a) => a.id),
      regie: data.regie.map((r) => r.id),
      zeiten: mitAngebot ? [] : data.zeiten.map((z) => z.id),
      material: mitAngebot ? [] : gruppen.map((g) => g.schluessel),
      // Eingangsrechnungen nie vorgewählt: Material daraus ist oft schon ausgefasst und gebucht
      eingang: [],
    });
  }, [data, gruppen, open]);
  useEffect(() => {
    if (!open) return;
    setSatz(String(stundensatzStart).replace(".", ","));
    setAbgegolten(true);
    setAufschlag(String(firma?.material_aufschlag ?? 0).replace(".", ","));
  }, [open, stundensatzStart, firma?.material_aufschlag]);

  const vorschau = useMemo(
    () => (data
      ? importPositionen(data, auswahl, {
        stundenJeMitarbeiter: jeMitarbeiter, materialPauschale: pauschale, stundensatz: zahlLesen(satz), abgegolten,
        eingangAufschlag: zahlLesen(aufschlag),
      }, firma, vorhandeneTitel)
      : null),
    [data, auswahl, jeMitarbeiter, pauschale, satz, abgegolten, aufschlag, firma, vorhandeneTitel],
  );
  const netto = vorschau ? summen(vorschau.positionen, 20, true).netto : 0;
  // Gezählt wird, was einen Betrag hat — wie auf der Angebotskarte
  const anzahl = vorschau?.positionen.filter((p) => !ohneBetrag(p)).length ?? 0;
  const nurAbgegolten = !!vorschau && anzahl === 0 && vorschau.positionen.some((p) => p.art === "text" && p.quelle);

  const eingang = data?.eingang ?? [];
  const umschalten = (feld: keyof ImportAuswahl, id: string, an: boolean) =>
    setAuswahl((a) => ({ ...a, [feld]: an ? [...new Set([...a[feld], id])] : a[feld].filter((x) => x !== id) }));
  const alle = (feld: keyof ImportAuswahl, ids: string[], an: boolean) =>
    setAuswahl((a) => ({ ...a, [feld]: an ? ids : [] }));

  const leer = data && !data.angebote.length && !data.regie.length && !data.zeiten.length && !gruppen.length && !eingang.length;
  const mitAngebot = !!data?.angebote.length || !!data?.angebotImEntwurf;
  // Abgegolten-Schalter nur, wenn ein Angebot dabei ist und Stunden oder Material übrig bleiben
  const restOffen = !!data && (data.zeiten.some((z) => !auswahl.zeiten.includes(z.id)) || gruppen.some((g) => !auswahl.material.includes(g.schluessel)));
  const abgegoltenMoeglich = (auswahl.angebote.length > 0 || !!data?.angebotImEntwurf) && restOffen;
  const stundenSumme = (data?.zeiten ?? []).filter((z) => auswahl.zeiten.includes(z.id)).reduce((s, z) => s + z.stunden, 0);

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Aus dem Projekt übernehmen"
      beschreibung="Alles, was noch nicht verrechnet ist — anhaken und übernehmen."
      fuss={(
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            className="h-12"
            disabled={!vorschau || (anzahl === 0 && !nurAbgegolten)}
            onClick={() => { if (vorschau) { onUebernehmen(vorschau); onOpenChange(false); } }}
          >
            {anzahl ? `${anzahl} ${anzahl === 1 ? "Position" : "Positionen"} übernehmen · ${euro(netto)}` : nurAbgegolten ? "Als abgegolten übernehmen" : "Übernehmen"}
          </Button>
        </>
      )}
    >
      {!projektId && <Leer icon={AlertTriangle} text="Zuerst ein Projekt wählen." />}
      {projektId && isLoading && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Offenes wird geladen …</p>
      )}
      {error && <p className="text-sm text-destructive">Laden fehlgeschlagen: {(error as Error).message}</p>}
      {leer && <Leer icon={CheckCircle2} text="Am Projekt ist nichts mehr offen — alles verrechnet." />}

      {data && data.unsigniert.length > 0 && (
        <div className={cn("flex gap-2.5 rounded-lg p-3 text-sm", TON_KLASSE.gelb)}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {data.unsigniert.map((r) => `${r.nummer ?? "Regiebericht"} (${datum(r.datum)})`).join(", ")}{" "}
            {data.unsigniert.length === 1 ? "ist" : "sind"} noch nicht unterschrieben — erst unterschreiben lassen, dann hier übernehmen.
          </p>
        </div>
      )}

      {data?.angebotImEntwurf && (
        <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          Angebot {data.angebotImEntwurf.nummer ?? ""} steckt schon in dieser Rechnung — Stunden und Material sind deshalb nicht vorgewählt.
        </p>
      )}

      {data && data.angebote.length > 0 && (
        <Bereich titel="Angebot">
          {data.angebote.map((a) => (
            <Zeile key={a.id} an={auswahl.angebote.includes(a.id)} onAn={(v) => umschalten("angebote", a.id, v)}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.nummer ?? "Angebot"}</span>
                <StatusBadge status={a.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {a.betreff ? `${a.betreff} · ` : ""}
                {((n) => `${n} ${n === 1 ? "Position" : "Positionen"}`)(a.positionen.filter((p) => p.art !== "titel" && p.art !== "text").length)} ·{" "}
                <span className="zahl">{euro(a.netto)}</span> netto
              </p>
            </Zeile>
          ))}
        </Bereich>
      )}

      {data && data.regie.length > 0 && (
        <Bereich titel="Unterschriebene Regieberichte">
          {data.regie.map((r) => {
            const h = r.zeiten.reduce((s, z) => s + z.stunden, 0);
            return (
              <Zeile key={r.id} an={auswahl.regie.includes(r.id)} onAn={(v) => umschalten("regie", r.id, v)}>
                <p className="font-medium">{r.nummer ?? "Regiebericht"} · {datum(r.datum)}</p>
                {r.arbeiten && <p className="line-clamp-2 text-sm text-muted-foreground">{r.arbeiten}</p>}
                <p className="text-xs text-muted-foreground">
                  <span className="zahl">{stunden(h)}</span> · {r.material.length} {r.material.length === 1 ? "Materialbuchung" : "Materialbuchungen"}
                </p>
              </Zeile>
            );
          })}
        </Bereich>
      )}

      {data && data.zeiten.length > 0 && (
        <Bereich
          titel="Stunden ohne Regiebericht"
          alle={{ an: auswahl.zeiten.length === data.zeiten.length, onAn: (v) => alle("zeiten", data.zeiten.map((z) => z.id), v) }}
          hinweis={mitAngebot ? "Nach Angebot abgerechnet? Dann stecken die Stunden meist schon im Angebotspreis." : undefined}
          rechts={<span className="zahl">{stunden(stundenSumme)}</span>}
        >
          {data.zeiten.map((z) => (
            <Zeile key={z.id} an={auswahl.zeiten.includes(z.id)} onAn={(v) => umschalten("zeiten", z.id, v)} dicht>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate"><span className="text-muted-foreground">{datum(z.datum)}</span> · {z.name}</span>
                <span className="zahl shrink-0 font-semibold">{stunden(z.stunden)}</span>
              </div>
              {z.taetigkeit && <p className="truncate text-xs text-muted-foreground">{z.taetigkeit}</p>}
            </Zeile>
          ))}
        </Bereich>
      )}

      {data && gruppen.length > 0 && (
        <Bereich
          titel="Material ohne Regiebericht"
          alle={{ an: auswahl.material.length === gruppen.length, onAn: (v) => alle("material", gruppen.map((g) => g.schluessel), v) }}
          hinweis="Ausgefasst und direkt gekauft, Rückgaben abgezogen. Preis = Verkaufspreis (EK der Buchung + Aufschlag)."
        >
          {gruppen.map((g) => (
            <Zeile key={g.schluessel} an={auswahl.material.includes(g.schluessel)} onAn={(v) => umschalten("material", g.schluessel, v)} dicht>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate"><span className="zahl font-semibold">{zahl(g.menge)} {g.einheit}</span> {g.bezeichnung}</span>
                <span className="zahl shrink-0 text-sm">{euro(g.menge * g.vk)}</span>
              </div>
            </Zeile>
          ))}
        </Bereich>
      )}

      {eingang.length > 0 && (
        <Bereich
          titel="Eingangsrechnungen weiterverrechnen"
          alle={{ an: auswahl.eingang.length === eingang.length, onAn: (v) => alle("eingang", eingang.map((a) => a.id), v) }}
          hinweis="Zugeordnet, noch nicht verrechnet. Material daraus schon ausgefasst oder gebucht? Dann nicht noch einmal anhaken."
        >
          {eingang.map((a) => (
            <Zeile key={a.id} an={auswahl.eingang.includes(a.id)} onAn={(v) => umschalten("eingang", a.id, v)} dicht>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{a.text?.trim() || a.lieferant}</span>
                <span className="zahl shrink-0 text-sm">{euro(a.betrag)}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[a.lieferant, a.nummer, a.datum && datum(a.datum)].filter(Boolean).join(" · ")} · Einkauf netto
              </p>
            </Zeile>
          ))}
        </Bereich>
      )}

      {data && !leer && (
        <section className="space-y-3 rounded-lg border bg-card p-3.5">
          <h3 className="text-sm font-semibold">So übernehmen</h3>
          <Schalter id="imp-je" an={jeMitarbeiter} onAn={setJeMitarbeiter} text="Stunden je Mitarbeiter" unter={jeMitarbeiter ? "Eine Zeile je Mitarbeiter, mit Namen" : "Eine Zeile „Arbeitszeit“"} />
          <Schalter id="imp-pausch" an={pauschale} onAn={setPauschale} text="Material als Materialpauschale" unter={pauschale ? "Eine Zeile, Artikel im Langtext" : "Jeder Artikel eine Zeile"} />
          {abgegoltenMoeglich && (
            <Schalter
              id="imp-abg"
              an={abgegolten}
              onAn={setAbgegolten}
              text="Übrige Stunden und Material sind mit dem Angebot abgegolten"
              unter={abgegolten
                ? `Gelten als verrechnet — ohne Betrag, auf der Rechnung steht „${ABGEGOLTEN_TEXT}“`
                : "Bleiben offen für eine spätere Rechnung"}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="imp-satz" className="text-sm">Stundensatz netto €</Label>
            <Input id="imp-satz" value={satz} onChange={(e) => setSatz(e.target.value)} inputMode="decimal" className="zahl h-11 w-28 text-right" />
          </div>
          {eingang.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="imp-aufschlag" className="text-sm">Aufschlag auf Eingangsrechnungen %</Label>
              <Input id="imp-aufschlag" value={aufschlag} onChange={(e) => setAufschlag(e.target.value)} inputMode="decimal" className="zahl h-11 w-28 text-right" />
            </div>
          )}
        </section>
      )}
    </FormularDialog>
  );
}

function Bereich({
  titel, children, alle, hinweis, rechts,
}: {
  titel: string;
  children: React.ReactNode;
  alle?: { an: boolean; onAn: (v: boolean) => void };
  hinweis?: string;
  rechts?: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        {alle && <Checkbox checked={alle.an} onCheckedChange={(v) => alle.onAn(!!v)} aria-label="alle" className="h-5 w-5" />}
        <h3 className="flex-1 text-sm font-semibold">{titel}</h3>
        {rechts && <span className="text-sm">{rechts}</span>}
      </div>
      {hinweis && <p className="px-1 text-xs text-muted-foreground">{hinweis}</p>}
      <div className="divide-y rounded-lg border bg-card">{children}</div>
    </section>
  );
}

function Zeile({ an, onAn, children, dicht }: { an: boolean; onAn: (v: boolean) => void; children: React.ReactNode; dicht?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 px-3", dicht ? "py-2" : "py-3", !an && "opacity-60")}>
      <Checkbox checked={an} onCheckedChange={(v) => onAn(!!v)} className="mt-0.5 h-5 w-5" />
      <div className="min-w-0 flex-1 space-y-0.5">{children}</div>
    </label>
  );
}

function Schalter({ id, an, onAn, text, unter }: { id: string; an: boolean; onAn: (v: boolean) => void; text: string; unter: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{text}</span>
        <span className="block text-xs font-normal text-muted-foreground">{unter}</span>
      </Label>
      <Switch id={id} checked={an} onCheckedChange={onAn} />
    </div>
  );
}
