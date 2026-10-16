import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Firma, Profil } from "@/lib/types";

/**
 * Wer ist angemeldet, zu welcher Firma gehört er, welche Firmen gibt es.
 *
 * Einmal geladen, überall verfügbar — jede Seite braucht das (Firmenfarbe,
 * "meine" vs. "fremde" Buchung, Briefkopf). Ohne zentrale Stelle fragte
 * jede Seite selbst nach, und nach dem Umstellen der Firma in den
 * Einstellungen zeigten halbe Seiten noch die alte an.
 */

interface Sitzung {
  laden: boolean;
  session: Session | null;
  profil: Profil | null;
  /** Die eigene Firma — null, solange keine zugeordnet ist. */
  firma: Firma | null;
  firmen: Firma[];
  firmaVon: (id: string | null | undefined) => Firma | undefined;
  neuLaden: () => Promise<void>;
}

const Ctx = createContext<Sitzung | null>(null);

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [laden, setLaden] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [firmen, setFirmen] = useState<Firma[]>([]);

  const datenLaden = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfil(null);
      setFirmen([]);
      setLaden(false);
      return;
    }
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("firmen").select("*").order("ist_demo").order("name"),
    ]);
    setProfil(p ?? null);
    setFirmen(f ?? []);
    setLaden(false);
  }, []);

  useEffect(() => {
    // Erst den Listener, dann die bestehende Sitzung — und nie await im
    // Listener selbst (Supabase-Eigenheit, sonst hängt die Anmeldung).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      window.setTimeout(() => void datenLaden(s), 0);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      void datenLaden(s);
    });
    return () => subscription.unsubscribe();
  }, [datenLaden]);

  const firmaVon = useCallback((id: string | null | undefined) => firmen.find((f) => f.id === id), [firmen]);

  const wert: Sitzung = {
    laden,
    session,
    profil,
    firma: profil?.firma_id ? firmen.find((f) => f.id === profil.firma_id) ?? null : null,
    firmen,
    firmaVon,
    neuLaden: () => datenLaden(session),
  };

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useSitzung(): Sitzung {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSitzung außerhalb von SitzungProvider");
  return s;
}

/** Für Stellen, die eine Firma zwingend brauchen (hinter ProtectedRoute). */
export function useMeineFirma(): Firma {
  const { firma } = useSitzung();
  if (!firma) throw new Error("Keine Firma zugeordnet");
  return firma;
}
