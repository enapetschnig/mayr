import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, Check, FileText, ImageOff, ImagePlus, Loader2, MapPin, Pencil, Plus, Star, Trash2, Truck, Upload, Warehouse,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArtikelDialog } from "@/components/stamm/ArtikelDialog";
import { ArtikelLieferantDialog } from "@/components/material/ArtikelLieferantDialog";
import {
  artikelDateiHochladen, artikelDateiLoeschen, lagerplatzSetzen, platzSchluessel, useArtikelBewegungen, useArtikelDateien,
  useArtikelLieferanten, useLagerplaetze, type ArtikelDateiMitUrl, type ArtikelLieferant,
} from "@/components/material/artikelDaten";
import { aufschlagAus, besterLieferant, bewegungsGruppe, ekVon, mitBestandDanach, type BewegungsFilter } from "@/components/material/artikelLogik";
import { fehlerText, mengeText, useAlleLagerorte, zeitpunktText, type BuchungMitBezug } from "@/components/material/materialDaten";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { dezimalLesen, euro, zahl } from "@/lib/format";
import { artikelVk, vkHerkunft } from "@/lib/preise";
import { BUCHUNGS_ART, name, type Artikel, type BuchungsArt } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER: { wert: BewegungsFilter; text: string }[] = [
  { wert: "alle", text: "Alle" }, { wert: "zugang", text: "Zugänge" }, { wert: "abgang", text: "Abgänge" },
  { wert: "umbuchung", text: "Umbuchungen" }, { wert: "projekt", text: "Projekte" }, { wert: "inventur", text: "Inventur" },
];
const SEITE = 30;

/**
 * Ein Artikel auf einen Blick: Bild, Daten, Preis (woher der VK kommt),
 * Lieferanten, Bestand und Lagerplatz je Lagerort, Datenblätter und alle
 * Bewegungen mit Bestand danach. Bearbeiten öffnet den Artikel-Dialog.
 * Monteure sehen alles außer Preisen und Lieferanten.
 */
