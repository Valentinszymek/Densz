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

// Solo web (pedido explícito, 2026-11-04): la cookie de sesión dura
// hasta que se cierra el navegador ENTERO (ver auth.route.ts), así que
// cerrar nada más que esta pestaña y abrir una nueva la deja viva —
// ningún sitio puede distinguir "cerraste la pestaña" de "recargaste la
// página" (F5) con un evento de JS, pero `sessionStorage` sí hace esa
// distinción solo con CÓMO funciona: sobrevive un F5 de la MISMA
// pestaña, pero nace vacía en cualquier pestaña nueva. Se usa esa marca
// para decidir si confiar en la cookie o no, en vez de un evento.
const MARCA_SESION_PESTANA = "densz.sesion.pestanaActiva";

function haySesionEnEstaPestana(): boolean {
  try {
    return sessionStorage.getItem(MARCA_SESION_PESTANA) === "1";
  } catch {
    // Sin sessionStorage disponible (ventana privada, storage bloqueado):
    // se cae al comportamiento de siempre (confiar en la cookie) — más
    // simple que bloquear el login entero por esto.
    return true;
  }
}

function marcarSesionEnEstaPestana(): void {
  try {
    sessionStorage.setItem(MARCA_SESION_PESTANA, "1");
  } catch {
    // Ver comentario arriba.
  }
}

function SesionInicial({ children }: { children: ReactNode }) {
  const cargando = useAuthStore((s) => s.cargando);
  const sesion = useAuthStore((s) => s.sesion);
  const setSesion = useAuthStore((s) => s.setSesion);
  const setCargando = useAuthStore((s) => s.setCargando);
  const esEscritorio = typeof window.densz !== "undefined" && window.densz.plataforma === "escritorio";

  useEffect(() => {
    if (typeof window.densz === "undefined") {
      setCargando(false);
      return;
    }
    // En escritorio esto no aplica: ahí "recordar la sesión entre
    // reinicios" es una función aparte, ya pedida explícitamente (ver
    // googleOAuthDesktop.ts) — nunca tocarla acá.
    if (!esEscritorio && !haySesionEnEstaPestana()) {
      setSesion(null);
      setCargando(false);
      return;
    }
    window.densz
      .authSesionActual()
      .then(setSesion)
      .catch(() => setSesion(null))
      .finally(() => setCargando(false));
  }, [esEscritorio, setSesion, setCargando]);

  // Apenas esta pestaña tiene una sesión real (login recién hecho, o una
  // ya restaurada arriba porque la marca seguía puesta), se marca — así
  // un F5 de ESTA MISMA pestaña la sigue reconociendo después.
  useEffect(() => {
    if (sesion && !esEscritorio) marcarSesionEnEstaPestana();
  }, [sesion, esEscritorio]);

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
