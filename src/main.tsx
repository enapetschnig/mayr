import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { farbenAnwenden } from "./kunde.config";
import { installationBeobachten } from "./lib/installieren";
import "./index.css";

// Hauptfarbe aus kunde.config.ts anwenden, bevor die App rendert.
farbenAnwenden();

// Chrome bietet die Installation nur EINMAL kurz nach dem Laden an —
// deshalb schon hier zuhören, nicht erst im Dialog.
installationBeobachten();

createRoot(document.getElementById("root")!).render(<App />);
