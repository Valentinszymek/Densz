import http from "node:http";
import type { Pool } from "pg";
import { shell, BrowserWindow } from "electron";
import { GoTrueClient } from "@supabase/auth-js";
import { crearAlmacenamientoDeSesion } from "./supabaseSessionStorage";
import { loginConGoogle, registrarseConGoogle, type IdentidadGoogle } from "./googleAuthService";
import type { SesionActual } from "./sessionService";
import { logger } from "../utils/logger";

/**
 * Login con Google en el escritorio (plan multi-laboratorio) — ver
 * compiled-pondering-hammock.md §7 para el diseño completo. Todo el
 * intercambio ocurre acá, en el proceso principal de Electron: el
 * navegador del sistema (nunca uno embebido, Google lo bloquea) abre la
 * pantalla de Google, y un servidor HTTP local temporal recibe la
 * respuesta — mismo patrón que usan GitHub Desktop, VS Code o
 * `gh auth login`.
 *
 * Usa `@supabase/auth-js` directamente (no el SDK completo
 * `@supabase/supabase-js`, que trae acceso a datos/tiempo real/archivos
 * que el escritorio no necesita — ya habla con Postgres directo).
 */

const PUERTO_CALLBACK = 53682;
const TIMEOUT_LOGIN_MS = 120_000;

let clienteAuth: GoTrueClient | null = null;

function getAuthClient(): GoTrueClient {
  if (clienteAuth) return clienteAuth;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Login con Google no está configurado todavía: faltan SUPABASE_URL / SUPABASE_ANON_KEY (ver .env.example)."
    );
  }
  clienteAuth = new GoTrueClient({
    url: `${url}/auth/v1`,
    headers: { apikey: anonKey },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no hay navegador acá — el intercambio lo maneja esta misma clase a mano
    flowType: "pkce",
    storage: crearAlmacenamientoDeSesion()
  });
  return clienteAuth;
}

/** De la sesión de Supabase (ya autenticada) a lo que necesita
 * loginConGoogle — mismo shape que usa la web en src/server/googleAuth.ts. */
function identidadDesdeSesion(usuario: { id: string; email?: string; user_metadata?: Record<string, unknown> }): IdentidadGoogle {
  if (!usuario.email) {
    throw new Error("Esa cuenta de Google no tiene un email verificado.");
  }
  return {
    supabaseUserId: usuario.id,
    email: usuario.email,
    nombreCompleto: (usuario.user_metadata?.full_name as string | undefined) ?? usuario.email
  };
}

/** Al arrancar la app: si hay una sesión de Google guardada de una vez
 * anterior (y sigue vigente o se puede renovar sola), la restaura sin
 * abrir ningún navegador. Nunca tira — si falla o no hay nada guardado,
 * el arranque sigue normal, simplemente sin laboratorio resuelto
 * todavía (como ya pasa hoy). */
export async function intentarRestaurarSesionGoogle(pool: Pool): Promise<SesionActual | null> {
  try {
    const auth = getAuthClient();
    const { data, error } = await auth.getSession();
    if (error || !data.session) return null;
    const identidad = identidadDesdeSesion(data.session.user);
    return await loginConGoogle(pool, identidad);
  } catch (err) {
    logger.info(`No se pudo restaurar la sesión de Google guardada (se pedirá login de nuevo): ${String(err)}`);
    return null;
  }
}

/** Arma la paginita que ve la persona en el navegador del sistema — nada
 * de assets externos ni de la app empaquetada, esto lo sirve este mismo
 * servidor temporal, una sola vez. */
