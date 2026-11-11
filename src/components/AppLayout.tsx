import { useEffect, useState, type CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Seitenleiste, gemerktOffen, merkeOffen } from "@/components/rahmen/Seitenleiste";
import { Suchpalette } from "@/components/rahmen/Suchpalette";
import { NeuRahmen } from "@/components/rahmen/NeuMenue";

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

/** Ab 768 px (Tablet) gibt es die Seitenleiste — dort immer schmal, nur Symbole. */
export function useHatSeitenleiste() {
  const [ja, setJa] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const aendern = () => setJa(mql.matches);
    mql.addEventListener("change", aendern);
    aendern();
    return () => mql.removeEventListener("change", aendern);
  }, []);
  return ja;
}

const BREITEN = { "--sidebar-width": "15rem", "--sidebar-width-icon": "3.5rem" } as CSSProperties;

/**
 * Rahmen nach dem Vorbild Lengauer Stockner:
 *  - Handy (unter 768 px): kein Seitenmenü, keine Leiste unten. Die Startseite
 *    IST das Menü, jede Unterseite hat Zurück und Logo im Kopf.
 *  - Tablet (768–1023 px): schmale Leiste mit Symbolen.
 *  - PC (ab 1024 px): helle Seitenleiste, 240 px, einklappbar (gemerkt).
 * Suche (Strg+K, am Handy die Lupe) und „+ Neu“ gibt es auf jeder Breite.
 * Der Baum bleibt beim Drehen gleich — die Leiste wird nur ein- oder
 * ausgehängt, ein offenes Formular bleibt erhalten.
 */
export function AppLayout() {
  const pc = useIstPc();
  const leiste = useHatSeitenleiste();
  const [offen, setOffen] = useState(gemerktOffen);

  return (
    <SidebarProvider style={BREITEN} open={pc ? offen : false}
      onOpenChange={(o) => { if (pc) { setOffen(o); merkeOffen(o); } }}>
      {leiste ? <Seitenleiste festSchmal={!pc} /> : null}
      <Suchpalette />
      <NeuRahmen />
      {/* min-w-0: breite Tabellen scrollen in sich, statt die Seite neben dem Menü aufzuschieben */}
      <SidebarInset className="min-w-0 bg-background">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
