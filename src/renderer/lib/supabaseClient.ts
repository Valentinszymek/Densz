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
 * con el código de autorización en la URL. */
export async function iniciarLoginGoogle(): Promise<void> {
  if (!supabase) {
    throw new Error("Login con Google no está configurado en este entorno (faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).");
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}#/auth/callback` }
  });
  if (error) throw error;
}
