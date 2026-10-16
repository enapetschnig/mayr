import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

type Modus = "login" | "register" | "reset" | "registriert";

export default function Auth() {
  const navigate = useNavigate();
  const { session, laden: sitzungLaedt } = useSitzung();
  const [laden, setLaden] = useState(false);
  const [modus, setModus] = useState<Modus>("login");
  const [firmen, setFirmen] = useState<{ id: string; name: string }[]>([]);
  const [firmaId, setFirmaId] = useState("");

  useEffect(() => {
    if (modus !== "register" || firmen.length) return;
    supabase.rpc("firmen_auswahl").then(({ data }) => setFirmen(data ?? []));
  }, [modus, firmen.length]);

  if (!sitzungLaedt && session && modus === "login") return <Navigate to="/" replace />;

  const anmelden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let email = String(fd.get("email")).trim();
    if (!email.includes("@")) email = `${email.toLowerCase()}@${KUNDE.loginDomain}`;
    setLaden(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: String(fd.get("password")) });
    setLaden(false);
    if (error) {
      toast.error("Anmeldung fehlgeschlagen", { description: error.message === "Invalid login credentials" ? "E-Mail oder Passwort falsch." : error.message });
      return;
    }
    navigate("/");
  };

  const registrieren = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!firmaId) return toast.error("Bitte deine Firma wählen.");
    const fd = new FormData(e.currentTarget);
    setLaden(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")).trim().toLowerCase(),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { vorname: String(fd.get("vorname")).trim(), nachname: String(fd.get("nachname")).trim(), firma_id: firmaId },
      },
    });
    if (error) {
      setLaden(false);
      return toast.error("Registrierung fehlgeschlagen", { description: error.message });
    }
    await supabase.auth.signOut({ scope: "local" });
    setLaden(false);
    setModus("registriert");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={KUNDE.logo} alt={KUNDE.firma} className="h-24 mx-auto mb-4 object-contain" />
          <CardTitle>{KUNDE.kurzname}</CardTitle>
          <CardDescription>{KUNDE.slogan}</CardDescription>
        </CardHeader>
        <CardContent>
          {modus === "registriert" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center"><Clock className="h-8 w-8 text-amber-600" /></div>
              <div>
                <h3 className="text-lg font-semibold">Registrierung eingegangen</h3>
                <p className="text-sm text-muted-foreground mt-2">Dein Konto wird freigeschaltet — danach meldest du dich mit E-Mail und Passwort an.</p>
              </div>
              <Button className="w-full" onClick={() => setModus("login")}>Zur Anmeldung</Button>
            </div>
          )}

          {modus === "reset" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Passwort vergessen</h3>
              <p className="text-sm text-muted-foreground">Melde dich beim Administrator — er setzt dir ein neues Passwort.</p>
              <Button className="w-full" onClick={() => setModus("login")}>Zurück zur Anmeldung</Button>
            </div>
          )}

          {modus === "login" && (
            <form onSubmit={anmelden} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" name="email" type="text" autoComplete="username" required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} className="h-11" />
              </div>
              <button type="button" onClick={() => setModus("reset")} className="text-sm text-primary hover:underline">Passwort vergessen?</button>
              <Button type="submit" className="w-full h-11" disabled={laden}>{laden ? "Lädt…" : "Anmelden"}</Button>
              <p className="text-center text-sm text-muted-foreground pt-2">
                Noch kein Konto?{" "}
                <button type="button" onClick={() => setModus("register")} className="text-primary hover:underline font-medium">Jetzt registrieren</button>
              </p>
            </form>
          )}

          {modus === "register" && (
            <form onSubmit={registrieren} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="vorname">Vorname</Label><Input id="vorname" name="vorname" autoComplete="given-name" required /></div>
                <div className="space-y-2"><Label htmlFor="nachname">Nachname</Label><Input id="nachname" name="nachname" autoComplete="family-name" required /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-firma">Meine Firma</Label>
                <Select value={firmaId} onValueChange={setFirmaId}>
                  <SelectTrigger id="reg-firma"><SelectValue placeholder="Firma wählen" /></SelectTrigger>
                  <SelectContent>{firmen.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="reg-email">E-Mail</Label><Input id="reg-email" name="email" type="email" autoComplete="email" required /></div>
              <div className="space-y-2"><Label htmlFor="reg-password">Passwort</Label><Input id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={6} /></div>
              <Button type="submit" className="w-full h-11" disabled={laden}>{laden ? "Wird registriert…" : "Registrieren"}</Button>
              <p className="text-xs text-muted-foreground text-center">Neue Konten werden vom Administrator freigeschaltet.</p>
              <p className="text-center text-sm text-muted-foreground">
                Bereits registriert?{" "}
                <button type="button" onClick={() => setModus("login")} className="text-primary hover:underline font-medium">Zur Anmeldung</button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
