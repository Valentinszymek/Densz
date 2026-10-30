import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "./components/ui/Tooltip";
import { Toaster } from "./components/ui/Toast";
import { AppRouter } from "./app/router";
import { useAuthStore } from "./store/authStore";
import { DenszLogo } from "./components/brand/DenszLogo";
import { ConexionGate } from "./components/system/ConexionGate";
import { ActualizacionBanner } from "./components/system/ActualizacionBanner";

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

  // Solo escritorio en la práctica (no-op en web, ver webApi.ts): si el
  // backend deja de reconocer la sesión a mitad de uso (ej. Railway se
  // reinició), vuelve directo a la pantalla de login en vez de quedarse
  // fallando en silencio en la pantalla donde estaba.
  useEffect(() => {
    if (typeof window.densz === "undefined") return;
    return window.densz.onSesionExpirada(() => setSesion(null));
  }, [setSesion]);

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
        <ActualizacionBanner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
