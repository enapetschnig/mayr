import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { FEHLER_DAUER_MS, fehlerDeutsch } from "@/lib/fehlerDeutsch";

// Jede Fehlermeldung auf Deutsch („Failed to fetch“ → „Keine Verbindung …“) und
// länger sichtbar als die kurzen Erfolgsmeldungen — einmal hier statt an 60 Stellen
const fehlerOriginal = toast.error;
toast.error = ((nachricht, daten) => fehlerOriginal(
  typeof nachricht === "string" ? fehlerDeutsch(nachricht) : nachricht,
  { duration: FEHLER_DAUER_MS, ...daten, description: typeof daten?.description === "string" ? fehlerDeutsch(daten.description) : daten?.description },
)) as typeof toast.error;

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={1500}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
