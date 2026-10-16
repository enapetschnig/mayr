import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, Download, FileText, Lock, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FirmaBadge, Leer } from "@/components/Bausteine";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { signierteAdressen } from "@/lib/upload";
import { datum } from "@/lib/format";
import type { Datei } from "@/lib/types";

/** Fotos bzw. Dokumente eines Projekts — derselbe Speicher, zwei Ordner. */
export function FotosTab({ projektId, art = "foto" }: { projektId: string; art?: "foto" | "dokument" }) {
  const dok = art === "dokument";
  const { firma, firmaVon } = useSitzung();
  const neuLaden = useNeuLaden();
  const [hochladenOffen, setHochladenOffen] = useState(false);
  const [gross, setGross] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["dateien", projektId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dateien").select("*").eq("projekt_id", projektId).order("created_at", { ascending: false });
      if (error) throw error;
      const liste = data ?? [];
      const urls = await signierteAdressen(liste.map((d) => d.pfad));
      return { liste, urls };
    },
  });

  // Live: wenn ein Partner Fotos hochlädt, erscheinen sie ohne Neuladen
  useEffect(() => {
    const kanal = supabase.channel(`dateien-${projektId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dateien", filter: `projekt_id=eq.${projektId}` },
        () => void neuLaden("dateien"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId]);

  const fotos = dok ? [] : (data?.liste ?? []).filter((d) => d.art === "foto");
  const dokumente = dok ? (data?.liste ?? []).filter((d) => d.art !== "foto") : [];
  const urls = data?.urls ?? {};

  const loeschen = async (d: Datei) => {
    const { error } = await supabase.from("dateien").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("projekt-dateien").remove([d.pfad]);
    toast.success("Gelöscht");
    setGross(null);
    await neuLaden("dateien");
  };

  const aktuelles = gross !== null ? fotos[gross] : null;

  return (
    <div className="space-y-6">
      <Button onClick={() => setHochladenOffen(true)} className="gap-2 w-full sm:w-auto" size="lg">
        {dok ? <FileText className="h-5 w-5" /> : <Camera className="h-5 w-5" />} {dok ? "+ Dokument hochladen" : "+ Foto"}
      </Button>

      {fotos.length === 0 && dokumente.length === 0 && (
        <Leer icon={dok ? FileText : Camera} text={dok ? "Noch keine Dokumente — Pläne, Angebote, Lieferscheine hier ablegen." : "Noch keine Fotos."} />
      )}

      {fotos.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Fotos ({fotos.length})</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {fotos.map((d, i) => (
              <button key={d.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted" onClick={() => setGross(i)}>
                {urls[d.pfad] && <img src={urls[d.pfad]} alt={d.beschreibung || d.name} loading="lazy" className="h-full w-full object-cover" />}
                <span className="absolute left-1 bottom-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: firmaVon(d.firma_id)?.farbe }} />
                {d.sichtbarkeit === "privat" && <Lock className="absolute right-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </section>
      )}

      {dokumente.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Dokumente ({dokumente.length})</h3>
          <div className="rounded-lg border divide-y">
            {dokumente.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  {d.beschreibung && <p className="text-xs text-muted-foreground truncate">{d.beschreibung}</p>}
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    {datum(d.created_at)} <FirmaBadge firma={firmaVon(d.firma_id)} />
                    {d.sichtbarkeit === "privat" && <Lock className="h-3 w-3" />}
                  </p>
                </div>
                {urls[d.pfad] && (
                  <Button variant="ghost" size="icon" asChild>
                    <a href={urls[d.pfad]} target="_blank" rel="noreferrer" aria-label="Öffnen"><Download className="h-4 w-4" /></a>
                  </Button>
                )}
                {d.firma_id === firma?.id && (
                  <Button variant="ghost" size="icon" onClick={() => loeschen(d)} aria-label="Löschen">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={aktuelles !== null} onOpenChange={(o) => !o && setGross(null)}>
        <DialogContent ohneSchliessen className="max-w-5xl p-0 bg-black border-0 overflow-hidden">
          <DialogTitle className="sr-only">Foto</DialogTitle>
          {aktuelles && (
            <div className="relative">
              <img src={urls[aktuelles.pfad]} alt={aktuelles.name} className="max-h-[80dvh] w-full object-contain" />
              <button className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(null)} aria-label="Schließen">
                <X className="h-5 w-5" />
              </button>
              {gross! > 0 && (
                <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(gross! - 1)} aria-label="Zurück">
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {gross! < fotos.length - 1 && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(gross! + 1)} aria-label="Weiter">
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
              <div className="flex items-center gap-2 bg-black/80 p-3 text-white text-sm">
                <FirmaBadge firma={firmaVon(aktuelles.firma_id)} className="bg-white" />
                <span className="flex-1 truncate">{aktuelles.beschreibung || datum(aktuelles.created_at)}</span>
                <a href={urls[aktuelles.pfad]} target="_blank" rel="noreferrer" className="p-1.5" aria-label="Herunterladen"><Download className="h-4 w-4" /></a>
                {aktuelles.firma_id === firma?.id && (
                  <button onClick={() => loeschen(aktuelles)} className="p-1.5" aria-label="Löschen"><Trash2 className="h-4 w-4 text-red-400" /></button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FotoDialog open={hochladenOffen} onOpenChange={setHochladenOffen} projektId={projektId} art={art} />
    </div>
  );
}
