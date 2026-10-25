import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KUNDE } from "@/kunde.config";

interface PageHeaderProps {
  title?: string;
  /** Kleine Zeile unter dem Titel (Projektnummer, Kunde …) */
  untertitel?: ReactNode;
  showBackButton?: boolean;
  backPath?: string;
  /** Knöpfe rechts im Kopf */
  aktionen?: ReactNode;
}

/** Seitenkopf: Zurück, Logo (führt zur Startseite), Titel, Aktionen rechts. */
export function PageHeader({ title, untertitel, showBackButton = true, backPath, aktionen }: PageHeaderProps) {
  const navigate = useNavigate();

  const zurueck = () => {
    if (backPath) navigate(backPath);
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 border-b bg-card" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-1 px-2 py-1.5 sm:px-4 lg:px-6">
        {showBackButton && (
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={zurueck} aria-label="Zurück">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <Link to="/" className="mr-1.5 shrink-0 lg:hidden" aria-label="Zur Startseite">
          <img src={KUNDE.logo} alt="" className="h-8 w-8 rounded-md" />
        </Link>
        <div className={cn("min-w-0 flex-1", !showBackButton && "pl-1")}>
          {title && <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">{title}</h1>}
          {untertitel && <div className="truncate text-xs text-muted-foreground">{untertitel}</div>}
        </div>
        {aktionen && <div className="flex shrink-0 items-center gap-1.5">{aktionen}</div>}
      </div>
    </header>
  );
}

/**
 * Seite = Kopf + Inhalt mit einheitlichen Rändern. Jede Seite der App
 * benutzt das, damit Abstände und Breiten überall gleich sind.
 */
export function Seite({
  titel, untertitel, zurueck = true, zurueckPfad, aktionen, children, className, breit = false,
}: {
  titel: string;
  untertitel?: ReactNode;
  zurueck?: boolean;
  zurueckPfad?: string;
  aktionen?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Tabellenseiten am PC: volle Breite statt 72rem */
  breit?: boolean;
}) {
  return (
    <div className="min-h-screen">
      <PageHeader title={titel} untertitel={untertitel} showBackButton={zurueck} backPath={zurueckPfad} aktionen={aktionen} />
      <main
        className={cn("mx-auto w-full space-y-5 px-3 py-4 sm:px-4 lg:px-6 lg:py-6", breit ? "max-w-[96rem]" : "max-w-6xl", className)}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