export default function ArtikelDetail() {
  const { id } = useParams<{ id: string }>();
  const { firma, istChef, profil } = useSitzung();
  const neuLaden = useNeuLaden();
  const [bearbeiten, setBearbeiten] = useState(false);

  const { data: artikel, isLoading, error } = useQuery({
    queryKey: ["artikel", "eins", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("artikel").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Artikel | null;
    },
  });
  const { data: dateien = [] } = useArtikelDateien(id);
  const { data: weitere = [] } = useArtikelLieferanten(id, istChef);
  const { data: orteAlle = [] } = useAlleLagerorte();
  const { data: plaetze } = useLagerplaetze();
  const { data: bewegungen = [], isLoading: laedtBewegungen } = useArtikelBewegungen(id);

  const bilder = dateien.filter((d) => d.art === "bild");
  const blaetter = dateien.filter((d) => d.art === "datenblatt");

  if (isLoading) {
    return <Seite titel="Artikel"><p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p></Seite>;
  }
  if (error || !artikel) {
    return (
      <Seite titel="Artikel" zurueckPfad="/artikel">
        <Leer icon={ImageOff} text={error ? fehlerText(error) : "Diesen Artikel gibt es nicht (mehr)."} />
      </Seite>
    );
  }
  const a = artikel;
  const info = [a.hersteller, a.hersteller_nr].filter(Boolean).join(" · ") || [a.lieferant, a.artikelnummer].filter(Boolean).join(" · ");

  return (
    <Seite
      titel={a.bezeichnung}
      untertitel={info || undefined}
      zurueckPfad="/artikel"
      breit
      aktionen={
        <Button variant="outline" className="h-11 px-3" onClick={() => setBearbeiten(true)} aria-label={istChef ? "Artikel bearbeiten" : "Artikel ansehen"}>
          <Pencil className="h-4 w-4" /><span className="hidden sm:inline">{istChef ? "Bearbeiten" : "Strichcodes"}</span>
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-5">
          <Bilder artikelId={a.id} bilder={bilder} darf={istChef} />
          <Karte titel="Artikel">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Zeile name="Hersteller" wert={a.hersteller} />
              <Zeile name="Hersteller-Nr." wert={a.hersteller_nr} mono />
              <Zeile name="Lieferant" wert={a.lieferant} />
              <Zeile name="Artikelnummer" wert={a.artikelnummer} mono />
              <Zeile name="EAN" wert={a.ean} mono />
              <Zeile name="Einheit" wert={a.einheit} />
              <Zeile name="Kategorie" wert={a.kategorie} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.lagerartikel && <StatusPille eintrag={{ ton: "blau", text: "Lagerartikel" }} />}
              {!a.aktiv && <StatusPille eintrag={{ ton: "grau", text: "Inaktiv" }} />}
              {a.mindestbestand != null && <StatusPille eintrag={{ ton: "grau", text: `min. ${zahl(a.mindestbestand)} ${a.einheit}` }} />}
            </div>
            {a.langtext && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{a.langtext}</p>}
          </Karte>
          <Datenblaetter artikelId={a.id} blaetter={blaetter} darf={istChef} />
        </div>

        <div className="space-y-5">
          {istChef && <PreisKarte artikel={a} />}
          {istChef && <Lieferanten artikel={a} weitere={weitere} />}
          <BestandKarte
            artikel={a}
            orte={orteAlle.filter((o) => o.aktiv)}
            plaetze={plaetze}
            bewegungen={bewegungen}
            darfPlatz={(ortUser) => istChef || (!!profil && ortUser === profil.id)}
            onGespeichert={() => void neuLaden("lager")}
          />
          <Bewegungen artikel={a} bewegungen={bewegungen} laedt={laedtBewegungen} orte={orteAlle} />
        </div>
      </div>

      <ArtikelDialog open={bearbeiten} onOpenChange={setBearbeiten} artikel={a} />
    </Seite>
  );
}

function Zeile({ name: n, wert, mono }: { name: string; wert: string | null | undefined; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{n}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-[13px]")}>{wert || "–"}</dd>
    </>
  );
}

// ── Bilder ────────────────────────────────────────────────────────────

