import { Link, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";
import { BarChart3, CalendarDays, Clock, FolderKanban, Home, LogOut, Package, Receipt, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FirmaBadge } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { KUNDE } from "@/kunde.config";

const GRUPPEN = [
  {
    label: "Hauptmenü",
    items: [
      { title: "Start", path: "/", icon: Home },
      { title: "Projekte", path: "/projekte", icon: FolderKanban },
      { title: "Kalender", path: "/kalender", icon: CalendarDays },
    ],
  },
  {
    label: "Erfassen & Abrechnen",
    items: [
      { title: "Zeiterfassung", path: "/zeiten", icon: Clock },
      { title: "Material", path: "/material", icon: Package },
      { title: "Rechnungen & Angebote", path: "/rechnungen", icon: Receipt },
      { title: "Stundenauswertung", path: "/auswertung", icon: BarChart3 },
    ],
  },
  { label: "System", items: [{ title: "Einstellungen", path: "/einstellungen", icon: Settings }] },
];

const aktiv = (p: string, jetzt: string) => (p === "/" ? jetzt === "/" : jetzt === p || jetzt.startsWith(p + "/"));

export function AppSidebar() {
  const { pathname } = useLocation();
  const { profil, firma } = useSitzung();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-3 border-b">
        <Link to="/" className="flex items-center justify-center px-1">
          <img src={KUNDE.logo} alt={KUNDE.firma} className="h-12 w-auto object-contain" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {GRUPPEN.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((i) => (
                  <SidebarMenuItem key={i.path}>
                    <SidebarMenuButton asChild isActive={aktiv(i.path, pathname)} tooltip={i.title}>
                      <Link to={i.path}><i.icon className="h-4 w-4" /><span>{i.title}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3 border-t">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate">{`${profil?.vorname ?? ""} ${profil?.nachname ?? ""}`.trim() || "Benutzer"}</p>
            <FirmaBadge firma={firma} />
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
