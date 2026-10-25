import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, FileText, Loader2, Receipt, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Avatar, Karte, RegieStatusBadge } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import { useSitzung } from "@/hooks/useSitzung";
import { isoZuDatum, stunden, zahl } from "@/lib/format";
import { materialText, regieberichtLaden, zeitpunkt, type RegieVoll } from "@/lib/regiePdf";
import { name } from "@/lib/types";
import { materialZusammenfassen, zeitSpanne } from "./regieLogik";
import { sicherungLoeschen } from "./sicherung";
import { useRegiePdf } from "./useRegiePdf";

/** Signierte Adresse des Unterschriftsbilds (Bucket ist privat) */
function useUnterschriftBild(pfad: string | null) {
  return useQuery({
    queryKey: ["regieberichte", "unterschrift", pfad],
    enabled: !!pfad,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("projekt-dateien").createSignedUrl(pfad!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function tagLang(iso: string) {
  return isoZuDatum(iso).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function baustelleText(p: { strasse: string | null; plz: string | null; ort: string | null } | null | undefined) {
  if (!p) return "";
  return [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Unterschriebener Regiebericht — festgeschrieben, nur noch ansehen,
 * als PDF teilen und (Chef) zur Rechnung springen.
 */
export function RegieAnsicht({ voll }: { voll: RegieVoll }) {
  const { istChef } = useSitzung();
  const pdf = useRegiePdf();
  const bild = useUnterschriftBild(voll.unterschrift_pfad);
  const p = voll.projekte;
  const verrechnet = !!voll.rechnung_id;
  const summe = voll.zeiten.reduce((s, z) => s + Number(z.stunden), 0);
  const material = useMemo(
    () => materialZusammenfassen(voll.material.map((m) => ({ artikelId: m.artikel_id, ...materialText(m), menge: Number(m.menge) }))),
    [voll.material],
  );
  const baustelle = baustelleText(p);

  // Eine liegengebliebene Sicherung des Entwurfs braucht es nicht mehr
  useEffect(() => sicherungLoeschen(voll.id), [voll.id]);

  const holen = () => regieberichtLaden(voll.id);
  const pdfKnoepfe = pdf.pc ? (
    <>
      <Button variant="outline" className="h-11 gap-1.5" disabled={pdf.laeuft} onClick={() => pdf.los(holen, true)}>
        {pdf.laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF ansehen
      </Button>
      <Button variant="outline" className="h-11 gap-1.5" disabled={pdf.laeuft} onClick={() => pdf.los(holen, false)}>
        <Download className="h-4 w-4" /> Herunterladen
      </Button>
    </>
  ) : (
    <Button variant="ghost" size="icon" className="h-11 w-11" disabled={pdf.laeuft} onClick={() => pdf.los(holen, false)} aria-label="PDF teilen">
      {pdf.laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
    </Button>
  );

  return (
    <Seite
      titel={`Regiebericht ${voll.nummer ?? ""}`.trim()}
      untertitel={[p?.name, p?.kunden?.name].filter(Boolean).join(" · ") || undefined}
      aktionen={pdfKnoepfe}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RegieStatusBadge status={voll.status} verrechnet={verrechnet} />
        <span className="text-sm text-muted-foreground">{tagLang(voll.datum)}</span>
      </div>

      {verrechnet ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-status-lila bg-status-lila p-3 text-sm text-status-lila-fg">
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Verrechnet{voll.rechnung?.nummer ? ` mit Rechnung ${voll.rechnung.nummer}` : ""} — der Bericht ist festgeschrieben.
          </span>
          {istChef && voll.rechnung_id && (
            <Link to={`/belege/${voll.rechnung_id}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-2 hover:underline">
              Rechnung öffnen <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Vom Kunden unterschrieben — festgeschrieben, nicht mehr änderbar. Noch nicht verrechnet.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Karte titel="Projekt">
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Projekt</dt>
              <dd className="min-w-0">
                {p ? (
                  <Link to={`/projekte/${p.id}`} className="font-medium text-primary hover:underline">{p.nummer} {p.name}</Link>
                ) : "–"}
              </dd>
              <dt className="text-muted-foreground">Kunde</dt>
              <dd className="min-w-0">{p?.kunden?.name ?? "–"}</dd>
              {baustelle && (<><dt className="text-muted-foreground">Baustelle</dt><dd className="min-w-0">{baustelle}</dd></>)}
              <dt className="text-muted-foreground">Aufgenommen</dt>
              <dd className="min-w-0">{name(voll.ersteller)}</dd>
            </dl>
          </Karte>

          <Karte titel="Durchgeführte Arbeiten">
            <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{voll.arbeiten.trim() || "–"}</p>
          </Karte>
        </div>

        <div className="space-y-4">
          <Karte titel="Arbeitszeit" ohnePolster>
            {voll.zeiten.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Keine Arbeitszeit erfasst.</p>
            ) : (
              <ul className="divide-y">
                {voll.zeiten.map((z) => (
                  <li key={z.id} className="flex items-center gap-3 px-4 py-2.5 lg:px-5">
                    <Avatar profil={z.profiles} className="h-7 w-7 text-[10px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name(z.profiles)}</span>
                      {z.von && <span className="block text-xs text-muted-foreground">{zeitSpanne(z.von, z.bis, z.pause_minuten)}</span>}
                    </span>
                    <span className="zahl shrink-0 font-semibold">{stunden(Number(z.stunden))}</span>
                  </li>
                ))}
                {voll.zeiten.length > 1 && (
                  <li className="flex items-center justify-between px-4 py-2.5 lg:px-5">
                    <span className="text-sm font-semibold">Summe</span>
                    <span className="zahl font-bold">{stunden(summe)}</span>
                  </li>
                )}
              </ul>
            )}
          </Karte>

          {material.length > 0 && (
            <Karte titel="Material" ohnePolster>
              <ul className="divide-y">
                {material.map((m, i) => (
                  <li key={`${m.artikelId ?? m.bezeichnung}-${i}`} className="flex items-baseline gap-3 px-4 py-2.5 text-sm lg:px-5">
                    <span className="zahl w-20 shrink-0 text-right font-semibold">{zahl(m.menge)} {m.einheit}</span>
                    <span className="min-w-0 flex-1">{m.bezeichnung}</span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}

          <Karte titel="Unterschrift des Kunden">
            <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border bg-white p-2">
              {bild.data ? (
                <img src={bild.data} alt={`Unterschrift ${voll.unterschrift_name ?? ""}`} className="max-h-full max-w-full object-contain" />
              ) : bild.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              ) : (
                <span className="text-sm text-neutral-500">Bild nicht verfügbar</span>
              )}
            </div>
            <p className="mt-2 text-sm">
              <span className="font-medium">{voll.unterschrift_name || "–"}</span>
              <span className="text-muted-foreground"> · {zeitpunkt(voll.unterschrieben_am)}</span>
            </p>
          </Karte>
        </div>
      </div>

      {!pdf.pc && (
        <Button className="h-12 w-full gap-2 text-base" disabled={pdf.laeuft} onClick={() => pdf.los(holen, false)}>
          {pdf.laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} PDF teilen
        </Button>
      )}
    </Seite>
  );
}
