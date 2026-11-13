import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, Loader2, Pencil, Repeat, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { Avatar, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AufgabeDialog } from "@/components/aufgaben/AufgabeDialog";
import { aufgabeFotoHochladen, useAufgabeVerlauf, type AufgabeMitInfo } from "@/components/aufgaben/aufgabenDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { anzeigeStatus, faelligText, PRIORITAET, verlaufText, WIEDERHOLUNG } from "@/lib/aufgaben";
import { isoTag } from "@/lib/format";
import { AUFGABE_STATUS, name } from "@/lib/types";
import { cn } from "@/lib/utils";

const ZEIT = (iso: string) => new Date(iso).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Eine Aufgabe: Status setzen (Offen → In Arbeit → Erledigt), Verlauf
 * lesen, kommentieren, Foto anhängen. Ändern und löschen darf, wer sie
 * angelegt hat, oder der Chef; Zuständige setzen Status und kommentieren.
 */
export function AufgabeDetail({ aufgabe, onOpenChange }: { aufgabe: AufgabeMitInfo | null; onOpenChange: (o: boolean) => void }) {
  const neuLaden = useNeuLaden();
  const { profil, istChef } = useSitzung();
  const { data: mitarbeiter = [] } = useMitarbeiter();
  // Die Aufgabe frisch halten (Status ändert sich hier im Dialog)
  const { data: frisch } = useQuery({
    queryKey: ["aufgaben", "eine", aufgabe?.id],
    enabled: !!aufgabe,
    queryFn: async () => {
      const { data } = await supabase.from("aufgaben").select("*, projekte(nummer, name), kunden(name)").eq("id", aufgabe!.id).maybeSingle();
      return data as AufgabeMitInfo | null;
    },
  });
  const a = frisch ?? aufgabe;
  const { data: verlauf = [] } = useAufgabeVerlauf(a?.id);
  const [kommentar, setKommentar] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const fotoFeld = useRef<HTMLInputElement>(null);
  const heute = isoTag();

  useEffect(() => { setKommentar(""); setFoto(null); }, [aufgabe?.id]);

  // Fotos im Verlauf: signierte Adressen
  const fotoPfade = verlauf.filter((v) => v.foto_pfad).map((v) => v.foto_pfad!);
  const { data: fotoUrls = {} } = useQuery({
    queryKey: ["aufgaben", "fotos", fotoPfade],
    enabled: fotoPfade.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from("aufgaben").createSignedUrls(fotoPfade, 3600);
      return Object.fromEntries((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    },
  });

  if (!a) return null;
  const darfAendern = istChef || a.erstellt_von === profil?.id;
  const zustaendige = mitarbeiter.filter((m) => a.zustaendig.includes(m.id));
  const st = anzeigeStatus(a, heute);

  const statusSetzen = async (s: string) => {
    if (s === a.status) return;
    setLaeuft(true);
    const { data, error } = await supabase.from("aufgaben").update({ status: s }).eq("id", a.id).select("id");
    setLaeuft(false);
    if (error) return toast.error("Nicht geändert", { description: fehlerText(error) });
    if (!data?.length) return toast.error("Nicht geändert — die Aufgabe ist dir nicht zugewiesen.");
    toast.success(s === "erledigt" ? (a.wiederholung ? "Erledigt — die nächste Runde ist angelegt" : "Erledigt") : `Status: ${AUFGABE_STATUS[s].text}`);
    await neuLaden("aufgaben");
  };

  const senden = async () => {
    if (!kommentar.trim() && !foto) return;
    setLaeuft(true);
    try {
      const pfad = foto ? await aufgabeFotoHochladen(a.id, foto) : null;
      const { error } = await supabase.from("aufgabe_verlauf").insert({ aufgabe_id: a.id, user_id: profil!.id, art: "kommentar", text: kommentar.trim() || null, foto_pfad: pfad });
      if (error) throw error;
      setKommentar("");
      setFoto(null);
      await neuLaden("aufgaben");
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e as Error) });
    } finally {
      setLaeuft(false);
    }
  };

  const loeschenJetzt = async () => {
    setLaeuft(true);
    const { data, error } = await supabase.from("aufgaben").delete().eq("id", a.id).select("id");
    setLaeuft(false);
    setLoeschen(false);
    if (error || !data?.length) return toast.error("Nicht gelöscht", { description: error ? fehlerText(error) : "Löschen kann nur, wer sie angelegt hat, oder der Chef." });
    const pfade = verlauf.filter((v) => v.foto_pfad).map((v) => v.foto_pfad!);
    if (pfade.length) await supabase.storage.from("aufgaben").remove(pfade);
    toast.success("Aufgabe gelöscht");
    await neuLaden("aufgaben");
    onOpenChange(false);
  };

  const statusKnopf = (s: string, text: string) => (
    <button key={s} type="button" onClick={() => void statusSetzen(s)} disabled={laeuft} aria-pressed={a.status === s}
      className={cn("flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-semibold transition-colors",
        a.status === s ? (s === "erledigt" ? "border-status-gruen bg-status-gruen text-status-gruen-fg" : "border-primary bg-primary-soft text-primary") : "bg-card hover:bg-muted")}>
      {s === "erledigt" && <Check className="h-4 w-4" />} {text}
    </button>
  );

  return (
    <FormularDialog open={!!aufgabe} onOpenChange={onOpenChange} titel="Aufgabe" gesperrt={laeuft}
      fuss={
        <>
          {darfAendern && (
            <Button variant="ghost" className="text-destructive sm:mr-auto" onClick={() => setLoeschen(true)} disabled={laeuft}>
              <Trash2 className="mr-2 h-4 w-4" /> Löschen
            </Button>
          )}
          {darfAendern && <Button variant="outline" onClick={() => setBearbeiten(true)} disabled={laeuft}><Pencil className="mr-2 h-4 w-4" /> Bearbeiten</Button>}
          <Button onClick={() => onOpenChange(false)}>Fertig</Button>
        </>
      }>
      <div className="max-w-2xl space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPille eintrag={AUFGABE_STATUS[st]} />
            {a.prioritaet !== "normal" && <StatusPille eintrag={PRIORITAET[a.prioritaet]} />}
            {a.wiederholung && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Repeat className="h-3 w-3" /> {WIEDERHOLUNG[a.wiederholung]}</span>}
          </div>
          <h2 className="text-xl font-semibold leading-tight" data-aufgabe-titel>{a.titel}</h2>
          <p className={cn("text-sm", st === "ueberfaellig" ? "font-medium text-status-rot-fg" : "text-muted-foreground")}>
            {a.status === "erledigt" && a.erledigt_am
              ? `Erledigt ${ZEIT(a.erledigt_am)}${a.erledigt_von ? ` von ${name(mitarbeiter.find((m) => m.id === a.erledigt_von))}` : ""}`
              : faelligText(a.faellig_am, heute)}
          </p>
          {a.beschreibung && <p className="whitespace-pre-wrap text-sm">{a.beschreibung}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {zustaendige.length > 0 ? (
              <span className="flex items-center gap-1.5">
                {zustaendige.map((m) => <Avatar key={m.id} profil={m} className="h-7 w-7 text-[11px]" />)}
                <span className="text-muted-foreground">{zustaendige.map((m) => m.vorname).join(", ")}</span>
              </span>
            ) : <span className="text-muted-foreground">Niemand zuständig</span>}
            {a.projekte && <Link to={`/projekte/${a.projekt_id}`} className="font-medium text-primary hover:underline">{a.projekte.nummer} {a.projekte.name}</Link>}
            {a.kunden && <span className="text-muted-foreground">Kunde: {a.kunden.name}</span>}
          </div>
        </div>

        <div className="flex gap-2" role="group" aria-label="Status">
          {statusKnopf("offen", "Offen")}
          {statusKnopf("in_arbeit", "In Arbeit")}
          {statusKnopf("erledigt", "Erledigt")}
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Verlauf</h3>
          <ol className="space-y-3" data-verlauf>
            {verlauf.map((v) => (
              <li key={v.id} className="flex gap-2.5">
                <Avatar profil={v.profiles} className="h-7 w-7 text-[11px]" />
                <div className={cn("min-w-0 flex-1", v.art === "kommentar" && "rounded-lg border bg-card px-3 py-2")}>
                  <p className="text-xs text-muted-foreground">{v.profiles ? name(v.profiles) : "System"} · {ZEIT(v.created_at)}</p>
                  <p className={cn("text-sm", v.art !== "kommentar" && "text-muted-foreground", v.art === "kommentar" && "whitespace-pre-wrap")}>
                    {verlaufText(v, (s) => AUFGABE_STATUS[s]?.text ?? s)}
                  </p>
                  {v.foto_pfad && fotoUrls[v.foto_pfad] && (
                    <a href={fotoUrls[v.foto_pfad]} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img src={fotoUrls[v.foto_pfad]} alt="Foto zur Aufgabe" className="max-h-56 rounded-md border object-contain" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-2 rounded-lg border bg-card p-3">
            <Textarea rows={2} className="text-base md:[@media(pointer:fine)]:text-sm" placeholder="Kommentar — z. B. „Material bestellt, kommt Dienstag“"
              aria-label="Kommentar" value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
            {foto && (
              <p className="flex items-center gap-2 text-sm">
                <Camera className="h-4 w-4 text-primary" /> <span className="min-w-0 flex-1 truncate">{foto.name}</span>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Foto entfernen" onClick={() => setFoto(null)}><X className="h-4 w-4" /></Button>
              </p>
            )}
            <div className="flex gap-2">
              <input ref={fotoFeld} type="file" accept="image/*" className="hidden" onChange={(e) => { setFoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => fotoFeld.current?.click()} disabled={laeuft}>
                <Camera className="h-4 w-4" /> Foto
              </Button>
              <Button type="button" className="h-11 flex-1 gap-1.5" onClick={() => void senden()} disabled={laeuft || (!kommentar.trim() && !foto)}>
                {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Kommentieren
              </Button>
            </div>
          </div>
        </section>
      </div>

      <AufgabeDialog open={bearbeiten} onOpenChange={setBearbeiten} aufgabe={a} />
      <AlertDialog open={loeschen} onOpenChange={setLoeschen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
            <AlertDialogDescription>„{a.titel}“ samt Verlauf und Fotos — das lässt sich nicht rückgängig machen. Erledigt setzen behält den Verlauf.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
            <Button variant="destructive" className="h-11" onClick={() => void loeschenJetzt()}>Löschen</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormularDialog>
  );
}
