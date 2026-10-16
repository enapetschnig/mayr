import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNeuLaden } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import type { Profil } from "@/lib/types";

const KEINE = "__keine__";

/**
 * Zugänge freischalten und einer Firma zuordnen. Mitarbeiter gibt es in
 * dieser App nicht — jeder Zugang ist "eine Firma". Löschen eines Kontos
 * geht nur im Supabase-Dashboard; hier wird gesperrt.
 */
export function BenutzerVerwaltung() {
  const { profil: ich, firmen, neuLaden: sitzungNeu } = useSitzung();
  const neuLaden = useNeuLaden();
  const { data: profile = [] } = useQuery({
    queryKey: ["profiles", "alle"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("ist_aktiv").order("created_at");
      return data ?? [];
    },
  });

  const aendern = async (p: Profil, teil: Partial<Profil>) => {
    const { error } = await supabase.from("profiles").update(teil).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Gespeichert");
    await neuLaden("profiles");
    if (p.id === ich?.id) await sitzungNeu();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Zugänge</CardTitle>
        <CardDescription>Neue Registrierungen freischalten und der richtigen Firma zuordnen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.map((p) => (
          <div key={p.id} className={`rounded-lg border p-3 space-y-3 ${!p.ist_aktiv ? "border-amber-300 bg-amber-50/60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{`${p.vorname} ${p.nachname}`.trim() || "—"} {p.id === ich?.id && <span className="text-muted-foreground font-normal">(ich)</span>}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              </div>
              {!p.ist_aktiv ? <Badge className="bg-amber-100 text-amber-800" variant="secondary">wartet</Badge>
                : p.ist_admin ? <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3" /> Admin</Badge> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <Select value={p.firma_id ?? KEINE} onValueChange={(v) => aendern(p, { firma_id: v === KEINE ? null : v })}>
                <SelectTrigger aria-label="Firma"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEINE}>Keine Firma</SelectItem>
                  {firmen.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch id={`aktiv-${p.id}`} checked={p.ist_aktiv} disabled={p.id === ich?.id} onCheckedChange={(v) => aendern(p, { ist_aktiv: v })} />
                <Label htmlFor={`aktiv-${p.id}`} className="text-sm">Freigeschaltet</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id={`admin-${p.id}`} checked={p.ist_admin} disabled={p.id === ich?.id} onCheckedChange={(v) => aendern(p, { ist_admin: v })} />
                <Label htmlFor={`admin-${p.id}`} className="text-sm">Admin</Label>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
