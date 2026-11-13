import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstallAnleitung } from "@/components/Installieren";
import { useSitzung } from "@/hooks/useSitzung";
import { authFehler, benutzerFehler, zuEmail } from "@/lib/konto";
import { offeneEinladungMerken, offeneEinladungVergessen, type EinladungInfo } from "@/lib/einladung";
import { geraetErkennen, istIOS, istMobil, laeuftAlsApp } from "@/lib/installieren";
import { name } from "@/lib/types";
import { KUNDE } from "@/kunde.config";

/**
 * /einladung/<token> — hierher führt der Link, den der Chef per WhatsApp,
 * Mail oder QR schickt. Ohne Anmeldung erreichbar.
 *
 * Reihenfolge wie bei Schrettl (Christophs Vorgabe): ZUERST die App auf den
 * Startbildschirm, DANN darin das Passwort festlegen.
 *
 *   Handy im Browser → „1. App auf den Startbildschirm“ mit der Anleitung für
 *     genau dieses Gerät, „2. App öffnen“. Klein: „Ohne App im Browser weiter“.
 *   In der installierten App und am PC → gleich das Formular: Name steht
 *     fest, nur Benutzername (vorgeschlagen) und Passwort. Wer über die
 *     Einladung kommt, ist sofort freigeschaltet (Trigger handle_new_user).
 *
 * Damit die App nach dem Installieren wieder HIER startet:
 *   iPhone: Die Home-App hat eigenen Speicher. Ohne Manifest nimmt Safari die
 *     aktuelle Adresse als Startadresse — deshalb wird es auf dieser Seite
 *     aus dem DOM genommen. Beim späteren Start mit Sitzung geht es sofort
 *     weiter auf die Startseite.
 *   Android/PC: Browser und App teilen den Speicher; der Merker „offene
 *     Einladung“ führt die auf „/“ startende App hierher zurück (Auth.tsx).
 *
 * Art „zugang“: Link zu einem bestehenden Konto — nur installieren und
 * anmelden, Benutzername steht schon da.
 */
