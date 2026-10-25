import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export type Ziel = { art: "link"; pfad: string } | { art: "zurueck" };

/**
 * Ungespeicherte Änderungen nicht still verlieren. Die App läuft mit
 * `BrowserRouter` (ohne `useBlocker`), deshalb: Neu laden/Tab schließen über
 * `beforeunload`, Klicks auf Links und den Zurück-Knopf im Seitenkopf werden
 * vor React Router abgefangen (Capture-Phase am Dokument). Die Zurück-Geste
 * des Browsers lässt sich so nicht abfangen.
 */
export function useVerlassenSchutz(aktiv: boolean, zurueckPfad?: string) {
  const navigate = useNavigate();
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const aktivRef = useRef(aktiv);
  aktivRef.current = aktiv;

  useEffect(() => {
    const vorEntladen = (e: BeforeUnloadEvent) => {
      if (!aktivRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const klick = (e: MouseEvent) => {
      if (!aktivRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      if (el.closest('header button[aria-label="Zurück"]')) {
        e.preventDefault();
        e.stopPropagation();
        setZiel({ art: "zurueck" });
        return;
      }
      const a = el.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setZiel({ art: "link", pfad: url.pathname + url.search + url.hash });
    };
    window.addEventListener("beforeunload", vorEntladen);
    document.addEventListener("click", klick, true);
    return () => {
      window.removeEventListener("beforeunload", vorEntladen);
      document.removeEventListener("click", klick, true);
    };
  }, []);

  const weiter = (z: Ziel | null = ziel) => {
    setZiel(null);
    if (!z) return;
    if (z.art === "link") navigate(z.pfad);
    else if (zurueckPfad) navigate(zurueckPfad);
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return { ziel, abbrechen: () => setZiel(null), weiter };
}
