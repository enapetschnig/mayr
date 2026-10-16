import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { farbenAnwenden } from "./kunde.config";
import "./index.css";

// Hauptfarbe aus kunde.config.ts anwenden, bevor die App rendert.
farbenAnwenden();

createRoot(document.getElementById("root")!).render(<App />);
