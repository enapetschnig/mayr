import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Formulardialog für Handy, Tablet und PC.
 *
 * Drei Dinge, die auf der Baustelle den Unterschied machen:
 *
 *  1. Das Formular füllt den Bildschirm. Auf jedem Gerät, oben unten links
 *     rechts, ohne Ausnahme — auch am Rechner. Ein Regiebericht in einem
 *     Kästchen mitten am Schirm ist mit einer Hand nicht zu bedienen.
 *
 *  2. Kopf und Fuß stehen fest, nur die Mitte scrollt. Der Speichern-Knopf
 *     ist damit IMMER sichtbar — man kann ihn nicht wegscrollen und man muss
 *     ihn nicht suchen.
 *
 *  3. Der Fuß hat Abstand nach unten (safe-area), damit der Knopf nicht unter
 *     der Gestensteuerung des iPhones klebt.
 */

export interface FormularDialogProps {
  open: boolean;
  onOpenChange: (offen: boolean) => void;
  titel: string;
  beschreibung?: string;
  children: ReactNode;
  /** Knöpfe im festen Fuß. Ohne sie entfällt der Fuß. */
  fuss?: ReactNode;
  /**
   * Wie breit der Inhalt höchstens läuft — greift erst auf sehr großen
   * Schirmen. Das Fenster selbst ist immer bildschirmfüllend; nur ein
   * einzelnes Eingabefeld über einen ganzen Breitbildschirm liest sich
   * schlecht. Auf Handy, Tablet und jedem üblichen Laptop ist keine dieser
   * Grenzen erreicht, dort läuft der Inhalt über die volle Breite.
   */
  breite?: "normal" | "breit" | "sehr-breit";
  /** Schließen unterbinden, solange gespeichert wird. */
  gesperrt?: boolean;
  /**
   * Der Inhalt füllt die Höhe aus, statt zu scrollen — für Ansichten, die
   * sich einpassen müssen statt zu wachsen (eine Zeichenfläche etwa).
   */
  fuellend?: boolean;
}

const INHALTSBREITEN = {
  normal: "max-w-[96rem]",
  breit: "max-w-[112rem]",
  /* Zeichnen und Pläne bekommen alles, was da ist. */
  "sehr-breit": "",
};

export function FormularDialog({
  open,
  onOpenChange,
  titel,
  beschreibung,
  children,
  fuss,
  breite = "normal",
  gesperrt = false,
  fuellend = false,
}: FormularDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!gesperrt) onOpenChange(o); }}>
      <DialogContent
        vollbild
        className="flex flex-col"
        onPointerDownOutside={(e) => gesperrt && e.preventDefault()}
        onEscapeKeyDown={(e) => gesperrt && e.preventDefault()}
      >
        {/* Kopf — steht fest, über die ganze Breite */}
        <div className="shrink-0 border-b bg-background">
          <div className={cn("mx-auto flex w-full items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4", INHALTSBREITEN[breite])}>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg sm:text-xl">{titel}</DialogTitle>
              {beschreibung && (
                <DialogDescription className="mt-0.5 text-sm">{beschreibung}</DialogDescription>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 shrink-0"
              onClick={() => onOpenChange(false)}
              disabled={gesperrt}
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Rumpf — der einzige Teil, der scrollt */}
        <div className={cn(
          "flex min-h-0 flex-1 flex-col",
          fuellend ? "overflow-hidden" : "overflow-y-auto overscroll-contain",
        )}>
          <div className={cn(
            "mx-auto w-full px-4 py-4 sm:px-6",
            INHALTSBREITEN[breite],
            fuellend ? "flex min-h-0 flex-1 flex-col" : "space-y-4",
          )}>
            {children}
          </div>
        </div>

        {/* Fuß — steht fest, damit Speichern immer erreichbar bleibt */}
        {fuss && (
          <div
            className="shrink-0 border-t bg-background"
            style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
          >
            <div className={cn("mx-auto flex w-full flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end sm:px-6", INHALTSBREITEN[breite])}>
              {fuss}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FormularDialog;
