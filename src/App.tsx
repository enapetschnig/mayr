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
const MaterialSeite = lazy(() => import("./pages/MaterialSeite"));
const Auswertung = lazy(() => import("./pages/Auswertung"));
const Kalender = lazy(() => import("./pages/Kalender"));
const Belege = lazy(() => import("./pages/Belege"));
const BelegDetail = lazy(() => import("./pages/BelegDetail"));
const Einstellungen = lazy(() => import("./pages/Einstellungen"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** Neuer Beleg vs. vorhandener: eigener Schlüssel, damit der Editor frisch startet. */
function BelegSeite() {
  const { id } = useParams();
  return <BelegDetail key={id ?? "neu"} />;
}

const Laedt = () => <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt…</div>;
const S = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><Suspense fallback={<Laedt />}>{children}</Suspense></ProtectedRoute>
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
                <Route path="/material" element={<S><MaterialSeite /></S>} />
                <Route path="/auswertung" element={<S><Auswertung /></S>} />
                <Route path="/kalender" element={<S><Kalender /></S>} />
                <Route path="/rechnungen" element={<S><Belege /></S>} />
                <Route path="/rechnungen/neu" element={<S><BelegSeite /></S>} />
                <Route path="/rechnungen/:id" element={<S><BelegSeite /></S>} />
                <Route path="/einstellungen" element={<S><Einstellungen /></S>} />
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
