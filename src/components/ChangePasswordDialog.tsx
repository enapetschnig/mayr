import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authFehler } from "@/lib/konto";

interface ChangePasswordDialogProps {
  /** Erzwungener Modus (nach einem vorläufigen Passwort vom Chef): nicht
   *  abbrechbar, kein Menü-Eintrag; onSuccess setzt profiles.passwort_neu zurück. */
  forced?: boolean;
  onSuccess?: () => void | Promise<void>;
}

export default function ChangePasswordDialog({ forced = false, onSuccess }: ChangePasswordDialogProps = {}) {
  const [open, setOpen] = useState(forced);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);

    const formData = new FormData(form);
    const newPassword = formData.get("new-password") as string;
    const confirmPassword = formData.get("confirm-password") as string;

    if (newPassword !== confirmPassword) return setError("Die Passwörter stimmen nicht überein.");
    if (newPassword.length < 6) return setError("Das Passwort braucht mindestens 6 Zeichen.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setError(authFehler(error.message));
      setLoading(false);
      return;
    }
    await onSuccess?.();
    setLoading(false);
    toast.success(forced ? "Eigenes Passwort festgelegt" : "Passwort geändert");
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (forced) return; setOpen(o); if (!o) setError(null); }}>
      {!forced && (
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault();
            setOpen(true);
          }}>
            <Key className="mr-2 h-4 w-4" />
            <span>Passwort ändern</span>
          </DropdownMenuItem>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => forced && e.preventDefault()} onEscapeKeyDown={(e) => forced && e.preventDefault()} ohneSchliessen={forced}>
        <DialogHeader>
          <DialogTitle>{forced ? "Eigenes Passwort festlegen" : "Passwort ändern"}</DialogTitle>
          <DialogDescription>
            {forced
              ? "Du hast dich mit einem vorläufigen Passwort vom Chef angemeldet. Leg jetzt dein eigenes fest — mindestens 6 Zeichen."
              : "Gib dein neues Passwort ein — mindestens 6 Zeichen."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Passwort wiederholen</Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Passwort wiederholen"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Speichert …" : forced ? "Passwort festlegen" : "Passwort ändern"}
            </Button>
            {!forced && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
