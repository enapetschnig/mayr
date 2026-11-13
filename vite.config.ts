import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { KUNDE } from "./src/kunde.config";

// Build-Kennung: dieselbe steckt in der App (__APP_BUILD__) und in /version.json —
// weicht sie ab, zeigt die App „Neue Version — Jetzt aktualisieren“ (UpdateHinweis).
const BUILD = new Date().toISOString().slice(0, 19).replace("T", " ");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Build-Zeitstempel als App-Version.
  // Wird u. a. bei Änderungswünschen mitgeschickt, damit nachvollziehbar ist,
  // welcher Stand beim Melder lief.
  define: {
    __APP_BUILD__: JSON.stringify(BUILD),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // Ersetzt die Platzhalter in index.html durch die Kundendaten.
    // Ohne das müsste man den Titel an vier Stellen von Hand pflegen.
    {
      name: "kunde-html",
      transformIndexHtml(html: string) {
        const titel = KUNDE.slogan ? `${KUNDE.firma} — ${KUNDE.slogan}` : KUNDE.firma;
        const beschreibung = `Projekte, Stunden, Material und Rechnungen — ${KUNDE.firma} & Partner`;
        return html
          .replaceAll("%KUNDE_TITEL%", titel)
          .replaceAll("%KUNDE_KURZNAME%", KUNDE.kurzname)
          .replaceAll("%KUNDE_FIRMA%", KUNDE.firma)
          .replaceAll("%KUNDE_BESCHREIBUNG%", beschreibung)
          .replaceAll("%KUNDE_FARBE%", KUNDE.farben.primaryHex);
      },
    }, 
    {
      name: "version-json",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) });
      },
    },
    VitePWA({
      // prompt: der neue Stand wartet, bis man „Jetzt aktualisieren“ tippt (UpdateHinweis)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        // Alles aus src/kunde.config.ts — hier nichts hart eintragen.
        name: KUNDE.slogan ? `${KUNDE.firma} — ${KUNDE.slogan}` : KUNDE.firma,
        short_name: KUNDE.kurzname,
        description: `Projekte, Stunden, Material und Rechnungen — ${KUNDE.firma}`,
        // Kopfleiste der installierten App im SETEC-Schwarz wie Logo und Website
        theme_color: '#121110',
        background_color: '#121110',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Größere schwere Libs in eigene Chunks → kleinerer First-Load.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("pdfjs-dist")) return "pdf";
          if (id.includes("xlsx") || id.includes("xlsx-js-style")) return "xlsx";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("date-fns")) return "date-fns";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
