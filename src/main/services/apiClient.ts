import { ApiError } from "../../shared/http/ApiError";
import { crearMetodosHttpComunes, type HttpPrimitives } from "../../shared/http/denszApiFactory";
import type { DenszApi } from "../../shared/types/ipc-contracts";
import type { SesionActualDto, UsuarioParaSeleccion } from "../../shared/types/entities";
import { leerTokenGuardado, guardarToken, borrarTokenGuardado } from "./apiSessionStorage";

/**
 * Cliente HTTP del escritorio hacia el backend de Railway — el reemplazo
 * de la conexión directa a Postgres (ver plan de seguridad del escritorio,
 * docs/REPORTE_LANZAMIENTO_COMERCIAL_DENSZ.md). Corre en el proceso
 * PRINCIPAL de Electron (Node), no en el renderer — a propósito: un
 * cliente HTTP de Node no está sujeto a CORS (que solo aplica en
 * navegadores), así que evita por completo la complicación de que el
 * escritorio empaquetado carga su interfaz con `file://`.
 *
 * Autenticación por `Authorization: Bearer <token>`, no por cookie: un
 * proceso de Node no tiene el cookie-jar implícito de un navegador. El
 * token es el mismo `sesionId` opaco que la web guarda en su cookie — ver
 * `sesionId` en las respuestas de /auth/login, /auth/google-callback y
 * /auth/google-register (src/server/routes/auth.route.ts), y el fallback
 * de bearer en requireAuth.ts/session.ts. Se persiste en disco
 * (apiSessionStorage.ts) para no tener que loguearse de nuevo en cada
 * arranque.
 *
 * Expone:
 *  - Las primitivas HTTP (get/post/put/patch/del/getBuffer) + manejo del
 *    token, para que otros módulos del proceso principal (impresión,
 *    exportación, vista previa de PDF — todo lo que además necesita una
 *    `BrowserWindow`/diálogo nativo, fuera del alcance de este archivo a
 *    propósito) puedan construir sus propias descargas.
 *  - Los ~120 métodos de `DenszApi` que son un simple GET/POST/PUT/PATCH/
 *    DELETE, compartidos con la web vía `denszApiFactory.ts`.
 *  - Los métodos de auth propios de este cliente (login/logout/sesión
 *    actual) — puramente HTTP, sin ninguna ventana nativa de por medio.
 *
 * Los métodos de `DenszApi` que SÍ necesitan algo nativo de Electron
 * (`comprobantesVerPdf`, `exportGenerar`, `impresora*`, `backups*`,
 * `authLoginGoogle`/`authRegistrarseConGoogle` completos —que arrancan
 * abriendo el navegador del sistema—) se arman en sus propios archivos
 * (comprobantes.ipc.ts, export.ipc.ts, impresoraService.ts,
 * googleOAuthDesktop.ts), usando las primitivas de acá — nunca duplicando
 * la lógica de fetch. Esto mantiene este archivo 100% Electron-agnóstico:
 * se puede testear con un `fetch` simulado, sin un BrowserWindow real.
 */

let onSesionExpirada: (() => void) | null = null;
/** Registra qué hacer cuando el backend rechaza el token actual (401) —
 * `src/main/index.ts` lo conecta a un aviso real en la ventana (evento
 * `AUTH_SESION_EXPIRADA`, ver preload.ts) durante la Etapa 3. Sin nada
 * registrado, un 401 simplemente limpia el token guardado y deja que el
 * error se propague como de costumbre. */
export function alExpirarSesion(callback: () => void): void {
  onSesionExpirada = callback;
}

let tokenEnMemoria: string | null | undefined;
function getToken(): string | null {
  if (tokenEnMemoria === undefined) tokenEnMemoria = leerTokenGuardado();
  return tokenEnMemoria;
}

/** El token actualmente en uso (ya persistido o recién obtenido por un
 * login) — para los pocos lugares del proceso principal que necesitan
 * guardarlo junto con la sesión (sessionService.ts#setSesionConToken, ver
 * googleOAuthDesktop.ts/auth.ipc.ts). La mayoría del código nunca necesita
 * leerlo directo: alcanza con que `apiClient` lo mande solo en cada pedido. */
export function getTokenActual(): string | null {
  return getToken();
}

export function setToken(token: string): void {
  tokenEnMemoria = token;
  guardarToken(token);
}

export function limpiarToken(): void {
  tokenEnMemoria = null;
  borrarTokenGuardado();
}

const API_BASE = process.env.DENSZ_API_URL ?? "http://localhost:4000";

function manejarNoAutorizado(): void {
  limpiarToken();
  onSesionExpirada?.();
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      }
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) manejarNoAutorizado();

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Respuesta sin cuerpo JSON (ej. un 500 crudo) — se mantiene el mensaje genérico de arriba.
    }
    throw new ApiError(respuesta.status, mensaje);
  }

  if (respuesta.status === 204) return undefined as T;
  const texto = await respuesta.text();
  return texto ? (JSON.parse(texto) as T) : (undefined as T);
}

function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
}

function del<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined });
}

/** Descarga binaria (un PDF, un export) como Buffer de Node — equivalente
 * a `getBlob` del lado del navegador. Usado por los módulos que necesitan
 * escribir el resultado a un archivo local (vista previa de PDF,
 * exportación) — nunca intenta parsear la respuesta como JSON. */
