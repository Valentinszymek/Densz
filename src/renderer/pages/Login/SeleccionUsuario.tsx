import { useState, type FormEvent } from "react";
import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { formatearRol } from "../../lib/format";
import { supabaseAuthDisponible, iniciarSesionConEmailPassword, tomarRegistroPendiente } from "../../lib/supabaseClient";
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
export function SeleccionUsuario({
  onSeleccionar,
  onOlvideContrasena
}: {
  onSeleccionar: (u: UsuarioParaSeleccion) => void;
  onOlvideContrasena: () => void;
}) {
  const { data: usuarios, isLoading } = useUsuariosDisponibles();
  const setSesion = useAuthStore((s) => s.setSesion);
  const [email, setEmail] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [cargandoEmail, setCargandoEmail] = useState(false);
  // Se lee en cada render (nunca a nivel de módulo): en la web,
  // `window.densz` recién se asigna (main.web.tsx) después de que este
  // módulo se evalúa, así que leerlo al importar rompería ese build.
  const esEscritorio = window.densz.plataforma === "escritorio";

  // Login con email+contraseña (cuentas propias de laboratorio, dadas de
  // alta desde RegistroLaboratorio.tsx) — solo tiene sentido en la web,
  // el escritorio sigue sin este camino (ver nota en OlvideContrasena.tsx).
  // Si queda un alta pendiente de confirmación de email para este mismo
  // correo (tomarRegistroPendiente), este primer login exitoso es el que
  // efectivamente crea el laboratorio — mismo patrón que CallbackGoogle.tsx
  // usa para Google, adaptado a que acá no hay redirect de por medio.
  async function onSubmitEmail(e: FormEvent) {
    e.preventDefault();
    setErrorEmail(null);
    setCargandoEmail(true);
    try {
      const accessToken = await iniciarSesionConEmailPassword(email.trim(), passwordEmail);
      const nombrePendiente = tomarRegistroPendiente(email.trim());
      const sesion = nombrePendiente
        ? await window.densz.authRegistrarseConGoogle(nombrePendiente, accessToken)
        : await window.densz.authLoginGoogle(accessToken);
      setSesion(sesion);
    } catch (err) {
      setErrorEmail(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setCargandoEmail(false);
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

      {/* Login con email+contraseña — por seguridad, es el ÚNICO camino
          para el ingreso del día a día (sin "Continuar con Google": ese
          botón quedaba expuesto a que cualquiera con Chrome ya logueado en
          la Google del laboratorio entrara directo, sin contraseña).
          Google sigue existiendo, pero solo para REGISTRAR un laboratorio
          nuevo (ver RegistroLaboratorio.tsx), nunca para este ingreso.
          Solo tiene sentido en la web — en escritorio el ingreso es
          siempre con las tarjetas de arriba + contraseña. */}
      {!esEscritorio && supabaseAuthDisponible && (
        <div className="mt-8 w-full max-w-xs">
          {!!usuarios?.length && (
            <div className="flex items-center gap-3 text-cream/25 text-xs w-full mb-3">
              <span className="h-px flex-1 bg-cream/10" />o<span className="h-px flex-1 bg-cream/10" />
            </div>
          )}
          <form onSubmit={onSubmitEmail} className="w-full flex flex-col gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoFocus
              required
              className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <input
              type="password"
              value={passwordEmail}
              onChange={(e) => setPasswordEmail(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <button
              type="submit"
              disabled={cargandoEmail}
              className="rounded-lg bg-gold text-carbon font-medium px-5 py-2.5 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
            >
              {cargandoEmail ? "Ingresando…" : "Ingresar"}
            </button>
            {errorEmail && <p className="text-red-400 text-xs text-center">{errorEmail}</p>}
            <button
              type="button"
              onClick={onOlvideContrasena}
              className="text-cream/35 text-xs hover:text-cream/60 transition-colors mx-auto"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
