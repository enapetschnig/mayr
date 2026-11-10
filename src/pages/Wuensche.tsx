import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bug, HelpCircle, Image, Lightbulb, Loader2, MessageSquarePlus, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useSitzung } from "@/hooks/useSitzung";
import { WUNSCH_STATUS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Wunsch = {
  id: string; art: string; status: string; text: string; antwort: string | null; seite: string | null;
  bild_pfad: string | null; audio_pfad: string | null; abschrift: string; abschrift_fehler: string | null;
  created_at: string; erstellt_von: string | null;
};

const ART_ICON: Record<string, typeof Bug> = { wunsch: Lightbulb, fehler: Bug, frage: HelpCircle };
const FILTER = [
  { wert: "offen", text: "Offen" },
  { wert: "umgesetzt", text: "Umgesetzt" },
  { wert: "alle", text: "Alle" },
] as const;

/**
 * Änderungswünsche: Monteure sehen ihre eigenen, der Chef alle (RLS). Gemeldet
 * wird über „Änderung melden“ in jedem Seitenkopf; umgesetzt werden sie vom
 * Änderungswunsch-Roboter, der Status und Antwort hier zurückschreibt.
 */
export default function Wuensche() {
  const { istChef } = useSitzung();
  const [filter, setFilter] = useState<(typeof FILTER)[number]["wert"]>("offen");
  const { data: liste = [], isLoading } = useQuery({
    queryKey: ["aenderungswuensche"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("aenderungswuensche" as never) as any)
        .select("id, art, status, text, antwort, seite, bild_pfad, audio_pfad, abschrift, abschrift_fehler, created_at, erstellt_von")
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as Wunsch[];
    },
    // Abschrift und Antwort des Roboters kommen nach
    refetchInterval: 20_000,
  });
  const { data: namen = {} } = useQuery({
    queryKey: ["wunsch-melder"],
    enabled: istChef,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, vorname, nachname");
      return Object.fromEntries((data ?? []).map((p) => [p.id, `${p.vorname} ${p.nachname}`.trim()]));
    },
  });

  const sichtbar = liste.filter((w) =>
    filter === "alle" ? true : filter === "umgesetzt" ? w.status === "umgesetzt" || w.status === "abgelehnt" : w.status === "neu" || w.status === "gesehen");

  return (
    <Seite titel="Änderungswünsche" untertitel={istChef ? "Alle Wünsche aus dem Betrieb" : "Was du gemeldet hast"}>
      <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        Oben rechts auf jeder Seite: <span className="inline-flex items-center gap-1 font-medium text-foreground"><MessageSquarePlus className="h-4 w-4" /> Änderung melden</span> —
        sagen oder tippen, was anders sein soll. Ist es umgesetzt, steht hier die Antwort; mit „Jetzt aktualisieren“ unten links kommt der neue Stand.
      </p>
      <div className="flex flex-wrap gap-2">
        {FILTER.map((f) => (
          <Button key={f.wert} variant="outline" size="sm" onClick={() => setFilter(f.wert)}
            className={cn("rounded-full", filter === f.wert && "border-primary bg-primary-soft text-primary")}>
            {f.text}
          </Button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : !sichtbar.length ? (
        <Leer icon={MessageSquarePlus} text={filter === "offen" ? "Nichts offen." : "Noch keine Wünsche."} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {sichtbar.map((w) => <WunschKarte key={w.id} w={w} melder={istChef && w.erstellt_von ? namen[w.erstellt_von] : undefined} />)}
        </div>
      )}
    </Seite>
  );
}

function WunschKarte({ w, melder }: { w: Wunsch; melder?: string }) {
  const Icon = ART_ICON[w.art] ?? Lightbulb;
  const [url, setUrl] = useState<{ bild?: string; ton?: string }>({});
  const laden = async (art: "bild" | "ton", pfad: string) => {
    const { data } = await supabase.storage.from("aenderungswuensche").createSignedUrl(pfad, 600);
    if (data?.signedUrl) setUrl((u) => ({ ...u, [art]: data.signedUrl }));
  };
  return (
    <article className="flex flex-col gap-2 rounded-lg border bg-card p-4" data-wunsch={w.id}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {new Date(w.created_at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {melder ? ` · ${melder}` : ""}{w.seite ? ` · ${w.seite}` : ""}
        </p>
        <StatusPille eintrag={WUNSCH_STATUS[w.status]} />
      </div>
      {w.text ? <p className="whitespace-pre-line text-sm">{w.text}</p> : null}
      {w.abschrift === "offen" || w.abschrift === "laeuft" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sprachnachricht wird abgeschrieben …</p>
      ) : w.abschrift === "fehler" ? (
        <p className="text-xs text-status-gelb-fg">Abschrift ging nicht ({w.abschrift_fehler}) — die Aufnahme ist trotzdem angekommen.</p>
      ) : null}
      {w.antwort && (
        <div className="rounded-md border-l-4 border-primary bg-primary-soft/60 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-primary">Antwort</p>
          <p className="whitespace-pre-line">{w.antwort}</p>
        </div>
      )}
      {(w.bild_pfad || w.audio_pfad) && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {w.bild_pfad && !url.bild && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void laden("bild", w.bild_pfad!)}><Image className="h-4 w-4" /> Bild</Button>
          )}
          {w.audio_pfad && !url.ton && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void laden("ton", w.audio_pfad!)}><Mic className="h-4 w-4" /> Anhören</Button>
          )}
          {url.ton && <audio controls autoPlay src={url.ton} className="h-9 w-full" />}
          {url.bild && <a href={url.bild} target="_blank" rel="noreferrer" className="w-full"><img src={url.bild} alt="Bildschirm beim Melden" className="max-h-56 w-full rounded border object-contain" /></a>}
        </div>
      )}
    </article>
  );
}
