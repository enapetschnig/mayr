import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Bausteine";
import { useSitzung } from "@/hooks/useSitzung";
import { GRUPPEN_TITEL, istAktiv, sichtbareNavigation, type NavEintrag } from "@/lib/navigation";
import { name } from "@/lib/types";
import { KUNDE } from "@/kunde.config";

const ZU_SCHLUESSEL = "menue.zu";
const zuLesen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(ZU_SCHLUESSEL) ?? "[]") as string[]; } catch { return []; }
};

export function AppSidebar() {
  const { pathname } = useLocation();
  const { profil, firma, istChef } = useSitzung();
  const { state, toggleSidebar } = useSidebar();
  const eingeklappt = state === "collapsed";
  // Gruppen zuklappen (gemerkt je Gerät); die Gruppe der offenen Seite bleibt immer offen
  const [zu, setZu] = useState<string[]>(zuLesen);
  const gruppeUmschalten = (g: string) => setZu((alt) => {
    const neu = alt.includes(g) ? alt.filter((x) => x !== g) : [...alt, g];
    try { localStorage.setItem(ZU_SCHLUESSEL, JSON.stringify(neu)); } catch { /* privat: egal */ }
    return neu;
  });

  const gruppen = (Object.keys(GRUPPEN_TITEL) as NavEintrag["gruppe"][])
    .map((g) => ({ g, eintraege: sichtbareNavigation(istChef, true).filter((n) => n.gruppe === g) }))
    .filter((x) => x.eintraege.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b p-3">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
            <img src={KUNDE.logo} alt="" className="h-9 w-9 shrink-0 rounded-xl object-contain" />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-bold leading-tight">{firma?.name || KUNDE.kurzname}</span>
              <span className="block truncate text-xs text-muted-foreground">{KUNDE.slogan}</span>
            </span>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={toggleSidebar}
            title={eingeklappt ? "Menü aufklappen" : "Menü einklappen"} aria-label={eingeklappt ? "Menü aufklappen" : "Menü einklappen"}>
            {eingeklappt ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {gruppen.map(({ g, eintraege }) => {
          const aktivDrin = eintraege.some((i) => istAktiv(i.pfad, pathname));
          const offen = eingeklappt || aktivDrin || !zu.includes(g);
          return (
          <SidebarGroup key={g}>
            <SidebarGroupLabel asChild>
              <button type="button" onClick={() => gruppeUmschalten(g)} aria-expanded={offen}
                className="flex w-full items-center justify-between hover:text-sidebar-foreground">
                {GRUPPEN_TITEL[g]}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !offen && "-rotate-90", aktivDrin && "opacity-30")} />
              </button>
            </SidebarGroupLabel>
            {offen && (
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
            )}
          </SidebarGroup>
          );
        })}
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
