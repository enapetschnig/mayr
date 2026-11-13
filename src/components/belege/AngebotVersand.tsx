import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, Copy, ExternalLink, FileDown, FileText, Link2, Loader2, Mail, MessageCircle, MessageSquareText, MoreVertical, Paperclip,
  RefreshCw, Share2, ShieldOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { TON_KLASSE, type Beleg } from "@/lib/types";
import { cn } from "@/lib/utils";
import { linkAdresse, mailAdresse, teilenText, VERLAUF_TEXT, whatsappAdresse, type VerlaufArt } from "./bestaetigung";
import { artikelIdsVon, datenblattLaden, paketNamen, paketZip, useDatenblaetter } from "./datenblaetter";
import type { EditorPosition, KatalogLeistung } from "./editor";

type Verlauf = { id: string; art: VerlaufArt; name: string | null; text: string | null; unterschrift_pfad: string | null; betrag: number | null; gelesen: boolean; created_at: string };

const zeit = (iso: string) => new Date(iso).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Link und Verlauf eines Angebots (nur Chef — RLS) */
export function useAngebotOnline(belegId: string, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "online", belegId],
    enabled: aktiv,
    queryFn: async () => {
      const [l, v] = await Promise.all([
        supabase.from("angebot_links").select("token, ablauf, geoeffnet_am, created_at").eq("beleg_id", belegId).is("gesperrt_am", null).maybeSingle(),
        supabase.from("angebot_verlauf").select("id, art, name, text, unterschrift_pfad, betrag, gelesen, created_at").eq("beleg_id", belegId).order("created_at", { ascending: false }),
      ]);
      if (l.error) throw l.error;
      if (v.error) throw v.error;
      return { link: l.data, verlauf: (v.data ?? []) as Verlauf[] };
    },
  });
}

/**
 * Unter dem Status eines fertigen Angebots: „Kunde bestätigt online“ (Link
 * erzeugen, teilen, sperren; Verlauf mit Annahme, Rückfragen, Unterschrift)
 * und die Datenblätter der Artikel als Anhang. Verschickt wird nichts von
 * hier — Mail-App und WhatsApp öffnen sich mit fertigem Text.
 */
