import { type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Ban, Clock, LogOut, ShieldAlert } from "lucide-react";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

/**
 * Hürden vor jeder Seite: angemeldet, freigeschaltet — und bei
 * Büro-Seiten (Rechnungen, Auswertung …) Chef. Die Datenbank sperrt
 * dieselben Dinge per RLS; das hier ist nur die freundliche Seite davon.
 * Nach einem vorläufigen Passwort vom Chef zuerst ein eigenes festlegen.
 */
export function ProtectedRoute({ children, nurChef = false }: { children: ReactNode; nurChef?: boolean }) {
  const { laden, session, profil, istChef, neuLaden } = useSitzung();

  if (laden) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Lädt…</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  if (!profil?.aktiv) {
    const abmelden = (
      <Button variant="outline" onClick={() => supabase.auth.signOut({ scope: "local" })}>
        <LogOut className="mr-2 h-4 w-4" /> Abmelden
      </Button>
    );
    return profil?.gesperrt ? (
      <Hinweis
        icon={<Ban className="h-8 w-8 text-amber-600" />}
        titel="Zugang gesperrt"
        text="Der Chef hat deinen Zugang gesperrt. Wenn das ein Irrtum ist, melde dich im Büro."
      >
        {abmelden}
      </Hinweis>
    ) : (
      <Hinweis
        icon={<Clock className="h-8 w-8 text-amber-600" />}
        titel="Wartet auf Freischaltung"
        text="Dein Konto ist angelegt. Sobald der Chef es freischaltet, kannst du loslegen."
      >
        {abmelden}
      </Hinweis>
    );
  }

  if (profil.passwort_neu) {
    return (
      <>
        {children}
        <ChangePasswordDialog
          forced
          onSuccess={async () => {
            await supabase.from("profiles").update({ passwort_neu: false }).eq("id", profil.id);
            await neuLaden();
          }}
        />
      </>
    );
  }

  if (nurChef && !istChef) {
    return (
      <Hinweis
        icon={<ShieldAlert className="h-8 w-8 text-amber-600" />}
        titel="Nur für den Chef"
        text="Dieser Bereich ist dem Büro vorbehalten."
      >
        <Button asChild><Link to="/">Zur Startseite</Link></Button>
      </Hinweis>
    );
  }

  return <>{children}</>;
}

/** Ganzseitiger Hinweis mit Logo — auch für „Seite nicht gefunden“ */
export function Hinweis({ icon, titel, text, children }: { icon: ReactNode; titel: string; text: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 text-center">
        <img src={KUNDE.logo} alt="" className="mx-auto mb-5 h-14 w-14 rounded-2xl" />
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">{icon}</div>
        <h1 className="text-xl font-bold">{titel}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-6 flex justify-center">{children}</div>
      </div>
    </div>
  );
}
