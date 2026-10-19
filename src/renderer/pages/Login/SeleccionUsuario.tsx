import { useState } from "react";
import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { formatearRol } from "../../lib/format";
import { supabaseAuthDisponible, iniciarLoginGoogle } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";
import type { UsuarioParaSeleccion } from "@shared/types/entities";

function TarjetaUsuario({ usuario, onClick }: { usuario: UsuarioParaSeleccion; onClick: () => void }) {
  const inicial = usuario.nombreCompleto.trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-xl border border-cream/10 bg-cream/[0.03] hover:bg-cream/[0.06] hover:border-gold/40 transition-colors px-6 py-6 w-40 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold text-2xl"
        style={{ fontFamily: '"Densz Avatar", "Inter", system-ui, sans-serif', fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        {inicial}
      </span>
      <div className="text-center min-w-0 w-full">
        <p className="text-sm font-medium text-cream truncate">{usuario.nombreCompleto}</p>
        <p className="text-xs text-cream/40 truncate">@{usuario.nombreUsuario}</p>
        <p className="text-[10px] uppercase tracking-wide text-gold-dim mt-1.5">{formatearRol(usuario.rolNombre)}</p>
      </div>
    </button>
  );
}

/** Paso 1 del login: "¿Quién va a utilizar Densz?" — los usuarios salen
 * dinámicamente de la base (solo activos), nunca hardcodeados. Funciona
 * igual con 1 usuario que con 10: se acomodan en una grilla que envuelve
 * y hace scroll interno si no entran todos en alto. */
export function SeleccionUsuario({ onSeleccionar }: { onSeleccionar: (u: UsuarioParaSeleccion) => void }) {
  const { data: usuarios, isLoading } = useUsuariosDisponibles();
  const setSesion = useAuthStore((s) => s.setSesion);
  const [errorGoogle, setErrorGoogle] = useState<string | null>(null);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Se lee en cada render (nunca a nivel de módulo): en la web,
  // `window.densz` recién se asigna (main.web.tsx) después de que este
  // módulo se evalúa, así que leerlo al importar rompería ese build.
  const esEscritorio = window.densz.plataforma === "escritorio";

  async function onClickGoogle() {
    setErrorGoogle(null);
    setCargandoGoogle(true);
    try {
      if (esEscritorio) {
        // Acá no hay redirect de pestaña: authLoginGoogle abre el
        // navegador del sistema, espera, y devuelve la sesión real ya
        // armada — se fija directo, sin pasar por ningún callback.
        const sesion = await window.densz.authLoginGoogle();
        setSesion(sesion);
        setCargandoGoogle(false);
      } else {
        await iniciarLoginGoogle(); // redirige la pestaña — si resuelve sin redirigir, algo falló (deja "Redirigiendo…" hasta que la página se vaya)
      }
    } catch (err) {
      setErrorGoogle(err instanceof Error ? err.message : "No se pudo iniciar el login con Google.");
      setCargandoGoogle(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={120} className="mb-10" />
      <h1 className="text-cream/80 text-lg font-medium mb-8 text-center">¿Quién va a utilizar Densz?</h1>

      {isLoading && <p className="text-cream/40 text-sm">Cargando usuarios…</p>}

      {!isLoading && usuarios?.length === 0 && (
        <p className="text-cream/40 text-sm max-w-sm text-center">
          No hay usuarios activos para iniciar sesión. Contactá a un administrador de este Densz.
        </p>
      )}

      {!isLoading && !!usuarios?.length && (
        <div className="flex flex-wrap justify-center gap-4 max-w-3xl max-h-[55vh] overflow-y-auto scrollbar-invisible px-2 py-2">
          {usuarios.map((u) => (
            <TarjetaUsuario key={u.id} usuario={u} onClick={() => onSeleccionar(u)} />
          ))}
        </div>
      )}

      {/* En web, solo se muestra si el entorno tiene Supabase Auth
          configurado (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) — nunca un
          botón que lleva a un error garantizado si todavía no se cargaron
          esas variables (ver supabaseClient.ts). En escritorio siempre se
          muestra: el login con Google lo resuelve enteramente el proceso
          main (googleOAuthDesktop.ts), sin depender de esas variables acá. */}
      {(supabaseAuthDisponible || esEscritorio) && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 text-cream/25 text-xs w-64">
            <span className="h-px flex-1 bg-cream/10" />o<span className="h-px flex-1 bg-cream/10" />
          </div>
          <button
            type="button"
            onClick={onClickGoogle}
            disabled={cargandoGoogle}
            className="flex items-center gap-2 rounded-lg border border-cream/15 bg-cream/[0.03] hover:bg-cream/[0.06] px-5 py-2.5 text-sm text-cream/80 disabled:opacity-50"
          >
            {cargandoGoogle ? (esEscritorio ? "Esperando el navegador…" : "Redirigiendo…") : "Continuar con Google"}
          </button>
          {errorGoogle && <p className="text-red-400 text-xs max-w-sm text-center">{errorGoogle}</p>}
        </div>
      )}
    </div>
  );
}