export default function Einladung() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { laden: sitzungLaedt, session, profil } = useSitzung();
  const geraet = useMemo(() => geraetErkennen(), []);
  const alsApp = laeuftAlsApp();
  const [imBrowser, setImBrowser] = useState(false);
  // Läuft hier gerade die eigene Anmeldung? Dann geht es mit der Sitzung sofort weiter.
  const [eigene, setEigene] = useState(false);

  const { data: info, isLoading, isError, refetch } = useQuery({
    queryKey: ["einladung", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("einladung_lesen", { p_token: token });
      if (error) throw error;
      return data as unknown as EinladungInfo;
    },
    retry: 2,
    staleTime: Infinity,
  });

  const gueltig = info?.status === "gueltig";

  useEffect(() => {
    if (!info) return;
    if (gueltig && info.art === "neu") offeneEinladungMerken(token);
    else offeneEinladungVergessen();
  }, [info, gueltig, token]);

  // iPhone/iPad: ohne Manifest wird DIESE Adresse die Startadresse der Home-App
  useEffect(() => {
    if (!istIOS(geraet) || alsApp) return;
    const manifest = document.querySelector('link[rel="manifest"]');
    const eltern = manifest?.parentNode;
    manifest?.remove();
    return () => { if (manifest && eltern) eltern.appendChild(manifest); };
  }, [geraet, alsApp]);

  if (sitzungLaedt || isLoading) return <Rahmen><p className="py-10 text-center text-muted-foreground">Lädt…</p></Rahmen>;

  // Angemeldet: gleich in die App — außer jemand anderer ist an diesem Gerät angemeldet
  if (session) {
    const fremd = gueltig && info?.art === "neu";
    if (eigene || !fremd) {
      offeneEinladungVergessen();
      return <Navigate to="/" replace />;
    }
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold">Schon angemeldet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An diesem Gerät ist gerade {profil ? name(profil) : "jemand"} angemeldet. Diese Einladung ist für {info?.vorname} {info?.nachname}.
        </p>
        <div className="mt-5 space-y-2">
          <Button className="h-12 w-full gap-2" onClick={() => void supabase.auth.signOut({ scope: "local" })}>
            <LogOut className="h-4 w-4" /> Abmelden und Einladung annehmen
          </Button>
          <Button variant="ghost" className="h-12 w-full" onClick={() => { offeneEinladungVergessen(); navigate("/", { replace: true }); }}>Weiter zur App</Button>
        </div>
      </Rahmen>
    );
  }
  if (isError || !info) {
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold">Keine Verbindung</h1>
        <p className="mt-2 text-sm text-muted-foreground">Die Einladung lässt sich gerade nicht laden. Bitte Netz prüfen und noch einmal versuchen.</p>
        <Button className="mt-5 h-12 w-full" onClick={() => void refetch()}>Noch einmal versuchen</Button>
      </Rahmen>
    );
  }

  if (!gueltig) {
    const benutzt = info.status === "eingeloest";
    return (
      <Rahmen>
        <h1 className="text-xl font-semibold" data-pruef={`einladung-${info.status}`}>
          {benutzt ? "Einladung schon angenommen" : "Dieser Link gilt nicht mehr"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {benutzt
            ? "Mit dieser Einladung wurde schon ein Konto angelegt. Melde dich mit deinem Benutzernamen und Passwort an."
            : info.status === "unbekannt"
              ? "Den Link gibt es nicht. Bitte den Chef um einen neuen Link."
              : "Der Link ist abgelaufen oder zurückgezogen. Bitte den Chef um einen neuen Link."}
        </p>
        <Button asChild className="mt-5 h-12 w-full"><Link to="/auth" replace>Zur Anmeldung</Link></Button>
      </Rahmen>
    );
  }

  const gruss = (
    <div className="mb-5">
      <h1 className="text-2xl font-bold leading-tight">Hallo {info.vorname}!</h1>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">
        {info.art === "zugang"
          ? `Hier ist dein Zugang zur ${KUNDE.kurzname}-App.`
          : `${info.firma || KUNDE.firma} lädt dich zur ${KUNDE.kurzname}-App ein.`}
      </p>
    </div>
  );

  // Handy im Browser: zuerst installieren
  if (istMobil(geraet) && !alsApp && !imBrowser) {
    return (
      <Rahmen>
        {gruss}
        <div className="space-y-4">
          <section className="rounded-xl border p-4" data-pruef="schritt-installieren">
            <h2 className="mb-3 text-lg font-semibold">1. App auf den Startbildschirm legen</h2>
            <InstallAnleitung onFertig={() => toast.success("Fertig — die App liegt auf deinem Startbildschirm. Jetzt dort öffnen.")} />
          </section>
          <section className="rounded-xl border p-4" data-pruef="schritt-oeffnen">
            <h2 className="text-lg font-semibold">2. App öffnen</h2>
            <p className="mt-2 flex items-start gap-3 text-[0.95rem] leading-snug">
              <img src={KUNDE.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
              <span>
                Auf dem Startbildschirm auf das {KUNDE.kurzname}-Zeichen tippen. {info.art === "zugang"
                  ? "Dort meldest du dich mit deinem Passwort an."
                  : "Dort legst du dein Passwort fest — fertig."}
              </span>
            </p>
          </section>
          <Button variant="ghost" className="h-12 w-full text-muted-foreground" onClick={() => setImBrowser(true)} data-pruef="ohne-app">
            Ohne App im Browser weiter
          </Button>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {gruss}
      {info.art === "zugang"
        ? <Anmelden benutzer={info.benutzer ?? ""} onStart={setEigene} />
        : <KontoAnlegen token={token} info={info} onStart={setEigene} />}
    </Rahmen>
  );
}

/** Schwarzer Kopf mit Logo wie die Anmeldeseite, darunter eine Karte */
function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="bg-marke-schwarz px-6 pb-14 pt-[calc(1.5rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-md">
          <img src={KUNDE.logoQuerHell} alt={KUNDE.firma} className="h-16 w-auto" />
        </div>
      </div>
      <div className="relative -mt-8 flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function PasswortFeld({ id, autoComplete, autoFocus }: { id: string; autoComplete: string; autoFocus?: boolean }) {
  const [zeigen, setZeigen] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name="passwort" type={zeigen ? "text" : "password"} autoComplete={autoComplete} required minLength={6}
        autoFocus={autoFocus} className="h-12 pr-12 text-base md:text-base" placeholder="mindestens 6 Zeichen" />
      <button type="button" onClick={() => setZeigen((z) => !z)} aria-label={zeigen ? "Passwort verbergen" : "Passwort zeigen"}
        className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-muted-foreground">
        {zeigen ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

/** onStart(true) vor dem Anlegen, onStart(false) bei einem Fehler — mit der Sitzung leitet die Seite weiter */
function KontoAnlegen({ token, info, onStart }: { token: string; info: EinladungInfo; onStart: (an: boolean) => void }) {
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (laeuft) return;
    const fd = new FormData(e.currentTarget);
    const benutzer = String(fd.get("benutzer") ?? "");
    const passwort = String(fd.get("passwort") ?? "");
    const falsch = benutzerFehler(benutzer);
    if (falsch) return toast.error("Benutzername geht so nicht", { description: falsch });
    if (passwort.length < 6) return toast.error("Das Passwort braucht mindestens 6 Zeichen.");
    const email = zuEmail(benutzer, KUNDE.loginDomain);
    setLaeuft(true);
    onStart(true);
    offeneEinladungVergessen();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: passwort,
      options: { data: { einladung: token, vorname: info.vorname, nachname: info.nachname } },
    });
    if (error) {
      // Doppelt getippt oder Funkloch nach dem Anlegen: mit demselben Passwort klappt die Anmeldung
      if (/already (been )?registered/i.test(error.message)) {
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: passwort });
        if (!e2) return;
        setLaeuft(false);
        onStart(false);
        offeneEinladungMerken(token);
        return toast.error("Diesen Benutzernamen gibt es schon", { description: "Bitte einen anderen wählen, z. B. mit Nachnamen." });
      }
      setLaeuft(false);
      onStart(false);
      offeneEinladungMerken(token);
      return toast.error("Hat nicht geklappt", { description: authFehler(error.message) });
    }
    if (!data.session) {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password: passwort });
      if (e2) { setLaeuft(false); return toast.error("Konto angelegt — bitte jetzt anmelden", { description: authFehler(e2.message) }); }
    }
    toast.success(`Willkommen, ${info.vorname}!`);
  };

  return (
    <form onSubmit={absenden} className="space-y-4" data-pruef="konto-anlegen">
      <div className="space-y-2">
        <Label htmlFor="ein-benutzer">Dein Benutzername</Label>
        <Input id="ein-benutzer" name="benutzer" defaultValue={info.benutzer ?? ""} autoComplete="username" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} required className="h-12 text-base md:text-base" />
        <p className="text-xs text-muted-foreground">Damit meldest du dich an. Du kannst ihn ändern oder deine E-Mail-Adresse nehmen.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ein-passwort">Dein Passwort</Label>
        <PasswortFeld id="ein-passwort" autoComplete="new-password" />
      </div>
      <Button type="submit" className="h-14 w-full text-base" disabled={laeuft} data-pruef="los">
        {laeuft ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />} Fertig — App starten
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Schon ein Konto? <Link to="/auth" onClick={offeneEinladungVergessen} className="font-medium text-primary">Anmelden</Link>
      </p>
    </form>
  );
}

