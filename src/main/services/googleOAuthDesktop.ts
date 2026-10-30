import http from "node:http";
import { shell, BrowserWindow } from "electron";
import { GoTrueClient } from "@supabase/auth-js";
import { crearAlmacenamientoDeSesion } from "./supabaseSessionStorage";
import { apiClient, getTokenActual } from "./apiClient";
import { setSesionConToken, type SesionActual } from "./sessionService";
import { logger } from "../utils/logger";

/**
 * Login con Google en el escritorio (plan multi-laboratorio) — ver
 * compiled-pondering-hammock.md §7 (diseño original) y la sección "el
 * escritorio deja de conectarse directo a Postgres" (plan de seguridad
 * del escritorio) para el porqué del cambio de esta etapa: antes, el
 * token de Supabase se usaba para consultar Postgres DIRECTO
 * (loginConGoogle(pool, identidad)); ahora se manda al mismo endpoint
 * HTTP que ya usa la web (`POST /auth/google-callback`, vía
 * apiClient.authLoginGoogle) — cero cambios de backend para esto, el
 * endpoint ya existía y ya hacía exactamente lo mismo, solo que para
 * pedidos HTTP en vez de llamados locales.
 *
 * El resto del trámite no cambió: el navegador del sistema (nunca uno
 * embebido, Google lo bloquea) abre la pantalla de Google, y un servidor
 * HTTP local temporal recibe la respuesta — mismo patrón que usan GitHub
 * Desktop, VS Code o `gh auth login`.
 *
 * Usa `@supabase/auth-js` directamente (no el SDK completo
 * `@supabase/supabase-js`, que trae acceso a datos/tiempo real/archivos
 * que el escritorio no necesita).
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

/** Guarda la sesión Y el token HTTP que `apiClient` ya persistió (lo que
 * faltaría si solo se llamara a `setUsuarioActual`) — un solo lugar para
 * no repetir `getTokenActual()!` en cada punto de entrada de acá abajo. */
function guardarSesion(sesion: SesionActual): SesionActual {
  setSesionConToken(sesion, getTokenActual()!);
  return sesion;
}

/** Al arrancar la app, en dos niveles — nunca abre un navegador sin
 * necesitarlo de verdad:
 *
 * 1. Si hay un token HTTP ya guardado de una vez anterior (apiClient lo
 *    restaura solo desde disco), se prueba directo contra
 *    `GET /auth/session` — si Railway todavía lo reconoce, la sesión
 *    vuelve sin tocar Google ni Postgres para nada.
 * 2. Si eso falla (nunca hubo token, o Railway se reinició y perdió su
 *    mapa de sesiones en memoria — pasa en cada `git push` al backend),
 *    se cae al login silencioso de Supabase (sin abrir navegador): si
 *    sigue teniendo una sesión vigente ahí, se la vuelve a mandar a
 *    `/auth/google-callback` como si fuera un login nuevo.
 *
 * Nunca tira — si los dos niveles fallan, el arranque sigue normal,
 * simplemente sin sesión todavía (como ya pasa hoy). */
export async function intentarRestaurarSesionGoogle(): Promise<SesionActual | null> {
  try {
    const sesionHttp = await apiClient.authSesionActual();
    if (sesionHttp) return guardarSesion(sesionHttp);
  } catch (err) {
    logger.info(`No se pudo validar el token guardado (se intenta con Supabase): ${String(err)}`);
  }

  try {
    const auth = getAuthClient();
    const { data, error } = await auth.getSession();
    if (error || !data.session) return null;
    const sesion = await apiClient.authLoginGoogle(data.session.access_token);
    return guardarSesion(sesion);
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
 * intercambia el código por un access token ya verificado por
 * Supabase — el mismo trámite para "Iniciar sesión" y para "Crear mi
 * laboratorio", que solo difieren en a qué endpoint HTTP mandan ese
 * token una vez resuelto. */
async function completarLoginGoogle(): Promise<{ accessToken: string }> {
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

  return { accessToken: sesionData.session.access_token };
}

/** Levanta el servidor local (127.0.0.1 únicamente — nunca accesible
 * desde la red), abre el navegador del sistema, y devuelve la sesión ya
 * autenticada una vez que la persona completa el login en Google. */
export async function iniciarLoginGoogleEscritorio(): Promise<SesionActual> {
  const { accessToken } = await completarLoginGoogle();
  const sesion = await apiClient.authLoginGoogle(accessToken);

  // La persona va a estar en el navegador — la traemos de vuelta a Densz.
  BrowserWindow.getAllWindows()[0]?.focus();

  return guardarSesion(sesion);
}

/** Variante de "Crear mi laboratorio" — mismo navegador del sistema +
 * servidor local, solo que al volver da de alta el laboratorio nuevo en
 * vez de buscar uno existente (ver googleAuthService.ts, que sigue
 * corriendo del lado del servidor sin cambios). */
export async function iniciarRegistroLaboratorioEscritorio(nombreLaboratorio: string): Promise<SesionActual> {
  const { accessToken } = await completarLoginGoogle();
  const sesion = await apiClient.authRegistrarseConGoogle(nombreLaboratorio, accessToken);

  BrowserWindow.getAllWindows()[0]?.focus();

  return guardarSesion(sesion);
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
