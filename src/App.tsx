import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { SitzungProvider } from "@/hooks/useSitzung";
import { InstallHinweis } from "@/components/Installieren";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Seltener besuchte Seiten erst bei Bedarf laden — kleinerer Start am Handy
const Projekte = lazy(() => import("./pages/Projekte"));
const ProjektDetail = lazy(() => import("./pages/ProjektDetail"));
const Zeiten = lazy(() => import("./pages/Zeiten"));
const Kalender = lazy(() => import("./pages/Kalender"));
const Scan = lazy(() => import("./pages/Scan"));
const Anlagen = lazy(() => import("./pages/Anlagen"));
const AnlageDetail = lazy(() => import("./pages/AnlageDetail"));
const PruefungSeite = lazy(() => import("./pages/PruefungSeite"));
const Lager = lazy(() => import("./pages/Lager"));
const Regieberichte = lazy(() => import("./pages/Regieberichte"));
const RegieDetail = lazy(() => import("./pages/RegieDetail"));
const Belege = lazy(() => import("./pages/Belege"));
const BelegDetail = lazy(() => import("./pages/BelegDetail"));
const Kunden = lazy(() => import("./pages/Kunden"));
const ArtikelSeite = lazy(() => import("./pages/Artikel"));
const Leistungen = lazy(() => import("./pages/Leistungen"));
const Auswertung = lazy(() => import("./pages/Auswertung"));
const Einstellungen = lazy(() => import("./pages/Einstellungen"));
const Handyansicht = lazy(() => import("./pages/Handyansicht"));
const Eingang = lazy(() => import("./pages/Eingang"));
const OffenePosten = lazy(() => import("./pages/OffenePosten"));
const Buchhaltung = lazy(() => import("./pages/Buchhaltung"));
const Plantafel = lazy(() => import("./pages/Plantafel"));
const Fuhrpark = lazy(() => import("./pages/Fuhrpark"));
const Lieferscheine = lazy(() => import("./pages/Lieferscheine"));
const Bestellungen = lazy(() => import("./pages/Bestellungen"));
const BestellungDetail = lazy(() => import("./pages/BestellungDetail"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** Neu vs. vorhanden: eigener Schlüssel, damit der Editor frisch startet. */
function BelegSeite() {
  const { id } = useParams();
  return <BelegDetail key={id ?? "neu"} />;
}
function RegieSeite() {
  const { id } = useParams();
  return <RegieDetail key={id ?? "neu"} />;
}

const Laedt = () => <div className="flex min-h-screen items-center justify-center text-muted-foreground">Lädt…</div>;
const S = ({ children, chef = false }: { children: React.ReactNode; chef?: boolean }) => (
  <ProtectedRoute nurChef={chef}><Suspense fallback={<Laedt />}>{children}</Suspense></ProtectedRoute>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster position="top-center" />
        <BrowserRouter>
          <SitzungProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<S><Index /></S>} />
                <Route path="/projekte" element={<S><Projekte /></S>} />
                <Route path="/projekte/:id" element={<S><ProjektDetail /></S>} />
                <Route path="/zeiten" element={<S><Zeiten /></S>} />
                <Route path="/kalender" element={<S><Kalender /></S>} />
                <Route path="/plantafel" element={<S><Plantafel /></S>} />
                <Route path="/fuhrpark" element={<S><Fuhrpark /></S>} />
                <Route path="/lieferscheine" element={<S><Lieferscheine /></S>} />
                <Route path="/scan" element={<S><Scan /></S>} />
                <Route path="/lager" element={<S><Lager /></S>} />
                <Route path="/bestellungen" element={<S chef><Bestellungen /></S>} />
                <Route path="/bestellungen/:id" element={<S chef><BestellungDetail /></S>} />
                <Route path="/anlagen" element={<S><Anlagen /></S>} />
                <Route path="/anlagen/:id" element={<S><AnlageDetail /></S>} />
                <Route path="/pruefungen/:id" element={<S><PruefungSeite /></S>} />
                <Route path="/regie" element={<S><Regieberichte /></S>} />
                <Route path="/regie/neu" element={<S><RegieSeite /></S>} />
                <Route path="/regie/:id" element={<S><RegieSeite /></S>} />
                <Route path="/belege" element={<S chef><Belege /></S>} />
                <Route path="/belege/neu" element={<S chef><BelegSeite /></S>} />
                <Route path="/belege/:id" element={<S chef><BelegSeite /></S>} />
                <Route path="/eingang" element={<S chef><Eingang /></S>} />
                <Route path="/offene-posten" element={<S chef><OffenePosten /></S>} />
                <Route path="/buchhaltung" element={<S chef><Buchhaltung /></S>} />
                <Route path="/kunden" element={<S><Kunden /></S>} />
                <Route path="/artikel" element={<S><ArtikelSeite /></S>} />
                <Route path="/leistungen" element={<S chef><Leistungen /></S>} />
                <Route path="/auswertung" element={<S chef><Auswertung /></S>} />
                <Route path="/einstellungen" element={<S><Einstellungen /></S>} />
                <Route path="/handyansicht" element={<S><Handyansicht /></S>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            <InstallHinweis />
          </SitzungProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
