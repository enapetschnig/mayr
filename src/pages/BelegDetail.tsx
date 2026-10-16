import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Ban, CheckCircle2, Copy, Download, FileCheck2, FolderInput, Inbox, Loader2, Lock,
  MoreVertical, Plus, Save, ThumbsDown, ThumbsUp, Trash2, Type, Undo2, Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FirmaBadge } from "@/components/Bausteine";
import { ProjektWahl } from "@/components/ProjektWahl";
import { ImportDialog, type ImportErgebnis } from "@/components/belege/ImportDialog";
import { KollegenImportDialog } from "@/components/belege/KollegenImportDialog";
import { neuePosition, positionGesamt, preisText, zahlText, type EditorPosition } from "@/components/belege/editor";
import { useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { belegDateiname, belegPdf, belegSummen, pdfTeilenOderLaden } from "@/lib/pdf";
import { datum as datumText, euro, isoTag, tageDazu, zahlLesen } from "@/lib/format";
import { EINHEITEN, STATUS_FARBE, STATUS_TEXT, type Beleg, type Firma } from "@/lib/types";
import { cn } from "@/lib/utils";

type Kopf = {
  typ: "rechnung" | "angebot";
  empfaenger_art: "kunde" | "firma";
  empfaenger_firma_id: string | null;
  projekt_id: string | null;
  kunde_name: string; kunde_zusatz: string; kunde_strasse: string; kunde_plz: string; kunde_ort: string;
  kunde_uid: string; kunde_email: string;
  datum: string; leistung_von: string; leistung_bis: string; faellig_am: string; gueltig_bis: string;
  betreff: string; notizen: string; ust_satz: string; reverse_charge: boolean;
};

function kopfAusFirma(f: Firma): Partial<Kopf> {
  return {
    empfaenger_art: "firma", empfaenger_firma_id: f.id, kunde_name: f.name, kunde_zusatz: f.inhaber && f.inhaber !== f.name ? `z. H. ${f.inhaber}` : "",
    kunde_strasse: f.strasse || "", kunde_plz: f.plz || "", kunde_ort: f.ort || "", kunde_uid: f.uid || "", kunde_email: f.email || "",
    reverse_charge: true,
  };
}

export default function BelegDetail() {
  const { id } = useParams();
  const istNeu = !id || id === "neu";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const neuLaden = useNeuLaden();
  const { firma, firmen, firmaVon } = useSitzung();
  const { data: projekte = [] } = useProjekte();

  const [beleg, setBeleg] = useState<Beleg | null>(null);
  const [kopf, setKopf] = useState<Kopf | null>(null);
  const [positionen, setPositionen] = useState<EditorPosition[]>([]);
  const [verknuepft, setVerknuepft] = useState<{ zeiten: string[]; material: string[] }>({ zeiten: [], material: [] });
  const [laden, setLaden] = useState(true);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "import" | "kollegen" | "fertig" | "storno" | "loeschen">(null);
  const [geaendert, setGeaendert] = useState(false);

  // ── Laden / Vorbelegen ──
  useEffect(() => {
    if (!firma) return;
    let abbruch = false;
    (async () => {
      setLaden(true);
      if (istNeu) {
        const typ = params.get("typ") === "angebot" ? "angebot" : "rechnung";
        const heute = isoTag();
        const k: Kopf = {
          typ, empfaenger_art: "kunde", empfaenger_firma_id: null, projekt_id: null,
          kunde_name: "", kunde_zusatz: "", kunde_strasse: "", kunde_plz: "", kunde_ort: "", kunde_uid: "", kunde_email: "",
          datum: heute, leistung_von: "", leistung_bis: "",
          faellig_am: tageDazu(heute, firma.zahlungsziel_tage), gueltig_bis: tageDazu(heute, 30),
          betreff: "", notizen: "", ust_satz: firma.kleinunternehmer ? "0" : "20", reverse_charge: false,
        };
        const an = firmen.find((f) => f.id === params.get("an") && f.id !== firma.id);
        if (an) Object.assign(k, kopfAusFirma(an), { typ: "rechnung" });
        const pid = params.get("projekt");
        if (pid) {
          const { data: p } = await supabase.from("projekte").select("*").eq("id", pid).maybeSingle();
          if (p) {
            k.projekt_id = p.id;
            k.betreff = `${an ? "Elektroinstallation " : ""}${p.name}${p.ort ? `, ${[p.adresse, p.ort].filter(Boolean).join(" ")}` : ""}`;
            if (!an) {
              Object.assign(k, {
                kunde_name: p.kunde_name || "", kunde_strasse: p.kunde_strasse || "", kunde_plz: p.kunde_plz || "",
                kunde_ort: p.kunde_ort || "", kunde_uid: p.kunde_uid || "", kunde_email: p.kunde_email || "",
              });
            }
          }
        }
        if (abbruch) return;
        setBeleg(null);
        setKopf(k);
        setPositionen([]);
        setVerknuepft({ zeiten: [], material: [] });
        setGeaendert(false);
        setLaden(false);
        return;
      }

      const [{ data: b }, { data: pos }, { data: z }, { data: m }] = await Promise.all([
        supabase.from("rechnungen").select("*").eq("id", id!).maybeSingle(),
        supabase.from("rechnung_positionen").select("*").eq("rechnung_id", id!).order("pos"),
        supabase.from("zeiten").select("id").eq("rechnung_id", id!),
        supabase.from("material").select("id").eq("rechnung_id", id!),
      ]);
      if (abbruch) return;
      if (!b) { setBeleg(null); setKopf(null); setLaden(false); return; }
      setBeleg(b);
      setKopf({
        typ: b.typ as Kopf["typ"], empfaenger_art: b.empfaenger_art as Kopf["empfaenger_art"], empfaenger_firma_id: b.empfaenger_firma_id,
        projekt_id: b.projekt_id,
        kunde_name: b.kunde_name || "", kunde_zusatz: b.kunde_zusatz || "", kunde_strasse: b.kunde_strasse || "",
        kunde_plz: b.kunde_plz || "", kunde_ort: b.kunde_ort || "", kunde_uid: b.kunde_uid || "", kunde_email: b.kunde_email || "",
        datum: b.datum, leistung_von: b.leistung_von || "", leistung_bis: b.leistung_bis || "",
        faellig_am: b.faellig_am || "", gueltig_bis: b.gueltig_bis || "",
        betreff: b.betreff || "", notizen: b.notizen || "", ust_satz: zahlText(Number(b.ust_satz)), reverse_charge: b.reverse_charge,
      });
      setPositionen((pos ?? []).map((p) => ({
        key: p.id, art: p.art, bezeichnung: p.bezeichnung, beschreibung: p.beschreibung || "",
        menge: zahlText(Number(p.menge)), einheit: p.einheit, einzelpreis: preisText(Number(p.einzelpreis)),
      })));
      setVerknuepft({ zeiten: (z ?? []).map((x) => x.id), material: (m ?? []).map((x) => x.id) });
      setGeaendert(false);
      setLaden(false);
    })();
    return () => { abbruch = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, firma?.id, firmen.length]);

  const eingang = !!beleg && beleg.firma_id !== firma?.id;
  const ausstellerFirma = eingang ? firmaVon(beleg!.firma_id) : firma;
  const festgeschrieben = eingang || (beleg?.typ === "rechnung" && beleg.status !== "entwurf");
  const ohneUst = !!kopf?.reverse_charge || !!ausstellerFirma?.kleinunternehmer;

  const summen = useMemo(() => belegSummen(
    positionen.map((p) => ({ art: p.art, menge: zahlLesen(p.menge), einzelpreis: zahlLesen(p.einzelpreis) })),
    zahlLesen(kopf?.ust_satz ?? "20"), ohneUst,
  ), [positionen, kopf?.ust_satz, ohneUst]);

  const setze = <K extends keyof Kopf>(k: K, v: Kopf[K]) => { setKopf((x) => (x ? { ...x, [k]: v } : x)); setGeaendert(true); };
  const posSetze = (key: string, teil: Partial<EditorPosition>) => {
    setPositionen((l) => l.map((p) => (p.key === key ? { ...p, ...teil } : p)));
    setGeaendert(true);
  };
  const posVerschieben = (i: number, r: -1 | 1) => {
    setPositionen((l) => {
      const n = [...l];
      const j = i + r;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setGeaendert(true);
  };

  const empfaengerWaehlen = (wert: string) => {
    if (!kopf) return;
    if (wert === "kunde") {
      const p = projekte.find((x) => x.id === kopf.projekt_id);
      setKopf({
        ...kopf, empfaenger_art: "kunde", empfaenger_firma_id: null, reverse_charge: false, kunde_zusatz: "",
        kunde_name: p?.kunde_name || "", kunde_strasse: p?.kunde_strasse || "", kunde_plz: p?.kunde_plz || "",
        kunde_ort: p?.kunde_ort || "", kunde_uid: p?.kunde_uid || "", kunde_email: p?.kunde_email || "",
      });
    } else {
      const f = firmen.find((x) => x.id === wert);
      if (f) setKopf({ ...kopf, ...kopfAusFirma(f), typ: "rechnung" } as Kopf);
    }
    setGeaendert(true);
  };

  const projektWaehlen = (pid: string) => {
    if (!kopf) return;
    const p = projekte.find((x) => x.id === pid);
    const neu: Kopf = { ...kopf, projekt_id: pid };
    if (p && kopf.empfaenger_art === "kunde" && !kopf.kunde_name) {
      Object.assign(neu, {
        kunde_name: p.kunde_name || "", kunde_strasse: p.kunde_strasse || "", kunde_plz: p.kunde_plz || "",
        kunde_ort: p.kunde_ort || "", kunde_uid: p.kunde_uid || "", kunde_email: p.kunde_email || "",
      });
    }
    if (p && !kopf.betreff) neu.betreff = p.name;
    setKopf(neu);
    setGeaendert(true);
  };

  const importUebernehmen = (e: ImportErgebnis) => {
    setPositionen((l) => [...l.filter((p) => p.bezeichnung || p.art === "text"), ...e.positionen]);
    setVerknuepft((v) => ({
      zeiten: [...new Set([...v.zeiten, ...e.zeitIds])],
      material: [...new Set([...v.material, ...e.materialIds])],
    }));
    if (kopf && kopf.typ === "rechnung" && !kopf.leistung_von && e.leistungVon) {
      setKopf({ ...kopf, leistung_von: e.leistungVon, leistung_bis: e.leistungBis || "" });
    }
    setGeaendert(true);
    toast.success(`${e.positionen.length} Position${e.positionen.length === 1 ? "" : "en"} übernommen`);
  };

  // ── Speichern ──
  const speichern = async (stumm = false, navigieren = true): Promise<string | null> => {
    if (!kopf || !firma) return null;
    if (festgeschrieben) return beleg?.id ?? null;
    if (!kopf.kunde_name.trim()) { toast.error("Bitte den Empfänger eintragen."); return null; }
    setArbeitet("speichern");
    const daten = {
      typ: kopf.typ,
      empfaenger_art: kopf.empfaenger_art,
      empfaenger_firma_id: kopf.empfaenger_art === "firma" ? kopf.empfaenger_firma_id : null,
      projekt_id: kopf.projekt_id || null,
      kunde_name: kopf.kunde_name.trim(), kunde_zusatz: kopf.kunde_zusatz.trim() || null,
      kunde_strasse: kopf.kunde_strasse.trim() || null, kunde_plz: kopf.kunde_plz.trim() || null,
      kunde_ort: kopf.kunde_ort.trim() || null, kunde_uid: kopf.kunde_uid.trim() || null, kunde_email: kopf.kunde_email.trim() || null,
      datum: kopf.datum,
      leistung_von: kopf.typ === "rechnung" ? kopf.leistung_von || null : null,
      leistung_bis: kopf.typ === "rechnung" ? kopf.leistung_bis || null : null,
      faellig_am: kopf.typ === "rechnung" ? kopf.faellig_am || null : null,
      gueltig_bis: kopf.typ === "angebot" ? kopf.gueltig_bis || null : null,
      betreff: kopf.betreff.trim() || null, notizen: kopf.notizen.trim() || null,
      ust_satz: zahlLesen(kopf.ust_satz), reverse_charge: kopf.reverse_charge,
      netto: summen.netto, ust: summen.ust, brutto: summen.brutto,
    };
    try {
      let bid = beleg?.id;
      if (bid) {
        const { error } = await supabase.from("rechnungen").update(daten).eq("id", bid);
        if (error) throw error;
        const { error: e2 } = await supabase.from("rechnung_positionen").delete().eq("rechnung_id", bid);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from("rechnungen").insert(daten).select("id").single();
        if (error) throw error;
        bid = data.id;
      }
      const zeilen = positionen
        .filter((p) => p.bezeichnung.trim() || p.beschreibung.trim())
        .map((p, i) => ({
          rechnung_id: bid!, pos: i + 1, art: p.art, bezeichnung: p.bezeichnung.trim(), beschreibung: p.beschreibung.trim() || null,
          menge: p.art === "text" ? 0 : zahlLesen(p.menge), einheit: p.einheit || "Stk", einzelpreis: p.art === "text" ? 0 : zahlLesen(p.einzelpreis),
        }));
      if (zeilen.length) {
        const { error } = await supabase.from("rechnung_positionen").insert(zeilen);
        if (error) throw error;
      }
      // Nur Rechnungen "verbrauchen" Stunden und Material — Angebote nicht.
      if (kopf.typ === "rechnung") {
        if (verknuepft.zeiten.length) await supabase.from("zeiten").update({ rechnung_id: bid }).in("id", verknuepft.zeiten);
        if (verknuepft.material.length) await supabase.from("material").update({ rechnung_id: bid }).in("id", verknuepft.material);
      }
      await neuLaden("rechnungen", "zeiten", "material");
      setGeaendert(false);
      if (!stumm) toast.success("Gespeichert");
      if (!beleg) { if (navigieren) navigate(`/rechnungen/${bid}`, { replace: true }); }
      else {
        const { data } = await supabase.from("rechnungen").select("*").eq("id", bid!).single();
        if (data) setBeleg(data);
      }
      return bid!;
    } catch (e) {
      toast.error("Nicht gespeichert", { description: (e as { message?: string }).message });
      return null;
    } finally {
      setArbeitet(null);
    }
  };

  const neuHolen = async (bid: string) => {
    const { data } = await supabase.from("rechnungen").select("*").eq("id", bid).single();
    if (data) setBeleg(data);
    await neuLaden("rechnungen");
  };

  const fertigstellen = async () => {
    setDialog(null);
    const bid = await speichern(true, false);
    if (!bid) return;
    setArbeitet("fertig");
    const { data: nr, error } = await supabase.rpc("beleg_fertigstellen", { p_id: bid });
    setArbeitet(null);
    if (error) return toast.error("Nicht fertiggestellt", { description: error.message });
    toast.success(`${kopf?.typ === "angebot" ? "Angebot" : "Rechnung"} ${nr} ist fertig`);
    if (beleg) await neuHolen(bid);
    else navigate(`/rechnungen/${bid}`, { replace: true });
  };

  const status = async (neu: string, extra: Partial<Beleg> = {}) => {
    if (!beleg) return;
    const { error } = await supabase.from("rechnungen").update({ status: neu, ...extra }).eq("id", beleg.id);
    if (error) return toast.error(error.message);
    if (neu === "storniert") {
      // Stornierte Rechnung gibt Stunden und Material wieder frei
      await supabase.from("zeiten").update({ rechnung_id: null }).eq("rechnung_id", beleg.id);
      await supabase.from("material").update({ rechnung_id: null }).eq("rechnung_id", beleg.id);
      await neuLaden("zeiten", "material");
    }
    toast.success(STATUS_TEXT[neu]);
    setDialog(null);
    await neuHolen(beleg.id);
  };

  const pdf = async () => {
    let b = beleg;
    if (!festgeschrieben && (geaendert || !b)) {
      const bid = await speichern(true);
      if (!bid) return;
      const { data } = await supabase.from("rechnungen").select("*").eq("id", bid).single();
      b = data;
    }
    if (!b || !ausstellerFirma) return;
    setArbeitet("pdf");
    try {
      const { data: pos } = await supabase.from("rechnung_positionen").select("*").eq("rechnung_id", b.id).order("pos");
      const projektName = projekte.find((p) => p.id === b!.projekt_id)?.name;
      const blob = await belegPdf({
        beleg: b, positionen: pos ?? [], firma: ausstellerFirma,
        empfaengerFirma: firmaVon(b.empfaenger_firma_id), projektName,
      });
      await pdfTeilenOderLaden(blob, belegDateiname(b));
    } catch (e) {
      toast.error("PDF fehlgeschlagen", { description: (e as Error).message });
    } finally {
      setArbeitet(null);
    }
  };

  const kopieren = async (alsRechnung: boolean) => {
    if (!beleg || !kopf) return;
    setArbeitet("kopie");
    const { id: _id, nummer: _n, status: _s, created_at: _c, updated_at: _u, fertig_am: _f, bezahlt_am: _b, firma_id: _fi, erstellt_von: _e, ...rest } = beleg;
    const heute = isoTag();
    const { data, error } = await supabase.from("rechnungen").insert({
      ...rest,
      typ: alsRechnung ? "rechnung" : beleg.typ,
      angebot_id: alsRechnung ? beleg.id : beleg.angebot_id,
      datum: heute,
      faellig_am: tageDazu(heute, firma!.zahlungsziel_tage),
      gueltig_bis: beleg.typ === "angebot" && !alsRechnung ? tageDazu(heute, 30) : null,
    }).select("id").single();
    if (error) { setArbeitet(null); return toast.error(error.message); }
    const { data: pos } = await supabase.from("rechnung_positionen").select("*").eq("rechnung_id", beleg.id);
    if (pos?.length) {
      await supabase.from("rechnung_positionen").insert(pos.map(({ id: _i, gesamt: _g, ...p }) => ({ ...p, rechnung_id: data.id })));
    }
    if (alsRechnung) await supabase.from("rechnungen").update({ status: "angenommen" }).eq("id", beleg.id);
    setArbeitet(null);
    await neuLaden("rechnungen");
    toast.success(alsRechnung ? "Rechnung aus dem Angebot erstellt" : "Kopie als Entwurf angelegt");
    navigate(`/rechnungen/${data.id}`);
  };

  const loeschen = async () => {
    if (!beleg) return;
    const { error } = await supabase.from("rechnungen").delete().eq("id", beleg.id);
    if (error) return toast.error(error.message);
    await neuLaden("rechnungen", "zeiten", "material");
    toast.success("Gelöscht");
    navigate("/rechnungen");
  };

  if (laden || !firma) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt…</div>;
  if (!kopf) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Beleg" backPath="/rechnungen" />
        <p className="p-8 text-center text-muted-foreground">Diesen Beleg gibt es nicht oder er ist nicht für dich sichtbar.</p>
      </div>
    );
  }

  const typText = kopf.typ === "angebot" ? "Angebot" : "Rechnung";
  const titel = beleg?.nummer ? `${typText} ${beleg.nummer}` : istNeu ? `Neue${kopf.typ === "angebot" ? "s Angebot" : " Rechnung"}` : `${typText} (Entwurf)`;
  const projekt = projekte.find((p) => p.id === kopf.projekt_id);
  const nl = festgeschrieben;

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageHeader title={titel} backPath={kopf.projekt_id && !eingang ? undefined : "/rechnungen"} />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 max-w-5xl">
        {/* Statuszeile */}
        <div className="flex flex-wrap items-center gap-2">
          {beleg && <Badge className={STATUS_FARBE[beleg.status]} variant="secondary">{STATUS_TEXT[beleg.status]}</Badge>}
          {eingang && <Badge variant="outline" className="gap-1 border-sky-300 text-sky-800"><Inbox className="h-3 w-3" /> Eingang von {ausstellerFirma?.name}</Badge>}
          {nl && !eingang && <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> festgeschrieben</span>}
          {beleg?.bezahlt_am && <span className="text-xs text-muted-foreground">bezahlt am {datumText(beleg.bezahlt_am)}</span>}
          <div className="ml-auto flex gap-2">
            {beleg && !eingang && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Weitere Aktionen"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => kopieren(false)}><Copy className="mr-2 h-4 w-4" /> Duplizieren</DropdownMenuItem>
                  {beleg.typ === "angebot" && <DropdownMenuItem onClick={() => kopieren(true)}><Receipt className="mr-2 h-4 w-4" /> In Rechnung umwandeln</DropdownMenuItem>}
                  {beleg.typ === "rechnung" && beleg.status === "offen" && (
                    <DropdownMenuItem className="text-destructive" onClick={() => setDialog("storno")}><Ban className="mr-2 h-4 w-4" /> Stornieren</DropdownMenuItem>
                  )}
                  {(beleg.status === "entwurf" || beleg.typ === "angebot") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDialog("loeschen")}><Trash2 className="mr-2 h-4 w-4" /> Löschen</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Typ */}
        {!nl && !beleg?.nummer && (
          <div className="flex rounded-lg border overflow-hidden w-fit">
            {(["rechnung", "angebot"] as const).map((t, i) => (
              <button key={t} onClick={() => setze("typ", t)} disabled={kopf.empfaenger_art === "firma" && t === "angebot"}
                className={cn("px-4 py-2 text-sm font-medium disabled:opacity-40", i > 0 && "border-l",
                  kopf.typ === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {t === "rechnung" ? "Rechnung" : "Angebot"}
              </button>
            ))}
          </div>
        )}

        {/* Empfänger */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{eingang ? "Rechnung an meine Firma" : "An wen?"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!nl && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => empfaengerWaehlen("kunde")}
                  className={cn("rounded-full border-2 px-4 py-1.5 text-sm font-medium", kopf.empfaenger_art === "kunde" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  Kunde
                </button>
                {kopf.typ === "rechnung" && firmen.filter((f) => f.id !== firma.id).map((f) => {
                  const an = kopf.empfaenger_firma_id === f.id;
                  return (
                    <button key={f.id} onClick={() => empfaengerWaehlen(f.id)}
                      className={cn("rounded-full border-2 px-4 py-1.5 text-sm font-medium", an ? "text-white" : "hover:bg-muted")}
                      style={an ? { backgroundColor: f.farbe, borderColor: f.farbe } : { borderColor: `${f.farbe}66` }}>
                      Kollege: {f.kurzname}
                    </button>
                  );
                })}
              </div>
            )}
            {kopf.empfaenger_art === "firma" && !eingang && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                Subunternehmer-Rechnung an <FirmaBadge firma={firmaVon(kopf.empfaenger_firma_id)} lang /> — sie erscheint dort nach dem Fertigstellen unter „Von Kollegen“.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="b-name" className="text-xs">Name / Firma</Label>
                <Input id="b-name" className="h-11" disabled={nl || kopf.empfaenger_art === "firma"} value={kopf.kunde_name} onChange={(e) => setze("kunde_name", e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="b-zusatz" className="text-xs">Zusatz (z. H., Abteilung)</Label>
                <Input id="b-zusatz" disabled={nl} value={kopf.kunde_zusatz} onChange={(e) => setze("kunde_zusatz", e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="b-strasse" className="text-xs">Straße</Label>
                <Input id="b-strasse" disabled={nl} value={kopf.kunde_strasse} onChange={(e) => setze("kunde_strasse", e.target.value)} />
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-2 sm:col-span-2">
                <div className="space-y-1"><Label htmlFor="b-plz" className="text-xs">PLZ</Label><Input id="b-plz" disabled={nl} value={kopf.kunde_plz} onChange={(e) => setze("kunde_plz", e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="b-ort" className="text-xs">Ort</Label><Input id="b-ort" disabled={nl} value={kopf.kunde_ort} onChange={(e) => setze("kunde_ort", e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="b-uid" className="text-xs">UID</Label><Input id="b-uid" disabled={nl} value={kopf.kunde_uid} onChange={(e) => setze("kunde_uid", e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="b-email" className="text-xs">E-Mail</Label><Input id="b-email" type="email" disabled={nl} value={kopf.kunde_email} onChange={(e) => setze("kunde_email", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Projekt</Label>
              {nl ? <p className="text-sm">{projekt?.name || "—"}</p> : <ProjektWahl wert={kopf.projekt_id ?? ""} onChange={projektWaehlen} leerText="Kein Projekt" mitAbgeschlossenen />}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1"><Label htmlFor="b-datum" className="text-xs">Datum</Label><Input id="b-datum" type="date" disabled={nl} value={kopf.datum} onChange={(e) => setze("datum", e.target.value)} /></div>
              {kopf.typ === "rechnung" ? (
                <>
                  <div className="space-y-1"><Label htmlFor="b-lv" className="text-xs">Leistung von</Label><Input id="b-lv" type="date" disabled={nl} value={kopf.leistung_von} onChange={(e) => setze("leistung_von", e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="b-lb" className="text-xs">Leistung bis</Label><Input id="b-lb" type="date" disabled={nl} value={kopf.leistung_bis} onChange={(e) => setze("leistung_bis", e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="b-faellig" className="text-xs">Fällig am</Label><Input id="b-faellig" type="date" disabled={nl} value={kopf.faellig_am} onChange={(e) => setze("faellig_am", e.target.value)} /></div>
                </>
              ) : (
                <div className="space-y-1"><Label htmlFor="b-gueltig" className="text-xs">Gültig bis</Label><Input id="b-gueltig" type="date" disabled={nl} value={kopf.gueltig_bis} onChange={(e) => setze("gueltig_bis", e.target.value)} /></div>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-betreff" className="text-xs">Betreff</Label>
              <Textarea id="b-betreff" rows={2} disabled={nl} value={kopf.betreff} onChange={(e) => setze("betreff", e.target.value)} placeholder="z. B. Elektroinstallation EFH Huber" />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Switch id="b-rc" disabled={nl} checked={kopf.reverse_charge} onCheckedChange={(v) => setze("reverse_charge", v)} />
                <Label htmlFor="b-rc">Reverse Charge (§ 19 Abs. 1a UStG)</Label>
              </div>
              {!ohneUst && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="b-ust" className="text-sm">USt %</Label>
                  <Select value={kopf.ust_satz} onValueChange={(v) => setze("ust_satz", v)} disabled={nl}>
                    <SelectTrigger id="b-ust" className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{["20", "13", "10", "0"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {kopf.reverse_charge && <p className="text-xs text-muted-foreground">Bauleistung an einen Unternehmer: keine USt, Hinweis und beide UID-Nummern stehen auf dem PDF.</p>}
            {ausstellerFirma?.kleinunternehmer && <p className="text-xs text-muted-foreground">Kleinunternehmer — ohne USt.</p>}
          </CardContent>
        </Card>

        {/* Positionen */}
        <Card>
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">Positionen</CardTitle>
            {!nl && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="gap-1" disabled={!kopf.projekt_id} onClick={() => setDialog("import")}
                  title={kopf.projekt_id ? "" : "Zuerst ein Projekt wählen"}>
                  <FolderInput className="h-4 w-4" /> Stunden & Material aus Projekt
                </Button>
                {kopf.empfaenger_art === "kunde" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setDialog("kollegen")}>
                    <Inbox className="h-4 w-4" /> Von Kollegen übernehmen
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-2 px-3 sm:px-6">
            {positionen.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Positionen.</p>}
            {positionen.map((p, i) => (
              <div key={p.key} className={cn("rounded-lg border p-3 space-y-2", p.art === "text" && "bg-muted/30")}>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-6 pt-2.5 shrink-0">{p.art === "text" ? "T" : String(positionen.slice(0, i + 1).filter((x) => x.art !== "text").length).padStart(2, "0")}</span>
                  <div className="flex-1 space-y-2 min-w-0">
                    <Input disabled={nl} value={p.bezeichnung} placeholder={p.art === "text" ? "Zwischenüberschrift / Text" : "Bezeichnung"}
                      onChange={(e) => posSetze(p.key, { bezeichnung: e.target.value })} className="font-medium" aria-label="Bezeichnung" />
                    <Textarea disabled={nl} rows={1} value={p.beschreibung} placeholder="Langtext (optional)"
                      onChange={(e) => posSetze(p.key, { beschreibung: e.target.value })} className="text-sm min-h-9" aria-label="Langtext" />
                  </div>
                  {!nl && (
                    <div className="flex flex-col shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => posVerschieben(i, -1)} disabled={i === 0} aria-label="Nach oben"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => posVerschieben(i, 1)} disabled={i === positionen.length - 1} aria-label="Nach unten"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPositionen((l) => l.filter((x) => x.key !== p.key)); setGeaendert(true); }} aria-label="Position löschen">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {p.art !== "text" && (
                  <div className="grid grid-cols-[1fr_1fr_1.3fr] sm:grid-cols-[6rem_7rem_8rem_1fr] gap-2 pl-8 items-end">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Menge</Label>
                      <Input disabled={nl} inputMode="decimal" value={p.menge} onChange={(e) => posSetze(p.key, { menge: e.target.value })} aria-label="Menge" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Einheit</Label>
                      <Select disabled={nl} value={p.einheit} onValueChange={(v) => posSetze(p.key, { einheit: v })}>
                        <SelectTrigger aria-label="Einheit"><SelectValue /></SelectTrigger>
                        <SelectContent>{[...new Set([p.einheit, ...EINHEITEN])].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Einzelpreis €</Label>
                      <Input disabled={nl} inputMode="decimal" value={p.einzelpreis} onChange={(e) => posSetze(p.key, { einzelpreis: e.target.value })}
                        onBlur={() => posSetze(p.key, { einzelpreis: preisText(zahlLesen(p.einzelpreis)) })} aria-label="Einzelpreis" />
                    </div>
                    <p className="col-span-3 sm:col-span-1 text-right font-bold tabular-nums pb-2">{euro(positionGesamt(p))}</p>
                  </div>
                )}
              </div>
            ))}
            {!nl && (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setPositionen((l) => [...l, neuePosition()]); setGeaendert(true); }}>
                  <Plus className="h-4 w-4" /> Position
                </Button>
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setPositionen((l) => [...l, neuePosition({ art: "text", menge: "0", einzelpreis: "0" })]); setGeaendert(true); }}>
                  <Type className="h-4 w-4" /> Textzeile
                </Button>
              </div>
            )}

            <div className="border-t pt-3 mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Netto</span><span className="tabular-nums">{euro(summen.netto)}</span></div>
              {!ohneUst && <div className="flex justify-between"><span>USt {kopf.ust_satz} %</span><span className="tabular-nums">{euro(summen.ust)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-1"><span>{ohneUst ? "Rechnungsbetrag" : "Gesamt"}</span><span className="tabular-nums">{euro(summen.brutto)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Anmerkung auf dem PDF</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={3} disabled={nl} value={kopf.notizen} onChange={(e) => setze("notizen", e.target.value)} placeholder="optional" />
          </CardContent>
        </Card>
      </main>

      {/* Feste Aktionsleiste unten — Speichern ist immer erreichbar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="container mx-auto max-w-5xl px-3 sm:px-6 py-3 flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={pdf} disabled={!!arbeitet} className="gap-2">
            {arbeitet === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
          </Button>
          {!nl && (
            <Button variant="outline" onClick={() => speichern()} disabled={!!arbeitet} className="gap-2">
              {arbeitet === "speichern" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
            </Button>
          )}
          {!nl && (!beleg || beleg.status === "entwurf") && (
            <Button onClick={() => (kopf.typ === "rechnung" ? setDialog("fertig") : fertigstellen())} disabled={!!arbeitet || positionen.length === 0} className="gap-2">
              {arbeitet === "fertig" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Fertigstellen
            </Button>
          )}
          {!eingang && beleg?.typ === "rechnung" && beleg.status === "offen" && (
            <Button onClick={() => status("bezahlt", { bezahlt_am: isoTag() })} className="gap-2 bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4" /> Bezahlt
            </Button>
          )}
          {!eingang && beleg?.typ === "rechnung" && beleg.status === "bezahlt" && (
            <Button variant="outline" onClick={() => status("offen", { bezahlt_am: null })} className="gap-2"><Undo2 className="h-4 w-4" /> Doch offen</Button>
          )}
          {!eingang && beleg?.typ === "angebot" && beleg.status === "offen" && (
            <>
              <Button variant="outline" onClick={() => status("abgelehnt")} className="gap-2"><ThumbsDown className="h-4 w-4" /> Abgelehnt</Button>
              <Button onClick={() => kopieren(true)} className="gap-2"><ThumbsUp className="h-4 w-4" /> Angenommen → Rechnung</Button>
            </>
          )}
          {eingang && beleg?.projekt_id && (
            <Button onClick={() => navigate(`/rechnungen/neu?projekt=${beleg.projekt_id}`)} className="gap-2">
              <Receipt className="h-4 w-4" /> Kundenrechnung dazu schreiben
            </Button>
          )}
        </div>
      </div>

      {kopf.projekt_id && (
        <ImportDialog open={dialog === "import"} onOpenChange={(o) => !o && setDialog(null)}
          projektId={kopf.projekt_id} belegId={beleg?.id} onUebernehmen={importUebernehmen} />
      )}
      <KollegenImportDialog open={dialog === "kollegen"} onOpenChange={(o) => !o && setDialog(null)} projektId={kopf.projekt_id}
        onUebernehmen={(p) => { setPositionen((l) => [...l.filter((x) => x.bezeichnung), ...p]); setGeaendert(true); toast.success(`${p.length} Position(en) übernommen`); }} />

      <AlertDialog open={dialog === "fertig"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung fertigstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Rechnung bekommt jetzt ihre fortlaufende Nummer und kann danach nicht mehr geändert werden — nur noch storniert.
              Betrag: <strong>{euro(summen.brutto)}</strong> an <strong>{kopf.kunde_name || "—"}</strong>.
              {kopf.empfaenger_art === "firma" && " Die Kollegenfirma sieht sie danach in ihrer App."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Noch nicht</AlertDialogCancel>
            <AlertDialogAction onClick={fertigstellen}>Fertigstellen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "storno"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Rechnung bleibt mit ihrer Nummer erhalten, gilt aber als storniert. Stunden und Material daraus werden wieder frei und können neu verrechnet werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => status("storniert")}>Stornieren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "loeschen"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen?</AlertDialogTitle>
            <AlertDialogDescription>Der Beleg wird entfernt. Verknüpfte Stunden und Material werden wieder frei.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={loeschen}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
