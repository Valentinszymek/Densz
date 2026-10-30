import type { DenszApi } from "@shared/types/ipc-contracts";
import { ApiError } from "@shared/http/ApiError";
import { buildQuery, crearMetodosHttpComunes } from "@shared/http/denszApiFactory";
import { useAuthStore } from "./store/authStore";
import { toast } from "./store/toastStore";

/**
 * Implementación de `DenszApi` para la versión WEB (fetch + cookie de
 * sesión), en reemplazo de `window.densz` inyectado por `preload.ts` en
 * Electron. Este archivo es EXCLUSIVO del punto de entrada web
 * (`main.web.tsx`) — nunca se importa desde `main.tsx` (Electron), así
 * que no afecta en nada al build/comportamiento del escritorio.
 *
 * Diseño: cada página/hook de src/renderer/** sigue llamando
 * `window.densz.algoQueSea(...)` exactamente igual que hoy — no se tocó
 * ni un hook, ni una página, ni un componente. Lo único que cambia es
 * QUÉ implementación responde a esas llamadas.
 *
 * La mayoría de los métodos (los que son un simple GET/POST/PUT/PATCH/
 * DELETE, sin nada propio del navegador) viven en
 * `src/shared/http/denszApiFactory.ts`, compartidos con el cliente HTTP
 * del escritorio (`src/main/services/apiClient.ts`) — ver el comentario de
 * ese archivo para la lista exacta de qué queda afuera y por qué. Acá
 * abajo solo quedan las primitivas de fetch (cookie de sesión, manejo de
 * blobs) y los métodos genuinamente propios del navegador: login/logout
 * (la sesión se maneja distinto en cada plataforma), ver/imprimir PDFs
 * (blob + pestaña del navegador), exportar (descarga del navegador) e
 * impresora física/backups (sin equivalente real en un navegador, quedan
 * como stubs `pendiente(...)` que nunca fallan en silencio).
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

/** Único punto de entrada HTTP: siempre con cookie de sesión, siempre
 * traduce el `{ error: string }` que ya devuelven las rutas del backend
 * (ver traducirErrorPostgres en src/main/utils/errors.ts) a un Error real
 * — nunca esconde el motivo original. En un 401, además, limpia la
 * sesión del frontend (authStore) para que RutaProtegida redirija sola a
 * /login — la fuente real de la sesión es siempre la cookie del backend,
 * authStore solo reflete ese estado para la UI. */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
      ...options
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) {
    useAuthStore.getState().setSesion(null);
  }

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = await respuesta.json();
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

/** Igual que `apiFetch`, pero para respuestas binarias (un PDF) — nunca
 * intenta parsear la respuesta exitosa como JSON. Usado por
 * `cuentasVerPdfResumen`: abre el PDF en una pestaña nueva a partir de un
 * blob URL local (nunca una URL pública de Supabase — el archivo viaja una
 * sola vez, autenticado, por este fetch). */
async function getBlob(path: string): Promise<Blob> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) {
    useAuthStore.getState().setSesion(null);
  }

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = await respuesta.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Respuesta sin cuerpo JSON — se mantiene el mensaje genérico de arriba.
    }
    throw new ApiError(respuesta.status, mensaje);
  }

  return respuesta.blob();
}

/** Abre un PDF en una pestaña nueva sin depender de que `window.open()`
 * ocurra después de un `await` (los navegadores solo lo permiten sin
 * bloquear cuando es síncrono dentro del gesto de click del usuario).
 * Estrategia: abrir la pestaña YA, en blanco, dentro del mismo gesto; si el
 * navegador la bloquea igual (devuelve `null`), avisar claramente en vez de
 * fallar en silencio; recién después pedir el PDF y, cuando llega,
 * redirigir esa pestaña ya abierta al blob — nunca se abre una pestaña
 * vacía si la descarga falla (se cierra la que se había abierto). */
