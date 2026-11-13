import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Karte, StatusPille } from "@/components/Bausteine";
import { useProjektEingang } from "@/components/eingang/eingangDaten";
import { useMitarbeiterSaetze } from "@/components/projekt/nachkalkulationDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { euro, stunden } from "@/lib/format";
import {
  angeboteneStunden, kalkulationsAngebote, nachkalkulieren, stundenAmpel, type NkBlock, type NkZeit,
} from "@/lib/nachkalkulation";
import { buchungVk, runden2, stundensatzFuer } from "@/lib/preise";
import type { StatusTon } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Ampel als Balken: kräftige Schriftfarbe des Tons */
const BALKEN: Partial<Record<StatusTon, string>> = { gruen: "bg-status-gruen-fg", gelb: "bg-status-gelb-fg", rot: "bg-destructive" };

/** Angebote des Projekts samt Positionen (für die angebotenen Stunden) — nur Chef */
export function useProjektAngebot(projektId: string, aktiv: boolean) {
  return useQuery({
    queryKey: ["belege", "projekt-kalkulation", projektId],
    enabled: aktiv,
    queryFn: async () => {
      const { data: belege, error } = await supabase.from("belege").select("id, typ, status, netto").eq("projekt_id", projektId);
      if (error) throw error;
      const { angebote, angenommen } = kalkulationsAngebote(belege ?? []);
      let positionen: { art: string; menge: number; einheit: string | null; minuten: number | null }[] = [];
      if (angebote.length) {
        const { data, error: e2 } = await supabase.from("beleg_positionen").select("art, menge, einheit, minuten").in("beleg_id", angebote.map((a) => a.id));
        if (e2) throw e2;
        positionen = data ?? [];
      }
      const verrechnet = (belege ?? []).filter((b) => b.typ === "rechnung" && (b.status === "offen" || b.status === "bezahlt"))
        .reduce((s, b) => s + Number(b.netto), 0);
      return {
        angebot: runden2(angebote.reduce((s, a) => s + Number(a.netto), 0)),
        angenommen,
        stundenAngeboten: angeboteneStunden(positionen),
        verrechnet: runden2(verrechnet),
      };
    },
  });
}

/**
 * Nachkalkulation im Projekt (nur Chef): angebotene gegen gebuchte Stunden
 * mit Ampel; Pauschale (Angebot gegen Aufwand ohne Regie) und Regie als
 * eigener Block — Regieberichte sind Zusatzarbeit und verfälschen sonst
 * das Angebot. Lohnkosten je Person mit dem Satz vom Tag der Stunde.
 */
