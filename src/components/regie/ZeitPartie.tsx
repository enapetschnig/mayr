import { useState } from "react";
import { AlertTriangle, Lock, Plus, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { datum as datumText, isoTag, stunden, zahlLesen } from "@/lib/format";
import { name, type Profil } from "@/lib/types";
import { cn } from "@/lib/utils";
import { neueZeile, zeileAusDb, type StundenVorschlag } from "./regieDaten";
import {
  SCHNELLWAHL_STUNDEN, summeStunden, zeileFehler, zeileLeer, zeileStunden, zeitSpanne,
  type Entwurf, type ZeitModus, type ZeitZeile,
} from "./regieLogik";

type Person = Pick<Profil, "vorname" | "nachname" | "farbe">;

/**
 * „Arbeitszeit der Partie“: eine Zeile je Mitarbeiter — Schnellwahl
 * 1/2/4/8 h oder Von–Bis mit Pause. Schon gebuchte Stunden am selben
 * Projekt und Tag werden angeboten und übernommen statt doppelt gebucht.
 */
export function ZeitPartie({
  entwurf, aendern, ich, istChef, person, mitarbeiter, vorschlaege, modusStandard, onModus,
}: {
  entwurf: Entwurf;
  aendern: (f: (e: Entwurf) => Entwurf) => void;
  ich: string;
  istChef: boolean;
  person: (userId: string) => Person | null;
  mitarbeiter: Profil[];
  vorschlaege: StundenVorschlag[];
  modusStandard: ZeitModus;
  onModus: (m: ZeitModus) => void;
}) {
  const [frage, setFrage] = useState<ZeitZeile | null>(null);
  const zeilen = entwurf.zeilen;

  const zeileSetzen = (key: string, teil: Partial<ZeitZeile>) =>
    aendern((e) => ({ ...e, zeilen: e.zeilen.map((z) => (z.key === key ? { ...z, ...teil } : z)) }));

  const drin = new Set(zeilen.map((z) => z.id).filter(Boolean));
  const offen = vorschlaege.filter((v) => !drin.has(v.id));
  const heute = entwurf.datum === isoTag();

  const uebernehmen = (liste: StundenVorschlag[]) =>
    aendern((e) => {
      const ids = new Set(e.zeilen.map((z) => z.id));
      const dazu = liste.filter((v) => !ids.has(v.id)).map((v) => zeileAusDb(v, ich, istChef, "uebernehmen"));
      const personen = new Set(dazu.map((z) => z.userId));
      // Eine leere Zeile derselben Person ersetzt die übernommene Buchung
      const bleiben = e.zeilen.filter((z) => !(zeileLeer(z) && personen.has(z.userId)));
      return { ...e, zeilen: [...bleiben, ...dazu] };
    });

  /** Übernehmen statt der neuen Zeile, die schon getippt wurde */
  const tauschen = (z: ZeitZeile, liste: StundenVorschlag[]) =>
    aendern((e) => ({
      ...e,
      zeilen: [
        ...e.zeilen.filter((x) => x.key !== z.key),
        ...liste.filter((v) => !e.zeilen.some((x) => x.id === v.id)).map((v) => zeileAusDb(v, ich, istChef, "uebernehmen")),
      ],
    }));

  const kollegeDazu = (userId: string) =>
    aendern((e) => ({ ...e, zeilen: [...e.zeilen, neueZeile(userId, modusStandard)] }));

  const entfernen = (z: ZeitZeile) => {
    if (z.herkunft === "bericht") return setFrage(z);
    aendern((e) => ({ ...e, zeilen: e.zeilen.filter((x) => x.key !== z.key) }));
  };

  const entfernenBestaetigen = (behalten: boolean) => {
    const z = frage;
    setFrage(null);
    if (!z?.id) return;
    aendern((e) => ({
      ...e,
      zeilen: e.zeilen.filter((x) => x.key !== z.key),
      entfernt: { ...e.entfernt, zeiten: [...e.entfernt.zeiten, { id: z.id as string, behalten }] },
    }));
  };

  const mitZeile = new Set(zeilen.map((z) => z.userId));
  const kollegen = mitarbeiter.filter((m) => !mitZeile.has(m.id));
  const gezaehlt = zeilen.filter((z) => !zeileLeer(z));
  const summe = summeStunden(gezaehlt);

  return (
    <div className="space-y-3">
      {offen.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{heute ? "Heute schon gebucht" : `Am ${datumText(entwurf.datum)} schon gebucht`}</p>
            {offen.length > 1 && (
              <Button type="button" variant="ghost" className="h-11 px-3 text-primary hover:text-primary" onClick={() => uebernehmen(offen)}>
                Alle übernehmen
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {offen.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => uebernehmen([v])}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 active:bg-muted/40"
                >
                  <Avatar profil={v.profiles ?? person(v.user_id)} className="h-7 w-7 text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {name(v.profiles ?? person(v.user_id))} <span className="zahl font-semibold">{stunden(Number(v.stunden))}</span>
                    </span>
                    {(v.von || v.taetigkeit) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[zeitSpanne(v.von, v.bis), v.taetigkeit].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-primary">Übernehmen</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Übernehmen bucht nicht doppelt — die Stunden kommen nur in diesen Bericht.</p>
        </div>
      )}

      {zeilen.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          Noch keine Arbeitszeit erfasst.
        </p>
      )}

      <ul className="space-y-2.5">
        {zeilen.map((z) => (
          <ZeitZeileKarte
            key={z.key}
            z={z}
            ich={ich}
            person={person(z.userId)}
            doppelt={z.herkunft === "neu" && !zeileLeer(z) ? offen.filter((v) => v.user_id === z.userId) : []}
            onSetzen={(teil) => zeileSetzen(z.key, teil)}
            onModus={(m) => { zeileSetzen(z.key, { modus: m }); onModus(m); }}
            onEntfernen={() => entfernen(z)}
            onTauschen={(liste) => tauschen(z, liste)}
          />
        ))}
      </ul>

      {kollegen.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" /> Kollege dazu
          </p>
          <div className="flex flex-wrap gap-2">
            {kollegen.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => kollegeDazu(m.id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors hover:border-primary/50 active:bg-muted/40"
              >
                <Avatar profil={m} className="h-7 w-7 text-[10px]" />
                {m.id === ich ? "Ich" : m.vorname || name(m)}
                <Plus className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </div>
      )}

      {gezaehlt.length > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-sm font-medium">Summe Partie</span>
          <span className="zahl text-base font-bold">{stunden(summe)}</span>
        </div>
      )}

      <AlertDialog open={!!frage} onOpenChange={(o) => !o && setFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Stunden von {frage ? name(person(frage.userId)) : ""} entfernen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {frage && (
                <>
                  <span className="zahl font-semibold text-foreground">{stunden(zeileStunden(frage))}</span> sind schon gebucht.{" "}
                  {frage.aenderbar
                    ? "Ganz löschen — oder nur aus dem Bericht nehmen, dann bleiben sie normale Projektstunden."
                    : `Löschen können nur ${person(frage.userId)?.vorname || "die Person"} selbst oder der Chef. Aus dem Bericht nehmen geht — die Stunden bleiben am Projekt.`}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Am Handy umgekehrt gestapelt: oben das Harmlose (aus dem Bericht nehmen) */}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            {frage?.aenderbar && (
              <Button variant="destructive" className="h-11" onClick={() => entfernenBestaetigen(false)}>
                Ganz löschen
              </Button>
            )}
            <Button variant="outline" className="h-11" onClick={() => entfernenBestaetigen(true)}>
              Nur aus dem Bericht nehmen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ZeitZeileKarte({
  z, ich, person, doppelt, onSetzen, onModus, onEntfernen, onTauschen,
}: {
  z: ZeitZeile;
  ich: string;
  person: Person | null;
  doppelt: StundenVorschlag[];
  onSetzen: (teil: Partial<ZeitZeile>) => void;
  onModus: (m: ZeitModus) => void;
  onEntfernen: () => void;
  onTauschen: (liste: StundenVorschlag[]) => void;
}) {
  const leer = zeileLeer(z);
  const fehler = leer ? null : zeileFehler(z);
  const h = zeileStunden(z);
  const istIch = z.userId === ich;
  const anderer = !SCHNELLWAHL_STUNDEN.includes(zahlLesen(z.stunden));

  return (
    <li className={cn("rounded-lg border bg-card p-3", fehler && "border-destructive/60")}>
      <div className="flex items-center gap-2.5">
        <Avatar profil={person} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">
            {name(person)}{istIch && <span className="font-normal text-muted-foreground"> (ich)</span>}
          </p>
          {z.herkunft === "uebernehmen" && <p className="text-xs text-primary">wird übernommen — schon gebucht</p>}
          {!z.aenderbar && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              {z.verrechnet ? "schon verrechnet" : `ändern nur ${person?.vorname || "die Person"} selbst oder der Chef`}
            </p>
          )}
        </div>
        <span className={cn("zahl shrink-0 text-lg font-bold", leer && "text-muted-foreground/60")}>
          {leer ? "– h" : stunden(h)}
        </span>
        {!z.verrechnet && (
          <Button type="button" variant="ghost" size="icon" className="-mr-1.5 h-11 w-11 shrink-0 text-muted-foreground"
            onClick={onEntfernen} aria-label={`Zeile ${name(person)} entfernen`}>
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {z.aenderbar ? (
        <div className="mt-3 space-y-2">
          {z.modus === "stunden" ? (
            <div className="grid grid-cols-5 gap-1.5">
              {SCHNELLWAHL_STUNDEN.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={zahlLesen(z.stunden) === s ? "default" : "outline"}
                  className="h-12 px-0 text-base"
                  onClick={() => onSetzen({ stunden: String(s) })}
                >
                  {s} h
                </Button>
              ))}
              <Input
                inputMode="decimal"
                enterKeyHint="done"
                className={cn("h-12 px-1 text-center text-base placeholder:text-xs", anderer && z.stunden && "border-primary font-semibold")}
                placeholder="andere"
                value={anderer ? z.stunden : ""}
                onChange={(e) => onSetzen({ stunden: e.target.value })}
                aria-label={`Stunden ${name(person)}`}
              />
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-1.5">
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-muted-foreground">Von</span>
                <Input type="time" className="h-12 min-w-0 px-2 text-base" value={z.von} onChange={(e) => onSetzen({ von: e.target.value })} />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-muted-foreground">Bis</span>
                <Input type="time" className="h-12 min-w-0 px-2 text-base" value={z.bis} onChange={(e) => onSetzen({ bis: e.target.value })} />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-muted-foreground">Pause</span>
                <Input inputMode="numeric" className="h-12 min-w-0 px-1 text-center text-base" value={z.pause}
                  onChange={(e) => onSetzen({ pause: e.target.value })} aria-label="Pause in Minuten" placeholder="Min." />
              </label>
            </div>
          )}
          <button
            type="button"
            className="min-h-11 text-sm font-medium text-primary hover:underline"
            onClick={() => onModus(z.modus === "stunden" ? "vonbis" : "stunden")}
          >
            {z.modus === "stunden" ? "Von – Bis eingeben" : "Nur Stunden eingeben"}
          </button>
        </div>
      ) : (
        (z.von || z.modus === "vonbis") && (
          <p className="mt-1.5 pl-[2.625rem] text-sm text-muted-foreground">{zeitSpanne(z.von, z.bis, zahlLesen(z.pause))}</p>
        )
      )}

      {fehler && <p className="mt-1 text-sm text-destructive">{fehler}</p>}

      {doppelt.length > 0 && (
        <div className="mt-2 rounded-md border border-status-gelb bg-status-gelb/40 px-3 pt-2 text-sm text-status-gelb-fg">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {person?.vorname || "Die Person"} hat an diesem Tag schon{" "}
              <span className="zahl font-semibold">{stunden(doppelt.reduce((s, v) => s + Number(v.stunden), 0))}</span> auf dieses Projekt gebucht — doppelt?
            </span>
          </p>
          <button type="button" className="min-h-11 pl-[1.375rem] font-semibold text-primary hover:underline" onClick={() => onTauschen(doppelt)}>
            Stattdessen übernehmen
          </button>
        </div>
      )}
    </li>
  );
}