async function getBuffer(path: string): Promise<Buffer> {
  const token = getToken();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) manejarNoAutorizado();

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Respuesta sin cuerpo JSON — se mantiene el mensaje genérico de arriba.
    }
    throw new ApiError(respuesta.status, mensaje);
  }

  return Buffer.from(await respuesta.arrayBuffer());
}

/** Igual que `getBuffer`, pero con `POST` + body JSON (usado por
 * `exportGenerar`) — devuelve también el nombre de archivo real que mandó
 * el servidor (Content-Disposition). */
async function postBuffer(path: string, body: unknown): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const token = getToken();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) manejarNoAutorizado();

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = (await respuesta.json()) as { error?: string };
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Respuesta sin cuerpo JSON — se mantiene el mensaje genérico de arriba.
    }
    throw new ApiError(respuesta.status, mensaje);
  }

  const disposicion = respuesta.headers.get("Content-Disposition") ?? "";
  const match = disposicion.match(/filename="([^"]+)"/);
  return { buffer: Buffer.from(await respuesta.arrayBuffer()), nombreArchivo: match?.[1] ?? "export" };
}

const primitivas: HttpPrimitives = { get, post, put, patch, del };

/** Respuesta real de /auth/login, /auth/google-callback y
 * /auth/google-register — `SesionActualDto` + el `sesionId` que hay que
 * guardar y reenviar como Bearer de ahí en más (ver auth.route.ts). */
type RespuestaLogin = SesionActualDto & { sesionId: string };

function alLoguear(respuesta: RespuestaLogin): SesionActualDto {
  setToken(respuesta.sesionId);
  const { sesionId: _sesionId, ...sesion } = respuesta;
  return sesion;
}

export const apiClient = {
  // --- Primitivas, para los módulos que arman su propia descarga nativa ---
  get,
  post,
  put,
  patch,
  del,
  getBuffer,
  postBuffer,

  // --- Los ~120 métodos de DenszApi que son un simple GET/POST/PUT/PATCH/DELETE ---
  ...crearMetodosHttpComunes(primitivas),

  // --- Auth: puramente HTTP, sin ninguna ventana nativa de por medio ---
  // (el navegador del sistema para Google vive en googleOAuthDesktop.ts,
  // que llama a authLoginGoogle/authRegistrarseConGoogle de acá recién
  // DESPUÉS de conseguir el accessToken).
  authLogin: (nombreUsuario: string, password: string): Promise<SesionActualDto> =>
    post<RespuestaLogin>("/auth/login", { nombreUsuario, password }).then(alLoguear),
  authLoginGoogle: (accessToken: string): Promise<SesionActualDto> =>
    post<RespuestaLogin>("/auth/google-callback", { accessToken }).then(alLoguear),
  authRegistrarseConGoogle: (nombreLaboratorio: string, accessToken: string): Promise<SesionActualDto> =>
    post<RespuestaLogin>("/auth/google-register", { accessToken, nombreLaboratorio }).then(alLoguear),
  authLogout: async (): Promise<void> => {
    try {
      await post("/auth/logout");
    } finally {
      limpiarToken();
    }
  },
  authSesionActual: (): Promise<SesionActualDto | null> => get("/auth/session"),
  authUsuariosDisponibles: (): Promise<UsuarioParaSeleccion[]> => get("/auth/usuarios-disponibles")
} satisfies Omit<DenszApi, SinImplementarAca> & Record<string, unknown>;

/** Métodos de DenszApi que NO se arman en este archivo — necesitan una
 * `BrowserWindow`/diálogo nativo/el navegador del sistema, y se ensamblan
 * en sus propios archivos (ver el comentario de arriba del todo). */
type SinImplementarAca =
  | "plataforma"
  // authLoginGoogle/authRegistrarseConGoogle de DenszApi aceptan un
  // accessToken OPCIONAL (la web ya lo tiene resuelto; el escritorio no
  // pasa nada y arranca el navegador del sistema él solo, ver
  // googleOAuthDesktop.ts) — lo que expone este archivo es el paso
  // siguiente, puramente HTTP, que SIEMPRE necesita el token ya resuelto.
  // Por eso no intenta satisfacer el tipo exacto de DenszApi acá: la
  // implementación final de esos dos métodos para IPC se arma en
  // auth.ipc.ts, orquestando googleOAuthDesktop + este cliente.
  | "authLoginGoogle"
  | "authRegistrarseConGoogle"
  | "comprobantesVerPdf"
  | "comprobantesImprimir"
  | "cuentasVerPdfResumen"
  | "listaPreciosVerPdf"
  | "exportGenerar"
  | "impresoraListar"
  | "impresoraObtenerSeleccionada"
  | "impresoraSeleccionar"
  | "impresoraPrueba"
  | "impresoraImprimirPdf"
  | "backupsListar"
  | "backupsCrear"
  | "backupsVerificar"
  | "backupsElegirArchivo"
  | "backupsRestaurar"
  | "backupsListarUnidades"
  | "backupsUbicacionDisponible"
  | "backupsObtenerConfig"
  | "backupsGuardarConfig"
  | "onActualizacionLista"
  | "reiniciarParaActualizar"
  // Implementado en preload.ts (escucha el evento IPC que este archivo
  // dispara vía alExpirarSesion) — no es un método HTTP.
  | "onSesionExpirada";
