import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Funkloch: unten eine gelbe Pille „Kein Netz“, solange der Browser offline
 * meldet. Die App selbst lädt aus dem Speicher (Service Worker), Daten und
 * Speichern brauchen aber Verbindung — das soll man sehen, bevor man tippt.
 */
export function OfflineHinweis() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const aus = () => setOffline(true);
    const an = () => setOffline(false);
    window.addEventListener("offline", aus);
    window.addEventListener("online", an);
    return () => { window.removeEventListener("offline", aus); window.removeEventListener("online", an); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" data-offline-hinweis
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <p className="flex items-center gap-2 rounded-full border border-status-gelb-fg/30 bg-status-gelb px-4 py-2 text-sm font-medium text-status-gelb-fg shadow-sm">
        <WifiOff className="h-4 w-4 shrink-0" />
        Kein Netz — Speichern geht erst wieder mit Verbindung.
      </p>
    </div>
  );
}
