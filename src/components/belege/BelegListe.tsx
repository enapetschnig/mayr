import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, Receipt, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { FirmaBadge, Leer } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { datum, euro, isoTag } from "@/lib/format";
import { STATUS_FARBE, STATUS_TEXT, type Beleg } from "@/lib/types";

export type BelegMitProjekt = Beleg & { projekte: { name: string } | null };

export function useBelege(projektId?: string) {
  const { firma } = useSitzung();
  return useQuery({
    queryKey: ["rechnungen", "liste", projektId ?? "alle", firma?.id],
    queryFn: async () => {
      let q = supabase.from("rechnungen").select("*, projekte(name)")
        .order("datum", { ascending: false }).order("created_at", { ascending: false });
      if (projektId) q = q.eq("projekt_id", projektId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BelegMitProjekt[];
    },
  });
}

export function istUeberfaellig(b: Beleg) {
  return b.typ === "rechnung" && b.status === "offen" && !!b.faellig_am && b.faellig_am < isoTag();
}

export function BelegZeile({ b }: { b: BelegMitProjekt }) {
  const navigate = useNavigate();
  const { firma, firmaVon } = useSitzung();
  const eingang = b.empfaenger_firma_id === firma?.id;
  const ueber = istUeberfaellig(b);
  return (
    <button onClick={() => navigate(`/rechnungen/${b.id}`)}
      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 ${ueber ? "bg-red-50" : ""}`}>
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {eingang ? <Inbox className="h-4 w-4 text-sky-700" /> : b.empfaenger_art === "firma" ? <Send className="h-4 w-4 text-primary" /> : <Receipt className="h-4 w-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {b.nummer || <span className="italic text-muted-foreground">Entwurf</span>}
          <span className="font-normal text-muted-foreground"> · {eingang ? `von ${firmaVon(b.firma_id)?.name}` : b.kunde_name || "ohne Empfänger"}</span>
        </p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
          {b.typ === "angebot" ? "Angebot" : "Rechnung"} · {datum(b.datum)}
          {b.projekte?.name ? ` · ${b.projekte.name}` : ""}
          {!eingang && b.empfaenger_art === "firma" && <FirmaBadge firma={firmaVon(b.empfaenger_firma_id)} className="ml-1" />}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="font-bold text-sm tabular-nums">{euro(b.reverse_charge ? b.netto : b.brutto)}</p>
        <div className="flex gap-1 justify-end">
          {ueber && <Badge variant="destructive" className="text-[10px] px-1.5">Überfällig</Badge>}
          <Badge className={`text-[10px] px-1.5 ${STATUS_FARBE[b.status]}`} variant="secondary">{STATUS_TEXT[b.status]}</Badge>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
    </button>
  );
}

/** Kompakte Liste für den Projekt-Reiter */
export function BelegListe({ projektId }: { projektId: string }) {
  const { data: belege = [], isLoading } = useBelege(projektId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Lädt…</p>;
  if (belege.length === 0) return <Leer icon={Receipt} text="Noch keine Rechnungen oder Angebote zu diesem Projekt." />;
  return <div className="rounded-lg border divide-y bg-card">{belege.map((b) => <BelegZeile key={b.id} b={b} />)}</div>;
}
