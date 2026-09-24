import { useEffect, useState, type ReactNode } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { DenszLogo } from "../brand/DenszLogo";

const INTERVALO_REINTENTO_MS = 3000;

/**
 * Antes de mostrar cualquier pantalla que dependa de la base (Login
 * incluido), confirma que Supabase responde. A diferencia de SQLite
 * (siempre local, siempre disponible), acá la conexión depende de
 * internet — así que el arranque puede legítimamente tener que esperar o
 * reintentar, y el usuario necesita ver que eso está pasando en vez de
 * quedarse mirando una pantalla en blanco o un error críptico.
 */
export function ConexionGate({ children }: { children: ReactNode }) {
  const [conectado, setConectado] = useState(false);
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    if (typeof window.densz === "undefined") {
      // Fuera de Electron (ej. `vite` solo en el navegador durante
      // desarrollo del renderer) — no hay nada que esperar.
      setConectado(true);
      return;
    }

    let cancelado = false;

    async function intentarConexion(): Promise<void> {
      try {
        const ok = await window.densz.ping();
        if (cancelado) return;
        if (ok) {
          setConectado(true);
          return;
        }
      } catch {
        // sigue reintentando
      }
      if (cancelado) return;
      setIntentos((n) => n + 1);
      setTimeout(intentarConexion, INTERVALO_REINTENTO_MS);
    }

    intentarConexion();
    return () => {
      cancelado = true;
    };
  }, []);

  if (conectado) return <>{children}</>;

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center gap-6 px-6 text-center">
      <DenszLogo height={64} />
      {intentos === 0 ? (
        <div className="flex items-center gap-2 text-white/70">
          <Loader2 size={18} className="animate-spin" />
          <span>Conectando con la base de datos…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/70 max-w-sm">
          <CloudOff size={22} />
          <p>No se pudo conectar con la base de datos. Verificá tu conexión a internet.</p>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 size={14} className="animate-spin" />
            <span>Reintentando…</span>
          </div>
        </div>
      )}
    </div>
  );
}
