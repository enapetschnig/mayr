import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, ExternalLink, FileCheck2, FileUp, Loader2, PackagePlus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { ProjektWahl } from "@/components/ProjektWahl";
import { LieferscheinEinbuchen } from "@/components/material/LieferscheinEinbuchen";
import { Button } from "@/components/ui/button";
import {
  lieferscheinAnlegen, lieferscheinLoeschen, lsAdresse, lsPositionen, LS_BUCKET, useLieferscheine, type LieferscheinMitProjekt,
} from "@/components/eingang/eingangDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { belegLesen } from "@/lib/ki";
import { datum, zahl } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * /lieferscheine — Lieferschein auf der Baustelle fotografieren. Die KI liest
 * Lieferant, Nummer und Positionen; das Büro gleicht später gegen die
 * Rechnung des Großhändlers ab (Menge, Artikel, Projekt).
 */
export default function Lieferscheine() {
  const { profil, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: liste = [], isLoading } = useLieferscheine();
  const [projekt, setProjekt] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  // Einbuchen (Chef): Auswahl bleibt beim Schließen stehen, damit der Dialog nicht mitten in der Animation leer wird
  const [einbuchen, setEinbuchen] = useState<LieferscheinMitProjekt | null>(null);
  const [einbuchenOffen, setEinbuchenOffen] = useState(false);
  const einbuchenStarten = (l: LieferscheinMitProjekt) => { setEinbuchen(l); setEinbuchenOffen(true); };

  /** KI liest das Foto und schreibt Kopf und Zeilen in den Lieferschein */
  const lesen = async (l: { id: string; datei_pfad: string }) => {
    const b = await belegLesen(LS_BUCKET, l.datei_pfad);
    const { error } = await supabase.from("lieferscheine").update({
      lieferant: b.lieferant, nummer: b.nummer, ...(b.datum ? { datum: b.datum } : {}), gelesen_am: new Date().toISOString(),
      positionen: b.positionen.map((p) => ({ artikelnummer: p.artikelnummer, bezeichnung: p.bezeichnung, menge: p.menge, einheit: p.einheit })),
    }).eq("id", l.id);
    if (error) throw error;
    return b.positionen.length;
  };

  const fotografiert = async (datei: File) => {
    if (!profil) return;
    setLaeuft("Foto wird hochgeladen …");
    try {
      const l = await lieferscheinAnlegen(profil.id, datei, projekt || null, null);
      await neuLaden("eingang");
      setLaeuft("Die KI liest den Lieferschein …");
      try {
        const n = await lesen(l);
        toast.success("Lieferschein gespeichert", {
          description: `${n} ${n === 1 ? "Position" : "Positionen"} gelesen${istChef ? " — unten „Einbuchen“ bucht die Ware ins Lager" : ""}`,
        });
        setOffen(l.id);
      } catch (e) {
        toast("Foto gespeichert — lesen hat nicht geklappt", { description: (e as Error).message });
      }
      await neuLaden("eingang");
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  const nochmalLesen = async (l: LieferscheinMitProjekt) => {
    setLaeuft("Die KI liest den Lieferschein …");
    try {
      const n = await lesen(l);
      await neuLaden("eingang");
      toast.success(`${n} ${n === 1 ? "Position" : "Positionen"} gelesen`);
    } catch (e) {
      toast.error("Nicht gelesen", { description: (e as Error).message });
    } finally {
      setLaeuft(null);
    }
  };
  const ansehen = async (l: LieferscheinMitProjekt) => {
    const fenster = window.open("", "_blank");
    try {
      const url = await lsAdresse(l.datei_pfad);
      if (fenster) fenster.location.href = url; else window.location.href = url;
    } catch (e) {
      fenster?.close();
      toast.error("Foto nicht geöffnet", { description: (e as Error).message });
    }
  };
  const loeschen = async (l: LieferscheinMitProjekt) => {
    try {
      await lieferscheinLoeschen(l);
      await neuLaden("eingang");
      toast.success("Lieferschein gelöscht");
    } catch (e) {
      toast.error("Nicht gelöscht", { description: (e as Error).message });
    }
  };

  return (
    <Seite titel="Lieferscheine" untertitel="Fotografieren — das Büro gleicht mit der Rechnung ab">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <ProjektWahl wert={projekt} onChange={(id) => setProjekt(id)} leerText="Für welches Projekt? (optional)" />
        <input ref={kamera} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void fotografiert(f); e.target.value = ""; }} />
        <Button className="h-14 w-full gap-2 text-base" disabled={!!laeuft} onClick={() => kamera.current?.click()}>
          {laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />} {laeuft ?? "Lieferschein fotografieren"}
        </Button>
        {istChef && (
          <>
            <input ref={pdf} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void fotografiert(f); e.target.value = ""; }} />
            <Button variant="outline" className="h-12 w-full gap-2" disabled={!!laeuft} onClick={() => pdf.current?.click()}>
              <FileUp className="h-4 w-4" /> PDF vom Großhändler hochladen
            </Button>
          </>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Die KI liest Lieferant, Nummer und jede Zeile — nichts abtippen.
        </p>
      </section>

      {isLoading ? (
        <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : liste.length === 0 ? (
        <Leer icon={FileCheck2} text={istChef ? "Noch keine Lieferscheine von den Baustellen." : "Noch keine Lieferscheine fotografiert."} />
      ) : (
        <ul className="space-y-2">
          {liste.map((l) => {
            const pos = lsPositionen(l);
            const auf = offen === l.id;
            return (
              <li key={l.id} className="rounded-lg border bg-card">
                <button type="button" onClick={() => setOffen(auf ? null : l.id)} aria-expanded={auf}
                  className="flex w-full items-start gap-3 p-3.5 text-left">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{l.lieferant || "Lieferschein"}{l.nummer ? ` ${l.nummer}` : ""}</span>
                      {l.eingebucht_am && <StatusPille eintrag={{ ton: "gruen", text: "eingebucht" }} />}
                      {l.eingangsrechnung_id ? <StatusPille eintrag={{ ton: "gruen", text: "mit Rechnung abgeglichen" }} />
                        : l.gelesen_am ? <StatusPille eintrag={{ ton: "cyan", text: "gelesen" }} />
                          : <StatusPille eintrag={{ ton: "gelb", text: "nicht gelesen" }} />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[datum(l.datum), l.projekte ? `${l.projekte.nummer} ${l.projekte.name}` : "ohne Projekt",
                        istChef && l.profiles ? `${l.profiles.vorname} ${l.profiles.nachname}` : null, `${pos.length} Zeilen`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", auf && "rotate-180")} />
                </button>
                {auf && (
                  <div className="space-y-2 border-t p-3.5">
                    {pos.length > 0 && (
                      <ul className="divide-y rounded-md border text-sm">
                        {pos.map((p, i) => (
                          <li key={i} className="flex gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1">{p.bezeichnung}{p.artikelnummer && <span className="block text-xs text-muted-foreground">{p.artikelnummer}</span>}</span>
                            <span className="zahl shrink-0">{p.menge == null ? "–" : zahl(p.menge)} {p.einheit ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {istChef && !l.eingebucht_am && pos.length > 0 && (
                        <Button className="h-11 gap-1.5" onClick={() => einbuchenStarten(l)}>
                          <PackagePlus className="h-4 w-4" /> Einbuchen
                        </Button>
                      )}
                      <Button variant="outline" className="h-11 gap-1.5" onClick={() => void ansehen(l)}><ExternalLink className="h-4 w-4" /> Foto</Button>
                      {!l.eingangsrechnung_id && !l.eingebucht_am && (
                        <Button variant="outline" className="h-11 gap-1.5" disabled={!!laeuft} onClick={() => void nochmalLesen(l)}>
                          <Sparkles className="h-4 w-4" /> {l.gelesen_am ? "Nochmal lesen" : "Mit KI lesen"}
                        </Button>
                      )}
                      {!l.eingangsrechnung_id && !l.eingebucht_am && (
                        <Button variant="ghost" className="h-11 gap-1.5 text-destructive hover:text-destructive" onClick={() => void loeschen(l)}>
                          <Trash2 className="h-4 w-4" /> Löschen
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {istChef && <LieferscheinEinbuchen ls={einbuchen} open={einbuchenOffen} onOpenChange={setEinbuchenOffen} />}
    </Seite>
  );
}
