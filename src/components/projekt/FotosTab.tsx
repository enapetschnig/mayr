import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, Download, FileText, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, Leer } from "@/components/Bausteine";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { signierteAdressen } from "@/lib/upload";
import { datum } from "@/lib/format";
import { name, type Datei, type Profil } from "@/lib/types";

type DateiMitPerson = Datei & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };

/** Fotos bzw. Dokumente eines Projekts — derselbe Speicher, zwei Ordner. */
export function FotosTab({ projektId, art = "foto" }: { projektId: string; art?: "foto" | "dokument" }) {
  const dok = art === "dokument";
  const { profil, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const [hochladenOffen, setHochladenOffen] = useState(false);
  const [gross, setGross] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dateien", projektId],
    queryFn: async () => {
      const { data, error } = await supabase.from("dateien").select("*, profiles(vorname, nachname, farbe)")
        .eq("projekt_id", projektId).order("created_at", { ascending: false });
      if (error) throw error;
      const liste = (data ?? []) as DateiMitPerson[];
      const urls = await signierteAdressen(liste.map((d) => d.pfad));
      return { liste, urls };
    },
  });

  // Live: lädt ein Kollege auf der Baustelle Fotos hoch, erscheinen sie ohne Neuladen
  useEffect(() => {
    const kanal = supabase.channel(`dateien-${projektId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dateien", filter: `projekt_id=eq.${projektId}` },
        () => void neuLaden("dateien"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId]);

  const liste = (data?.liste ?? []).filter((d) => (dok ? d.art !== "foto" : d.art === "foto"));
  const urls = data?.urls ?? {};
  const darfLoeschen = (d: Datei) => istChef || d.user_id === profil?.id;

  const loeschen = async (d: Datei) => {
    const { error } = await supabase.from("dateien").delete().eq("id", d.id);
    if (error) return toast.error("Nicht gelöscht", { description: error.message });
    await supabase.storage.from("projekt-dateien").remove([d.pfad]);
    toast.success("Gelöscht");
    setGross(null);
    await neuLaden("dateien");
  };

  const aktuelles = gross !== null ? liste[gross] : null;

  return (
    <div className="space-y-4">
      <Button onClick={() => setHochladenOffen(true)} className="h-12 w-full gap-2 sm:w-auto">
        {dok ? <FileText className="h-5 w-5" /> : <Camera className="h-5 w-5" />} {dok ? "Dokument hochladen" : "Fotos machen"}
      </Button>

      {!isLoading && liste.length === 0 && (
        <Leer icon={dok ? FileText : Camera} text={dok ? "Noch keine Dokumente — Pläne, Lieferscheine, Prüfprotokolle hier ablegen." : "Noch keine Fotos."} />
      )}

      {!dok && liste.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
          {liste.map((d, i) => (
            <button key={d.id} type="button" className="relative aspect-square overflow-hidden rounded-md border bg-muted" onClick={() => setGross(i)}>
              {urls[d.pfad] && <img src={urls[d.pfad]} alt={d.beschreibung || d.name} loading="lazy" className="h-full w-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white">{datum(d.created_at).slice(0, 6)}</span>
            </button>
          ))}
        </div>
      )}

      {dok && liste.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                {d.beschreibung && <p className="truncate text-xs text-muted-foreground">{d.beschreibung}</p>}
                <p className="text-xs text-muted-foreground">{datum(d.created_at)} · {name(d.profiles)}</p>
              </div>
              {urls[d.pfad] && (
                <Button variant="ghost" size="icon" asChild>
                  <a href={urls[d.pfad]} target="_blank" rel="noreferrer" aria-label="Öffnen"><Download className="h-4 w-4" /></a>
                </Button>
              )}
              {darfLoeschen(d) && (
                <Button variant="ghost" size="icon" onClick={() => loeschen(d)} aria-label="Löschen">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aktuelles !== null} onOpenChange={(o) => !o && setGross(null)}>
        <DialogContent ohneSchliessen className="max-w-5xl overflow-hidden border-0 bg-black p-0">
          <DialogTitle className="sr-only">Foto</DialogTitle>
          {aktuelles && (
            <div className="relative">
              <img src={urls[aktuelles.pfad]} alt={aktuelles.name} className="max-h-[80dvh] w-full object-contain" />
              <button type="button" className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(null)} aria-label="Schließen">
                <X className="h-5 w-5" />
              </button>
              {gross! > 0 && (
                <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(gross! - 1)} aria-label="Zurück">
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {gross! < liste.length - 1 && (
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white" onClick={() => setGross(gross! + 1)} aria-label="Weiter">
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
              <div className="flex items-center gap-2 bg-black/80 p-3 text-sm text-white">
                <Avatar profil={aktuelles.profiles} className="h-6 w-6 text-[10px]" />
                <span className="flex-1 truncate">{aktuelles.beschreibung || `${name(aktuelles.profiles)} · ${datum(aktuelles.created_at)}`}</span>
                <a href={urls[aktuelles.pfad]} target="_blank" rel="noreferrer" className="p-1.5" aria-label="Herunterladen"><Download className="h-4 w-4" /></a>
                {darfLoeschen(aktuelles) && (
                  <button type="button" onClick={() => loeschen(aktuelles)} className="p-1.5" aria-label="Löschen"><Trash2 className="h-4 w-4 text-red-400" /></button>
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
