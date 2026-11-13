import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Mail, MessageCircle, RefreshCw, Share2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Karte } from "@/components/Bausteine";
import { FormularDialog } from "@/components/FormularDialog";
import { useTeams } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { einladungsAdresse, einladungsText, mailAdresse, whatsAppAdresse } from "@/lib/einladung";
import { datum } from "@/lib/format";
import { name, type Profil, type Rolle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { KUNDE } from "@/kunde.config";

/**
 * Mitarbeiter einladen (Einstellungen → Mitarbeiter): Vorname, Nachname,
 * Rolle, Team → persönlicher Link zum Teilen per WhatsApp, Mail, Kopieren
 * oder QR am Bildschirm. Wer ihn öffnet, installiert die App, legt sein
 * Passwort fest und ist sofort freigeschaltet (pages/Einladung.tsx,
 * Migration 20261114100000_einladungen.sql).
 */

type Geteilt = { vorname: string; nachname: string; token: string; zugang?: boolean };

type Offen = {
  id: string; vorname: string; nachname: string; rolle: string; gueltig_bis: string; profil_id: string | null;
};

export function EinladenKarte() {
  const qc = useQueryClient();
  const [neu, setNeu] = useState(false);
  const [teilen, setTeilen] = useState<Geteilt | null>(null);
  const { data: offen = [] } = useQuery({
    queryKey: ["einladungen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("einladungen")
        .select("id, vorname, nachname, rolle, gueltig_bis, profil_id")
        .is("eingeloest_am", null).is("zurueckgezogen_am", null).is("profil_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Offen[];
    },
  });

  const neuerLink = async (e: Offen) => {
    const { data, error } = await supabase.rpc("einladung_neu", { p_id: e.id });
    if (error) return toast.error("Kein neuer Link", { description: error.message });
    await qc.invalidateQueries({ queryKey: ["einladungen"] });
    setTeilen({ vorname: e.vorname, nachname: e.nachname, token: data as string });
  };
  const zurueckziehen = async (e: Offen) => {
    const { error } = await supabase.rpc("einladung_zurueckziehen", { p_id: e.id });
    if (error) return toast.error("Nicht zurückgezogen", { description: error.message });
    toast.success(`Einladung für ${e.vorname} zurückgezogen — der Link gilt nicht mehr`);
    await qc.invalidateQueries({ queryKey: ["einladungen"] });
  };

  return (
    <Karte titel="Neue Mitarbeiter">
      <p className="text-sm text-muted-foreground">
        Schick jedem einen persönlichen Link — per WhatsApp, Mail oder als QR-Code zum Abscannen. Damit installiert er die App
        und legt sein Passwort fest. Freischalten ist dann nicht nötig.
      </p>
      <Button className="mt-4 h-12 w-full gap-2 text-base sm:w-auto" onClick={() => setNeu(true)} data-pruef="einladen">
        <UserPlus className="h-5 w-5" /> Mitarbeiter einladen
      </Button>

      {offen.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-sm font-medium">Offene Einladungen</p>
          {offen.map((e) => {
            const abgelaufen = new Date(e.gueltig_bis) < new Date();
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3" data-pruef="offene-einladung">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.vorname} {e.nachname}</p>
                  <p className={cn("text-xs", abgelaufen ? "text-destructive" : "text-muted-foreground")}>
                    {e.rolle === "chef" ? "Chef · " : ""}{abgelaufen ? "abgelaufen" : `gültig bis ${datum(e.gueltig_bis)}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => void neuerLink(e)}>
                  <RefreshCw className="h-4 w-4" /> Neuer Link
                </Button>
                <Button variant="ghost" size="sm" className="h-10 text-muted-foreground" onClick={() => void zurueckziehen(e)}>
                  Zurückziehen
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Ohne Link geht es auch: unter <span className="font-mono">{window.location.host}</span> auf „Konto anlegen“ — solche Konten schaltest du unten frei.
      </p>

      <EinladenDialog open={neu} onOpenChange={setNeu} onErzeugt={(g) => { setNeu(false); setTeilen(g); void qc.invalidateQueries({ queryKey: ["einladungen"] }); }} />
      <LinkTeilen geteilt={teilen} onClose={() => setTeilen(null)} />
    </Karte>
  );
}

function EinladenDialog({ open, onOpenChange, onErzeugt }: {
  open: boolean; onOpenChange: (o: boolean) => void; onErzeugt: (g: Geteilt) => void;
}) {
  const { data: teams = [] } = useTeams();
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [rolle, setRolle] = useState<Rolle>("monteur");
  const [team, setTeam] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVorname(""); setNachname(""); setRolle("monteur"); setTeam("");
  }, [open]);

  const erzeugen = async () => {
    if (laeuft) return;
    const v = vorname.trim(), n = nachname.trim();
    if (!v || !n) return toast.error("Bitte Vor- und Nachnamen eintragen.");
    setLaeuft(true);
    const { data, error } = await supabase.rpc("einladung_erstellen", {
      p_vorname: v, p_nachname: n, p_rolle: rolle, p_team: team || null,
    });
    setLaeuft(false);
    if (error) return toast.error("Keine Einladung erzeugt", { description: error.message });
    onErzeugt({ vorname: v, nachname: n, token: (data as { token: string }).token });
  };

  return (
    <FormularDialog open={open} onOpenChange={onOpenChange} titel="Mitarbeiter einladen" gesperrt={laeuft}
      ungespeichert={!!(vorname || nachname)}
      fuss={(
        <Button className="h-12 w-full gap-2 text-base sm:w-auto" onClick={() => void erzeugen()} disabled={laeuft} data-pruef="link-erzeugen">
          {laeuft ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />} Link erzeugen
        </Button>
      )}>
      <form className="mx-auto max-w-lg space-y-5" onSubmit={(e) => { e.preventDefault(); void erzeugen(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ein-vorname">Vorname</Label>
            <Input id="ein-vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} autoComplete="off" className="h-12 text-base md:text-base" maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ein-nachname">Nachname</Label>
            <Input id="ein-nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} autoComplete="off" className="h-12 text-base md:text-base" maxLength={60} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Rolle</Label>
          <div className="flex h-12 overflow-hidden rounded-md border text-base" role="group" aria-label="Rolle">
            {(["monteur", "chef"] as Rolle[]).map((r, i) => (
              <button key={r} type="button" onClick={() => setRolle(r)} aria-pressed={rolle === r}
                className={cn("flex-1 font-medium transition-colors", i > 0 && "border-l",
                  rolle === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {r === "chef" ? "Chef (Büro, alles)" : "Monteur"}
              </button>
            ))}
          </div>
        </div>
        {teams.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="ein-team">Team <span className="font-normal text-muted-foreground">(freiwillig)</span></Label>
            <select id="ein-team" value={team} onChange={(e) => setTeam(e.target.value)} className="h-12 w-full rounded-md border bg-background px-3 text-base">
              <option value="">— kein Team —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Der Link gilt 14 Tage und nur einmal. Wer ihn benutzt, ist gleich freigeschaltet.</p>
      </form>
    </FormularDialog>
  );
}

/** Der fertige Link: WhatsApp, Mail, Kopieren, Teilen — und der QR-Code zum direkten Abscannen */
export function LinkTeilen({ geteilt, onClose }: { geteilt: Geteilt | null; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const link = geteilt ? einladungsAdresse(window.location.origin, geteilt.token) : "";
  const text = geteilt ? einladungsText({ vorname: geteilt.vorname, firma: KUNDE.kurzname, link, zugang: geteilt.zugang }) : "";

  useEffect(() => {
    setQr(null);
    if (!link) return;
    let aktiv = true;
    void import("qrcode").then((QR) => QR.toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: "M" }))
      .then((u) => { if (aktiv) setQr(u); }).catch(() => {});
    return () => { aktiv = false; };
  }, [link]);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link kopiert");
    } catch {
      toast.error("Kopieren geht hier nicht — bitte den Link markieren und kopieren.");
    }
  };
  const kannTeilen = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <FormularDialog open={!!geteilt} onOpenChange={(o) => { if (!o) onClose(); }}
      titel={geteilt ? `${geteilt.zugang ? "Zugang für" : "Einladung für"} ${geteilt.vorname} ${geteilt.nachname}` : ""}
      fuss={<Button variant="outline" className="h-12 w-full gap-2 sm:w-auto" onClick={onClose}><X className="h-4 w-4" /> Fertig</Button>}>
      <div className="mx-auto max-w-lg space-y-5" data-pruef="link-teilen">
        <p className="text-sm text-muted-foreground">
          Schick {geteilt?.vorname} diesen Link. {geteilt?.zugang
            ? "Er führt zur Installation und Anmeldung."
            : "Damit installiert er die App und legt sein Passwort fest."} Der Link gilt 14 Tage.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="h-12 gap-2 text-base">
            <a href={whatsAppAdresse(text)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-5 w-5" /> Per WhatsApp</a>
          </Button>
          <Button asChild variant="outline" className="h-12 gap-2 text-base">
            <a href={mailAdresse(`${KUNDE.kurzname}-App: deine Einladung`, text)}><Mail className="h-5 w-5" /> Per E-Mail</a>
          </Button>
          <Button variant="outline" className="h-12 gap-2 text-base" onClick={() => void kopieren()} data-pruef="kopieren">
            <Copy className="h-5 w-5" /> Link kopieren
          </Button>
          {kannTeilen && (
            <Button variant="outline" className="h-12 gap-2 text-base"
              onClick={() => void navigator.share({ title: `${KUNDE.kurzname}-App`, text }).catch(() => {})}>
              <Share2 className="h-5 w-5" /> Teilen …
            </Button>
          )}
        </div>
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-11 font-mono text-sm" aria-label="Einladungslink" />
        <div className="rounded-xl border bg-white p-4 text-center">
          <p className="mb-3 text-sm font-medium text-neutral-900">Oder gleich hier abscannen — Handy-Kamera auf den Code halten</p>
          {qr ? <img src={qr} alt="QR-Code mit dem Einladungslink" className="mx-auto h-60 w-60" data-pruef="qr" /> : <div className="mx-auto h-60 w-60 animate-pulse rounded bg-neutral-100" />}
        </div>
      </div>
    </FormularDialog>
  );
}

/** Für einen bestehenden Zugang: Link nur zum Installieren und Anmelden („dein Zugang“) */
export function ZugangsLinkKnopf({ p }: { p: Profil }) {
  const { istChef } = useSitzung();
  const [teilen, setTeilen] = useState<Geteilt | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  if (!istChef) return null;
  const erzeugen = async () => {
    setLaeuft(true);
    const { data, error } = await supabase.rpc("einladung_erstellen", { p_vorname: p.vorname, p_nachname: p.nachname, p_profil: p.id });
    setLaeuft(false);
    if (error) return toast.error("Kein Link erzeugt", { description: error.message });
    setTeilen({ vorname: p.vorname, nachname: p.nachname, token: (data as { token: string }).token, zugang: true });
  };
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => void erzeugen()} disabled={laeuft}
        title={`Link für ${name(p)}: App installieren und anmelden`}>
        {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Zugangslink
      </Button>
      <LinkTeilen geteilt={teilen} onClose={() => setTeilen(null)} />
    </>
  );
}
