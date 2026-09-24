import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "./components/ui/Tooltip";
import { Toaster } from "./components/ui/Toast";
import { AppRouter } from "./app/router";
import { useAuthStore } from "./store/authStore";
import { DenszLogo } from "./components/brand/DenszLogo";
import { ConexionGate } from "./components/system/ConexionGate";

function Splash() {
  return (
    <div className="min-h-screen bg-carbon flex items-center justify-center">
      <DenszLogo height={80} />
    </div>
  );
}

function SesionInicial({ children }: { children: ReactNode }) {
  const cargando = useAuthStore((s) => s.cargando);
  const setSesion = useAuthStore((s) => s.setSesion);
  const setCargando = useAuthStore((s) => s.setCargando);

  useEffect(() => {
    if (typeof window.densz === "undefined") {
      setCargando(false);
      return;
    }
    window.densz
      .authSesionActual()
      .then(setSesion)
      .catch(() => setSesion(null))
      .finally(() => setCargando(false));
  }, [setSesion, setCargando]);

  if (cargando) return <Splash />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConexionGate>
          <SesionInicial>
            <AppRouter />
          </SesionInicial>
        </ConexionGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
