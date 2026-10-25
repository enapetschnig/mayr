import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Hinweis } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";

/** Unbekannte Adresse — alter Link, Tippfehler, gelöschter Eintrag */
export default function NotFound() {
  return (
    <Hinweis
      icon={<SearchX className="h-8 w-8 text-amber-600" />}
      titel="Seite nicht gefunden"
      text="Diese Adresse gibt es in der App nicht — vielleicht ein alter Link oder ein Tippfehler."
    >
      <Button asChild><Link to="/">Zur Startseite</Link></Button>
    </Hinweis>
  );
}
