import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EingangDialog } from "@/components/eingang/EingangDialog";
import { dateiAdresse, eingangLaden, type EingangMitAnteilen } from "@/components/eingang/eingangDaten";
import { ablauf } from "@/components/eingang/eingangLogik";
import { isoTag } from "@/lib/format";
import { BELEG_STATUS, FREIGABE_STATUS } from "@/lib/types";
import { useEingangZeitraum, useKategorien, useLetzteEingangKategorien } from "./buchhaltungDaten";
import { eingangVorschlag, letzteKategorien } from "./buchhaltungLogik";
import { RechnungsUebersicht, type UebersichtZeile } from "./RechnungsUebersicht";
import { zeitraumGrenzen, type Zeitraum } from "./Zeitraum";

/** Eingang: Lieferantenrechnungen im Zeitraum; Antippen öffnet die Eingangsrechnung, das Symbol Foto/PDF */
export function EingangListe({ zeitraum, onKategorien }: { zeitraum: Zeitraum; onKategorien: () => void }) {
  const heute = isoTag();
  const { von, bis, text } = zeitraumGrenzen(zeitraum);
  const { data = [], isLoading, error } = useEingangZeitraum(von, bis);
  const { data: alle = [] } = useKategorien();
  const { data: letzte = [] } = useLetzteEingangKategorien();
  const kategorien = useMemo(() => alle.filter((k) => k.richtung === "eingang"), [alle]);
  const [offen, setOffen] = useState<EingangMitAnteilen | null>(null);

  const zeilen = useMemo((): UebersichtZeile[] => {
    const jeLieferant = letzteKategorien(letzte);
    return data.map((r) => {
      const a = ablauf(r);
      const erledigt = a === "ueberwiesen" || a === "abgelehnt";
      return {
        id: r.id, datum: r.datum, nummer: r.nummer, name: r.lieferant, unter: null,
        netto: Number(r.netto), ust: Number(r.ust), brutto: Number(r.brutto), offen: erledigt ? 0 : Number(r.brutto),
        status: !erledigt && r.faellig_am && r.faellig_am < heute ? BELEG_STATUS.ueberfaellig : FREIGABE_STATUS[a],
        erledigt,
        kategorie_id: r.kategorie_id,
        vorschlag: r.kategorie_id ? null : eingangVorschlag(r.lieferant, r.eingang_positionen.map((p) => p.bezeichnung), jeLieferant, kategorien),
        datei: !!r.datei_pfad,
      };
    });
  }, [data, letzte, kategorien, heute]);
  const lieferanten = useMemo(() => [...new Set(data.map((r) => r.lieferant.trim()))].sort((a, b) => a.localeCompare(b, "de")), [data]);

  const oeffnen = async (id: string) => {
    try {
      const r = await eingangLaden(id);
      if (!r) return toast.error("Die Eingangsrechnung gibt es nicht mehr.");
      setOffen(r);
    } catch (e) {
      toast.error("Nicht geladen", { description: (e as Error).message });
    }
  };
  const datei = async (id: string) => {
    const pfad = data.find((r) => r.id === id)?.datei_pfad;
    if (!pfad) return;
    // Fenster sofort öffnen — sonst blockt Safari das Popup nach dem await
    const fenster = window.open("", "_blank");
    try {
      const url = await dateiAdresse(pfad);
      if (fenster) fenster.location.href = url;
      else window.location.href = url;
    } catch (e) {
      fenster?.close();
      toast.error("Datei nicht geöffnet", { description: (e as Error).message });
    }
  };

  return (
    <>
      <RechnungsUebersicht richtung="eingang" zeilen={zeilen} kategorien={kategorien} laedt={isLoading} fehler={error} zeitraumText={text}
        onOeffnen={(id) => void oeffnen(id)} onDatei={datei} onKategorien={onKategorien} />
      <EingangDialog open={!!offen} onOpenChange={(o) => { if (!o) setOffen(null); }} rechnung={offen} lieferanten={lieferanten} />
    </>
  );
}
