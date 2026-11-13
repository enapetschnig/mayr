import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIstPc } from "@/components/AppLayout";
import { PdfVorschau, type PdfDatei } from "@/components/op/PdfVorschau";
import { archivLaden } from "@/lib/belegArchiv";
import { isoTag } from "@/lib/format";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";
import { sichererDateiname } from "@/lib/upload";
import { BELEG_STATUS, type StatusEintrag } from "@/lib/types";
import { useAusgang, useKategorien } from "./buchhaltungDaten";
import { kategorieVorschlag, zahlStatus, type ZahlStatus } from "./buchhaltungLogik";
import { RechnungsUebersicht, type UebersichtZeile } from "./RechnungsUebersicht";
import { zeitraumGrenzen, type Zeitraum } from "./Zeitraum";

export const ZAHL_STATUS: Record<ZahlStatus, StatusEintrag> = {
  offen: BELEG_STATUS.offen,
  teilbezahlt: { ton: "gelb", text: "Teilbezahlt" },
  bezahlt: BELEG_STATUS.bezahlt,
  ausgebucht: { ton: "rosa", text: "Ausgebucht" },
  storniert: BELEG_STATUS.storniert,
};
export const ALT_PILLE: StatusEintrag = { ton: "grau", text: "Altrechnung" };

/** Ausgang: unsere fertigen Rechnungen im Zeitraum, Antippen öffnet sie, das Symbol das Original aus dem Archiv */
export function AusgangListe({ zeitraum, onKategorien }: { zeitraum: Zeitraum; onKategorien: () => void }) {
  const pc = useIstPc();
  const navigate = useNavigate();
  const heute = isoTag();
  const { von, bis, text } = zeitraumGrenzen(zeitraum);
  const { data = [], isLoading, error } = useAusgang(von, bis);
  const { data: alle = [] } = useKategorien();
  const kategorien = useMemo(() => alle.filter((k) => k.richtung === "ausgang"), [alle]);
  const [vorschau, setVorschau] = useState<PdfDatei | null>(null);

  const zeilen = useMemo((): UebersichtZeile[] => data.map((b) => {
    const z = zahlStatus(b, b.zahlungen);
    const ueber = z.status === "offen" || z.status === "teilbezahlt" ? !!b.faellig_am && b.faellig_am < heute : false;
    return {
      id: b.id, datum: b.datum, nummer: b.nummer, name: b.empf_name ?? "–",
      unter: [b.projekte ? `${b.projekte.nummer} ${b.projekte.name}` : null, b.betreff && b.betreff !== b.projekte?.name ? b.betreff : null].filter(Boolean).join(" · ") || null,
      netto: Number(b.netto), ust: Number(b.ust), brutto: Number(b.brutto), offen: z.offen,
      status: b.status === "storno" ? BELEG_STATUS.storno : ueber ? BELEG_STATUS.ueberfaellig : ZAHL_STATUS[z.status],
      erledigt: z.offen <= 0,
      kategorie_id: b.kategorie_id,
      vorschlag: b.kategorie_id ? null : kategorieVorschlag([b.betreff, b.projekte?.name, ...b.beleg_positionen.map((p) => p.bezeichnung)].filter(Boolean).join(" "), kategorien),
      zusatz: b.altbestand ? ALT_PILLE : null,
      // fertige Rechnungen haben ihr Original im Archiv; ob es wirklich da ist, zeigt erst das Laden
      datei: true,
    };
  }), [data, kategorien, heute]);

  const original = async (id: string) => {
    const b = data.find((x) => x.id === id);
    const pdf = await archivLaden(id);
    if (!pdf) {
      if (b?.altbestand) return void toast.info("Zu dieser Altrechnung ist kein PDF hinterlegt.");
      // ältere Rechnung ohne Original: in der Rechnung legt der PDF-Knopf es nach
      toast.info("Das Original liegt noch nicht im Archiv — in der Rechnung „PDF“ tippen, dann wird es abgelegt.");
      return navigate(`/belege/${id}`);
    }
    const d = { blob: pdf, dateiname: `${sichererDateiname(b?.nummer ?? "Rechnung")}.pdf` };
    if (pc) setVorschau(d);
    else await pdfTeilenOderLaden(d.blob, d.dateiname);
  };

  return (
    <>
      <RechnungsUebersicht richtung="ausgang" zeilen={zeilen} kategorien={kategorien} laedt={isLoading} fehler={error} zeitraumText={text}
        onOeffnen={(id) => navigate(`/belege/${id}`)} onDatei={original} onKategorien={onKategorien} />
      <PdfVorschau datei={vorschau} onClose={() => setVorschau(null)} />
    </>
  );
}
