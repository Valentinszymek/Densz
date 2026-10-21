import { useState, type FormEvent } from "react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { supabaseAuthDisponible, iniciarLoginGoogle, registrarseConEmailPassword, guardarRegistroPendiente } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";

/** Alta de laboratorio nuevo: un campo de texto + "Continuar con
 * Google" — el nombre tipeado viaja con el round-trip de Google (ver
 * supabaseClient.ts) en la web, o se manda directo en escritorio (que
 * hace todo el trámite de Google él solo, sin redirect de pestaña). Si
 * la cuenta de Google ya pertenece a un laboratorio existente, no es un
 * error: el backend loguea directo a ese laboratorio (googleAuthService.ts). */
export function RegistroLaboratorio({ onVolver }: { onVolver: () => void }) {
  const setSesion = useAuthStore((s) => s.setSesion);
  const [nombreLaboratorio, setNombreLaboratorio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const esEscritorio = window.densz.plataforma === "escritorio";

  const [mostrarEmail, setMostrarEmail] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [errorEmail, setErrorEmail] = useState<string | null>(null);
  const [cargandoEmail, setCargandoEmail] = useState(false);
  const [registroPendienteConfirmacion, setRegistroPendienteConfirmacion] = useState(false);

  async function onClickGoogle() {
    const nombre = nombreLaboratorio.trim();
    if (!nombre) {
      setError("Ingresá el nombre de tu laboratorio.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      if (esEscritorio) {
        const sesion = await window.densz.authRegistrarseConGoogle(nombre);
        setSesion(sesion);
        setCargando(false);
      } else {
        await iniciarLoginGoogle(nombre); // redirige la pestaña
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el registro con Google.");
      setCargando(false);
    }
  }

  // Alta con email+contraseña (alternativa a Google, solo web — ver nota
  // en supabaseClient.ts). Si el proyecto de Supabase exige confirmar el
  // email, no hay sesión todavía: se guarda el nombre del laboratorio
  // pendiente y se avisa que confirme el email; el laboratorio se crea
  // recién en el primer "Iniciar sesión con email y contraseña" exitoso
  // (ver SeleccionUsuario.tsx).
  async function onSubmitEmail(e: FormEvent) {
    e.preventDefault();
    const nombre = nombreLaboratorio.trim();
    if (!nombre) {
      setErrorEmail("Ingresá el nombre de tu laboratorio.");
      return;
    }
    if (password.length < 6) {
      setErrorEmail("La contraseña tiene que tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setErrorEmail("Las contraseñas no coinciden.");
      return;
    }
    setErrorEmail(null);
    setCargandoEmail(true);
    try {
      const emailLimpio = email.trim();
      const { sesionInmediata, accessToken } = await registrarseConEmailPassword(emailLimpio, password, nombreCompleto.trim() || emailLimpio);
      if (sesionInmediata && accessToken) {
        const sesion = await window.densz.authRegistrarseConGoogle(nombre, accessToken);
        setSesion(sesion);
      } else {
        guardarRegistroPendiente(emailLimpio, nombre);
        setRegistroPendienteConfirmacion(true);
      }
    } catch (err) {
      setErrorEmail(err instanceof Error ? err.message : "No se pudo completar el registro.");
    } finally {
      setCargandoEmail(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={100} className="mb-8" />
      <h1 className="text-cream/80 text-lg font-medium mb-1 text-center">Crear mi laboratorio</h1>
      <p className="text-cream/40 text-sm mb-8 text-center max-w-xs">¿Cómo se llama tu laboratorio?</p>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="text"
          value={nombreLaboratorio}
          onChange={(e) => setNombreLaboratorio(e.target.value)}
          placeholder="Nombre de tu laboratorio"
          autoFocus
          className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        />

        {(supabaseAuthDisponible || esEscritorio) ? (
          <button
            type="button"
            onClick={onClickGoogle}
            disabled={cargando}
            className="rounded-lg bg-gold text-carbon font-medium px-5 py-3 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
          >
            {cargando ? (esEscritorio ? "Esperando el navegador…" : "Redirigiendo…") : "Continuar con Google"}
          </button>
        ) : (
          <p className="text-cream/40 text-xs text-center">Login con Google no está configurado en este entorno.</p>
        )}

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        {/* Email+contraseña: solo web, igual que en SeleccionUsuario.tsx. */}
        {!esEscritorio && supabaseAuthDisponible && (
          <>
            {registroPendienteConfirmacion ? (
              <p className="text-cream/70 text-sm text-center bg-cream/[0.04] rounded-lg px-4 py-3">
                Te enviamos un email para confirmar tu cuenta. Confirmalo y después volvé a "Iniciar sesión con email y contraseña" —
                ahí creamos tu laboratorio.
              </p>
            ) : !mostrarEmail ? (
              <>
                <div className="flex items-center gap-3 text-cream/25 text-xs w-full">
                  <span className="h-px flex-1 bg-cream/10" />o<span className="h-px flex-1 bg-cream/10" />
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarEmail(true)}
                  className="text-cream/40 text-xs hover:text-cream/70 transition-colors underline underline-offset-2"
                >
                  Registrarme con email y contraseña
                </button>
              </>
            ) : (
              <form onSubmit={onSubmitEmail} className="w-full flex flex-col gap-2">
                <input
                  type="text"
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  placeholder="Tu nombre"
                  className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete="new-password"
                  required
                  className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                />
                <input
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repetí la contraseña"
                  autoComplete="new-password"
                  required
                  className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                />
                <button
                  type="submit"
                  disabled={cargandoEmail}
                  className="rounded-lg bg-gold text-carbon font-medium px-5 py-2.5 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
                >
                  {cargandoEmail ? "Creando cuenta…" : "Crear mi cuenta"}
                </button>
                {errorEmail && <p className="text-red-400 text-xs text-center">{errorEmail}</p>}
              </form>
            )}
          </>
        )}

        <button type="button" onClick={onVolver} className="text-cream/40 text-xs mt-2 hover:text-cream/70 transition-colors">
          ← Volver
        </button>
      </div>
    </div>
  );
}
