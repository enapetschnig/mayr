import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hauptbild eines Artikels als Vorschaubild (Adresse aus `useHauptbilder`).
 * Ohne Bild ein leeres Feld — die Zeilen bleiben gleich ausgerichtet.
 */
export function ArtikelVorschau({ url, groesse = "mittel", className }: { url: string | undefined; groesse?: "klein" | "mittel"; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40",
      groesse === "klein" ? "h-10 w-10" : "h-14 w-14", className)}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff className="h-4 w-4 text-muted-foreground/40" />}
    </span>
  );
}
