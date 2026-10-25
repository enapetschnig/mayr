import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BELEG_STATUS, PROJEKT_STATUS, REGIE_STATUS, TON_KLASSE, kuerzel, name,
  type Profil, type ProjektStatus, type StatusEintrag,
} from "@/lib/types";

type Icon = ComponentType<{ className?: string }>;

/** Kennzahl-Kachel: Beschriftung klein, Wert groß */
export function Kennzahl({ titel, wert, unter, className, icon: I }: { titel: string; wert: string; unter?: string; className?: string; icon?: Icon }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3.5 lg:p-4", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {I && <I className="h-3.5 w-3.5" />}{titel}
      </div>
      <p className="zahl mt-1 text-xl font-bold tracking-tight lg:text-2xl">{wert}</p>
      {unter && <p className="mt-0.5 text-xs text-muted-foreground">{unter}</p>}
    </div>
  );
}

/** Leerer Zustand mit Symbol und optionaler Aktion */
export function Leer({ icon: I, text, children, className }: { icon: Icon; text: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("py-10 text-center text-muted-foreground", className)}>
      <I className="mx-auto mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Status-Pille: Pastellfläche, dunkle Schrift, voll gerundet. Farbe aus EINER Tabelle (lib/types.ts). */
export function StatusPille({ eintrag, className }: { eintrag: StatusEintrag | undefined; className?: string }) {
  if (!eintrag) return null;
  return (
    <span className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
      TON_KLASSE[eintrag.ton], eintrag.durchgestrichen && "line-through", className,
    )}>
      {eintrag.text}
    </span>
  );
}

/** Status eines Angebots/einer Rechnung */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <StatusPille eintrag={BELEG_STATUS[status] ?? { ton: "grau", text: status }} className={className} />;
}

/** Status eines Projekts */
export function ProjektStatusBadge({ status, className }: { status: string; className?: string }) {
  return <StatusPille eintrag={PROJEKT_STATUS[status as ProjektStatus] ?? { ton: "grau", text: status }} className={className} />;
}

/** Status eines Regieberichts — verrechnet geht vor unterschrieben */
export function RegieStatusBadge({ status, verrechnet, className }: { status: string; verrechnet?: boolean; className?: string }) {
  return <StatusPille eintrag={REGIE_STATUS[verrechnet ? "verrechnet" : status] ?? { ton: "grau", text: status }} className={className} />;
}

/** Runder Kreis mit Initialen in der Mitarbeiterfarbe */
export function Avatar({ profil, className }: { profil: Pick<Profil, "vorname" | "nachname" | "farbe"> | null | undefined; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", className)}
      style={{ backgroundColor: profil?.farbe || "hsl(var(--muted-foreground))" }}
      title={name(profil)}
    >
      {kuerzel(profil)}
    </span>
  );
}

/** Aktionskachel (Projekt, Schnellaktionen) — Symbol, Titel, optional Untertitel */
export function AktionsKachel({
  icon: I, titel, unter, to, onClick, ton = "standard", className,
}: {
  icon: Icon;
  titel: string;
  unter?: string;
  to?: string;
  onClick?: () => void;
  ton?: "standard" | "primaer";
  className?: string;
}) {
  const inhalt = (
    <>
      <span className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
        ton === "primaer" ? "bg-white/15 text-primary-foreground" : "bg-primary-soft text-primary",
      )}>
        <I className="h-5 w-5" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block font-semibold leading-tight">{titel}</span>
        {unter && <span className={cn("mt-0.5 block truncate text-xs", ton === "standard" ? "text-muted-foreground" : "opacity-80")}>{unter}</span>}
      </span>
    </>
  );
  const klasse = cn(
    "flex min-h-14 items-center gap-3 rounded-lg p-3 transition-colors active:scale-[0.99]",
    ton === "primaer" ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border bg-card hover:border-primary/50",
    className,
  );
  return to ? <Link to={to} className={klasse}>{inhalt}</Link> : <button type="button" onClick={onClick} className={klasse}>{inhalt}</button>;
}

/** Listenzeile mit Pfeil — für Projekte, Belege, Regieberichte */
export function ListenZeile({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn("flex items-center gap-3 rounded-lg border bg-card p-3.5 transition-colors hover:border-primary/50 active:bg-muted/40", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Abschnittsüberschrift mit optionaler Aktion rechts */
export function Abschnitt({ titel, aktion, children, className }: { titel: string; aktion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold">{titel}</h2>
        {aktion}
      </div>
      {children}
    </section>
  );
}

/** Weiße Karte mit Titel und optional „Alle anzeigen →“ */
export function Karte({
  titel, alle, aktion, children, className, ohnePolster = false,
}: {
  titel?: string;
  alle?: { text?: string; to: string };
  aktion?: ReactNode;
  children: ReactNode;
  className?: string;
  ohnePolster?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(titel || alle || aktion) && (
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5 lg:px-5">
          {titel && <h2 className="text-[0.9375rem] font-semibold">{titel}</h2>}
          {alle && (
            <Link to={alle.to} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              {alle.text ?? "Alle anzeigen"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          {aktion}
        </div>
      )}
      <div className={cn(!ohnePolster && "px-4 pb-4 lg:px-5", ohnePolster && "pb-1")}>{children}</div>
    </section>
  );
}

/** Kleine Überschrift in Großbuchstaben (Gruppen auf der Startseite, Formularabschnitte) */
export function Gruppentitel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground", className)}>{children}</h2>;
}