function Anmelden({ benutzer, onStart }: { benutzer: string; onStart: (an: boolean) => void }) {
  const [laeuft, setLaeuft] = useState(false);
  const [vergessen, setVergessen] = useState(false);

  const absenden = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (laeuft) return;
    const passwort = String(new FormData(e.currentTarget).get("passwort") ?? "");
    setLaeuft(true);
    onStart(true);
    const { error } = await supabase.auth.signInWithPassword({ email: zuEmail(benutzer, KUNDE.loginDomain), password: passwort });
    if (error) {
      setLaeuft(false);
      onStart(false);
      return toast.error("Anmeldung fehlgeschlagen", { description: authFehler(error.message) });
    }
  };

  return (
    <form onSubmit={absenden} className="space-y-4" data-pruef="zugang-anmelden">
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">Dein Benutzername</p>
        <p className="font-mono text-lg font-semibold">{benutzer}</p>
        <input type="hidden" name="benutzer" autoComplete="username" value={benutzer} readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ein-anmelden">Passwort</Label>
        <PasswortFeld id="ein-anmelden" autoComplete="current-password" />
      </div>
      <Button type="submit" className="h-14 w-full text-base" disabled={laeuft}>
        {laeuft && <Loader2 className="mr-2 h-5 w-5 animate-spin" />} Anmelden
      </Button>
      {vergessen ? (
        <p className="text-sm text-muted-foreground">Sag dem Chef Bescheid: Unter Einstellungen → Mitarbeiter gibt er dir ein vorläufiges Passwort.</p>
      ) : (
        <button type="button" className="h-11 w-full text-sm text-muted-foreground" onClick={() => setVergessen(true)}>Passwort vergessen?</button>
      )}
    </form>
  );
}
