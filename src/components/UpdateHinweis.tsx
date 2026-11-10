import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { ungespeichertListe } from "@/lib/ungespeichert";

/**
 * „Neue Version — Jetzt aktualisieren“ unten links, sobald ein neuer Stand
 * live ist (z. B. ein umgesetzter Änderungswunsch). Zwei Wege, damit der
 * Hinweis sicher kommt: der Service Worker (jede Minute, beim Zurückkehren in
 * die App) und /version.json (Build-Kennung aus vite.config.ts) — falls der
 * Service Worker hängt. Nichts lädt ungefragt neu; ist etwas ungespeichert,
 * fragt der Knopf erst nach. „Später“ blendet ihn 30 Minuten aus.
 */
const PRUEFEN_MS = 60_000;
const SPAETER_MS = 30 * 60_000;
const SPAETER_KEY = "elektro.update.spaeter";

const spaeterLesen = () => { try { return Number(localStorage.getItem(SPAETER_KEY)) || 0; } catch { return 0; } };

async function serverFassung(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.build === "string" ? j.build : null;
  } catch { return null; }
}

export function UpdateHinweis() {
  const [neuAufServer, setNeuAufServer] = useState(false);
  const [rueckfrage, setRueckfrage] = useState<string[] | null>(null);
  const [spaeterBis, setSpaeterBis] = useState(spaeterLesen);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [laeuft, setLaeuft] = useState(false);

  const { needRefresh: [neueFassung], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const pruefen = () => { if (navigator.onLine !== false) reg.update().catch(() => {}); };
      setInterval(pruefen, PRUEFEN_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pruefen(); });
    },
  });

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const pruefen = async () => {
      if (navigator.onLine === false) return;
      const s = await serverFassung();
      if (s && s !== __APP_BUILD__) setNeuAufServer(true);
    };
    const t = window.setInterval(pruefen, PRUEFEN_MS);
    const erst = window.setTimeout(pruefen, 5000);
    const sichtbar = () => { if (document.visibilityState === "visible") void pruefen(); };
    document.addEventListener("visibilitychange", sichtbar);
    return () => { window.clearInterval(t); window.clearTimeout(erst); document.removeEventListener("visibilitychange", sichtbar); };
  }, []);

  // Nach „Später“ von selbst wiederkommen
  useEffect(() => {
    if (spaeterBis <= jetzt) return;
    const t = window.setTimeout(() => setJetzt(Date.now()), Math.min(spaeterBis - jetzt + 500, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [spaeterBis, jetzt]);

  const spaeter = () => {
    const bis = Date.now() + SPAETER_MS;
    try { localStorage.setItem(SPAETER_KEY, String(bis)); } catch { /* gilt dann bis zum Neuladen */ }
    setSpaeterBis(bis);
    setJetzt(Date.now());
    setRueckfrage(null);
  };

  const aktualisieren = async () => {
    setRueckfrage(null);
    setLaeuft(true);
    if (neueFassung) {
      void updateServiceWorker(true);
      window.setTimeout(() => window.location.reload(), 3000);
      return;
    }
    // Neue Fassung kam über version.json: erst den neuen Service Worker holen,
    // sonst liefert der alte beim Neuladen wieder den alten Stand
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) {
        await reg.update().catch(() => undefined);
        const wartend: ServiceWorker | null = reg.waiting ?? await new Promise<ServiceWorker | null>((fertig) => {
          const sw = reg.installing;
          if (!sw) { fertig(null); return; }
          const t = window.setTimeout(() => fertig(reg.waiting), 20_000);
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed") { window.clearTimeout(t); fertig(reg.waiting ?? sw); }
            if (sw.state === "redundant") { window.clearTimeout(t); fertig(null); }
          });
        });
        if (wartend) {
          navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
          wartend.postMessage({ type: "SKIP_WAITING" });
          window.setTimeout(() => window.location.reload(), 5000);
          return;
        }
      }
    } catch { /* dann direkt neu laden */ }
    window.location.reload();
  };

  const klick = () => {
    const offen = ungespeichertListe();
    if (offen.length) setRueckfrage(offen);
    else void aktualisieren();
  };

  if (!neueFassung && !neuAufServer) return null;
  if (spaeterBis > jetzt && !laeuft) return null;
  const knopf = "flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold";
  return (
    <div role="status" aria-live="polite" data-update-hinweis data-bildschirmfoto="aus"
      className="fixed bottom-4 left-3 z-[70] max-w-[calc(100vw-1.5rem)] rounded-xl border-2 border-primary bg-card p-2 text-sm sm:left-4 sm:max-w-md print:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {!rueckfrage ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 px-1 font-semibold">Neue Version der App</span>
          <button type="button" onClick={klick} disabled={laeuft} className={`${knopf} bg-primary text-primary-foreground disabled:opacity-70`}>
            <RefreshCw className={`h-4 w-4 ${laeuft ? "animate-spin" : ""}`} /> {laeuft ? "Wird aktualisiert …" : "Jetzt aktualisieren"}
          </button>
          {!laeuft && (
            <button type="button" onClick={spaeter} title="Kommt in 30 Minuten wieder" className={`${knopf} border text-muted-foreground hover:bg-muted`}>
              <X className="h-4 w-4" /> Später
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="px-1">Noch nicht gespeichert: {rueckfrage.join(", ")}. Erst speichern?</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRueckfrage(null)} className={`${knopf} border-2 border-primary`}>Zurück, erst speichern</button>
            <button type="button" onClick={() => void aktualisieren()} className={`${knopf} bg-primary text-primary-foreground`}>Trotzdem aktualisieren</button>
          </div>
        </div>
      )}
    </div>
  );
}
