import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  anleitungFuer, angebotVorhanden, aufAenderung, geraetErkennen, jetztInstallieren, laeuftAlsApp,
  schonEinmalInstalliert,
} from "@/lib/installieren";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

/** Merker je Gerät: Wurde der Hinweis hier schon gezeigt? */
const GEZEIGT = "mayr.installhinweis";

/** Anleitung passend zu Gerät und Browser — im Dialog und in den Einstellungen. */
export function InstallAnleitung({ onFertig }: { onFertig?: () => void }) {
  const geraet = useMemo(() => geraetErkennen(), []);
  const [angebot, setAngebot] = useState(angebotVorhanden());
  const [alsApp, setAlsApp] = useState(laeuftAlsApp());
  useEffect(() => aufAenderung(() => { setAngebot(angebotVorhanden()); setAlsApp(laeuftAlsApp()); }), []);
  const a = anleitungFuer(geraet, angebot);
  const iphone = geraet.startsWith("ios");

  if (alsApp) {
    return (
      <p className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 className="h-5 w-5" /> Die App ist auf diesem Gerät installiert.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{a.titel}</p>
      {a.direkt ? (
        <Button size="lg" className="w-full h-14 text-base gap-2" onClick={async () => { if (await jetztInstallieren()) onFertig?.(); }}>
          <Download className="h-5 w-5" /> Jetzt installieren
        </Button>
      ) : (
        <ol className="space-y-3">
          {a.schritte.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">{i + 1}</span>
              <span className="pt-1">
                {s}
                {iphone && i === 0 && <Share className="inline h-4 w-4 ml-1 text-primary align-text-bottom" aria-label="Teilen-Zeichen" />}
              </span>
            </li>
          ))}
        </ol>
      )}
      {a.hinweis && <p className="text-xs text-muted-foreground">{a.hinweis}</p>}
    </div>
  );
}

/**
 * Erscheint einmal pro Gerät nach dem ersten Login.
 * Android/Chrome: ein Tipp auf „Jetzt installieren“. iPhone: die Schritte
 * übers Teilen-Menü (Apple lässt keinen Knopf dafür zu).
 * Läuft die App schon installiert, kommt nichts.
 */
export function InstallHinweis() {
  const { session, firma } = useSitzung();
  const [offen, setOffen] = useState(false);

  useEffect(() => {
    if (!session || !firma) return;
    let gezeigt = false;
    try { gezeigt = localStorage.getItem(GEZEIGT) !== null; } catch { /* egal */ }
    if (gezeigt || laeuftAlsApp() || schonEinmalInstalliert()) return;
    // kurz warten — Chrome liefert sein Installationsangebot erst nach dem Laden
    const t = window.setTimeout(() => setOffen(true), 1200);
    return () => window.clearTimeout(t);
  }, [session, firma]);

  const schliessen = () => {
    try { localStorage.setItem(GEZEIGT, new Date().toISOString()); } catch { /* egal */ }
    setOffen(false);
  };

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && schliessen()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Smartphone className="h-7 w-7 text-primary" />
        </div>
        <DialogTitle className="text-center">{KUNDE.kurzname} als App</DialogTitle>
        <DialogDescription className="text-center">
          Leg die App auf den Startbildschirm — dann startet sie wie jede andere App, ohne Adresszeile und mit einem Tipp.
        </DialogDescription>
        <InstallAnleitung onFertig={schliessen} />
        <Button variant="ghost" className="h-auto min-h-11 w-full whitespace-normal py-2.5" onClick={schliessen}>Später — findest du unter Einstellungen → Handy</Button>
      </DialogContent>
    </Dialog>
  );
}