function paginaRespuesta(ok: boolean): string {
  const titulo = ok ? "Listo" : "No se pudo completar el login";
  const mensaje = ok
    ? "Ya podés cerrar esta pestaña y volver a Densz."
    : "Volvé a Densz e intentá de nuevo.";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Densz</title></head>
<body style="font-family: system-ui, sans-serif; background:#0e0e10; color:#f5f0e6; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
  <div style="text-align:center;"><h1>${titulo}</h1><p>${mensaje}</p></div>
</body></html>`;
}

/** Abre el navegador del sistema, espera el login de Google, e
 * intercambia el código por una identidad ya verificada — el mismo
 * trámite para "Iniciar sesión" y para "Crear mi laboratorio", que solo
 * difieren en qué hacen con la identidad una vez resuelta. */
async function completarLoginGoogle(): Promise<IdentidadGoogle> {
  const auth = getAuthClient();
  const redirectTo = `http://127.0.0.1:${PUERTO_CALLBACK}/callback`;

  const { data, error } = await auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true }
  });
  if (error || !data.url) {
    throw new Error(error?.message ?? "No se pudo armar el login con Google.");
  }

  const codigo = await esperarCodigoDeCallback(data.url);
  const { data: sesionData, error: errorIntercambio } = await auth.exchangeCodeForSession(codigo);
  if (errorIntercambio || !sesionData.session) {
    throw new Error(errorIntercambio?.message ?? "No se pudo completar el login con Google.");
  }

  return identidadDesdeSesion(sesionData.session.user);
}

/** Levanta el servidor local (127.0.0.1 únicamente — nunca accesible
 * desde la red), abre el navegador del sistema, y devuelve la sesión ya
 * autenticada una vez que la persona completa el login en Google. */
export async function iniciarLoginGoogleEscritorio(pool: Pool): Promise<SesionActual> {
  const identidad = await completarLoginGoogle();
  const sesion = await loginConGoogle(pool, identidad);

  // La persona va a estar en el navegador — la traemos de vuelta a Densz.
  BrowserWindow.getAllWindows()[0]?.focus();

  return sesion;
}

/** Variante de "Crear mi laboratorio" — mismo navegador del sistema +
 * servidor local, solo que al volver da de alta el laboratorio nuevo en
 * vez de buscar uno existente (ver googleAuthService.ts). */
export async function iniciarRegistroLaboratorioEscritorio(pool: Pool, nombreLaboratorio: string): Promise<SesionActual> {
  const identidad = await completarLoginGoogle();
  const sesion = await registrarseConGoogle(pool, identidad, nombreLaboratorio);

  BrowserWindow.getAllWindows()[0]?.focus();

  return sesion;
}

/** Abre el navegador del sistema en `urlGoogle` y espera, con el
 * servidor local temporal, a que vuelva con el código de autorización
 * (o lo cancela con un error claro si pasan 2 minutos sin respuesta). */
function esperarCodigoDeCallback(urlGoogle: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let terminado = false;
    let timeoutId: NodeJS.Timeout;

    const servidor = http.createServer((req, res) => {
      if (terminado || !req.url) {
        res.writeHead(404).end();
        return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${PUERTO_CALLBACK}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const codigo = url.searchParams.get("code");
      const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(paginaRespuesta(!!codigo));

      finalizar(() => {
        if (codigo) resolve(codigo);
        else reject(new Error(errorParam ?? "Google no devolvió un código de autorización."));
      });
    });

    function finalizar(accion: () => void): void {
      if (terminado) return;
      terminado = true;
      clearTimeout(timeoutId);
      servidor.close();
      accion();
    }

    servidor.on("error", (err: NodeJS.ErrnoException) => {
      const mensaje =
        err.code === "EADDRINUSE"
          ? "No se pudo iniciar el login con Google: el puerto local ya está en uso. Cerrá cualquier otra instancia de Densz e intentá de nuevo."
          : `No se pudo iniciar el servidor local para el login con Google: ${err.message}`;
      finalizar(() => reject(new Error(mensaje)));
    });

    servidor.listen(PUERTO_CALLBACK, "127.0.0.1", () => {
      void shell.openExternal(urlGoogle);
    });

    timeoutId = setTimeout(() => {
      finalizar(() => reject(new Error("Tiempo de espera agotado — no se completó el login con Google.")));
    }, TIMEOUT_LOGIN_MS);
  });
}
