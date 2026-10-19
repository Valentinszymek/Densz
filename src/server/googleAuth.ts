import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IdentidadGoogle } from "../main/services/googleAuthService";

/**
 * Verificación del token de Google (vía Supabase Auth) del lado del
 * servidor — nunca se confía en nada que mande el navegador sin antes
 * validarlo acá: el frontend web inicia el login con Google
 * (`supabase.auth.signInWithOAuth`) y termina con un access token de
 * Supabase; esta función se lo pasa de vuelta a Supabase (con la clave
 * `anon`, pública) para confirmar que es real y sacar el email/id de
 * ahí — nunca se le cree el email que mandaría el cliente directamente.
 */

let clienteVerificacion: SupabaseClient | null = null;

function getClienteVerificacion(): SupabaseClient {
  if (clienteVerificacion) return clienteVerificacion;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Login con Google no está configurado todavía: faltan SUPABASE_URL / SUPABASE_ANON_KEY en el servidor (ver .env.example)."
    );
  }
  clienteVerificacion = createClient(url, anonKey);
  return clienteVerificacion;
}

/** Valida un access token de Supabase Auth y devuelve la identidad real
 * detrás — nunca null en éxito: si el token no es válido, tira. */
export async function verificarTokenGoogle(accessToken: string): Promise<IdentidadGoogle> {
  const { data, error } = await getClienteVerificacion().auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("No se pudo verificar la sesión de Google — iniciá sesión de nuevo.");
  }
  const { user } = data;
  if (!user.email) {
    throw new Error("Esa cuenta de Google no tiene un email verificado.");
  }
  return {
    supabaseUserId: user.id,
    email: user.email,
    nombreCompleto: (user.user_metadata?.full_name as string | undefined) ?? user.email
  };
}