export function AngebotVersand({
  beleg, positionen, katalog, pdfErzeugen,
}: {
  beleg: Beleg;
  positionen: EditorPosition[];
  katalog: KatalogLeistung[];
  /** das PDF, wie es der Kunde bekommt */
  pdfErzeugen: () => Promise<{ blob: Blob; dateiname: string }>;
}) {
  const qc = useQueryClient();
  const { firma } = useSitzung();
  const fertig = beleg.status !== "entwurf";
  const { data, isLoading } = useAngebotOnline(beleg.id, fertig);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const link = data?.link ? linkAdresse(window.location.origin, data.link.token) : null;
  const verlauf = data?.verlauf ?? [];
  const ungelesen = verlauf.filter((v) => !v.gelesen).length;

  // Angebot geöffnet = Annahme und Rückfragen gesehen (für „Zu erledigen“)
  useEffect(() => {
    if (!ungelesen) return;
    void supabase.from("angebot_verlauf").update({ gelesen: true }).eq("beleg_id", beleg.id).eq("gelesen", false)
      .then(() => qc.invalidateQueries({ queryKey: ["belege", "start"] }));
  }, [ungelesen, beleg.id, qc]);

  const { data: kunde } = useQuery({
    queryKey: ["kunden", "telefon", beleg.kunde_id],
    enabled: !!beleg.kunde_id && !!link,
    queryFn: async () => (await supabase.from("kunden").select("telefon, email").eq("id", beleg.kunde_id!).maybeSingle()).data,
  });

  const neuLaden = () => qc.invalidateQueries({ queryKey: ["belege", "online", beleg.id] });
  const ausfuehren = async (was: string, fn: () => Promise<void>) => {
    if (laeuft) return;
    setLaeuft(was);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setLaeuft(null); }
  };

  const erzeugen = () => ausfuehren("link", async () => {
    const { error } = await supabase.rpc("angebot_link_erstellen", { p_beleg: beleg.id });
    if (error) throw new Error(error.message);
    await neuLaden();
    toast.success(data?.link ? "Neuer Link erzeugt — der alte gilt nicht mehr." : "Link erzeugt — jetzt dem Kunden schicken.");
  });
  const sperren = () => ausfuehren("sperren", async () => {
    const { error } = await supabase.rpc("angebot_link_sperren", { p_beleg: beleg.id });
    if (error) throw new Error(error.message);
    await neuLaden();
    toast.success("Link gesperrt — der Kunde sieht das Angebot nicht mehr.");
  });

  const text = link ? teilenText({
    firma: firma?.name, nummer: beleg.nummer, betreff: beleg.betreff, link,
    giltBis: data?.link ? datum(beleg.gueltig_bis ?? data.link.ablauf) : null,
  }) : "";
  const betreff = `Angebot ${beleg.nummer ?? ""}${beleg.betreff ? ` – ${beleg.betreff}` : ""}`;
  const kopieren = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kopiert");
    } catch {
      window.prompt("Link kopieren:", link);
    }
  };
  const teilen = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: betreff, text });
    } catch (e) {
      if ((e as Error).name !== "AbortError") void kopieren();
    }
  };
  const kannTeilen = typeof navigator !== "undefined" && "share" in navigator && /Android|iPhone|iPad/i.test(navigator.userAgent);

  // ── Datenblätter ──
  const namen = useMemo(() => new Map(positionen.filter((p) => p.artikel_id).map((p) => [p.artikel_id!, p.bezeichnung])), [positionen]);
  const ids = useMemo(() => artikelIdsVon(positionen, katalog), [positionen, katalog]);
  const { data: blaetter = [] } = useDatenblaetter(ids, namen);
  const [ohne, setOhne] = useState<Set<string>>(new Set());
  const gewaehlt = blaetter.filter((d) => !ohne.has(d.pfad));

  const paket = () => ausfuehren("paket", async () => {
    const pdf = await pdfErzeugen();
    const geladen = await Promise.all(gewaehlt.map(async (d) => ({ d, blob: await datenblattLaden(d.pfad) })));
    const dateinamen = paketNamen(geladen.map((g) => g.d));
    const dateien = [{ name: pdf.dateiname, blob: pdf.blob }, ...geladen.map((g, i) => ({ name: dateinamen[i], blob: g.blob }))];
    // Handy: alle Dateien ins Teilen-Menü (Mail, WhatsApp nehmen mehrere), sonst ein ZIP
    const files = dateien.map((d) => new File([d.blob], d.name, { type: d.blob.type || "application/pdf" }));
    const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
    if (kannTeilen && nav.canShare?.({ files })) {
      try { await navigator.share({ files, title: betreff }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    const zip = await paketZip(dateien);
    await pdfTeilenOderLaden(zip, pdf.dateiname.replace(/\.pdf$/i, " mit Datenblättern.zip"));
  });
  const einzeln = (pfad: string, name: string) => ausfuehren("blatt", async () => {
    const blob = await datenblattLaden(pfad);
    await pdfTeilenOderLaden(blob, name);
  });

  const unterschriftOeffnen = (pfad: string) => ausfuehren("bild", async () => {
    const { data: u, error } = await supabase.storage.from("angebot-bestaetigung").createSignedUrl(pfad, 300);
    if (error || !u) throw new Error("Unterschrift nicht geladen");
    window.open(u.signedUrl, "_blank", "noopener");
  });

  if (!fertig) return null;
  const annahme = verlauf.find((v) => v.art === "angenommen");
  const offen = beleg.status === "offen";

  return (
    <>
      {(offen || verlauf.length > 0) && (
        <section className="rounded-lg border bg-card p-4" aria-label="Kunde bestätigt online">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Link2 className="h-4 w-4 text-primary" /> Kunde bestätigt online</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {annahme
                  ? `Angenommen von ${annahme.name} am ${zeit(annahme.created_at)}${annahme.betrag != null ? ` · ${euro(Number(annahme.betrag))} brutto` : ""}`
                  : link
                    ? `Link gilt bis ${datum(beleg.gueltig_bis ?? data!.link!.ablauf)}${data?.link?.geoeffnet_am ? ` · vom Kunden geöffnet am ${zeit(data.link.geoeffnet_am)}` : " · noch nicht geöffnet"}`
                    : offen ? "Link schicken — der Kunde sieht das Angebot am Handy, unterschreibt und nimmt an. Ohne Anmeldung." : ""}
              </p>
            </div>
            {link && offen && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Link verwalten" disabled={!!laeuft}><MoreVertical className="h-5 w-5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem className="h-11 gap-2" onClick={() => window.open(link, "_blank", "noopener")}><ExternalLink className="h-4 w-4" /> So sieht es der Kunde</DropdownMenuItem>
                  <DropdownMenuItem className="h-11 gap-2" onClick={erzeugen}><RefreshCw className="h-4 w-4" /> Neuen Link erzeugen</DropdownMenuItem>
                  <DropdownMenuItem className="h-11 gap-2 text-destructive focus:text-destructive" onClick={sperren}><ShieldOff className="h-4 w-4" /> Link sperren</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {offen && !isLoading && !link && (
            <Button className="mt-3 h-11 w-full sm:w-auto" onClick={erzeugen} disabled={!!laeuft}>
              {laeuft === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Link zur Bestätigung erzeugen
            </Button>
          )}

          {offen && link && (
            <div className="mt-3 space-y-2">
              <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" data-bestaetigungslink>{link}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {kannTeilen && <Button className="col-span-2 h-11" onClick={() => void teilen()}><Share2 className="h-4 w-4" /> Teilen</Button>}
                <Button variant={kannTeilen ? "outline" : "default"} className="h-11" onClick={() => void kopieren()}><Copy className="h-4 w-4" /> Link kopieren</Button>
                <Button variant="outline" className="h-11" asChild>
                  <a href={whatsappAdresse(text, kunde?.telefon)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                </Button>
                <Button variant="outline" className={cn("h-11", !kannTeilen && "col-span-2 sm:col-span-1")} asChild>
                  <a href={mailAdresse(beleg.empf_email ?? kunde?.email, betreff, text)}><Mail className="h-4 w-4" /> E-Mail</a>
                </Button>
              </div>
            </div>
          )}

          {verlauf.length > 0 && (
            <ol className="mt-3 space-y-0 border-t pt-2 text-sm" aria-label="Verlauf">
              {verlauf.map((v) => (
                <li key={v.id} className="flex items-start gap-2.5 py-1.5">
                  {v.art === "angenommen" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    : v.art === "rueckfrage" ? <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className={cn("font-medium", (v.art === "angenommen" || v.art === "rueckfrage") && "text-foreground")}>{VERLAUF_TEXT[v.art] ?? v.art}</span>
                      {v.name && <> · {v.name}</>}
                      <span className="text-muted-foreground"> · {zeit(v.created_at)}</span>
                    </p>
                    {v.art === "rueckfrage" && v.text && <p className={cn("mt-1 whitespace-pre-wrap rounded-md px-3 py-2", TON_KLASSE.gelb)}>{v.text}</p>}
                    {v.unterschrift_pfad && (
                      <button type="button" className="mt-0.5 text-xs font-medium text-primary hover:underline" onClick={() => v.unterschrift_pfad && unterschriftOeffnen(v.unterschrift_pfad)}>
                        Unterschrift ansehen
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {blaetter.length > 0 && (
        <section className="rounded-lg border bg-card p-4" aria-label="Datenblätter">
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold"><Paperclip className="h-4 w-4 text-primary" /> Datenblätter als Anhang</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Aus den Artikeln im Angebot — der Kunde sieht sie auch beim Bestätigungslink.</p>
          <ul className="mt-2 divide-y text-sm">
            {blaetter.map((d) => (
              <li key={d.pfad} className="flex items-center gap-2 py-1.5">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={!ohne.has(d.pfad)} aria-label={`${d.name} mitschicken`}
                  onChange={(e) => setOhne((s) => { const n = new Set(s); if (e.target.checked) n.delete(d.pfad); else n.add(d.pfad); return n; })} />
                <button type="button" className="min-w-0 flex-1 truncate py-1 text-left hover:underline" onClick={() => einzeln(d.pfad, d.name)}>
                  <FileText className="mr-1.5 inline h-4 w-4 text-muted-foreground" />{d.name}
                  {d.artikel && <span className="text-muted-foreground"> · {d.artikel}</span>}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="mt-2 h-11 w-full sm:w-auto" onClick={paket} disabled={!!laeuft}>
            {laeuft === "paket" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Angebot + {gewaehlt.length} {gewaehlt.length === 1 ? "Datenblatt" : "Datenblätter"} {kannTeilen ? "teilen" : "laden (ZIP)"}
          </Button>
        </section>
      )}
    </>
  );
}
