import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
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
  neuLaden: () => Promise<void>;
}

const Ctx = createContext<Sitzung | null>(null);

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [laden, setLaden] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [firma, setFirma] = useState<Firma | null>(null);

  const datenLaden = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfil(null);
      setFirma(null);
      setLaden(false);
      return;
    }
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.from("firma").select("*").eq("id", 1).maybeSingle(),
    ]);
    setProfil(p ?? null);
    setFirma(f ?? null);
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

  const wert: Sitzung = {
    laden,
    session,
    profil,
    firma,
    istChef: !!profil?.aktiv && profil.rolle === "chef",
    neuLaden: () => datenLaden(session),
  };

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useSitzung(): Sitzung {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSitzung außerhalb von SitzungProvider");
  return s;
}
