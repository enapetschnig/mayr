import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Lock, Package, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FirmaBadge, Leer } from "@/components/Bausteine";
import { ZeitDialog } from "@/components/dialoge/ZeitDialog";
import { MaterialDialog } from "@/components/dialoge/MaterialDialog";
import { useSitzung } from "@/hooks/useSitzung";
import { datumKurz, euro, stunden, uhrzeit, zahl } from "@/lib/format";
import type { Material, Zeit } from "@/lib/types";

type ZeitMitProjekt = Zeit & { projekte: { name: string } | null };
type MaterialMitProjekt = Material & { projekte: { name: string } | null };

interface Filter {
  projektId?: string;
  /** nur eigene Firma (für "Meine Stunden") */
  nurEigene?: boolean;
  von?: string;
  bis?: string;
}

export function useZeiten(f: Filter) {
  const { firma } = useSitzung();
  return useQuery({
    queryKey: ["zeiten", f, firma?.id],
    queryFn: async () => {
      let q = supabase.from("zeiten").select("*, projekte(name)").order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (f.projektId) q = q.eq("projekt_id", f.projektId);
      if (f.nurEigene && firma) q = q.eq("firma_id", firma.id);
      if (f.von) q = q.gte("datum", f.von);
      if (f.bis) q = q.lte("datum", f.bis);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as ZeitMitProjekt[];
    },
  });
}

export function useMaterial(f: Filter) {
  const { firma } = useSitzung();
  return useQuery({
    queryKey: ["material", f, firma?.id],
    queryFn: async () => {
      let q = supabase.from("material").select("*, projekte(name)").order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (f.projektId) q = q.eq("projekt_id", f.projektId);
      if (f.nurEigene && firma) q = q.eq("firma_id", firma.id);
      if (f.von) q = q.gte("datum", f.von);
      if (f.bis) q = q.lte("datum", f.bis);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as MaterialMitProjekt[];
    },
  });
}

function Sicht({ wert }: { wert: string }) {
  return wert === "gemeinsam"
    ? <Users className="h-3.5 w-3.5 text-primary shrink-0" aria-label="für alle sichtbar" />
    : <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="nur ich" />;
}

export function ZeitenListe({ filter, mitProjekt = false }: { filter: Filter; mitProjekt?: boolean }) {
  const { firma, firmaVon } = useSitzung();
  const { data: zeiten = [], isLoading } = useZeiten(filter);
  const [bearbeiten, setBearbeiten] = useState<Zeit | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Lädt…</p>;
  if (zeiten.length === 0) return <Leer icon={Clock} text="Noch keine Stunden gebucht." />;

  const summeEigen = zeiten.filter((z) => z.firma_id === firma?.id).reduce((s, z) => s + Number(z.stunden), 0);
  const summeFremd = zeiten.filter((z) => z.firma_id !== firma?.id).reduce((s, z) => s + Number(z.stunden), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Meine Firma: <strong className="text-foreground">{stunden(summeEigen)}</strong>
        {summeFremd > 0 && <> · Partner (freigegeben): <strong className="text-foreground">{stunden(summeFremd)}</strong></>}
      </p>
      <div className="rounded-lg border divide-y bg-card">
        {zeiten.map((z) => {
          const eigen = z.firma_id === firma?.id;
          return (
            <button key={z.id} disabled={!eigen} onClick={() => setBearbeiten(z)}
              className="w-full flex items-center gap-3 p-3 text-left enabled:hover:bg-muted/50 disabled:cursor-default">
              <div className="w-20 shrink-0 text-xs">
                <p className="font-semibold">{datumKurz(z.datum)}</p>
                {z.von && <p className="text-muted-foreground">{uhrzeit(z.von)}–{uhrzeit(z.bis)}</p>}
              </div>
              <div className="flex-1 min-w-0">
                {mitProjekt && <p className="text-sm font-semibold truncate">{z.projekte?.name}</p>}
                <p className={`text-sm truncate ${mitProjekt ? "text-muted-foreground" : ""}`}>{z.taetigkeit || (mitProjekt ? "" : "—")}</p>
                {!eigen && <FirmaBadge firma={firmaVon(z.firma_id)} className="mt-1" />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {z.rechnung_id && <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="verrechnet" />}
                <Sicht wert={z.sichtbarkeit} />
                <span className="font-bold tabular-nums w-14 text-right">{zahl(z.stunden)} h</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> nur ich</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> für alle</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> schon verrechnet</span>
      </p>
      <ZeitDialog open={!!bearbeiten} onOpenChange={(o) => !o && setBearbeiten(null)} eintrag={bearbeiten} />
    </div>
  );
}

export function MaterialListe({ filter, mitProjekt = false }: { filter: Filter; mitProjekt?: boolean }) {
  const { firma, firmaVon } = useSitzung();
  const { data: material = [], isLoading } = useMaterial(filter);
  const [bearbeiten, setBearbeiten] = useState<Material | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Lädt…</p>;
  if (material.length === 0) return <Leer icon={Package} text="Noch kein Material gebucht." />;

  const ekEigen = material.filter((m) => m.firma_id === firma?.id).reduce((s, m) => s + Number(m.menge) * Number(m.ek_preis ?? 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {material.length} Positionen · Einkauf meine Firma: <strong className="text-foreground">{euro(ekEigen)}</strong>
      </p>
      <div className="rounded-lg border divide-y bg-card">
        {material.map((m) => {
          const eigen = m.firma_id === firma?.id;
          return (
            <button key={m.id} disabled={!eigen} onClick={() => setBearbeiten(m)}
              className="w-full flex items-center gap-3 p-3 text-left enabled:hover:bg-muted/50 disabled:cursor-default">
              <div className="w-20 shrink-0 text-xs font-semibold">{datumKurz(m.datum)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.bezeichnung}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {mitProjekt && m.projekte?.name ? `${m.projekte.name} · ` : ""}
                  {m.ek_preis != null ? `EK ${euro(m.ek_preis)} / ${m.einheit}` : "ohne Preis"}
                  {m.notiz ? ` · ${m.notiz}` : ""}
                </p>
                {!eigen && <FirmaBadge firma={firmaVon(m.firma_id)} className="mt-1" />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.rechnung_id && <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="verrechnet" />}
                <Sicht wert={m.sichtbarkeit} />
                <span className="font-bold tabular-nums text-right whitespace-nowrap">{zahl(m.menge)} {m.einheit}</span>
              </div>
            </button>
          );
        })}
      </div>
      <MaterialDialog open={!!bearbeiten} onOpenChange={(o) => !o && setBearbeiten(null)} eintrag={bearbeiten} />
    </div>
  );
}