function Bilder({ artikelId, bilder, darf }: { artikelId: string; bilder: ArtikelDateiMitUrl[]; darf: boolean }) {
  const neuLaden = useNeuLaden();
  const [gross, setGross] = useState(0);
  const [laeuft, setLaeuft] = useState(false);
  const kamera = useRef<HTMLInputElement>(null);
  const datei = useRef<HTMLInputElement>(null);
  const aktuell = bilder[Math.min(gross, bilder.length - 1)];

  const hochladen = async (liste: FileList | null) => {
    const files = [...(liste ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return toast.error("Bitte ein Bild wählen (JPG, PNG).");
    setLaeuft(true);
    try {
      for (const f of files) await artikelDateiHochladen(artikelId, f, "bild");
      await neuLaden("artikel");
      toast.success(files.length === 1 ? "Bild gespeichert" : `${files.length} Bilder gespeichert`);
    } catch (e) {
      toast.error("Bild nicht gespeichert", { description: fehlerText(e) });
    } finally {
      setLaeuft(false);
    }
  };
  const loeschen = async (d: ArtikelDateiMitUrl) => {
    try {
      await artikelDateiLoeschen(d);
      setGross(0);
      await neuLaden("artikel");
      toast.success("Bild entfernt");
    } catch (e) {
      toast.error("Nicht entfernt", { description: fehlerText(e) });
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-muted/40">
        {aktuell?.url ? (
          <img src={aktuell.url} alt={aktuell.name ?? "Artikelbild"} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="h-10 w-10 opacity-40" /> Noch kein Bild
          </div>
        )}
        {darf && aktuell && (
          <Button variant="outline" size="icon" className="absolute right-2 top-2 h-11 w-11 bg-card" aria-label="Dieses Bild entfernen"
            onClick={() => void loeschen(aktuell)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {gross === 0 && bilder.length > 1 && (
          <span className="absolute left-2 top-2 rounded-full bg-card px-2 py-0.5 text-xs font-medium">Hauptbild</span>
        )}
      </div>
      {(bilder.length > 1 || darf) && (
        <div className="flex gap-2 overflow-x-auto p-2">
          {bilder.length > 1 && bilder.map((b, i) => (
            <button key={b.id} type="button" onClick={() => setGross(i)} aria-label={`Bild ${i + 1}`}
              className={cn("h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted/40", i === gross && "ring-2 ring-primary")}>
              {b.url && <img src={b.url} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
          {darf && (
            <div className="ml-auto flex shrink-0 gap-2">
              <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { void hochladen(e.target.files); e.target.value = ""; }} />
              <input ref={datei} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { void hochladen(e.target.files); e.target.value = ""; }} />
              <Button variant="outline" className="h-14 gap-1.5 px-3" disabled={laeuft} onClick={() => kamera.current?.click()}>
                <Camera className="h-4 w-4" /> Foto
              </Button>
              <Button variant="outline" className="h-14 gap-1.5 px-3" disabled={laeuft} onClick={() => datei.current?.click()}>
                {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Bild
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Datenblätter ──────────────────────────────────────────────────────

function Datenblaetter({ artikelId, blaetter, darf }: { artikelId: string; blaetter: ArtikelDateiMitUrl[]; darf: boolean }) {
  const neuLaden = useNeuLaden();
  const [laeuft, setLaeuft] = useState(false);
  const eingabe = useRef<HTMLInputElement>(null);
  const hochladen = async (liste: FileList | null) => {
    const files = [...(liste ?? [])];
    if (!files.length) return;
    setLaeuft(true);
    try {
      for (const f of files) await artikelDateiHochladen(artikelId, f, "datenblatt");
      await neuLaden("artikel");
      toast.success("Datenblatt gespeichert");
    } catch (e) {
      toast.error("Nicht gespeichert", { description: fehlerText(e) });
    } finally {
      setLaeuft(false);
    }
  };
  const loeschen = async (d: ArtikelDateiMitUrl) => {
    try {
      await artikelDateiLoeschen(d);
      await neuLaden("artikel");
      toast.success("Datenblatt entfernt");
    } catch (e) {
      toast.error("Nicht entfernt", { description: fehlerText(e) });
    }
  };
  if (!darf && !blaetter.length) return null;
  return (
    <Karte titel="Datenblätter" ohnePolster aktion={darf ? (
      <>
        <input ref={eingabe} type="file" accept="application/pdf,image/*" multiple className="hidden"
          onChange={(e) => { void hochladen(e.target.files); e.target.value = ""; }} />
        <Button variant="outline" className="-my-1.5 h-11 gap-1.5" disabled={laeuft} onClick={() => eingabe.current?.click()}>
          {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Hochladen
        </Button>
      </>
    ) : undefined}>
      {!blaetter.length ? (
        <p className="px-4 pb-3 text-sm text-muted-foreground lg:px-5">Noch kein Datenblatt. PDF vom Hersteller hochladen — es geht später auch als Anhang zum Angebot.</p>
      ) : (
        <ul className="divide-y border-t">
          {blaetter.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-4 py-1.5 lg:px-5">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <a href={d.url ?? undefined} target="_blank" rel="noreferrer"
                className="flex min-h-11 min-w-0 flex-1 items-center truncate text-sm font-medium text-primary hover:underline">
                {d.name ?? "Datenblatt"}
              </a>
              {darf && (
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={`${d.name} entfernen`}
                  onClick={() => void loeschen(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Karte>
  );
}

// ── Preis ─────────────────────────────────────────────────────────────

type PreisArt = "standard" | "aufschlag" | "fest";

function PreisKarte({ artikel: a }: { artikel: Artikel }) {
  const { firma } = useSitzung();
  const neuLaden = useNeuLaden();
  const start: PreisArt = a.vk_preis != null ? "fest" : a.aufschlag != null ? "aufschlag" : "standard";
  const [art, setArt] = useState<PreisArt>(start);
  const [wert, setWert] = useState(start === "fest" ? zahl(a.vk_preis) : start === "aufschlag" ? zahl(a.aufschlag) : "");
  const [speichert, setSpeichert] = useState(false);
  const vk = artikelVk(a, firma);
  const herkunft = vkHerkunft(a, firma);
  const ek = a.ek_preis != null ? Number(a.ek_preis) : null;
  const zahlNeu = dezimalLesen(wert);
  const vorschau = art === "standard" ? artikelVk({ ...a, vk_preis: null, aufschlag: null }, firma)
    : art === "aufschlag" ? (zahlNeu != null ? artikelVk({ ...a, vk_preis: null, aufschlag: zahlNeu }, firma) : null)
      : zahlNeu;
  const geaendert = art !== start || (art !== "standard" && zahlNeu !== (art === "fest" ? a.vk_preis : a.aufschlag));

  const speichern = async () => {
    if (art !== "standard" && (zahlNeu == null || zahlNeu < (art === "fest" ? 0 : -100) || zahlNeu > (art === "fest" ? 1e7 : 1000))) {
      return toast.error(art === "fest" ? "Bitte einen gültigen VK eintragen." : "Aufschlag zwischen −100 und 1000 %.");
    }
    setSpeichert(true);
    const { error } = await supabase.from("artikel").update({
      vk_preis: art === "fest" ? zahlNeu : null,
      aufschlag: art === "aufschlag" ? zahlNeu : null,
    }).eq("id", a.id);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await neuLaden("artikel", "leistungen");
    toast.success("Preis gespeichert");
  };

  return (
    <Karte titel="Preis">
      <div className="grid grid-cols-3 gap-3">
        <PreisZahl titel="Liste" wert={a.listenpreis != null ? euro(a.listenpreis) : "–"} />
        <PreisZahl titel="EK" wert={ek != null ? euro(ek) : "–"}
          unter={a.listenpreis && ek != null && ek < Number(a.listenpreis) ? `−${zahl(((Number(a.listenpreis) - ek) / Number(a.listenpreis)) * 100)} %` : undefined} />
        <PreisZahl titel={`VK je ${a.einheit}`} wert={euro(vk)} gross
          unter={a.vk_preis != null && ek ? `= +${zahl(aufschlagAus(ek, Number(a.vk_preis)))} %` : undefined} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <StatusPille eintrag={{ ton: herkunft.art === "fest" ? "lila" : herkunft.art === "artikel" ? "blau" : "grau", text: herkunft.text }} />
      </div>
      <div className="mt-4 space-y-3 border-t pt-4">
        <div role="radiogroup" aria-label="Wie entsteht der VK?" className="grid grid-cols-3 gap-1 rounded-lg border bg-secondary p-1">
          {([["standard", "Standard"], ["aufschlag", "Aufschlag %"], ["fest", "VK fest"]] as const).map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={art === k}
              onClick={() => { setArt(k); setWert(k === "fest" ? zahl(a.vk_preis ?? vk) : k === "aufschlag" ? zahl(a.aufschlag ?? firma?.material_aufschlag ?? 0) : ""); }}
              className={cn("h-11 min-w-0 truncate rounded-md px-1 text-sm font-medium transition-colors",
                art === k ? "bg-card font-semibold text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground")}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {art !== "standard" && (
            <div className="flex items-center gap-2">
              <Input className="zahl h-11 w-32 text-base" inputMode="decimal" value={wert} onChange={(e) => setWert(e.target.value)}
                aria-label={art === "fest" ? "Fester VK" : "Aufschlag in Prozent"} />
              <span className="text-sm text-muted-foreground">{art === "fest" ? "€" : "%"}</span>
            </div>
          )}
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {art === "standard" ? `EK + ${zahl(firma?.material_aufschlag ?? 0)} % des Betriebs` : art === "aufschlag" ? "auf den EK, nur dieser Artikel" : "unabhängig vom EK"}
            {vorschau != null && <> → <span className="zahl font-semibold text-foreground">{euro(vorschau)}</span></>}
          </p>
          <Button className="h-11" disabled={!geaendert || speichert} onClick={() => void speichern()}>
            {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Übernehmen
          </Button>
        </div>
      </div>
    </Karte>
  );
}

function PreisZahl({ titel, wert, unter, gross }: { titel: string; wert: string; unter?: string; gross?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{titel}</p>
      <p className={cn("zahl truncate font-semibold", gross ? "text-xl text-foreground" : "text-base")}>{wert}</p>
      {unter && <p className="zahl truncate text-xs text-muted-foreground">{unter}</p>}
    </div>
  );
}

// ── Lieferanten ───────────────────────────────────────────────────────

function Lieferanten({ artikel: a, weitere }: { artikel: Artikel; weitere: ArtikelLieferant[] }) {
  const [dialog, setDialog] = useState<{ eintrag: ArtikelLieferant | null } | null>(null);
  const best = besterLieferant(a, weitere);
  const zeilen: { schluessel: string; lieferant: string; nr: string | null; ek: number | null; liste: number | null; zeit: number | null; haupt: boolean; eintrag: ArtikelLieferant | null }[] = [
    { schluessel: "haupt", lieferant: a.lieferant, nr: a.artikelnummer, ek: a.ek_preis, liste: a.listenpreis, zeit: null, haupt: true, eintrag: null },
    ...weitere.map((w) => ({ schluessel: w.id, lieferant: w.lieferant, nr: w.lieferanten_nr, ek: ekVon(w), liste: w.listenpreis, zeit: w.lieferzeit_tage, haupt: false, eintrag: w })),
  ];
  return (
    <Karte titel="Lieferanten" ohnePolster aktion={
      <Button variant="outline" className="-my-1.5 h-11 gap-1.5" onClick={() => setDialog({ eintrag: null })}>
        <Plus className="h-4 w-4" /> Lieferant
      </Button>
    }>
      <ul className="divide-y border-t">
        {zeilen.map((z) => {
          const gewaehlt = best.lieferant === z.lieferant;
          const inhalt = (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{z.lieferant}</span>
                  {z.haupt && <StatusPille eintrag={{ ton: "grau", text: "am Artikel" }} />}
                  {gewaehlt && weitere.length > 0 && (
                    <StatusPille eintrag={{ ton: "gruen", text: best.grund === "bevorzugt" ? "bevorzugt" : "günstigster" }} />
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[z.nr && `Nr. ${z.nr}`, z.liste != null && `Liste ${euro(z.liste)}`, z.zeit != null && `${z.zeit} Tage Lieferzeit`].filter(Boolean).join(" · ") || "–"}
                </p>
              </div>
              <span className={cn("zahl shrink-0 text-right font-semibold", gewaehlt && weitere.length > 0 && "text-primary")}>
                {z.ek != null ? euro(z.ek) : "–"}
              </span>
              {gewaehlt && best.grund === "bevorzugt" && <Star className="h-4 w-4 shrink-0 fill-current text-primary" aria-label="bevorzugt" />}
            </>
          );
          return (
            <li key={z.schluessel}>
              {z.eintrag ? (
                <button type="button" onClick={() => setDialog({ eintrag: z.eintrag })}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/40 lg:px-5">
                  {inhalt}
                </button>
              ) : (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2 lg:px-5">{inhalt}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2.5 text-xs text-muted-foreground lg:px-5">
        Angebote rechnen mit dem EK am Artikel. Bestellungen gehen an den bevorzugten Lieferanten, sonst an den günstigsten.
      </p>
      <ArtikelLieferantDialog
        open={!!dialog}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        artikelId={a.id}
        hauptLieferant={a.lieferant}
        einheit={a.einheit}
        eintrag={dialog?.eintrag ?? null}
        vergeben={weitere.map((w) => w.lieferant)}
      />
    </Karte>
  );
}

// ── Bestand und Lagerplatz ────────────────────────────────────────────

function BestandKarte({
  artikel: a, orte, plaetze, bewegungen, darfPlatz, onGespeichert,
}: {
  artikel: Artikel;
  orte: { id: string; name: string; art: string; user_id: string | null }[];
  plaetze: Map<string, string> | undefined;
  bewegungen: { art: string; menge: number | string; lagerort_id: string | null }[];
  darfPlatz: (ortUser: string | null) => boolean;
  onGespeichert: () => void;
}) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [speichert, setSpeichert] = useState(false);
  // Bestand je Ort aus den Bewegungen (dieselbe Rechnung wie die View lagerbestand)
  const jeOrt = useMemo(() => {
    const m = new Map<string, number>();
    mitBestandDanach(bewegungen.map((b, i) => ({ ...b, id: String(i), created_at: "" }))).forEach((b) => {
      if (b.lagerort_id) m.set(b.lagerort_id, Math.round(((m.get(b.lagerort_id) ?? 0) + b.delta) * 1000) / 1000);
    });
    return m;
  }, [bewegungen]);
  const gesamt = orte.reduce((s, o) => s + (jeOrt.get(o.id) ?? 0), 0);

  const speichern = async (ortId: string) => {
    setSpeichert(true);
    try {
      await lagerplatzSetzen(a.id, ortId, text);
      onGespeichert();
      setBearbeite(null);
    } catch (e) {
      toast.error("Lagerplatz nicht gespeichert", { description: fehlerText(e) });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Karte titel={`Bestand · ${mengeText(Math.round(gesamt * 1000) / 1000, a.einheit)}`} ohnePolster>
      <ul className="divide-y border-t">
        {orte.map((o) => {
          const b = jeOrt.get(o.id) ?? 0;
          const platz = plaetze?.get(platzSchluessel(a.id, o.id));
          const darf = darfPlatz(o.user_id);
          return (
            <li key={o.id} className="px-4 py-2 lg:px-5">
              <div className="flex min-h-11 items-center gap-3">
                {o.art === "fahrzeug" ? <Truck className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  {bearbeite !== o.id && (
                    darf ? (
                      <button type="button" onClick={() => { setBearbeite(o.id); setText(platz ?? ""); }}
                        className="-my-1 flex min-h-10 items-center gap-1 pr-3 text-xs text-muted-foreground hover:text-primary">
                        <MapPin className="h-3 w-3" /> {platz || "Lagerplatz eintragen"}
                      </button>
                    ) : platz ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {platz}</p>
                    ) : null
                  )}
                </div>
                <span className={cn("zahl shrink-0 font-semibold", !b && "font-normal text-muted-foreground", b < 0 && "text-destructive")}>
                  {b ? mengeText(b, a.einheit) : "–"}
                </span>
              </div>
              {bearbeite === o.id && (
                <div className="flex gap-2 pb-1 pt-1">
                  <Input className="h-11 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Regal 3, Fach B" autoFocus
                    maxLength={60} aria-label={`Lagerplatz in ${o.name}`} onKeyDown={(e) => { if (e.key === "Enter") void speichern(o.id); if (e.key === "Escape") setBearbeite(null); }} />
                  <Button className="h-11 shrink-0" disabled={speichert} onClick={() => void speichern(o.id)}>
                    {speichert ? <Loader2 className="h-4 w-4 animate-spin" /> : "Speichern"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Karte>
  );
}

// ── Bewegungen ────────────────────────────────────────────────────────

function Bewegungen({
  artikel: a, bewegungen, laedt, orte,
}: {
  artikel: Artikel;
  bewegungen: BuchungMitBezug[];
  laedt: boolean;
  orte: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState<BewegungsFilter>("alle");
  const [ort, setOrt] = useState("alle");
  const [zeigen, setZeigen] = useState(SEITE);
  const mitBestand = useMemo(() => mitBestandDanach(bewegungen, ort === "alle" ? null : ort), [bewegungen, ort]);
  const sichtbar = mitBestand.filter((b) => (filter === "alle" || bewegungsGruppe(b) === filter) && (ort === "alle" || b.lagerort_id === ort));
  const genutzteOrte = orte.filter((o) => bewegungen.some((b) => b.lagerort_id === o.id));

  let inhalt: ReactNode;
  if (laedt) inhalt = <p className="px-4 py-6 text-center text-sm text-muted-foreground">Lädt…</p>;
  else if (!sichtbar.length) inhalt = <p className="px-4 py-6 text-center text-sm text-muted-foreground lg:px-5">{bewegungen.length ? "Keine Bewegung passt zum Filter." : "Noch nie gebucht."}</p>;
  else {
    inhalt = (
      <ul className="divide-y border-t">
        {sichtbar.slice(0, zeigen).map((b) => {
          const gruppe = bewegungsGruppe(b);
          const titel = gruppe === "umbuchung" ? (b.art === "zugang" ? "Umbuchung rein" : "Umbuchung raus") : BUCHUNGS_ART[b.art as BuchungsArt] ?? b.art;
          const menge = b.delta !== 0 ? b.delta : Number(b.menge);
          return (
            <li key={b.id} className="flex items-start gap-3 px-4 py-2.5 lg:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {titel}
                  {b.projekte && <> · <Link to={`/projekte/${b.projekte.id}`} className="text-primary hover:underline">{b.projekte.nummer} {b.projekte.name}</Link></>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[zeitpunktText(b.created_at), name(b.profiles), b.lagerorte?.name, b.notiz].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("zahl whitespace-nowrap text-sm font-semibold", b.delta < 0 && "text-destructive")}>
                  {b.delta > 0 ? "+" : b.delta < 0 ? "−" : ""}{zahl(Math.abs(menge))} <span className="font-normal text-muted-foreground">{a.einheit}</span>
                </p>
                {b.lagerort_id && <p className="zahl whitespace-nowrap text-xs text-muted-foreground">danach {zahl(b.bestand)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Karte titel={`Bewegungen${bewegungen.length ? ` · ${bewegungen.length}` : ""}`} ohnePolster>
      <div className="space-y-2 px-4 pb-3 lg:px-5">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Art der Bewegung">
          {FILTER.map((f) => (
            <button key={f.wert} type="button" aria-pressed={filter === f.wert} onClick={() => { setFilter(f.wert); setZeigen(SEITE); }}
              className={cn("h-9 shrink-0 rounded-full border px-3 text-sm transition-colors",
                filter === f.wert ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
              {f.text}
            </button>
          ))}
        </div>
        {genutzteOrte.length > 1 && (
          <Select value={ort} onValueChange={(v) => { setOrt(v); setZeigen(SEITE); }}>
            <SelectTrigger className="h-11 sm:w-64" aria-label="Lagerort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Lagerorte</SelectItem>
              {genutzteOrte.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {inhalt}
      {sichtbar.length > zeigen && (
        <div className="border-t p-2">
          <Button variant="ghost" className="h-11 w-full" onClick={() => setZeigen((n) => n + SEITE)}>
            Weitere {Math.min(SEITE, sichtbar.length - zeigen)} zeigen
          </Button>
        </div>
      )}
    </Karte>
  );
}
