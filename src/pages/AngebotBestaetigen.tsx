import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Eraser, FileDown, FileText, Loader2, Mail, MessageSquareText, Phone, PenLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnterschriftFeld, type UnterschriftHandle } from "@/components/regie/UnterschriftFeld";
import { neueId, ohneBetrag, positionsNummern, zwischensummen } from "@/components/belege/editor";
import { inAppBrowser, tokenGueltig, unterschriftPfad, ZUSTAND_TEXT, type OeffentlichZustand } from "@/components/belege/bestaetigung";
import { DATEIEN_BUCKET } from "@/components/belege/datenblattLogik";
import { belegPdfErstellen, kvHinweis } from "@/lib/belegPdf";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { datum, euro, zahl } from "@/lib/format";
import { runden2 } from "@/lib/preise";
import { logoAdresse } from "@/lib/upload";
import type { Beleg, Firma } from "@/lib/types";
import { cn } from "@/lib/utils";

type Pos = { art: string; bezeichnung: string; langtext: string | null; menge: number; einheit: string; einzelpreis: number };
type Daten = {
  zustand: OeffentlichZustand;
  stand?: string;
  gilt_bis?: string;
  annahme?: { name: string; zeit: string } | null;
  projekt?: { nummer: string; name: string; strasse: string | null; plz: string | null; ort: string | null } | null;
  firma: Partial<Firma> & { name: string };
  beleg?: Beleg;
  positionen?: Pos[];
  datenblaetter?: { name: string; pfad: string; artikel: string | null }[];
};

type Schritt = "ansehen" | "annehmen" | "rueckfrage" | "fertig";

/**
 * Öffentliche Seite /angebot/<token> — ohne Anmeldung, im Briefkopf des
 * Betriebs. Der Kunde sieht das Angebot (wie das PDF, ohne Kalkulation),
 * lädt PDF und Datenblätter, nimmt mit Namen, Haken und Unterschrift an —
 * oder schickt eine Rückfrage. Gelesen und geschrieben wird nur über die
 * RPCs mit dem Token; sonst gibt die Datenbank anonym nichts her.
 */
export default function AngebotBestaetigen() {
  const { token } = useParams();
  const gueltig = tokenGueltig(token);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["angebot-oeffentlich", token],
    enabled: gueltig,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: d, error: e } = await supabase.rpc("angebot_oeffentlich", { p_token: token! });
      if (e) throw new Error(e.message);
      return d as unknown as Daten;
    },
  });

  if (!gueltig) return <Rahmen><Hinweis titel={ZUSTAND_TEXT.unbekannt.titel} text={ZUSTAND_TEXT.unbekannt.text} /></Rahmen>;
  if (isLoading) return <Rahmen><p className="py-16 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Angebot wird geladen …</p></Rahmen>;
  if (error || !data) {
    return (
      <Rahmen>
        <Hinweis titel="Keine Verbindung" text="Das Angebot konnte gerade nicht geladen werden. Bitte später noch einmal versuchen.">
          <Button className="mt-4 h-12" onClick={() => void refetch()}>Noch einmal versuchen</Button>
        </Hinweis>
      </Rahmen>
    );
  }
  if (!data.beleg || data.zustand === "unbekannt" || data.zustand === "gesperrt") {
    const t = ZUSTAND_TEXT[data.zustand === "offen" ? "unbekannt" : data.zustand];
    return <Rahmen firma={data.firma}><Hinweis titel={t.titel} text={t.text}><Kontakt firma={data.firma} /></Hinweis></Rahmen>;
  }
  return <Angebot daten={data} token={token!} neuLaden={() => void refetch()} />;
}

