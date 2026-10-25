import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

// Eigene Konfiguration, damit die Tests nicht die PWA-/HTML-Plugins aus
// vite.config.ts laden. .claude/ enthält Worktrees der Agenten — nicht mittesten.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
