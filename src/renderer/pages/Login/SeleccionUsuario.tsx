import { useState, type FormEvent } from "react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { formatearRol } from "../../lib/format";
import {
  supabaseAuthDisponible,
  iniciarLoginGoogle,
  iniciarSesionConEmailPassword,
  tomarRegistroPendiente
} from "../../lib/supabaseClient";
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
 * y hace scroll interno si no entran todos en alto.
 *
 * `usuarios` lo resuelve Login/index.tsx, no este componente: en
 * escritorio es la lista sin filtrar de siempre; en la web, SOLO existe
 * después de pasar por Google (ver CallbackGoogle.tsx) — `undefined`
 * antes de eso, a propósito, para no mostrar nunca una lista de usuarios
 * sin haber verificado a qué laboratorio pertenecen. */
export function SeleccionUsuario({
  usuarios,
  ocultarOtrosMetodos,
  onSeleccionar,
  onOlvideContrasena
}: {
  usuarios: UsuarioParaSeleccion[] | undefined;
  /** Ya se pasó por Google y hay tarjetas reales para elegir — mostrar
   * de nuevo el botón de Google (o el email+contraseña) acá abajo sería
   * un paso redundante que la persona ya hizo (ver Login/index.tsx). */
  ocultarOtrosMetodos: boolean;
  onSeleccionar: (u: UsuarioParaSeleccion) => void;
  onOlvideContrasena: () => void;
}) {
  const setSesion = useAuthStore((s) => s.setSesion);
  const [email, setEmail] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [cargandoEmail, setCargandoEmail] = useState(false);
  const [errorGoogle, setErrorGoogle] = useState<string | null>(null);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Mismo criterio que Google (ver CallbackGoogle.tsx): el email+contraseña
  // TAMPOCO entra directo a Densz — primero resuelve la lista de usuarios
  // de SU laboratorio y la muestra acá mismo, sin navegar a ningún lado
  // (a diferencia de Google, esto no tiene un redirect de por medio, así
  // que alcanza con guardar el resultado en un estado local).
  const [usuariosVerificados, setUsuariosVerificados] = useState<UsuarioParaSeleccion[] | null>(null);
  const usuariosAMostrar = usuariosVerificados ?? usuarios;
  const yaVerificado = ocultarOtrosMetodos || usuariosVerificados !== null;
  // Se lee en cada render (nunca a nivel de módulo): en la web,
  // `window.densz` recién se asigna (main.web.tsx) después de que este
  // módulo se evalúa, así que leerlo al importar rompería ese build.
  const esEscritorio = window.densz.plataforma === "escritorio";

  // Diseño final (2026-11-03, pedido explícito del dueño del producto):
  // "Continuar con Google" se queda como opción permanente del login
  // diario — lo que se sacó fue el ATAJO, no el botón. `iniciarLoginGoogle`
  // (supabaseClient.ts) manda `prompt: "login"` a Google, que lo obliga a
  // mostrar SU PROPIA pantalla de usuario/contraseña siempre, aunque el
  // navegador ya tenga esa cuenta de Google abierta — así cualquiera que
  // toque este botón en una compu ajena igual tiene que escribir la
  // contraseña real de Gmail, nunca entra solo por tener Chrome logueado.
  async function onClickGoogle() {
    setErrorGoogle(null);
    setCargandoGoogle(true);
    try {
      if (esEscritorio) {
        const sesion = await window.densz.authLoginGoogle();
        setSesion(sesion);
        setCargandoGoogle(false);
      } else {
        await iniciarLoginGoogle();
      }
    } catch (err) {
      setErrorGoogle(err instanceof Error ? err.message : "No se pudo iniciar el login con Google.");
      setCargandoGoogle(false);
    }
  }

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
      if (nombrePendiente) {
        // Alta de laboratorio nuevo recién confirmada por email — todavía
        // no hay ningún otro usuario para elegir, entra directo (mismo
        // criterio que CallbackGoogle.tsx con `labName`).
        const sesion = await window.densz.authRegistrarseConGoogle(nombrePendiente, accessToken);
        setSesion(sesion);
        return;
      }
      // "Iniciar sesión" normal: nunca entra directo (ver comentario
      // arriba) — resuelve los usuarios de SU laboratorio y los muestra.
      const usuariosDelLab = await window.densz.authUsuariosDelLaboratorio(accessToken);
      setUsuariosVerificados(usuariosDelLab);
      setEmail("");
      setPasswordEmail("");
    } catch (err) {
      setErrorEmail(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setCargandoEmail(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={120} className="mb-10" />
      <h1 className="text-cream/80 text-lg font-medium mb-8 text-center">¿Quién va a utilizar Densz?</h1>

      {usuariosAMostrar !== undefined && usuariosAMostrar.length === 0 && (
        <p className="text-cream/40 text-sm max-w-sm text-center">
          No hay usuarios activos para iniciar sesión. Contactá a un administrador de este Densz.
        </p>
      )}

      {!!usuariosAMostrar?.length && (
        <div className="flex flex-wrap justify-center gap-4 max-w-3xl max-h-[55vh] overflow-y-auto scrollbar-invisible px-2 py-2">
          {usuariosAMostrar.map((u) => (
            <TarjetaUsuario key={u.id} usuario={u} onClick={() => onSeleccionar(u)} />
          ))}
        </div>
      )}

      {/* "Continuar con Google", con prompt=login forzado (ver comentario
          arriba) — opción permanente, no un atajo sin contraseña. Oculto
          si ya se pasó por Google o por email+contraseña (ver yaVerificado). */}
      {!yaVerificado && (supabaseAuthDisponible || esEscritorio) && (
        <div className="mt-8 flex flex-col items-center gap-1 w-full max-w-xs">
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

      {/* Email+contraseña propia de Densz — alternativa a Google, para
          quien prefiera no depender de su cuenta de Gmail. Solo tiene
          sentido en la web — en escritorio el ingreso sin Google es
          siempre con las tarjetas de arriba + contraseña. Oculto si ya
          se pasó por Google o por email+contraseña (ver yaVerificado). */}
      {!yaVerificado && !esEscritorio && supabaseAuthDisponible && (
        <div className="mt-4 w-full max-w-xs">
          <div className="flex items-center gap-3 text-cream/25 text-xs w-full mb-3">
            <span className="h-px flex-1 bg-cream/10" />o<span className="h-px flex-1 bg-cream/10" />
          </div>
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
