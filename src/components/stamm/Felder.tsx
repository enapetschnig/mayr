import { useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Formular beim Öffnen (oder beim Wechsel des Datensatzes) frisch befüllen —
 * noch im selben Render statt in einem Effekt. Sonst steht für einen
 * Augenblick der alte Inhalt im Formular, und eine schnelle Eingabe landet
 * auf den alten Werten. `schluessel` = null heißt geschlossen.
 */
export function useBeimOeffnen(schluessel: string | null, fuellen: () => void) {
  const [vorher, setVorher] = useState<string | null>(null);
  if (schluessel !== vorher) {
    setVorher(schluessel);
    if (schluessel !== null) fuellen();
  }
}

/** Beschriftung + Eingabe + optionaler Hinweis darunter — überall gleich. */
export function Feld({
  id, label, hinweis, children, className,
}: { id?: string; label: ReactNode; hinweis?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hinweis && <div className="text-xs text-muted-foreground">{hinweis}</div>}
    </div>
  );
}

/** Zahl fürs Eingabefeld: 12.5 → „12,5“, leer bleibt leer */
export const zahlFeld = (n: number | null | undefined) => (n == null ? "" : String(Number(n)).replace(".", ","));

export const leerNull = (s: string | null | undefined) => (s ?? "").trim() || null;

/** Kleiner Zusatz in der Beschriftung, z. B. „(optional)“ */
export const Zusatz = ({ children }: { children: ReactNode }) => (
  <span className="font-normal text-muted-foreground"> {children}</span>
);