async function abrirPdfEnNuevaPestana(obtenerBlob: () => Promise<Blob>): Promise<void> {
  const ventana = window.open("", "_blank");
  if (!ventana) {
    toast({
      titulo: "El navegador bloqueó la ventana",
      descripcion: "Habilitá las ventanas emergentes para este sitio y volvé a intentar.",
      tono: "error"
    });
    return;
  }

  let blob: Blob;
  try {
    blob = await obtenerBlob();
  } catch (err) {
    ventana.close();
    toast({
      titulo: "No se pudo abrir el PDF",
      descripcion: err instanceof Error ? err.message : "Error inesperado.",
      tono: "error"
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  ventana.location.href = url;
  // Se libera el Object URL una vez que la pestaña nueva ya lo cargó — antes
  // sería prematuro (la pestaña todavía lo necesita para mostrarlo).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Dispara el diálogo de impresión nativo del navegador sobre un PDF, sin
 * abrir ninguna pestaña visible — es la técnica que de verdad funciona de
 * forma confiable: un iframe oculto cargando el PDF, llamando a
 * `contentWindow.print()` recién cuando el visor interno de PDF del
 * navegador ya terminó de renderizar (nunca apenas dispara el evento
 * `load` del iframe: el visor de PDF de Chrome sigue dibujando un
 * instante después de eso, y llamar a `print()` demasiado pronto no hace
 * nada — por eso el pequeño `setTimeout` antes de imprimir). No existe
 * ninguna forma de imprimir en silencio, sin diálogo, desde un navegador
 * (ninguna web puede hacerlo, por diseño de seguridad) — esto es lo más
 * cercano: un solo click, sin tener que ir a buscar el botón de imprimir
 * dentro del visor. Si por lo que sea el navegador bloquea esto, se cae
 * a abrir el PDF en una pestaña visible para que la persona lo imprima
 * desde ahí con un click más. */
async function imprimirPdf(obtenerBlob: () => Promise<Blob>): Promise<void> {
  let blob: Blob;
  try {
    blob = await obtenerBlob();
  } catch (err) {
    toast({
      titulo: "No se pudo imprimir",
      descripcion: err instanceof Error ? err.message : "Error inesperado.",
      tono: "error"
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  let resuelto = false;
  const limpiar = () => {
    iframe.remove();
    URL.revokeObjectURL(url);
  };

  // Si el navegador bloquea el diálogo directo (o el PDF nunca termina de
  // cargar), se cae a una pestaña visible — pero avisando SIEMPRE por qué,
  // nunca en silencio (antes de esta corrección, la persona veía "se abrió
  // una pestaña en vez de imprimir" sin ninguna explicación).
  const caerAPestanaVisible = () => {
    if (resuelto) return;
    resuelto = true;
    window.open(url, "_blank");
    toast({
      titulo: "Se abrió en una pestaña nueva",
      descripcion: "Tu navegador no permitió abrir el diálogo de impresión directo — imprimí desde ahí con el botón de imprimir del visor.",
      tono: "info"
    });
    setTimeout(limpiar, 60_000);
  };

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = url;

  // Si el iframe nunca dispara `load` (PDF corrupto, bloqueado, lo que
  // sea), antes esto se quedaba colgado sin avisar nada — ahora cae al
  // respaldo visible después de un tiempo razonable.
  const timeoutCarga = setTimeout(caerAPestanaVisible, 8_000);

  iframe.onload = () => {
    clearTimeout(timeoutCarga);
    setTimeout(() => {
      if (resuelto) return;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        resuelto = true;
        setTimeout(limpiar, 60_000);
      } catch {
        caerAPestanaVisible();
      }
    }, 300);
  };

  document.body.appendChild(iframe);
}

/** Igual que `getBlob`, pero con `POST` + body JSON — usado por
 * `exportGenerar`: los filtros de exportación (rango, filtroAuditoria) son
 * objetos anidados, no entran razonablemente en un query string. Devuelve
 * también el nombre de archivo real que mandó el servidor
 * (Content-Disposition), para no tener que reconstruirlo del lado del cliente. */
async function postBlob(path: string, body: unknown): Promise<{ blob: Blob; nombreArchivo: string }> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión a internet.");
  }

  if (respuesta.status === 401) {
    useAuthStore.getState().setSesion(null);
  }

  if (!respuesta.ok) {
    let mensaje = `Error del servidor (${respuesta.status}).`;
    try {
      const cuerpo = await respuesta.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // Respuesta sin cuerpo JSON — se mantiene el mensaje genérico de arriba.
    }
    throw new ApiError(respuesta.status, mensaje);
  }

  const disposicion = respuesta.headers.get("Content-Disposition") ?? "";
  const match = disposicion.match(/filename="([^"]+)"/);
  return { blob: await respuesta.blob(), nombreArchivo: match?.[1] ?? "export" };
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

/** Stub tipado: cualquier método de DenszApi todavía no conectado a la
 * versión web. Nunca se llama silenciosamente "como si funcionara" — tira
 * un error explícito, igual que cualquier otro fallo de red, para que se
 * note de inmediato en desarrollo. */
function pendiente<T extends (...args: never[]) => unknown>(nombreMetodo: string): T {
  return ((..._args: unknown[]) => {
    throw new ApiError(0, `densz.${nombreMetodo}: todavía no está conectado en la versión web (pendiente de una etapa posterior).`);
  }) as unknown as T;
}

export const webApi: DenszApi = {
  plataforma: "web",

  ...crearMetodosHttpComunes({ get, post, put, patch, del }),

  // PDF de lista de precios: descarga autenticada vía GET
  // /listas-precio/pdf (nunca un path elegido por el cliente) y lo abre en
  // una pestaña nueva a partir de un blob local.
  listaPreciosVerPdf: (pdfPath) =>
    abrirPdfEnNuevaPestana(() => getBlob(`/listas-precio/pdf${buildQuery({ path: pdfPath })}`)),

  // Igual patrón que cuentasVerPdfResumen: descarga autenticada vía GET
  // /comprobantes/:id/pdf (nunca un path elegido por el cliente), abierta
  // en una pestaña nueva a partir de un blob local.
  comprobantesVerPdf: (comprobanteId) => abrirPdfEnNuevaPestana(() => getBlob(`/comprobantes/${comprobanteId}/pdf`)),
  // Impresión física SILENCIOSA (sin diálogo, a una impresora elegida de
  // antemano) solo existe en Desktop — ninguna API de navegador lo
  // permite. En Web, "Imprimir" dispara el diálogo de impresión nativo
  // del navegador directo sobre el PDF, sin abrir ninguna pestaña visible
  // (ver imprimirPdf).
  comprobantesImprimir: (comprobanteId) => imprimirPdf(() => getBlob(`/comprobantes/${comprobanteId}/pdf`)),

  // Descarga autenticada vía GET /cuentas/resumenes/:id/pdf (nunca un path
  // elegido por el cliente) y lo abre en una pestaña nueva a partir de un
  // blob local — nunca una URL pública de Supabase.
  cuentasVerPdfResumen: (resumenId) => abrirPdfEnNuevaPestana(() => getBlob(`/cuentas/resumenes/${resumenId}/pdf`)),

  // Backups: sin equivalente web (ver auditoría de frontend) — quedan
  // pendientes a propósito, no se van a conectar nunca del mismo modo.
  backupsListar: pendiente("backupsListar"),
  backupsCrear: pendiente("backupsCrear"),
  backupsVerificar: pendiente("backupsVerificar"),
  backupsElegirArchivo: pendiente("backupsElegirArchivo"),
  backupsRestaurar: pendiente("backupsRestaurar"),
  backupsListarUnidades: pendiente("backupsListarUnidades"),
  backupsUbicacionDisponible: pendiente("backupsUbicacionDisponible"),
  backupsObtenerConfig: pendiente("backupsObtenerConfig"),
  backupsGuardarConfig: pendiente("backupsGuardarConfig"),

  authLogin: (nombreUsuario, password) => post("/auth/login", { nombreUsuario, password }),
  authLoginGoogle: (accessToken) => post("/auth/google-callback", { accessToken }),
  authRegistrarseConGoogle: (nombreLaboratorio, accessToken) =>
    post("/auth/google-register", { accessToken, nombreLaboratorio }),
  authLogout: () => post("/auth/logout"),
  authSesionActual: () => get("/auth/session"),
  authUsuariosDisponibles: () => get("/auth/usuarios-disponibles"),

  // Exportación: descarga real vía el navegador (Content-Disposition:
  // attachment) — nunca un diálogo nativo, que no existe en la web.
  // Devuelve el nombre de archivo real como "ruta" (en Desktop era la ruta
  // local elegida en el diálogo; acá no hay una ruta de disco del lado del
  // cliente, así que el nombre de archivo es el dato equivalente más útil
  // para mostrar).
  exportGenerar: async (tipo, formato, nombreSugerido, opciones) => {
    const { blob, nombreArchivo } = await postBlob("/export", { tipo, formato, nombreSugerido, opciones });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    return nombreArchivo;
  },

  impresoraListar: pendiente("impresoraListar"),
  impresoraObtenerSeleccionada: pendiente("impresoraObtenerSeleccionada"),
  impresoraSeleccionar: pendiente("impresoraSeleccionar"),
  impresoraPrueba: pendiente("impresoraPrueba"),
  impresoraImprimirPdf: pendiente("impresoraImprimirPdf"),

  // No existe "versión instalada" que actualizar en un navegador — nunca
  // hay nada que escuchar acá, a diferencia del resto de `pendiente(...)`
  // esto no es un gap, es la web funcionando como corresponde.
  onActualizacionLista: () => () => {},
  reiniciarParaActualizar: () => {},

  // Idem: la web ya maneja un 401 directo en `apiFetch` (arriba), sin
  // necesidad de ningún evento — esto es exclusivo del escritorio
  // (apiClient.ts corre en otro proceso que el renderer).
  onSesionExpirada: () => () => {}
};
