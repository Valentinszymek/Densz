import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase Auth EXCLUSIVO del navegador (web) — usa la clave
 * `anon` (pública por diseño, pensada para vivir en el bundle del
 * cliente; nunca la `service_role`, esa es solo del servidor, ver
 * src/server/storage.ts). Solo se usa para el flujo de login con Google
 * (`signInWithOAuth`/`exchangeCodeForSession`) — ninguna consulta a
 * datos de Densz pasa por acá, todas siguen yendo por window.densz.*
 * (fetch al backend, con la cookie de sesión propia de Densz).
 *
 * `flowType: "pkce"` a propósito: el router de Densz es un HashRouter
 * (la app se sirve desde file:// en Electron, sin servidor que resuelva
 * rutas arbitrarias — ver src/renderer/app/router.tsx) y el flujo
 * implícito de Supabase devuelve la sesión en el FRAGMENTO de la URL
 * (`#access_token=...`), que colisionaría con el propio uso del `#` para
 * rutear. PKCE en cambio vuelve con `?code=...` como query param real,
 * compatible sin conflicto con HashRouter.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseAuthDisponible = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export const supabase = supabaseAuthDisponible
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { flowType: "pkce" } })
  : null;

/** Arranca el login con Google — redirige la pestaña actual a Google
 * (lo hace supabase-js solo, no hace falta navegar a mano) y, si todo
 * sale bien, Google vuelve a `#/auth/callback` (ver CallbackGoogle.tsx)
 * con el código de autorización en la URL.
 *
 * Si se pasa `nombreLaboratorio` (pantalla "Crear mi laboratorio"), viaja
 * como query param ANTES del `#` (`?labName=...#/auth/callback`) — ahí
 * sigue disponible en `window.location.search` cuando vuelve de Google,
 * sin necesidad de guardar nada server-side entre medio (Supabase agrega
 * su propio `?code=...` a la query existente, nunca lo pisa). */
export async function iniciarLoginGoogle(nombreLaboratorio?: string): Promise<void> {
  if (!supabase) {
    throw new Error("Login con Google no está configurado en este entorno (faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).");
  }
  const query = nombreLaboratorio ? `?labName=${encodeURIComponent(nombreLaboratorio)}` : "";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}${query}#/auth/callback` }
  });
  if (error) throw error;
}

/**
 * Alta con email y contraseña (alternativa a Google, solo web) — usa el
 * mismo proyecto de Supabase Auth, así que el backend de Densz no
 * distingue el origen: `verificarTokenGoogle` (googleAuth.ts) valida
 * cualquier access token de Supabase Auth, sea de Google o de
 * email/password, por igual.
 *
 * Si el proyecto tiene desactivada la confirmación por email, Supabase
 * devuelve la sesión ya armada en el mismo `signUp` (`sesionInmediata:
 * true`, con el `accessToken` listo para mandar a
 * `authRegistrarseConGoogle`). Si la tiene activada, no hay sesión
 * todavía — hay que esperar a que confirme el email y recién ahí inicie
 * sesión (ver SeleccionUsuario.tsx, que resuelve el alta pendiente en
 * ese primer login exitoso).
 */
export async function registrarseConEmailPassword(
  email: string,
  password: string,
  nombreCompleto: string
): Promise<{ sesionInmediata: boolean; accessToken?: string }> {
  if (!supabase) {
    throw new Error("El registro con email no está configurado en este entorno (faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).");
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: nombreCompleto } }
  });
  if (error) throw error;
  if (data.session) {
    return { sesionInmediata: true, accessToken: data.session.access_token };
  }
  return { sesionInmediata: false };
}

/** Inicio de sesión con email y contraseña (cuentas dadas de alta con
 * `registrarseConEmailPassword`, o con Google usando el mismo email) —
 * devuelve el access token de Supabase, listo para
 * `authLoginGoogle`/`authRegistrarseConGoogle` igual que el de Google. */
export async function iniciarSesionConEmailPassword(email: string, password: string): Promise<string> {
  if (!supabase) {
    throw new Error("El login con email no está configurado en este entorno (faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).");
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : "No se pudo iniciar sesión.");
  }
  return data.session.access_token;
}

const PREFIJO_REGISTRO_PENDIENTE = "densz.registro.pendiente.";

/** Si el proyecto exige confirmar el email antes de dar sesión,
 * `registrarseConEmailPassword` no puede completar el alta todavía —
 * esto guarda el nombre de laboratorio tipeado, para que
 * SeleccionUsuario lo recupere en el primer login exitoso (después de
 * confirmar el email) y recién ahí cree el laboratorio. */
export function guardarRegistroPendiente(email: string, nombreLaboratorio: string): void {
  try {
    localStorage.setItem(PREFIJO_REGISTRO_PENDIENTE + email.trim().toLowerCase(), nombreLaboratorio);
  } catch {
    // localStorage puede no estar disponible — en el peor caso, la
    // persona tendría que volver a tocar "Crear mi laboratorio" después
    // de confirmar el email, nunca es un error silencioso de datos.
  }
}

/** Lee y borra (una sola vez) el registro pendiente de ese email, si existe. */
export function tomarRegistroPendiente(email: string): string | null {
  const clave = PREFIJO_REGISTRO_PENDIENTE + email.trim().toLowerCase();
  try {
    const valor = localStorage.getItem(clave);
    if (valor) localStorage.removeItem(clave);
    return valor;
  } catch {
    return null;
  }
}

/** Pide el email de recuperación de contraseña — Supabase nunca revela
 * si la cuenta existe (ni en la respuesta de esta llamada ni por email),
 * así que la pantalla que la usa debe mostrar siempre el mismo mensaje
 * genérico, exista o no la cuenta. */
export async function solicitarRecuperacionContrasena(email: string): Promise<void> {
  if (!supabase) {
    throw new Error("La recuperación de contraseña no está configurada en este entorno.");
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}#/auth/restablecer`
  });
  if (error) throw error;
}
