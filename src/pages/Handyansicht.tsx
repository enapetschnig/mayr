import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Home, LogOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seite } from "@/components/PageHeader";
import { useIstPc } from "@/components/AppLayout";
import { HANDY_ANMELDUNG, HANDY_RAHMEN, imHandyRahmen } from "@/lib/handyansicht";

// Bildschirm eines gängigen Handys (iPhone 14/15) in CSS-Pixeln
const BREITE = 390;
const HOEHE = 844;
const RAND = 12;

/** Wer ist im Rahmen angemeldet? Liest die getrennte Anmeldung aus dem Speicher. */
function angemeldetImRahmen(): string | null {
  try {
    const roh = localStorage.getItem(HANDY_ANMELDUNG);
    if (!roh) return null;
    const user = JSON.parse(roh)?.user;
    const meta = user?.user_metadata ?? {};
    const name = [meta.vorname, meta.nachname].filter(Boolean).join(" ");
    return name || user?.email?.split("@")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Handyansicht am PC: die App in Handybreite, mit eigener Anmeldung im
 * Rahmen. So zeigt der Chef am Bildschirm, was ein Monteur am Handy sieht,
 * ohne sich selbst abzumelden.
 */
export default function Handyansicht() {
  const pc = useIstPc();
  const rahmen = useRef<HTMLIFrameElement>(null);
  const [wer, setWer] = useState(angemeldetImRahmen);
  const [massstab, setMassstab] = useState(1);

  // Der Rahmen schreibt seine Anmeldung in den Speicher — das meldet der Browser hier
  useEffect(() => {
    const geaendert = (e: StorageEvent) => {
      if (e.key === null || e.key === HANDY_ANMELDUNG) setWer(angemeldetImRahmen());
    };
    window.addEventListener("storage", geaendert);
    return () => window.removeEventListener("storage", geaendert);
  }, []);

  // Ganz aufs Bild: bei niedrigem Fenster das Handy verkleinern statt scrollen
  useEffect(() => {
    const anpassen = () => setMassstab(Math.min(1, Math.max(0.5, (window.innerHeight - 150) / (HOEHE + 2 * RAND))));
    anpassen();
    window.addEventListener("resize", anpassen);
    return () => window.removeEventListener("resize", anpassen);
  }, []);

  // Im Rahmen selbst nicht noch einmal verschachteln; am Handy braucht es das nicht
  if (imHandyRahmen() || !pc) return <Navigate to="/" replace />;

  const zurStartseite = () => {
    if (rahmen.current) rahmen.current.src = "/";
  };
  const neuLaden = () => rahmen.current?.contentWindow?.location.reload();
  const abmelden = () => {
    try { localStorage.removeItem(HANDY_ANMELDUNG); } catch { /* egal */ }
    setWer(null);
    zurStartseite();
  };

  const aussen = { w: BREITE + 2 * RAND, h: HOEHE + 2 * RAND };

  return (
    <Seite titel="Handyansicht" untertitel="So sieht die App am Handy aus">
      <div className="flex flex-wrap items-start justify-center gap-8">
        <div style={{ width: aussen.w * massstab, height: aussen.h * massstab }}>
          <div
            className="origin-top-left rounded-[3rem] border border-foreground/20 bg-foreground"
            style={{ width: aussen.w, height: aussen.h, padding: RAND, transform: `scale(${massstab})` }}
          >
            <iframe
              ref={rahmen}
              name={HANDY_RAHMEN}
              src="/"
              title="App in Handybreite"
              className="block h-full w-full rounded-[2.25rem] bg-background"
            />
          </div>
        </div>

        <div className="w-full max-w-xs space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Im Handy angemeldet</p>
            <p className="mt-0.5 font-semibold">{wer ?? "noch niemand"}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Im Handy mit dem Konto eines Monteurs anmelden. Die Anmeldung dort ist getrennt —
              du bleibst hier am PC angemeldet.
            </p>
          </div>
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start" onClick={zurStartseite}>
              <Home className="mr-2 h-4 w-4" /> Zur Startseite
            </Button>
            <Button variant="outline" className="justify-start" onClick={neuLaden}>
              <RotateCw className="mr-2 h-4 w-4" /> Neu laden
            </Button>
            <Button variant="outline" className="justify-start" onClick={abmelden} disabled={!wer}>
              <LogOut className="mr-2 h-4 w-4" /> Im Handy abmelden
            </Button>
          </div>
        </div>
      </div>
    </Seite>
  );
}
