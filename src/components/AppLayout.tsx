import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

const PC_AB = 1024;

/** Ab 1024 px Breite gilt das Gerät als PC (Seitenmenü), darunter Handy/Tablet. */
export function useIstPc() {
  const [pc, setPc] = useState(() => typeof window !== "undefined" && window.innerWidth >= PC_AB);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${PC_AB}px)`);
    const aendern = () => setPc(mql.matches);
    mql.addEventListener("change", aendern);
    aendern();
    return () => mql.removeEventListener("change", aendern);
  }, []);
  return pc;
}

/**
 * Handy und Tablet: wie Schrettl — kein Seitenmenü, keine Leiste unten.
 * Die Startseite IST das Menü, jede Unterseite hat Zurück und Logo im Kopf.
 * PC: Seitenmenü links (Büro).
 */
export function AppLayout() {
  const pc = useIstPc();

  if (!pc) return <Outlet />;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
