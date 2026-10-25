import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Eraser, Loader2, RotateCw } from "lucide-react";
import FormularDialog from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { datum as datumText, isoZuDatum, stunden, zahl } from "@/lib/format";
import { UnterschriftFeld, type UnterschriftHandle } from "./UnterschriftFeld";

/** Was der Kunde zu sehen bekommt — ohne Preise */
export type KundenSicht = {
  nummer: string | null;
  datum: string;
  kunde: string | null;
  projekt: string;
  baustelle: string | null;
  arbeiten: string;
  zeiten: { key: string; name: string; spanne: string; stunden: number }[];
  material: { key: string; menge: number; einheit: string; bezeichnung: string }[];
};

function useHochformat() {
  const messen = () => typeof window !== "undefined" && window.innerHeight > window.innerWidth && window.innerWidth < 700;
  const [hoch, setHoch] = useState(messen);
  useEffect(() => {
    const neu = () => setHoch(messen());
    window.addEventListener("resize", neu);
    window.addEventListener("orientationchange", neu);
    return () => {
      window.removeEventListener("resize", neu);
      window.removeEventListener("orientationchange", neu);
    };
  }, []);
  return hoch;
}

/**
 * Der Monteur reicht dem Kunden das Handy: erst in großer Schrift prüfen
 * (Arbeiten, Stunden je Person, Material), Namen eintragen — dann auf einer
 * großen Fläche unterschreiben. Quer gehalten wird die Fläche breiter.
 */
export function KundenUnterschrift({
  open, onOpenChange, sicht, nameVorschlag, onBestaetigen,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sicht: KundenSicht;
  nameVorschlag: string;
  /** Hochladen und festschreiben; true = geschafft */
  onBestaetigen: (name: string, png: Blob) => Promise<boolean>;
}) {
  const [schritt, setSchritt] = useState<"pruefen" | "unterschrift">("pruefen");
  const [name, setName] = useState("");
  const [gezeichnet, setGezeichnet] = useState(false);
  const [sendet, setSendet] = useState(false);
  const feld = useRef<UnterschriftHandle>(null);
  const angefasst = useRef(false);
  const hochformat = useHochformat();

  // Beim Öffnen von vorn beginnen
  useEffect(() => {
    if (!open) return;
    setSchritt("pruefen");
    setGezeichnet(false);
    angefasst.current = false;
  }, [open]);

  // Vorschlag (letzter Unterzeichner) kommt evtl. später — nie über Getipptes schreiben
  useEffect(() => {
    if (open && !angefasst.current) setName(nameVorschlag);
  }, [open, nameVorschlag]);

  const zurUnterschrift = () => {
    if (!name.trim()) return;
    setGezeichnet(false);
    setSchritt("unterschrift");
  };

  const summe = sicht.zeiten.reduce((s, z) => s + z.stunden, 0);
  const tag = isoZuDatum(sicht.datum).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const bestaetigen = async () => {
    const png = await feld.current?.alsPng();
    if (!png) {
      toast.error("Bitte im weißen Feld unterschreiben.");
      return;
    }
    setSendet(true);
    const ok = await onBestaetigen(name.trim(), png);
    setSendet(false);
    if (ok) onOpenChange(false);
  };

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel={schritt === "pruefen" ? `Regiebericht ${sicht.nummer ?? ""}`.trim() : "Unterschrift"}
      beschreibung={schritt === "pruefen" ? `Bitte prüfen · ${tag}` : `${name.trim()} · ${datumText(sicht.datum)}`}
      gesperrt={sendet}
      fuellend={schritt === "unterschrift"}
      fuss={schritt === "pruefen" ? (
        <>
          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-4 w-4" /> Zurück zum Bericht
          </Button>
          <Button className="h-12 min-w-56 text-base" disabled={!name.trim()} onClick={zurUnterschrift}>
            {name.trim() ? "Weiter zur Unterschrift" : "Bitte Namen eintragen"} <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="h-12" disabled={sendet} onClick={() => setSchritt("pruefen")}>
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Button>
          <Button className="h-12 min-w-56 text-base" disabled={!gezeichnet || sendet} onClick={bestaetigen}>
            {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {sendet ? "Wird gespeichert…" : "Unterschrift bestätigen"}
          </Button>
        </>
      )}
    >
      {schritt === "pruefen" ? (
        <div className="mx-auto w-full max-w-3xl space-y-6 pb-2">
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Auftraggeber</p>
            <p className="text-xl font-semibold leading-snug">{sicht.kunde || sicht.projekt}</p>
            <p className="text-base text-muted-foreground">{[sicht.projekt, sicht.baustelle].filter(Boolean).join(" · ")}</p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Durchgeführte Arbeiten</h3>
            <p className="whitespace-pre-wrap text-lg leading-relaxed">{sicht.arbeiten.trim() || "—"}</p>
          </section>

          {sicht.zeiten.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Arbeitszeit</h3>
              <ul className="divide-y rounded-lg border bg-card">
                {sicht.zeiten.map((z) => (
                  <li key={z.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-lg font-medium leading-tight">{z.name}</span>
                      {z.spanne && <span className="block text-base text-muted-foreground">{z.spanne}</span>}
                    </span>
                    <span className="zahl shrink-0 text-xl font-semibold">{stunden(z.stunden)}</span>
                  </li>
                ))}
                {sicht.zeiten.length > 1 && (
                  <li className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-3">
                    <span className="text-lg font-semibold">Gesamt</span>
                    <span className="zahl text-xl font-bold">{stunden(summe)}</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          {sicht.material.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Material</h3>
              <ul className="divide-y rounded-lg border bg-card">
                {sicht.material.map((m) => (
                  <li key={m.key} className="flex items-baseline gap-3 px-4 py-3 text-lg">
                    <span className="zahl w-24 shrink-0 text-right font-semibold">{zahl(m.menge)} {m.einheit}</span>
                    <span className="min-w-0 leading-snug">{m.bezeichnung}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2 rounded-lg border bg-card p-4">
            <Label htmlFor="ku-name" className="text-base">Ihr Name</Label>
            <Input
              id="ku-name"
              className="h-14 text-xl"
              value={name}
              onChange={(e) => { angefasst.current = true; setName(e.target.value); }}
              placeholder="Vor- und Nachname"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              onKeyDown={(e) => { if (e.key === "Enter") zurUnterschrift(); }}
            />
            <p className="text-sm text-muted-foreground">
              Mit Ihrer Unterschrift bestätigen Sie die angeführten Arbeiten, Arbeitszeiten und Materialien.
            </p>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-muted-foreground">
              {hochformat
                ? <span className="inline-flex items-center gap-1.5"><RotateCw className="h-4 w-4 shrink-0" /> Tipp: Handy quer halten — das Feld wird breiter.</span>
                : "Bitte im weißen Feld unterschreiben."}
            </p>
            <Button variant="outline" className="h-11 shrink-0" onClick={() => { feld.current?.leeren(); }} disabled={sendet || !gezeichnet}>
              <Eraser className="h-4 w-4" /> Löschen
            </Button>
          </div>
          <UnterschriftFeld ref={feld} onChange={setGezeichnet} className="min-h-[9rem] flex-1" />
        </div>
      )}
    </FormularDialog>
  );
}