export function NachkalkulationKarte({ projekt, zeiten }: {
  projekt: { id: string; stundensatz: number | null };
  zeiten: NkZeit[];
}) {
  const { firma, istChef } = useSitzung();
  const { saetzeFuer } = useMitarbeiterSaetze(istChef);
  const { data: angebot } = useProjektAngebot(projekt.id, istChef);
  const { data: eingang = [] } = useProjektEingang(projekt.id, istChef);
  const { data: material = [] } = useQuery({
    queryKey: ["material", "projekt-kalkulation", projekt.id],
    enabled: istChef,
    queryFn: async () => {
      const { data, error } = await supabase.from("material_buchungen")
        .select("art, menge, ek_preis, regiebericht_id, artikel(ek_preis, vk_preis, listenpreis)")
        .eq("projekt_id", projekt.id).in("art", ["ausfassung", "rueckgabe", "direkt"]);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!istChef || !angebot) return null;

  const satz = stundensatzFuer(projekt, firma);
  const nk = nachkalkulieren(
    zeiten,
    material.map((m) => ({
      menge: (m.art === "rueckgabe" ? -1 : 1) * Number(m.menge),
      ek: Number(m.ek_preis ?? m.artikel?.ek_preis ?? 0),
      vk: buchungVk(m, firma),
      regiebericht_id: m.regiebericht_id,
    })),
    saetzeFuer(satz),
  );
  const fremd = runden2(eingang.filter((a) => a.eingangsrechnungen?.kategorie !== "material").reduce((s, a) => s + Number(a.betrag), 0));
  const p = nk.pauschal;
  const r = nk.regie;
  const mitAngebot = angebot.angebot > 0;
  // Pauschale: Erlös = Angebot; ohne Angebot = was die Arbeit zu den Sätzen wert ist
  const erloes = mitAngebot ? angebot.angebot : p.wert;
  const ertragPauschal = runden2(erloes - p.lohnkosten - p.materialEk - fremd);
  const ampel = stundenAmpel(p.stunden, angebot.stundenAngeboten);
  const hatRegie = r.stunden > 0 || r.materialVk !== 0;
  if (!mitAngebot && p.wert === 0 && !hatRegie && fremd === 0) return null;

  return (
    <Karte titel="Nachkalkulation">
      <div className="space-y-4 text-sm">
        {/* Stunden: angeboten gegen gebucht (ohne Regie) */}
        {angebot.stundenAngeboten > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Stunden {angebot.angenommen ? "laut Auftrag" : "laut offenem Angebot"}</span>
              <span className="zahl font-semibold">{stunden(p.stunden)} von {stunden(angebot.stundenAngeboten)}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", ampel && BALKEN[ampel.ton])} style={{ width: `${Math.min(100, (ampel?.anteil ?? 0) * 100)}%` }} />
            </div>
            {ampel && <StatusPille eintrag={{ ton: ampel.ton, text: ampel.text }} className="mt-1.5" />}
            {r.stunden > 0 && <p className="mt-1 text-xs text-muted-foreground">dazu {stunden(r.stunden)} Regie — zählen nicht gegen das Angebot</p>}
          </div>
        )}

        {/* Pauschale bzw. Arbeit nach Aufwand ohne Regie */}
        <Block titel={mitAngebot ? "Auftrag (ohne Regie)" : "Arbeit (ohne Regie)"}>
          <Zeile text={mitAngebot ? `Angebot netto${angebot.angenommen ? "" : " (offen)"}` : `Wert: ${stunden(p.stunden)} zu den Sätzen + Material`} wert={euro(erloes)} fett />
          {mitAngebot && <Zeile text={`Aufwand zu Verkaufspreisen (${stunden(p.stunden)} + Material)`} wert={euro(p.wert)} leise />}
          <Kosten b={p} fremd={fremd} />
          <Zeile text="Ertrag" wert={`${euro(ertragPauschal)}${erloes > 0 ? ` · ${Math.round((ertragPauschal / erloes) * 100)} %` : ""}`} fett negativ={ertragPauschal < 0} rand />
          {mitAngebot && (
            <p className={cn("text-xs", p.wert > erloes ? "font-medium text-destructive" : "text-muted-foreground")}>
              {p.wert > erloes ? `Aufwand ${euro(p.wert - erloes)} über dem Angebot` : `${Math.round((p.wert / erloes) * 100)} % des Angebots verbraucht`}
            </p>
          )}
        </Block>

        {hatRegie && (
          <Block titel="Regie (nach Aufwand)">
            <Zeile text={`Wert: ${stunden(r.stunden)} zu den Sätzen + Material ${euro(r.materialVk)}`} wert={euro(r.wert)} fett />
            <Kosten b={r} fremd={0} />
            <Zeile text="Ertrag" wert={`${euro(r.ertrag)}${r.wert > 0 ? ` · ${Math.round((r.ertrag / r.wert) * 100)} %` : ""}`} fett negativ={r.ertrag < 0} rand />
          </Block>
        )}

        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {angebot.verrechnet > 0 && <p>Bisher verrechnet: <span className="zahl font-medium text-foreground">{euro(angebot.verrechnet)}</span> netto</p>}
          {nk.ohneKosten > 0 && <p>{stunden(nk.ohneKosten)} ohne Lohnkosten — in den Einstellungen je Mitarbeiter oder für den Betrieb eintragen.</p>}
          {nk.mitEigenemSatz && <p>Mit dem Verrechnungssatz je Mitarbeiter gerechnet.</p>}
        </div>
      </div>
    </Karte>
  );
}

function Block({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titel}</p>
      {children}
    </div>
  );
}

function Zeile({ text, wert, fett, leise, negativ, rand }: { text: string; wert: string; fett?: boolean; leise?: boolean; negativ?: boolean; rand?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", rand && "border-t pt-1", leise && "text-xs text-muted-foreground")}>
      <span className={cn(!fett && !leise && "text-muted-foreground", fett && "font-medium")}>{text}</span>
      <span className={cn("zahl shrink-0", fett ? "font-semibold" : "font-medium", negativ && "text-destructive")}>{wert}</span>
    </div>
  );
}

function Kosten({ b, fremd }: { b: NkBlock; fremd: number }) {
  return (
    <>
      <Zeile text="Material (Einkauf)" wert={`− ${euro(b.materialEk)}`} />
      <Zeile text={`Lohnkosten (${stunden(b.stunden)})`} wert={`− ${euro(b.lohnkosten)}`} />
      {fremd !== 0 && <Zeile text="Fremdleistung, Sonstiges" wert={`− ${euro(fremd)}`} />}
    </>
  );
}
