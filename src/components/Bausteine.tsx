import { Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Firma, Sichtbarkeit } from "@/lib/types";

/** Farbpunkt + Kurzname einer Firma — überall, wo "wer war das?" zählt. */
export function FirmaBadge({ firma, className, lang = false }: { firma?: Firma | null; className?: string; lang?: boolean }) {
  if (!firma) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", className)}
      style={{ borderColor: `${firma.farbe}55`, backgroundColor: `${firma.farbe}12`, color: firma.farbe }}
    >
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: firma.farbe }} />
      {lang ? firma.name : firma.kurzname}
    </span>
  );
}

/** Kleines Abzeichen: Nur ich / Für alle */
export function SichtbarkeitBadge({ wert, className }: { wert: string; className?: string }) {
  const gemeinsam = wert === "gemeinsam";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        gemeinsam ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {gemeinsam ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      {gemeinsam ? "Für alle" : "Nur ich"}
    </span>
  );
}

/**
 * Die eine Frage, die in dieser App überall gestellt wird: Wer sieht das?
 * Zwei große Knöpfe statt eines Schalters — am Handy mit dem Daumen
 * eindeutig zu treffen, und man sieht sofort, was gilt.
 */
export function SichtbarkeitWahl({
  wert,
  onChange,
  textPrivat = "Nur ich",
  textGemeinsam = "Für alle",
  hinweisPrivat = "Nur meine Firma sieht das",
  hinweisGemeinsam = "Alle drei Firmen sehen das",
  gesperrt,
}: {
  wert: Sichtbarkeit;
  onChange: (w: Sichtbarkeit) => void;
  textPrivat?: string;
  textGemeinsam?: string;
  hinweisPrivat?: string;
  hinweisGemeinsam?: string;
  gesperrt?: boolean;
}) {
  const knopf = (w: Sichtbarkeit, text: string, hinweis: string, Icon: typeof Lock) => (
    <button
      type="button"
      disabled={gesperrt}
      onClick={() => onChange(w)}
      className={cn(
        "flex flex-1 items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60",
        wert === w ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      <div className={cn("h-9 w-9 shrink-0 rounded-full flex items-center justify-center",
        wert === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{text}</p>
        <p className="text-xs text-muted-foreground">{hinweis}</p>
      </div>
    </button>
  );
  return (
    <div className="flex gap-2">
      {knopf("privat", textPrivat, hinweisPrivat, Lock)}
      {knopf("gemeinsam", textGemeinsam, hinweisGemeinsam, Users)}
    </div>
  );
}

/** Kennzahl-Kachel */
export function Kennzahl({ titel, wert, unter, className }: { titel: string; wert: string; unter?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3 sm:p-4", className)}>
      <p className="text-xs text-muted-foreground">{titel}</p>
      <p className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5">{wert}</p>
      {unter && <p className="text-xs text-muted-foreground mt-0.5">{unter}</p>}
    </div>
  );
}

/** Leerer Zustand mit Symbol und optionaler Aktion */
export function Leer({ icon: Icon, text, children }: { icon: typeof Lock; text: string; children?: React.ReactNode }) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
