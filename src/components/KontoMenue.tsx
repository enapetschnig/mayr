import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { InstallAnleitung } from "@/components/Installieren";
import { Avatar } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { name } from "@/lib/types";
import { KUNDE } from "@/kunde.config";

/** Rundes Kürzel oben rechts: Konto, App installieren, Passwort, Abmelden. */
export function KontoMenue() {
  const navigate = useNavigate();
  const { profil, istChef } = useSitzung();
  const [installOffen, setInstallOffen] = useState(false);

  const abmelden = async () => {
    await supabase.auth.signOut({ scope: "local" });
    navigate("/auth");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="Konto-Menü">
            <Avatar profil={profil} className="h-9 w-9 text-sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block font-semibold">{name(profil)}</span>
            <span className="block text-xs text-muted-foreground">{istChef ? "Chef" : "Monteur"}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/einstellungen")}>
            <Settings className="mr-2 h-4 w-4" /> Einstellungen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setInstallOffen(true)}>
            <Smartphone className="mr-2 h-4 w-4" /> App auf den Startbildschirm
          </DropdownMenuItem>
          <ChangePasswordDialog />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={abmelden}>
            <LogOut className="mr-2 h-4 w-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={installOffen} onOpenChange={setInstallOffen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{KUNDE.kurzname} als App</DialogTitle>
          <DialogDescription>Auf den Startbildschirm legen — dann startet sie wie jede andere App.</DialogDescription>
          <InstallAnleitung onFertig={() => setInstallOffen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
