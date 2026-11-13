import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Building2, FileText, FolderOpen, Image as Bild, Lock, Plus, Search, Trash2, User, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Avatar, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DokumentDialog } from "@/components/dokumente/DokumentDialog";
import { dateiOeffnen, useFirmenDokumente, usePersonalDokumente } from "@/components/dokumente/dokumentDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { useMitarbeiter, useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { ablauf, groesseText, nachOrdner, passt, PERSONAL_ART, PERSONAL_ARTEN, personalTitel, type PersonalArt } from "@/lib/dokumente";
import { datum, isoTag } from "@/lib/format";
import { name, type FirmenDokument, type PersonalDokument } from "@/lib/types";
import { cn } from "@/lib/utils";

type Bereich = "firma" | "meine" | "mitarbeiter";

/**
 * Dokumente: Firmendokumente in Ordnern (Vorlagen, Zertifikate,
 * Versicherungen …) mit Suche, „Meine Dokumente“ (Lohnzettel, Krankenschein)
 * für jeden und — nur der Chef — die Ablage je Mitarbeiter.
 */
export default function Dokumente() {
  const { profil, istChef } = useSitzung();
  const [params, setParams] = useSearchParams();
  const bereiche: { wert: Bereich; text: string; icon: typeof User }[] = [
    { wert: "firma", text: "Firma", icon: Building2 },
    { wert: "meine", text: "Meine Dokumente", icon: User },
    ...(istChef ? [{ wert: "mitarbeiter" as Bereich, text: "Mitarbeiter", icon: Users }] : []),
  ];
  const bereich = (bereiche.find((b) => b.wert === params.get("bereich"))?.wert ?? "firma") as Bereich;

  return (
    <Seite titel="Dokumente" untertitel={bereich === "firma" ? "Vorlagen, Zertifikate, Versicherungen …" : bereich === "meine" ? "Lohnzettel, Meldungen, Krankenscheine" : "Ablage je Mitarbeiter"}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {bereiche.map(({ wert, text, icon: I }) => (
          <button key={wert} type="button" aria-pressed={bereich === wert}
            onClick={() => setParams(wert === "firma" ? {} : { bereich: wert }, { replace: true })}
            className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
              bereich === wert ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
            <I className="h-4 w-4" /> {text}
          </button>
        ))}
      </div>
      {bereich === "firma" && <FirmenAblage />}
      {bereich === "meine" && profil && <PersonAblage userId={profil.id} personName={name(profil)} eigene />}
      {bereich === "mitarbeiter" && istChef && <MitarbeiterAblage person={params.get("person")} setPerson={(id) => setParams(id ? { bereich: "mitarbeiter", person: id } : { bereich: "mitarbeiter" }, { replace: true })} />}
    </Seite>
  );
}

const DateiSymbol = ({ mime }: { mime: string | null }) =>
  mime?.startsWith("image/") ? <Bild className="h-5 w-5 shrink-0 text-primary" /> : <FileText className="h-5 w-5 shrink-0 text-primary" />;

