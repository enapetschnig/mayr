import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Clock, LogOut, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";
import { BenutzerVerwaltung } from "@/components/BenutzerVerwaltung";

/**
 * Drei Hürden vor jeder Seite: angemeldet, freigeschaltet, einer Firma
 * zugeordnet. Ohne Firma ergibt nichts in dieser App Sinn — jede Buchung,
 * jede Rechnung gehört einer Firma.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { laden, session, profil, firma } = useSitzung();

  if (laden) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Lädt…</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  const abmelden = () => supabase.auth.signOut({ scope: "local" });

  if (!profil?.ist_aktiv) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <img src={KUNDE.logo} alt={KUNDE.firma} className="h-20 mx-auto mb-4 object-contain" />
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl">Wartet auf Freischaltung</CardTitle>
            <CardDescription className="text-base mt-2">
              Dein Konto ist angelegt. Sobald es freigeschaltet ist, kannst du loslegen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={abmelden}>
              <LogOut className="mr-2 h-4 w-4" /> Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!firma) {
    // Ein Administrator ohne Firma (z. B. der Support-Zugang) kann sich hier
    // selbst einer Firma zuordnen und die übrigen Konten verwalten.
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-4 py-6">
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Noch keiner Firma zugeordnet</CardTitle>
              <CardDescription>
                {profil.ist_admin
                  ? "Ordne dich unten einer Firma zu, um die App aus deren Sicht zu benutzen."
                  : "Ein Administrator muss dein Konto noch einer Firma zuordnen."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={abmelden}>
                <LogOut className="mr-2 h-4 w-4" /> Abmelden
              </Button>
            </CardContent>
          </Card>
          {profil.ist_admin && <BenutzerVerwaltung />}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
