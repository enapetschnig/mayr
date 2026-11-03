import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { FormularDialog } from "@/components/FormularDialog";
import { Button } from "@/components/ui/button";
import { pdfTeilenOderLaden } from "@/lib/pdfBasis";

export type PdfDatei = { blob: Blob; dateiname: string };

/** PDF am PC im Vollbild ansehen, mit „Herunterladen“ (am Handy wird gleich geteilt, siehe `pdfZeigen`) */
export function PdfVorschau({ datei, onClose }: { datei: PdfDatei | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!datei) return setUrl(null);
    const u = URL.createObjectURL(datei.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [datei]);

  return (
    <FormularDialog
      open={!!datei}
      onOpenChange={(o) => { if (!o) onClose(); }}
      titel={datei?.dateiname ?? "PDF"}
      breite="breit"
      fuellend
      fuss={datei && (
        <>
          <Button variant="outline" className="h-12" onClick={onClose}>Schließen</Button>
          <Button className="h-12" onClick={() => void pdfTeilenOderLaden(datei.blob, datei.dateiname)}>
            <Download className="h-4 w-4" /> Herunterladen
          </Button>
        </>
      )}
    >
      {url && <iframe src={url} title="PDF-Vorschau" className="min-h-0 w-full flex-1 rounded-md border bg-muted" />}
    </FormularDialog>
  );
}
