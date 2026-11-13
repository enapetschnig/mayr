import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { alleSicherungenLoeschen } from "@/components/belege/sicherung";
import { supabase } from "@/integrations/supabase/client";
import type { Firma, Profil } from "@/lib/types";

/**
 * Wer ist angemeldet, welche Rolle hat er, wie heißt der Betrieb.
 *
 * Einmal geladen, überall verfügbar — fast jede Seite fragt „Chef oder
 * Monteur?“ und braucht Stundensatz, Aufschlag oder den Briefkopf.
 */

interface Sitzung {
  laden: boolean;
  session: Session | null;
  profil: Profil | null;
  firma: Firma | null;
  istChef: boolean;
  /** Profil ließ sich nicht laden (Funkloch) und am Gerät ist keins gemerkt */
  ohneVerbindung: boolean;
  neuLaden: () => Promise<void>;
}

const Ctx = createContext<Sitzung | null>(null);

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/*
  Zuletzt geladenes Profil und Betrieb am Gerät: im Funkloch öffnet die App
  damit normal, statt „Wartet auf Freischaltung“ zu zeigen. Rechte prüft
  ohnehin die Datenbank. Beim Abmelden gelöscht.
*/
const MERK = "mayr.sitzung";
type Gemerkt = { id: string; profil: Profil; firma: Firma | null };
function gemerkt(id: string): Gemerkt | null {
  try {
    const g = JSON.parse(localStorage.getItem(MERK) || "null") as Gemerkt | null;
    return g?.id === id ? g : null;
  } catch { return null; }
}
function merken(g: Gemerkt | null) {
  try {
    if (g) localStorage.setItem(MERK, JSON.stringify(g));
    else localStorage.removeItem(MERK);
  } catch { /* privat: dann eben ohne */ }
}

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [laden, setLaden] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [ohneVerbindung, setOhneVerbindung] = useState(false);

  const datenLaden = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfil(null);
      setFirma(null);
      setLaden(false);
      return;
    }
    const [{ data: p, error: pFehler }, { data: f, error: fFehler }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("firma").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (pFehler || fFehler) {
      // Funkloch o. Ä.: Bekanntes behalten (sonst stünde mitten in der Arbeit
      // „Wartet auf Freischaltung“ da und offene Formulare wären weg)
      const g = gemerkt(s.user.id);
      setProfil((alt) => (alt?.id === s.user.id ? alt : g?.profil ?? null));
      setFirma((alt) => alt ?? g?.firma ?? null);
      setOhneVerbindung(!g);
      setLaden(false);
      return;
    }
    setOhneVerbindung(false);
    merken(p ? { id: s.user.id, profil: p, firma: f ?? null } : null);
    // Unveränderte Daten behalten ihr Objekt — Supabase meldet sich bei jeder
    // Rückkehr in den Tab neu an, und ein neues Objekt setzt offene Formulare zurück
    setProfil((alt) => (gleich(alt, p ?? null) ? alt : p ?? null));
    setFirma((alt) => (gleich(alt, f ?? null) ? alt : f ?? null));
    setLaden(false);
  }, []);

  useEffect(() => {
    // Erst den Listener, dann die bestehende Sitzung — und nie await im
    // Listener selbst (Supabase-Eigenheit, sonst hängt die Anmeldung).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((e, s) => {
      // Gesicherte Beleg-Entwürfe enthalten Kundendaten — nicht fürs nächste Konto am Gerät
      if (e === "SIGNED_OUT") { alleSicherungenLoeschen(); merken(null); }
      setSession(s);
      window.setTimeout(() => void datenLaden(s), 0);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      void datenLaden(s);
    });
    return () => subscription.unsubscribe();
  }, [datenLaden]);

  const wert: Sitzung = {
    laden,
    session,
    profil,
    firma,
    istChef: !!profil?.aktiv && profil.rolle === "chef",
    ohneVerbindung,
    neuLaden: () => datenLaden(session),
  };

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useSitzung(): Sitzung {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSitzung außerhalb von SitzungProvider");
  return s;
}
