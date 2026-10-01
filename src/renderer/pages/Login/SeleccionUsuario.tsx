import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { formatearRol } from "../../lib/format";
import type { UsuarioParaSeleccion } from "@shared/types/entities";

function TarjetaUsuario({ usuario, onClick }: { usuario: UsuarioParaSeleccion; onClick: () => void }) {
  const inicial = usuario.nombreCompleto.trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-xl border border-cream/10 bg-cream/[0.03] hover:bg-cream/[0.06] hover:border-gold/40 transition-colors px-6 py-6 w-40 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold text-2xl font-semibold">
        {inicial}
      </span>
      <div className="text-center min-w-0 w-full">
        <p className="text-sm font-medium text-cream truncate">{usuario.nombreCompleto}</p>
        <p className="text-xs text-cream/40 font-mono truncate">@{usuario.nombreUsuario}</p>
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
    </div>
  );
}
