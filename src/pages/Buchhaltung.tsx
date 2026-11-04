import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { strToU8, zipSync, type Zippable } from "fflate";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileArchive, Info, Loader2, Settings2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Karte, Leer, StatusPille } from "@/components/Bausteine";
import FormularDialog from "@/components/FormularDialog";
import { Seite } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { supabase } from "@/integrations/supabase/client";
import { alsText, csvFeld, type CsvZelle } from "@/lib/abfrage";
import { archivLaden } from "@/lib/belegArchiv";
import {
  aufwandKonto, buchungenText, debitorKonto, eingangNummer, erloesKonto, KONTEN_TEXT, kontrolle, personenkontenText, summen, windows1252,
  type FibuBeleg, type FibuEingang, type FibuFormat, type FibuKonten,
} from "@/lib/fibu";
import { datum, euro, isoTag } from "@/lib/format";
import { BUCKET } from "@/components/eingang/eingangDaten";
import { fehlerText } from "@/components/stamm/stammDaten";
import { sichererDateiname } from "@/lib/upload";
import { cn } from "@/lib/utils";

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const FORMATE: Record<FibuFormat, string> = { bmd: "BMD", rzl: "RZL" };

export default function Buchhaltung() {
  const { firma, neuLaden: firmaNeu } = useSitzung();
  const neuLaden = useNeuLaden();
  // Vorbelegt: der letzte abgeschlossene Monat — den will die Kanzlei
  const [monat, setMonat] = useState(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return { jahr: d.getFullYear(), monat: d.getMonth() }; });
  const [mitUebergebenen, setMitUebergebenen] = useState(false);
  const [kontenOffen, setKontenOffen] = useState(false);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const von = isoTag(new Date(monat.jahr, monat.monat, 1));
  const bis = isoTag(new Date(monat.jahr, monat.monat + 1, 0));
  const naechster = isoTag(new Date(monat.jahr, monat.monat + 1, 1));
  const monatText = `${MONATE[monat.monat]} ${monat.jahr}`;
  const monatKurz = `${monat.jahr}-${String(monat.monat + 1).padStart(2, "0")}`;
  const blaettern = (um: number) => setMonat((m) => { const d = new Date(m.jahr, m.monat + um, 1); return { jahr: d.getFullYear(), monat: d.getMonth() }; });
  const format = (firma?.fibu_format ?? "bmd") as FibuFormat;
  const konten = firma?.fibu_konten as unknown as FibuKonten | undefined;
  const klein = !!firma?.kleinunternehmer;

  const { data, isLoading } = useQuery({
    queryKey: ["buchhaltung", "monat", von],
    queryFn: async () => {
      const [b, e, u, d] = await Promise.all([
        supabase.from("belege").select("id, nummer, datum, faellig_am, status, netto, ust, brutto, ust_satz, reverse_charge, empf_name, empf_uid, teil_nr, storno_von, kunden(nummer, name, strasse, plz, ort, uid)")
          .eq("typ", "rechnung").neq("status", "entwurf").gte("datum", von).lte("datum", bis).order("datum").order("nummer"),
        supabase.from("eingangsrechnungen").select("id, lieferant, nummer, datum, faellig_am, netto, ust, brutto, ust_satz, reverse_charge, kategorie, datei_pfad")
          .gte("datum", von).lte("datum", bis).order("datum").order("lieferant"),
        supabase.from("fibu_uebergabe_belege").select("beleg_id, eingang_id"),
        supabase.from("belege").select("id", { count: "exact", head: true }).eq("typ", "rechnung").eq("status", "entwurf").gte("datum", von).lte("datum", bis),
      ]);
      const fehler = b.error ?? e.error ?? u.error ?? d.error;
      if (fehler) throw fehler;
      // Liegt das Original schon im Archiv? Besser jetzt wissen als im ZIP vermissen
      const imArchiv = await Promise.all((b.data ?? []).map(async (x) => {
        const { data: f } = await supabase.storage.from("beleg-archiv").list("", { search: x.id, limit: 1 });
        return f?.length ? null : x.nummer;
      }));
      return {
        belege: (b.data ?? []).map(({ kunden, ...x }) => ({ ...x, kunde: kunden })) as unknown as FibuBeleg[],
        eingaenge: (e.data ?? []) as FibuEingang[],
        uebergeben: new Set((u.data ?? []).flatMap((x) => [x.beleg_id, x.eingang_id]).filter(Boolean) as string[]),
        entwuerfe: d.count ?? 0,
        ohneArchiv: imArchiv.filter(Boolean) as string[],
      };
    },
  });
  const { data: uebergaben = [] } = useQuery({
    queryKey: ["buchhaltung", "uebergaben"],
    queryFn: async () => {
      const { data: z, error } = await supabase.from("fibu_uebergaben").select("id, von, bis, format, created_at, fibu_uebergabe_belege(beleg_id, eingang_id)").order("created_at", { ascending: false }).limit(12);
      if (error) throw error;
      return z ?? [];
    },
  });

  const uebergeben = useMemo(() => data?.uebergeben ?? new Set<string>(), [data]);
  const belege = useMemo(() => (data?.belege ?? []).filter((b) => mitUebergebenen || !uebergeben.has(b.id)), [data, uebergeben, mitUebergebenen]);
  const eingaenge = useMemo(() => (data?.eingaenge ?? []).filter((e) => mitUebergebenen || !uebergeben.has(e.id)), [data, uebergeben, mitUebergebenen]);
  const hinweise = useMemo(() => [
    ...(data?.ohneArchiv ?? []).filter((n) => belege.some((b) => b.nummer === n)).map((n) => ({ schwer: true, text: `${n}: Original-PDF fehlt im Rechnungsarchiv. Rechnung einmal öffnen und als PDF laden.` })),
    ...kontrolle(belege, eingaenge, klein, data?.entwuerfe),
  ], [data?.ohneArchiv, belege, eingaenge, klein, data?.entwuerfe]);
  const ar = summen(belege), er = summen(eingaenge);
  const schonDa = (data?.belege ?? []).length + (data?.eingaenge ?? []).length - belege.length - eingaenge.length;
  const leer = !belege.length && !eingaenge.length;
  const offeneZumMerken = [...belege, ...eingaenge].filter((x) => !uebergeben.has(x.id));

  const formatSetzen = async (f: FibuFormat) => {
    const { error } = await supabase.from("firma").update({ fibu_format: f }).eq("id", 1);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await firmaNeu();
  };

  const zipLaden = async () => {
    if (!konten) return;
    setLaeuft("zip");
    try {
      const { data: k, error } = await supabase.rpc("kreditor_konten_holen", { p_namen: [...new Set(eingaenge.map((e) => e.lieferant))] });
      if (error) throw error;
      const kreditor = new Map((k ?? []).map((x) => [x.schluessel, x.konto]));
      const dateien: Zippable = {};
      const fehlen: string[] = [];

      const belegeFertig: FibuBeleg[] = await Promise.all(belege.map(async (b) => {
        const pdf = await archivLaden(b.id);
        if (!pdf) { fehlen.push(`${b.nummer} (Rechnung noch nicht im Archiv)`); return b; }
        const pfad = `Ausgangsrechnungen/${sichererDateiname(b.nummer)}.pdf`;
        dateien[pfad] = [new Uint8Array(await pdf.arrayBuffer()), { level: 0 }];
        return { ...b, datei: pfad };
      }));
      const eingaengeFertig: FibuEingang[] = await Promise.all(eingaenge.map(async (e) => {
        const mit = { ...e, kreditor: kreditor.get(e.lieferant.trim().toLowerCase()) };
        if (!e.datei_pfad) return mit;
        const { data: blob } = await supabase.storage.from(BUCKET).download(e.datei_pfad);
        if (!blob) { fehlen.push(`${e.lieferant} ${e.nummer ?? ""} (Datei nicht gefunden)`.trim()); return mit; }
        const endung = e.datei_pfad.split(".").pop()?.toLowerCase() || "pdf";
        const pfad = `Eingangsrechnungen/${eingangNummer(e)}-${sichererDateiname(e.lieferant)}.${endung}`;
        dateien[pfad] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
        return { ...mit, datei: pfad };
      }));

      const endung = format === "bmd" ? "csv" : "txt";
      dateien[`Buchungen-${FORMATE[format]}.${endung}`] = windows1252(buchungenText(format, belegeFertig, eingaengeFertig, konten, klein));
      dateien[`Personenkonten-${FORMATE[format]}.${endung}`] = windows1252(personenkontenText(format, belegeFertig, eingaengeFertig));

      // Die Belegliste für den Menschen: öffnet in Excel, egal welches Programm die Kanzlei hat
      const liste: CsvZelle[][] = [
        ["Art", "Belegnummer", "Belegdatum", "Konto", "Name", "UID", "Gegenkonto", "USt %", "Reverse Charge", "Netto", "USt", "Brutto", "Fällig", "Hinweis", "Datei"],
        ...belegeFertig.map((b): CsvZelle[] => ["Ausgangsrechnung", alsText(b.nummer), datum(b.datum), debitorKonto(b), alsText(b.kunde?.name ?? b.empf_name), alsText(b.empf_uid), erloesKonto(b, konten, klein), Number(b.ust_satz),
          b.reverse_charge ? "ja" : "", Number(b.netto), Number(b.ust), Number(b.brutto), b.faellig_am ? datum(b.faellig_am) : "",
          b.storno_von ? "Stornorechnung" : b.status === "storniert" ? "storniert" : b.teil_nr ? `${b.teil_nr}. Teilrechnung` : "", alsText(b.datei)]),
        ...eingaengeFertig.map((e): CsvZelle[] => ["Eingangsrechnung", alsText(e.nummer ?? eingangNummer(e)), datum(e.datum), e.kreditor, alsText(e.lieferant), "", aufwandKonto(e, konten), Number(e.ust_satz),
          e.reverse_charge ? "ja" : "", Number(e.netto), Number(e.ust), Number(e.brutto), e.faellig_am ? datum(e.faellig_am) : "", "", alsText(e.datei)]),
      ];
      dateien["Belegliste.csv"] = strToU8(`\uFEFF${liste.map((z) => z.map(csvFeld).join(";")).join("\r\n")}\r\n`);

      dateien["LIESMICH.txt"] = windows1252([
        `${firma?.name ?? ""} - Buchhaltung ${monatText}`, "",
        `Format: ${FORMATE[format]}, Windows-1252, Strichpunkt, CR/LF.`,
        format === "bmd"
          ? "Buchungen: variabler Satzaufbau mit Kopfzeile, Verbuchkz A, Gegenbuchkz E. BMD macht Gegen- und Sammelbuchungen."
          : "Buchungen: Euro-Version mit Trennzeichen, je Beleg zwei Zeilen, Belegpfad in Feld 37. Bitte zuerst den Probelauf.",
        `Ausgangsrechnungen: ${ar.anzahl}, netto ${ar.netto.toFixed(2)}, USt ${ar.ust.toFixed(2)}`,
        `Eingangsrechnungen: ${er.anzahl}, netto ${er.netto.toFixed(2)}, Vorsteuer ${er.ust.toFixed(2)}`, "",
        "Debitoren: 20000 + Kundennummer. Kreditoren: ab 30001, fest je Lieferant.",
        "Teil- und Schlussrechnungen sind normale Rechnungen mit ihren eigenen Betraegen, siehe Belegliste.", "",
        "Konten:", ...Object.entries(KONTEN_TEXT).map(([s, t]) => `  ${konten[s as keyof FibuKonten]}  ${t}`),
        ...(hinweise.length || fehlen.length ? ["", "Hinweise:", ...hinweise.map((h) => `  ${h.text}`), ...fehlen.map((f) => `  Beleg fehlt: ${f}`)] : []), "",
      ].join("\r\n"));

      const zip = zipSync(dateien);
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `buchhaltung-${monatKurz}-${format}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      await neuLaden("buchhaltung");
      if (fehlen.length) toast.warning(`ZIP erstellt, ${fehlen.length} ${fehlen.length === 1 ? "Beleg fehlt" : "Belege fehlen"}`, { description: fehlen.slice(0, 3).join(", ") });
      else toast.success("ZIP erstellt", { description: "Danach „Als übergeben merken“, dann kommt nichts doppelt." });
    } catch (e) {
      toast.error("ZIP nicht erstellt", { description: fehlerText(e as { message?: string; code?: string }) });
    } finally {
      setLaeuft(null);
    }
  };

  const merken = async () => {
    setLaeuft("merken");
    const { error } = await supabase.rpc("fibu_uebergeben", {
      p_von: von, p_bis: bis, p_format: format,
      p_belege: belege.filter((b) => !uebergeben.has(b.id)).map((b) => b.id),
      p_eingaenge: eingaenge.filter((e) => !uebergeben.has(e.id)).map((e) => e.id),
    });
    setLaeuft(null);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    toast.success(`${monatText} als übergeben gemerkt`);
    await neuLaden("buchhaltung");
  };

  const zuruecknehmen = async (id: string) => {
    setLaeuft(id);
    const { error } = await supabase.from("fibu_uebergaben").delete().eq("id", id);
    setLaeuft(null);
    if (error) return toast.error("Nicht zurückgenommen", { description: fehlerText(error) });
    toast.success("Übergabe zurückgenommen");
    await neuLaden("buchhaltung");
  };

  return (
    <Seite
      titel="Buchhaltung"
      untertitel="Der Monat für den Steuerberater"
      aktionen={<Button variant="outline" className="h-11 gap-1.5" onClick={() => setKontenOffen(true)}><Settings2 className="h-4 w-4" /> Konten</Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Monat zurück" onClick={() => blaettern(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold">{monatText}</span>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Monat vor" disabled={naechster > isoTag()} onClick={() => blaettern(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex overflow-hidden rounded-lg border bg-card" role="radiogroup" aria-label="Programm der Kanzlei">
          {(Object.keys(FORMATE) as FibuFormat[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => void formatSetzen(f)}
              className={cn("h-11 px-4 text-sm font-medium", format === f ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{FORMATE[f]}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[{ titel: "Ausgangsrechnungen", s: ar, steuer: "USt" }, { titel: "Eingangsrechnungen", s: er, steuer: "Vorsteuer" }].map(({ titel, s, steuer }) => (
          <div key={titel} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{titel}</p>
            <p className="zahl mt-1 text-2xl font-bold">{euro(s.netto)} <span className="text-sm font-normal text-muted-foreground">netto</span></p>
            <p className="zahl mt-0.5 text-sm text-muted-foreground">{s.anzahl} {s.anzahl === 1 ? "Beleg" : "Belege"} · {steuer} {euro(s.ust)}</p>
          </div>
        ))}
      </div>

      {isLoading ? null : leer && !schonDa ? (
        <Leer icon={FileArchive} text={`Im ${monatText} gibt es keine fertigen Belege.`} />
      ) : (
        <>
          {hinweise.length > 0 && (
            <Karte titel="Vor der Übergabe prüfen">
              <ul className="space-y-2">
                {hinweise.map((h) => (
                  <li key={h.text} className="flex gap-2 text-sm">
                    {h.schwer ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span>{h.text}</span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-12 gap-2" disabled={leer || !!laeuft || !konten} onClick={() => void zipLaden()}>
              {laeuft === "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />} ZIP herunterladen
            </Button>
            <Button variant="outline" className="h-12 gap-2" disabled={!offeneZumMerken.length || !!laeuft} onClick={() => void merken()}>
              <CheckCircle2 className="h-4 w-4" /> Als übergeben merken
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="mit-uebergebenen" checked={mitUebergebenen} onCheckedChange={setMitUebergebenen} />
            <Label htmlFor="mit-uebergebenen" className="cursor-pointer text-sm font-normal">
              Schon Übergebene noch einmal mitnehmen{schonDa > 0 && !mitUebergebenen ? ` (${schonDa})` : ""}
            </Label>
          </div>

          {leer ? (
            <Leer icon={CheckCircle2} text={`${monatText} ist schon übergeben.`} />
          ) : (
            <Karte titel="Belege" ohnePolster>
              <ul className="divide-y">
                {belege.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 lg:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium"><span className="font-mono text-xs text-muted-foreground">{b.nummer}</span> {b.kunde?.name ?? b.empf_name}</p>
                      <p className="text-xs text-muted-foreground">{datum(b.datum)} · {b.storno_von ? "Stornorechnung" : b.teil_nr ? `${b.teil_nr}. Teilrechnung` : b.reverse_charge ? "Reverse Charge" : `${Number(b.ust_satz)} % USt`}</p>
                    </div>
                    {uebergeben.has(b.id) && <StatusPille eintrag={{ ton: "gruen", text: "Übergeben" }} />}
                    <span className="zahl text-sm font-semibold">{euro(b.brutto)}</span>
                  </li>
                ))}
                {eingaenge.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 lg:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium"><span className="font-mono text-xs text-muted-foreground">{e.nummer ?? "ohne Nr."}</span> {e.lieferant}</p>
                      <p className="text-xs text-muted-foreground">{datum(e.datum)} · Eingang · {e.reverse_charge ? "Reverse Charge" : `${Number(e.ust_satz)} % VSt`}</p>
                    </div>
                    {uebergeben.has(e.id) && <StatusPille eintrag={{ ton: "gruen", text: "Übergeben" }} />}
                    <span className="zahl text-sm font-semibold">{euro(e.brutto)}</span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}
        </>
      )}

      {uebergaben.length > 0 && (
        <Karte titel="Bisherige Übergaben" ohnePolster>
          <ul className="divide-y">
            {uebergaben.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-2 lg:px-5">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{MONATE[Number(u.von.slice(5, 7)) - 1]} {u.von.slice(0, 4)}</p>
                  <p className="text-xs text-muted-foreground">{u.fibu_uebergabe_belege.length} Belege · {FORMATE[u.format as FibuFormat]} · am {datum(u.created_at.slice(0, 10))}</p>
                </div>
                <Button variant="ghost" className="h-11 gap-1.5" disabled={!!laeuft} onClick={() => void zuruecknehmen(u.id)}><Undo2 className="h-4 w-4" /> Zurücknehmen</Button>
              </li>
            ))}
          </ul>
        </Karte>
      )}

      {konten && <KontenDialog open={kontenOffen} onOpenChange={setKontenOffen} konten={konten} onGespeichert={firmaNeu} />}
    </Seite>
  );
}

function KontenDialog({ open, onOpenChange, konten, onGespeichert }: { open: boolean; onOpenChange: (o: boolean) => void; konten: FibuKonten; onGespeichert: () => Promise<void> | void }) {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => { if (open) setWerte(Object.fromEntries(Object.entries(konten).map(([k, v]) => [k, String(v)]))); }, [open, konten]);

  const speichern = async () => {
    const aus: Record<string, number> = {};
    for (const k of Object.keys(KONTEN_TEXT) as (keyof FibuKonten)[]) {
      const n = Number(werte[k]);
      if (!Number.isInteger(n) || n < 1 || n > 999999999) return toast.error(`${KONTEN_TEXT[k]}: bitte eine Kontonummer eintragen.`);
      aus[k] = n;
    }
    setSpeichert(true);
    const { error } = await supabase.from("firma").update({ fibu_konten: aus }).eq("id", 1);
    setSpeichert(false);
    if (error) return toast.error("Nicht gespeichert", { description: fehlerText(error) });
    await onGespeichert();
    toast.success("Konten gespeichert");
    onOpenChange(false);
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Konten" beschreibung="Die Nummern sind ein Vorschlag. Bitte mit der Kanzlei abstimmen." gesperrt={speichert}
      fuss={<>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={speichert}>Abbrechen</Button>
        <Button onClick={() => void speichern()} disabled={speichert} className="min-w-32">Speichern</Button>
      </>}>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {(Object.keys(KONTEN_TEXT) as (keyof FibuKonten)[]).map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`konto-${k}`} className="text-xs">{KONTEN_TEXT[k]}</Label>
            <Input id={`konto-${k}`} className="h-11" inputMode="numeric" value={werte[k] ?? ""} onChange={(e) => setWerte((w) => ({ ...w, [k]: e.target.value }))} />
          </div>
        ))}
      </div>
    </FormularDialog>
  );
}
