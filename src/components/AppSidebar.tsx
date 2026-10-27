import { Link, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { GRUPPEN_TITEL, istAktiv, sichtbareNavigation, type NavEintrag } from "@/lib/navigation";
import { name } from "@/lib/types";
import { KUNDE } from "@/kunde.config";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { profil, firma, istChef } = useSitzung();

  const gruppen = (Object.keys(GRUPPEN_TITEL) as NavEintrag["gruppe"][])
    .map((g) => ({ g, eintraege: sichtbareNavigation(istChef, true).filter((n) => n.gruppe === g) }))
    .filter((x) => x.eintraege.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b p-3">
        <Link to="/" className="flex items-center gap-2.5 px-1">
          <img src={KUNDE.logo} alt="" className="h-9 w-9 shrink-0 rounded-xl object-contain" />
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-bold leading-tight">{firma?.name || KUNDE.kurzname}</span>
            <span className="block truncate text-xs text-muted-foreground">{KUNDE.slogan}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {gruppen.map(({ g, eintraege }) => (
          <SidebarGroup key={g}>
            <SidebarGroupLabel>{GRUPPEN_TITEL[g]}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {eintraege.map((i) => (
                  <SidebarMenuItem key={i.pfad}>
                    <SidebarMenuButton asChild isActive={istAktiv(i.pfad, pathname)} tooltip={i.titel}
                      className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground">
                      <Link to={i.pfad}><i.icon className="h-4 w-4" /><span>{i.titel}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Avatar profil={profil} className="group-data-[collapsible=icon]:hidden" />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">{name(profil)}</p>
            <p className="text-xs text-muted-foreground">{istChef ? "Chef" : "Monteur"}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Abmelden"
            onClick={() => supabase.auth.signOut({ scope: "local" })}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
