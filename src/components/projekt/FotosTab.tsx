import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Download, FileText, Image as BildIcon, MoreVertical, PencilRuler, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, Leer } from "@/components/Bausteine";
import { FotoDialog } from "@/components/dialoge/FotoDialog";
import { BildBetrachter } from "@/components/projekt/BildBetrachter";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { signierteAdressen } from "@/lib/upload";
import { datum } from "@/lib/format";
import { name, type Datei, type Profil } from "@/lib/types";

// pdf.js ist groß — erst laden, wenn jemand ein PDF öffnet
const PdfVollbild = lazy(() => import("@/components/projekt/PdfAnsicht").then((m) => ({ default: m.PdfVollbild })));

export type DateiMitPerson = Datei & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };

export const istPdf = (d: Pick<Datei, "mime" | "name">) => d.mime === "application/pdf" || /\.pdf$/i.test(d.name);
export const istBild = (d: Pick<Datei, "mime">) => !!d.mime?.startsWith("image/");

/** Fotos, Dokumente und Planung eines Projekts samt signierten Adressen (1 h) */
export function useProjektDateien(projektId: string) {
  const neuLaden = useNeuLaden();
  const abfrage = useQuery({
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
    const kanal = supabase.channel(`dateien-${projektId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dateien", filter: `projekt_id=eq.${projektId}` },
        () => void neuLaden("dateien"))
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId]);

  return abfrage;
}

/**
 * Öffnen je nach Art: Bild im Betrachter (Zoom), PDF in der Ansicht
 * (Seiten, Zoom, Teilen), alles andere in einem neuen Tab.
 */
export function useDateiOeffnen() {
  const [bild, setBild] = useState<{ liste: DateiMitPerson[]; index: number } | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const oeffnen = (d: DateiMitPerson, urls: Record<string, string>, bilder: DateiMitPerson[] = [d]) => {
    const url = urls[d.pfad];
    if (!url) return toast.error("Datei nicht erreichbar — Seite neu laden.");
    if (istPdf(d)) return setPdf({ url, name: d.name });
    if (istBild(d)) return setBild({ liste: bilder, index: Math.max(0, bilder.indexOf(d)) });
    window.open(url, "_blank", "noopener");
  };
  return { bild, setBild, pdf, setPdf, oeffnen };
}

/** Fotos bzw. Dokumente eines Projekts — derselbe Speicher, zwei Ordner. */
export function FotosTab({ projektId, art = "foto" }: { projektId: string; art?: "foto" | "dokument" }) {
  const dok = art === "dokument";
  const { profil, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const [hochladenOffen, setHochladenOffen] = useState(false);
  const [loeschFrage, setLoeschFrage] = useState<DateiMitPerson | null>(null);
  const { data, isLoading } = useProjektDateien(projektId);
  const { bild, setBild, pdf, setPdf, oeffnen } = useDateiOeffnen();

  const liste = (data?.liste ?? []).filter((d) => (dok ? d.art !== "foto" : d.art === "foto"));
  const urls = data?.urls ?? {};
  // wie die Policies: ändern und löschen, wer hochgeladen hat, oder der Chef
  const darfAendern = (d: Datei) => istChef || d.user_id === profil?.id;

  const loeschen = async (d: Datei) => {
    setLoeschFrage(null);
    const { data: weg, error } = await supabase.from("dateien").delete().eq("id", d.id).select("id");
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    if (!weg?.length) return toast.error("Nicht gelöscht", { description: "Löschen kann nur, wer hochgeladen hat, oder der Chef." });
    await supabase.storage.from("projekt-dateien").remove([d.pfad]);
    toast.success(d.art === "foto" ? "Foto gelöscht" : "Dokument gelöscht");
    setBild(null);
    await neuLaden("dateien");
  };

  const planungSetzen = async (d: Datei, planung: boolean) => {
    const { data: neu, error } = await supabase.from("dateien").update({ planung }).eq("id", d.id).select("id");
    if (error || !neu?.length) return toast.error("Nicht geändert", { description: error ? fehlerText(error) : "Ändern kann nur, wer hochgeladen hat, oder der Chef." });
    toast.success(planung ? "Steht jetzt oben unter Planung" : "Aus der Planung genommen");
    await neuLaden("dateien");
  };

  const aktuelles = bild ? bild.liste[bild.index] : null;

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
            <button key={d.id} type="button" className="relative aspect-square overflow-hidden rounded-md border bg-muted"
              onClick={() => setBild({ liste, index: i })} aria-label={`Foto ${i + 1} groß ansehen`}>
              {urls[d.pfad] && <img src={urls[d.pfad]} alt={d.beschreibung || d.name} loading="lazy" className="h-full w-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white">{datum(d.created_at).slice(0, 6)}</span>
            </button>
          ))}
        </div>
      )}

      {dok && liste.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {liste.map((d) => (
            <li key={d.id} className="flex items-center gap-1 pr-1">
              <button type="button" onClick={() => oeffnen(d, urls, liste.filter(istBild))}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-muted/50">
                {d.planung ? <PencilRuler className="h-5 w-5 shrink-0 text-primary" />
                  : istBild(d) ? <BildIcon className="h-5 w-5 shrink-0 text-primary" /> : <FileText className="h-5 w-5 shrink-0 text-primary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.name}
                    {d.planung && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">Planung</span>}
                  </p>
                  {d.beschreibung && <p className="truncate text-xs text-muted-foreground">{d.beschreibung}</p>}
                  <p className="text-xs text-muted-foreground">{datum(d.created_at)} · {name(d.profiles)}</p>
                </div>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${d.name}: mehr`}><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {urls[d.pfad] && (
                    <DropdownMenuItem asChild>
                      <a href={urls[d.pfad]} target="_blank" rel="noreferrer" download={d.name}><Download className="mr-2 h-4 w-4" /> Herunterladen</a>
                    </DropdownMenuItem>
                  )}
                  {darfAendern(d) && (
                    <DropdownMenuItem onClick={() => planungSetzen(d, !d.planung)}>
                      <PencilRuler className="mr-2 h-4 w-4" /> {d.planung ? "Aus der Planung nehmen" : "Als Planung oben zeigen"}
                    </DropdownMenuItem>
                  )}
                  {darfAendern(d) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setLoeschFrage(d)}><Trash2 className="mr-2 h-4 w-4" /> Löschen</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <BildBetrachter
        bilder={(bild?.liste ?? []).map((d) => ({ url: urls[d.pfad] ?? "", alt: d.beschreibung || d.name }))}
        index={bild?.index ?? null}
        onIndex={(index) => setBild((b) => (b ? { ...b, index } : b))}
        onSchliessen={() => setBild(null)}
        fuss={aktuelles && (
          <div className="flex items-center gap-2 p-3 text-sm text-white">
            <Avatar profil={aktuelles.profiles} className="h-6 w-6 text-[10px]" />
            <span className="flex-1 truncate">{aktuelles.beschreibung || `${name(aktuelles.profiles)} · ${datum(aktuelles.created_at)}`}</span>
            <a href={urls[aktuelles.pfad]} target="_blank" rel="noreferrer" className="flex h-11 w-11 items-center justify-center" aria-label="Herunterladen"><Download className="h-4 w-4" /></a>
            {darfAendern(aktuelles) && (
              <button type="button" onClick={() => setLoeschFrage(aktuelles)} className="flex h-11 w-11 items-center justify-center" aria-label="Löschen">
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            )}
          </div>
        )}
      />
      {pdf && <Suspense fallback={null}><PdfVollbild datei={pdf} onSchliessen={() => setPdf(null)} /></Suspense>}

      <FotoDialog open={hochladenOffen} onOpenChange={setHochladenOffen} projektId={projektId} art={art} />

      <AlertDialog open={!!loeschFrage} onOpenChange={(o) => !o && setLoeschFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{loeschFrage?.art === "foto" ? "Foto löschen?" : "Dokument löschen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {loeschFrage?.beschreibung || loeschFrage?.name} wird endgültig gelöscht — auch für alle Kollegen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => loeschFrage && loeschen(loeschFrage)}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