function FirmenAblage() {
  const { istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: dokumente = [], isLoading } = useFirmenDokumente();
  const [suche, setSuche] = useState("");
  const [neu, setNeu] = useState<string | null>(null);
  const [weg, setWeg] = useState<FirmenDokument | null>(null);
  const heute = isoTag();
  const gefunden = useMemo(() => dokumente.filter((d) => passt(suche, d.titel, d.name, d.ordner, d.beschreibung)), [dokumente, suche]);
  const ordner = nachOrdner(gefunden);
  const alleOrdner = [...new Set(dokumente.map((d) => d.ordner))];

  const loeschen = async () => {
    if (!weg) return;
    const { error } = await supabase.from("firmen_dokumente").delete().eq("id", weg.id);
    if (error) return toast.error("Nicht gelöscht", { description: fehlerText(error) });
    await supabase.storage.from("firmen-dokumente").remove([weg.pfad]);
    toast.success("Dokument gelöscht");
    setWeg(null);
    await neuLaden("dokumente");
  };

  return (
    <>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9 text-base md:[@media(pointer:fine)]:text-sm" placeholder="Suchen — Titel, Ordner, Dateiname" aria-label="Dokumente suchen"
            value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        {istChef && <Button className="h-11 gap-1.5" onClick={() => setNeu("")}><Plus className="h-4 w-4" /> Dokument</Button>}
      </div>

      {!isLoading && ordner.length === 0 ? (
        <Leer icon={FolderOpen} text={suche ? "Nichts gefunden." : istChef ? "Noch keine Firmendokumente — Vorlagen, Zertifikate, Versicherungen hier ablegen." : "Noch keine Firmendokumente."} />
      ) : (
        <div className="space-y-4">
          {ordner.map((o) => (
            <section key={o.ordner} data-ordner={o.ordner}>
              <div className="flex items-center justify-between px-1 pb-1.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-muted-foreground" /> {o.ordner}
                  <span className="font-normal text-muted-foreground">· {o.dokumente.length}</span></h2>
                {istChef && <Button variant="ghost" size="sm" className="h-9 gap-1 text-primary" onClick={() => setNeu(o.ordner)}><Plus className="h-4 w-4" /> hierher</Button>}
              </div>
              <ul className="divide-y rounded-lg border bg-card">
                {o.dokumente.map((d) => {
                  const g = ablauf(d.gueltig_bis, heute);
                  return (
                    <li key={d.id} className="flex items-center gap-1 pr-1">
                      <button type="button" onClick={() => void dateiOeffnen("firmen-dokumente", d.pfad)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left">
                        <DateiSymbol mime={d.mime} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{d.titel}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="truncate">{d.name}</span>
                            {d.groesse ? <span>· {groesseText(d.groesse)}</span> : null}
                            {g && <StatusPille eintrag={{ ton: g.stufe === "abgelaufen" ? "rot" : g.stufe === "bald" ? "gelb" : "grau", text: g.text }} />}
                            {d.nur_chef && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> nur Chef</span>}
                          </span>
                        </span>
                      </button>
                      {istChef && (
                        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${d.titel} löschen`} onClick={() => setWeg(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {neu !== null && <DokumentDialog open onOpenChange={(o) => !o && setNeu(null)} ziel={{ art: "firma", ordner: neu }} ordnerListe={alleOrdner} />}
      <LoeschenFrage titel={weg?.titel} offen={!!weg} onAbbrechen={() => setWeg(null)} onLoeschen={() => void loeschen()} />
    </>
  );
}

function MitarbeiterAblage({ person, setPerson }: { person: string | null; setPerson: (id: string | null) => void }) {
  const { data: mitarbeiter = [] } = useMitarbeiter();
  const gewaehlt = mitarbeiter.find((m) => m.id === person) ?? null;
  return (
    <>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Mitarbeiter">
        {mitarbeiter.map((m) => (
          <button key={m.id} type="button" aria-pressed={person === m.id} onClick={() => setPerson(m.id)}
            className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-colors",
              person === m.id ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:bg-muted")}>
            <Avatar profil={m} className="h-7 w-7 text-[11px]" /> {m.vorname || m.nachname}
          </button>
        ))}
      </div>
      {gewaehlt
        ? <PersonAblage key={gewaehlt.id} userId={gewaehlt.id} personName={name(gewaehlt)} />
        : <Leer icon={Users} text="Mitarbeiter wählen — Lohnzettel, An- und Abmeldung, Krankenscheine, Verträge." />}
    </>
  );
}

/** Die Ablage einer Person, nach Art gruppiert. Neu = noch nicht geöffnet. */
function PersonAblage({ userId, personName, eigene = false }: { userId: string; personName: string; eigene?: boolean }) {
  const { profil, istChef } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: dokumente = [], isLoading } = usePersonalDokumente(userId);
  const [neu, setNeu] = useState(false);
  const [weg, setWeg] = useState<PersonalDokument | null>(null);
  const gruppen = PERSONAL_ARTEN.map((a) => ({ art: a, liste: dokumente.filter((d) => d.art === a) })).filter((g) => g.liste.length);

  const oeffnen = async (d: PersonalDokument) => {
    const ok = await dateiOeffnen("personal", d.pfad);
    if (ok && d.user_id === profil?.id && !d.gelesen_am) {
      await supabase.rpc("personal_dokument_gelesen", { p_id: d.id });
      await neuLaden("dokumente");
    }
  };
  const loeschen = async () => {
    if (!weg) return;
    const { data, error } = await supabase.from("personal_dokumente").delete().eq("id", weg.id).select("id");
    if (error || !data?.length) return toast.error("Nicht gelöscht", { description: error ? fehlerText(error) : "Löschen kann das nur der Chef." });
    await supabase.storage.from("personal").remove([weg.pfad]);
    toast.success("Dokument gelöscht");
    setWeg(null);
    await neuLaden("dokumente");
  };
  const darfLoeschen = (d: PersonalDokument) => istChef || (d.user_id === profil?.id && d.hochgeladen_von === profil?.id);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{eigene ? "Nur du und der Chef sehen diese Dokumente." : `Sieht nur ${personName} — und du.`}</p>
        <Button className="h-11 shrink-0 gap-1.5" onClick={() => setNeu(true)}><Plus className="h-4 w-4" /> {eigene ? "Hochladen" : "Dokument"}</Button>
      </div>
      {!isLoading && gruppen.length === 0 ? (
        <Leer icon={FileText} text={eigene ? "Noch keine Dokumente. Lohnzettel legt das Büro hier ab; Krankenschein kannst du selbst fotografieren." : "Noch keine Dokumente."} />
      ) : (
        <div className="space-y-4">
          {gruppen.map((g) => (
            <section key={g.art} data-art={g.art}>
              <h2 className="px-1 pb-1.5 text-sm font-semibold">{PERSONAL_ART[g.art as PersonalArt].mehrzahl}</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {g.liste.map((d) => (
                  <li key={d.id} className="flex items-center gap-1 pr-1">
                    <button type="button" onClick={() => void oeffnen(d)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left">
                      <DateiSymbol mime={d.mime} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", !d.gelesen_am && d.user_id === profil?.id ? "font-bold" : "font-medium")}>{personalTitel(d)}</span>
                          {!d.gelesen_am && <StatusPille eintrag={{ ton: "blau", text: eigene ? "Neu" : "ungelesen" }} />}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {datum(d.created_at.slice(0, 10))} · {d.name}{d.groesse ? ` · ${groesseText(d.groesse)}` : ""}
                        </span>
                      </span>
                    </button>
                    {darfLoeschen(d) && (
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${personalTitel(d)} löschen`} onClick={() => setWeg(d)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <DokumentDialog open={neu} onOpenChange={setNeu} ziel={{ art: "personal", userId, name: personName }} />
      <LoeschenFrage titel={weg ? personalTitel(weg) : undefined} offen={!!weg} onAbbrechen={() => setWeg(null)} onLoeschen={() => void loeschen()} />
    </>
  );
}

function LoeschenFrage({ titel, offen, onAbbrechen, onLoeschen }: { titel?: string; offen: boolean; onAbbrechen: () => void; onLoeschen: () => void }) {
  return (
    <AlertDialog open={offen} onOpenChange={(o) => !o && onAbbrechen()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
          <AlertDialogDescription>„{titel}“ samt Datei — das lässt sich nicht rückgängig machen.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11">Behalten</AlertDialogCancel>
          <Button variant="destructive" className="h-11" onClick={onLoeschen}>Löschen</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