function Angebot({ daten, token, neuLaden }: { daten: Daten; token: string; neuLaden: () => void }) {
  const b = daten.beleg!;
  const positionen = daten.positionen ?? [];
  const firma = daten.firma;
  const [schritt, setSchritt] = useState<Schritt>("ansehen");
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const ohneUst = !!b.reverse_charge || !!firma.kleinunternehmer;
  const inApp = inAppBrowser(navigator.userAgent);

  const pdf = async () => {
    setPdfLaeuft(true);
    try {
      const { blob, dateiname } = await belegPdfErstellen({ beleg: b, positionen, firma: firma as Firma, projekt: daten.projekt ?? null });
      await pdfTeilenOderLaden(blob, dateiname);
    } catch (e) {
      toast.error(`PDF nicht erstellt: ${(e as Error).message}`);
    } finally {
      setPdfLaeuft(false);
    }
  };
  const datenblatt = async (pfad: string, name: string) => {
    const { data, error } = await supabase.storage.from(DATEIEN_BUCKET).download(pfad);
    if (error || !data) { toast.error("Datenblatt gerade nicht verfügbar."); return; }
    await pdfTeilenOderLaden(data, name);
  };

  const gesamt = positionen.map((p) => (ohneBetrag(p) ? 0 : runden2(Number(p.menge) * Number(p.einzelpreis))));
  const nummern = positionsNummern(positionen.map((p) => p.art));
  const zs = zwischensummen(positionen.map((p, i) => ({ art: p.art, gesamt: gesamt[i] })));
  const zustand = schritt === "fertig" ? "angenommen" : daten.zustand;

  return (
    <Rahmen firma={firma}>
      {/* Kopf: was ist das, für wen, wie viel */}
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Angebot {b.nummer}</p>
        <h1 className="mt-1 text-xl font-semibold leading-snug sm:text-2xl">{b.betreff || "Ihr Angebot"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[b.empf_name, `vom ${datum(b.datum)}`, daten.gilt_bis ? `gültig bis ${datum(daten.gilt_bis)}` : null].filter(Boolean).join(" · ")}
        </p>
        <p className="zahl mt-3 text-3xl font-bold">{euro(Number(ohneUst ? b.netto : b.brutto))}</p>
        <p className="text-sm text-muted-foreground">{ohneUst ? "Gesamtbetrag (ohne USt)" : `Gesamtbetrag inkl. ${zahl(Number(b.ust_satz))} % USt`}</p>
        <Button variant="outline" className="mt-4 h-12 w-full sm:w-auto" onClick={() => void pdf()} disabled={pdfLaeuft}>
          {pdfLaeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Angebot als PDF
        </Button>
        {inApp && (
          <p className="mt-2 text-xs text-muted-foreground">
            Geht das PDF hier nicht auf? Oben rechts über das Menü (⋮ oder …) „Im Browser öffnen“ wählen. Annehmen geht auch hier.
          </p>
        )}
      </section>

      {zustand !== "offen" && (
        <section className={cn("rounded-lg border p-4", zustand === "angenommen" ? "border-primary bg-primary-soft" : "bg-card")} role="status">
          <p className="flex items-center gap-2 text-lg font-semibold">
            {zustand === "angenommen" ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-muted-foreground" />}
            {ZUSTAND_TEXT[zustand].titel}
          </p>
          <p className="mt-1 text-sm">
            {zustand === "angenommen" && daten.annahme
              ? `Angenommen von ${daten.annahme.name} am ${new Date(daten.annahme.zeit).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" })}. ${ZUSTAND_TEXT.angenommen.text}`
              : ZUSTAND_TEXT[zustand].text}
          </p>
          {zustand !== "angenommen" && <Kontakt firma={firma} />}
        </section>
      )}

      {schritt === "ansehen" && (
        <>
          {b.einleitung && <p className="whitespace-pre-wrap px-1 text-[15px] leading-relaxed">{b.einleitung}</p>}
          <section className="overflow-hidden rounded-lg border bg-card" aria-label="Positionen">
            <ul className="divide-y">
              {positionen.map((p, i) => p.art === "titel" ? (
                <li key={i} className="flex items-baseline justify-between gap-3 bg-muted/50 px-4 py-2.5">
                  <span className="font-semibold">{nummern[i]} {p.bezeichnung}</span>
                  <span className="zahl shrink-0 text-sm font-semibold">{zs[i] != null ? euro(zs[i]) : ""}</span>
                </li>
              ) : p.art === "text" ? (
                <li key={i} className="whitespace-pre-wrap px-4 py-2.5 text-sm text-muted-foreground">{[p.bezeichnung, p.langtext].filter(Boolean).join("\n")}</li>
              ) : (
                <li key={i} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="zahl w-9 shrink-0 text-xs text-muted-foreground">{nummern[i]}</span>
                    <span className="min-w-0 flex-1 text-[15px] leading-snug">{p.bezeichnung}</span>
                    <span className="zahl shrink-0 font-medium">{euro(gesamt[i])}</span>
                  </div>
                  <p className="zahl ml-12 text-xs text-muted-foreground">{zahl(Number(p.menge))} {p.einheit} × {euro(Number(p.einzelpreis))}</p>
                  {p.langtext && <p className="ml-12 mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{p.langtext}</p>}
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t bg-muted/30 px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Summe netto</dt><dd className="zahl">{euro(Number(b.netto))}</dd></div>
              {!ohneUst && <div className="flex justify-between"><dt className="text-muted-foreground">USt {zahl(Number(b.ust_satz))} %</dt><dd className="zahl">{euro(Number(b.ust))}</dd></div>}
              <div className="flex justify-between border-t pt-1.5 text-base font-bold"><dt>Gesamt</dt><dd className="zahl">{euro(Number(ohneUst ? b.netto : b.brutto))}</dd></div>
            </dl>
          </section>
          {b.schlusstext && <p className="whitespace-pre-wrap px-1 text-[15px] leading-relaxed">{b.schlusstext}</p>}
          <p className="px-1 text-xs text-muted-foreground">{kvHinweis(!!b.kv_verbindlich)}</p>

          {(daten.datenblaetter ?? []).length > 0 && (
            <section className="rounded-lg border bg-card p-4" aria-label="Datenblätter">
              <h2 className="font-semibold">Datenblätter</h2>
              <ul className="mt-1 divide-y">
                {daten.datenblaetter!.map((d) => (
                  <li key={d.pfad}>
                    <button type="button" className="flex min-h-11 w-full items-center gap-2 py-2 text-left text-sm hover:underline" onClick={() => void datenblatt(d.pfad, d.name)}>
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate">{d.name}{d.artikel && <span className="text-muted-foreground"> · {d.artikel}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {daten.zustand === "offen" && (
            <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Button className="h-14 text-base" onClick={() => { setSchritt("annehmen"); window.scrollTo({ top: 0 }); }}>
                  <PenLine className="h-5 w-5" /> Angebot annehmen
                </Button>
                <Button variant="outline" className="h-12" onClick={() => { setSchritt("rueckfrage"); window.scrollTo({ top: 0 }); }}>
                  <MessageSquareText className="h-4 w-4" /> Rückfrage stellen
                </Button>
              </div>
            </div>
          )}
          {daten.zustand === "abgelaufen" && (
            <Button variant="outline" className="h-12 w-full" onClick={() => setSchritt("rueckfrage")}><MessageSquareText className="h-4 w-4" /> Nachricht schicken</Button>
          )}
        </>
      )}

      {schritt === "annehmen" && (
        <Annehmen token={token} daten={daten} zurueck={() => setSchritt("ansehen")}
          fertig={() => { setSchritt("fertig"); neuLaden(); }} veraltet={() => { setSchritt("ansehen"); neuLaden(); }} />
      )}
      {schritt === "rueckfrage" && <Rueckfrage token={token} zurueck={() => setSchritt("ansehen")} />}
      {schritt === "fertig" && <Kontakt firma={firma} />}
    </Rahmen>
  );
}

function Annehmen({ token, daten, zurueck, fertig, veraltet }: { token: string; daten: Daten; zurueck: () => void; fertig: () => void; veraltet: () => void }) {
  const b = daten.beleg!;
  const ohneUst = !!b.reverse_charge || !!daten.firma.kleinunternehmer;
  const [name, setName] = useState(b.empf_name ?? "");
  const [haken, setHaken] = useState(false);
  const [gezeichnet, setGezeichnet] = useState(false);
  const [sendet, setSendet] = useState(false);
  const feld = useRef<UnterschriftHandle>(null);
  const bereit = name.trim().length >= 3 && haken && gezeichnet;

  const annehmen = async () => {
    if (!bereit || sendet) return;
    setSendet(true);
    try {
      const png = await feld.current?.alsPng();
      if (!png) throw new Error("Bitte im weißen Feld unterschreiben.");
      const pfad = unterschriftPfad(token, neueId());
      const hoch = await supabase.storage.from("angebot-bestaetigung").upload(pfad, png, { contentType: "image/png", upsert: false });
      if (hoch.error) {
        // Meist nicht das Netz, sondern: inzwischen angenommen (zweiter Tab), gesperrt oder abgelaufen
        const { data: jetzt } = await supabase.rpc("angebot_oeffentlich", { p_token: token });
        const z = (jetzt as { zustand?: OeffentlichZustand } | null)?.zustand;
        if (z && z !== "offen") { toast.error(ZUSTAND_TEXT[z].titel, { duration: 10_000 }); veraltet(); return; }
        throw new Error("Die Unterschrift konnte nicht gespeichert werden. Bitte noch einmal versuchen.");
      }
      const { error } = await supabase.rpc("angebot_annehmen", {
        p_token: token, p_name: name.trim(), p_stand: daten.stand ?? "", p_unterschrift: pfad, p_akzeptiert: haken,
      });
      if (error) {
        // Stand geändert, schon angenommen, abgelaufen: zurück zum Angebot, das zeigt den neuen Stand
        if (/geändert|bereits angenommen|abgelaufen|nicht mehr angenommen/.test(error.message)) { toast.error(error.message, { duration: 10_000 }); veraltet(); return; }
        throw new Error(error.message);
      }
      toast.success("Vielen Dank — das Angebot ist angenommen.");
      fertig();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSendet(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-5" aria-label="Angebot annehmen">
      <button type="button" onClick={zurueck} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Angebot
      </button>
      <h2 className="text-lg font-semibold">Angebot {b.nummer} annehmen</h2>
      <div className="space-y-1.5">
        <Label htmlFor="an-name" className="text-base">Ihr Name</Label>
        <Input id="an-name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
          placeholder="Vor- und Nachname" autoComplete="name" autoCapitalize="words" />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-[15px] leading-snug">
        <Checkbox checked={haken} onCheckedChange={(v) => setHaken(!!v)} className="mt-0.5 h-6 w-6" aria-label="Angebot bestätigen" />
        <span>
          Ich beauftrage {daten.firma.name} laut Angebot {b.nummer} vom {datum(b.datum)} zum Gesamtpreis von{" "}
          <strong className="zahl">{euro(Number(ohneUst ? b.netto : b.brutto))}</strong>{ohneUst ? "" : " inkl. USt"}.
          Es gelten die Angaben im Angebot und die Allgemeinen Geschäftsbedingungen von {daten.firma.name}.
        </span>
      </label>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-base">Unterschrift</Label>
          <Button variant="outline" className="h-10" onClick={() => feld.current?.leeren()} disabled={!gezeichnet || sendet}><Eraser className="h-4 w-4" /> Löschen</Button>
        </div>
        <UnterschriftFeld ref={feld} onChange={setGezeichnet} className="h-48 sm:h-56" />
        <p className="text-xs text-muted-foreground">Mit dem Finger im weißen Feld unterschreiben. Gespeichert werden Name, Zeitpunkt und Unterschrift.</p>
      </div>
      <Button className="h-14 w-full text-base" disabled={!bereit || sendet} onClick={() => void annehmen()}>
        {sendet ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        {sendet ? "Wird gespeichert …" : bereit ? "Angebot verbindlich annehmen" : !name.trim() ? "Bitte Namen eintragen" : !haken ? "Bitte Haken setzen" : "Bitte unterschreiben"}
      </Button>
    </section>
  );
}

function Rueckfrage({ token, zurueck }: { token: string; zurueck: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const senden = async () => {
    setSendet(true);
    const { error } = await supabase.rpc("angebot_rueckfrage", { p_token: token, p_name: name.trim(), p_text: text.trim() });
    setSendet(false);
    if (error) { toast.error(error.message); return; }
    setGesendet(true);
  };
  if (gesendet) {
    return (
      <section className="rounded-lg border border-primary bg-primary-soft p-4" role="status">
        <p className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> Danke für Ihre Nachricht</p>
        <p className="mt-1 text-sm">Wir melden uns so bald wie möglich.</p>
        <Button variant="outline" className="mt-3 h-11" onClick={zurueck}>Zurück zum Angebot</Button>
      </section>
    );
  }
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-5" aria-label="Rückfrage">
      <button type="button" onClick={zurueck} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Angebot
      </button>
      <h2 className="text-lg font-semibold">Rückfrage zum Angebot</h2>
      <div className="space-y-1.5">
        <Label htmlFor="rf-name" className="text-base">Ihr Name</Label>
        <Input id="rf-name" className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rf-text" className="text-base">Ihre Frage</Label>
        <Textarea id="rf-text" className="min-h-32 text-base" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
          placeholder="z. B. Geht der Speicher auch später? Wann wäre ein Termin frei?" />
      </div>
      <Button className="h-12 w-full" disabled={sendet || name.trim().length < 2 || text.trim().length < 3} onClick={() => void senden()}>
        {sendet ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} Rückfrage senden
      </Button>
    </section>
  );
}

/** Kopf mit Logo oder Namen des Betriebs; schmal, für das Handy gebaut */
function Rahmen({ firma, children }: { firma?: Partial<Firma> & { name: string }; children: React.ReactNode }) {
  const logo = logoAdresse(firma?.logo_pfad);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-16 max-w-2xl items-center gap-3 px-4 py-2">
          {logo ? <img src={logo} alt={firma?.name ?? ""} className="h-10 max-w-[10rem] object-contain" /> : null}
          {firma && <span className={cn("min-w-0 truncate font-semibold", logo && "sr-only")}>{firma.name}</span>}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:py-6">{children}</main>
      {firma && (
        <footer className="mx-auto max-w-2xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
          {[firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" "), firma.uid ? `UID ${firma.uid}` : null].filter(Boolean).join(" · ")}
        </footer>
      )}
    </div>
  );
}

function Hinweis({ titel, text, children }: { titel: string; text: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="mt-2 text-lg font-semibold">{titel}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {children}
    </section>
  );
}

function Kontakt({ firma }: { firma: Partial<Firma> & { name: string } }) {
  if (!firma.telefon && !firma.email) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
      {firma.telefon && <Button variant="outline" className="h-11" asChild><a href={`tel:${firma.telefon.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4" /> {firma.telefon}</a></Button>}
      {firma.email && <Button variant="outline" className="h-11" asChild><a href={`mailto:${firma.email}`}><Mail className="h-4 w-4" /> E-Mail</a></Button>}
    </div>
  );
}
