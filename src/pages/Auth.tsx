import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

type Modus = "login" | "register" | "reset" | "registriert";

/** "max" → max@elektro.handwerkapp.at, echte E-Mail-Adressen bleiben, wie sie sind */
const zuEmail = (eingabe: string) => {
  const e = eingabe.trim().toLowerCase();
  return e.includes("@") ? e : `${e}@${KUNDE.loginDomain}`;
};

export default function Auth() {
  const navigate = useNavigate();
  const { session, laden: sitzungLaedt } = useSitzung();
  const [laden, setLaden] = useState(false);
  const [modus, setModus] = useState<Modus>("login");

  if (!sitzungLaedt && session && modus === "login") return <Navigate to="/" replace />;

  const anmelden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLaden(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: zuEmail(String(fd.get("benutzer"))),
      password: String(fd.get("password")),
    });
    setLaden(false);
    if (error) {
      toast.error("Anmeldung fehlgeschlagen", {
        description: error.message === "Invalid login credentials" ? "Benutzername oder Passwort falsch." : error.message,
      });
      return;
    }
    navigate("/");
  };

  const registrieren = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLaden(true);
    const { error } = await supabase.auth.signUp({
      email: zuEmail(String(fd.get("benutzer"))),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { vorname: String(fd.get("vorname")).trim(), nachname: String(fd.get("nachname")).trim() },
      },
    });
    if (error) {
      setLaden(false);
      return toast.error("Registrierung fehlgeschlagen", {
        description: error.message.includes("already registered") ? "Diesen Benutzer gibt es schon." : error.message,
      });
    }
    await supabase.auth.signOut({ scope: "local" });
    setLaden(false);
    setModus("registriert");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Kopf in Markenfarbe — Blitz-Logo, Name */}
      <div className="relative overflow-hidden bg-primary px-6 pb-16 pt-[calc(3rem+env(safe-area-inset-top))] text-primary-foreground">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10" aria-hidden />
        <div className="relative mx-auto max-w-sm">
          <img src={KUNDE.logo} alt="" className="h-16 w-16 rounded-2xl shadow-lg ring-2 ring-white/30" />
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{KUNDE.kurzname}</h1>
          <p className="mt-1 text-primary-foreground/80">Stunden, Material, Regie, Rechnung — alles am Handy.</p>
        </div>
      </div>

      <div className="relative -mt-8 flex-1 px-4 pb-10">
        <div className="mx-auto w-full max-w-sm rounded-3xl border bg-card p-6 shadow-lg">
          {modus === "registriert" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100"><Clock className="h-8 w-8 text-amber-600" /></div>
              <div>
                <h2 className="text-lg font-semibold">Registrierung eingegangen</h2>
                <p className="mt-2 text-sm text-muted-foreground">Der Chef schaltet dein Konto frei — danach meldest du dich mit Benutzername und Passwort an.</p>
              </div>
              <Button className="h-12 w-full" onClick={() => setModus("login")}>Zur Anmeldung</Button>
            </div>
          )}

          {modus === "reset" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Passwort vergessen</h2>
              <p className="text-sm text-muted-foreground">Melde dich beim Chef — er setzt dir in den Einstellungen ein neues Passwort.</p>
              <Button className="h-12 w-full" onClick={() => setModus("login")}>Zurück zur Anmeldung</Button>
            </div>
          )}

          {modus === "login" && (
            <form onSubmit={anmelden} className="space-y-4">
              <h2 className="text-lg font-semibold">Anmelden</h2>
              <div className="space-y-2">
                <Label htmlFor="benutzer">Benutzername oder E-Mail</Label>
                <Input id="benutzer" name="benutzer" type="text" autoComplete="username" autoCapitalize="none" required className="h-12" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} className="h-12" />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={laden}>
                {laden && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Anmelden
              </Button>
              <div className="flex items-center justify-between pt-1 text-sm">
                <button type="button" onClick={() => setModus("reset")} className="text-muted-foreground hover:text-foreground">Passwort vergessen?</button>
                <button type="button" onClick={() => setModus("register")} className="font-medium text-primary hover:underline">Konto anlegen</button>
              </div>
            </form>
          )}

          {modus === "register" && (
            <form onSubmit={registrieren} className="space-y-4">
              <h2 className="text-lg font-semibold">Konto anlegen</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="vorname">Vorname</Label><Input id="vorname" name="vorname" autoComplete="given-name" required className="h-12" /></div>
                <div className="space-y-2"><Label htmlFor="nachname">Nachname</Label><Input id="nachname" name="nachname" autoComplete="family-name" required className="h-12" /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-benutzer">Benutzername oder E-Mail</Label>
                <Input id="reg-benutzer" name="benutzer" autoComplete="username" autoCapitalize="none" required className="h-12" placeholder="z. B. max" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Passwort</Label>
                <Input id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={6} className="h-12" placeholder="mindestens 6 Zeichen" />
              </div>
              <Button type="submit" className="h-12 w-full text-base" disabled={laden}>
                {laden && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrieren
              </Button>
              <p className="text-center text-xs text-muted-foreground">Neue Konten schaltet der Chef frei.</p>
              <p className="text-center text-sm text-muted-foreground">
                Schon registriert?{" "}
                <button type="button" onClick={() => setModus("login")} className="font-medium text-primary hover:underline">Anmelden</button>
              </p>
            </form>
          )}
        </div>
        <p className="mx-auto mt-6 max-w-sm text-center text-xs text-muted-foreground">Demo-Version · alle Daten sind Beispieldaten</p>
      </div>
    </div>
  );
}
