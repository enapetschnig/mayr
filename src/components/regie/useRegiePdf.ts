import { useState } from "react";
import { toast } from "sonner";
import { useIstPc } from "@/components/AppLayout";
import { useSitzung } from "@/hooks/useSitzung";
import { regiePdfAnsehen, regiePdfTeilen, type RegieVoll } from "@/lib/regiePdf";

const WARTEN = "<title>PDF</title><p style=\"font:16px system-ui,sans-serif;padding:24px;color:#555\">PDF wird erstellt …</p>";

/**
 * PDF eines Regieberichts: am PC in einem neuen Fenster ansehen, am Handy
 * über das Teilen-Menü (WhatsApp, Mail) — sonst herunterladen.
 * `holen` liefert den aktuellen Stand; null = abbrechen (z. B. Speichern fehlgeschlagen).
 */
export function useRegiePdf() {
  const { firma } = useSitzung();
  const pc = useIstPc();
  const [laeuft, setLaeuft] = useState(false);

  const los = async (holen: () => Promise<RegieVoll | null>, ansehen = pc) => {
    if (!firma) {
      toast.error("Firmendaten fehlen", { description: "Der Briefkopf kommt aus den Einstellungen." });
      return;
    }
    // Das Fenster jetzt öffnen, noch im Klick — später blockt der Popup-Blocker
    const fenster = ansehen ? window.open("", "_blank") : null;
    try { fenster?.document.write(WARTEN); } catch { /* fremdes Fenster */ }
    setLaeuft(true);
    try {
      const r = await holen();
      if (!r) {
        fenster?.close();
        return;
      }
      if (ansehen) await regiePdfAnsehen(r, firma, fenster);
      else await regiePdfTeilen(r, firma);
    } catch (e) {
      fenster?.close();
      toast.error("PDF nicht erstellt", { description: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  return { los, laeuft, pc };
}
