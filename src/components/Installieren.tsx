import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, ExternalLink, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { mitZeichen } from "@/components/Bedienzeichen";
import {
  anleitungFuer, angebotVorhanden, aufAenderung, chromeLink, geraetErkennen, inAppBrowser, jetztInstallieren,
  laeuftAlsApp, schonEinmalInstalliert,
} from "@/lib/installieren";
import { useSitzung } from "@/hooks/useSitzung";
import { imHandyRahmen } from "@/lib/handyansicht";
import { KUNDE } from "@/kunde.config";

/** Merker je Gerät: Wurde der Hinweis hier schon gezeigt? */
const GEZEIGT = "mayr.installhinweis";

/**
 * Anleitung passend zu Gerät und Browser — im Hinweis nach dem Anmelden, in
 * den Einstellungen (Handy) und auf der Einladungsseite. Gibt es das
 * Installations-Angebot des Browsers (Chrome/Edge am Android und am PC), ist
 * es EIN Knopf „App installieren“. Jedes Zeichen, das man antippen muss,
 * steht als Bild im Satz (Bedienzeichen.tsx).
 */
export function InstallAnleitung({ onFertig }: { onFertig?: () => void }) {
  const geraet = useMemo(() => geraetErkennen(), []);
  const [angebot, setAngebot] = useState(angebotVorhanden());
  const [alsApp, setAlsApp] = useState(laeuftAlsApp());
  useEffect(() => aufAenderung(() => { setAngebot(angebotVorhanden()); setAlsApp(laeuftAlsApp()); }), []);
  const a = anleitungFuer(geraet, angebot);

  if (alsApp) {
    return (
      <p className="flex items-center gap-2 text-sm text-green-700" data-pruef="installiert">
        <CheckCircle2 className="h-5 w-5" /> Die App ist auf diesem Gerät installiert.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-left" data-geraet={geraet}>
      <InAppHinweis />
      {geraet !== "inapp" && <p className="text-sm font-semibold">{a.titel}</p>}
      {a.direkt && (
        <Button size="lg" className="h-14 w-full gap-2 text-base" data-pruef="app-installieren"
          onClick={async () => {
            try {
              if (await jetztInstallieren()) onFertig?.();
              else toast.info("Abgebrochen — geht jederzeit wieder über „App installieren“.");
            } catch {
              toast.error("Bitte die Installation über das Menü des Browsers starten (drei Punkte).");
            }
          }}>
          <Download className="h-5 w-5" /> App installieren
        </Button>
      )}
      {a.chromeKnopf && (
        <Button asChild size="lg" className="h-12 w-full gap-2 text-base">
          <a href={chromeLink(window.location.href)}><ExternalLink className="h-5 w-5" /> In Chrome öffnen</a>
        </Button>
      )}
      {!a.direkt && geraet !== "inapp" && (
        <ol className="space-y-3">
          {a.schritte.map((s, i) => (
            <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
              <span className="pt-0.5">{mitZeichen(s)}</span>
            </li>
          ))}
        </ol>
      )}
      {a.hinweis && geraet !== "inapp" && <p className="text-sm leading-relaxed text-muted-foreground">{mitZeichen(a.hinweis)}</p>}
    </div>
  );
}

/**
 * Link in WhatsApp, Instagram, Facebook … geöffnet? Dort geht weder die
 * Installation noch bleibt man verlässlich angemeldet. Also sagen, wie man in
 * den richtigen Browser kommt — am Android ein Knopf, der Chrome öffnet.
 */
export function InAppHinweis() {
  const [app] = useState(() => inAppBrowser());
  if (!app) return null;
  const android = /Android/.test(navigator.userAgent);
  const adresse = window.location.href;
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(adresse);
      toast.success(`Link kopiert. Jetzt ${android ? "Chrome" : "Safari"} öffnen und oben einfügen.`);
    } catch {
      toast.error(`Bitte die Adresse ${adresse} in ${android ? "Chrome" : "Safari"} eintippen.`);
    }
  };
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4" data-pruef="inapp-hinweis">
      <p className="font-semibold">Bitte im Browser öffnen</p>
      <p className="text-sm">
        Der Link ist in {app} aufgegangen. Hier lässt sich die App nicht installieren. Tippe auf das Menü
        ({android ? "⋮ oben rechts" : "⋯ oder das Kompass-Zeichen"}) und wähle „Im Browser öffnen“{android ? "" : " bzw. „In Safari öffnen“"}.
      </p>
      <div className="flex flex-col gap-2">
        {android && (
          <Button asChild className="h-12 w-full gap-2"><a href={chromeLink(adresse)}><ExternalLink className="h-4 w-4" /> In Chrome öffnen</a></Button>
        )}
        <Button type="button" variant="outline" className="h-12 w-full gap-2" onClick={() => void kopieren()}>
          <Copy className="h-4 w-4" /> Link kopieren
        </Button>
      </div>
    </div>
  );
}

/**
 * Erscheint einmal pro Gerät nach dem ersten Login.
 * Android/Chrome: ein Tipp auf „App installieren“. iPhone: die Schritte
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
    if (gezeigt || laeuftAlsApp() || schonEinmalInstalliert() || imHandyRahmen()) return;
    // kurz warten — Chrome liefert sein Installationsangebot erst nach dem Laden
    // und nie über ein offenes Formular legen
    const t = window.setInterval(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      window.clearInterval(t);
      setOffen(true);
    }, 1200);
    return () => window.clearInterval(t);
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
