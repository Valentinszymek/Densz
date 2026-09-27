import type { DenszApi } from "@shared/types/ipc-contracts";
import type { Orden, ResumenMensual, Pago } from "@shared/types/entities";
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
 * ESTADO ACTUAL (post Bloque 2 — ver informes de cada fase/bloque para el
 * detalle histórico completo):
 *
 * COMPLETOS: Odontólogos, Clínicas (incl. uso/eliminación segura),
 * Pacientes (incl. eliminación segura), Trabajos/OT, Precios/Categorías/
 * Prestaciones (incl. eliminación segura), Listas de precio (incl.
 * eliminación segura y PDF vía Storage), Pagos (incl. medios de pago),
 * Comprobantes (incl. PDF vía Storage), Cuentas, Estadísticas, Usuarios y
 * Roles (incl. eliminación segura), Auditoría, Configuración/identidad del
 * laboratorio, Protección (completa), Búsqueda global, Estado del sistema,
 * Exportación (CSV/XLSX/PDF vía descarga HTTP real).
 *
 * Eliminaciones seguras (Bloque 2 / Parte B): todas reutilizan tal cual la
 * función de repositorio existente (bloquean con un error claro si hay
 * historial, nunca DELETE en cascada) — `categoriasEliminar`,
 * `prestacionesEliminar`, `listasPrecioEliminar`, `pacientesEliminar`,
 * `usuariosEliminar`, `clinicasEliminar`/`clinicasUso`.
 *
 * PDFs vía Storage (bucket "documentos", privado, siempre por descarga
 * autenticada, nunca URL pública): `comprobantes/` (Comprobantes),
 * `estados-cuenta/` (Cuentas), `listas-precio/` (Listas de precio — objeto
 * efímero con nombre UUID aleatorio, sin registro en base; la descarga
 * valida ese formato exacto antes de aceptar el path que manda el
 * cliente, nunca uno arbitrario).
 *
 * Exportación (`exportGenerar`, Bloque 2 / Parte A): reutiliza
 * `exportService.ts` sin cambiar columnas/formato/permiso — la única
 * diferencia real es la entrega (`src/server/exportWeb.ts` escribe a un
 * temporal LOCAL DEL SERVIDOR, lo lee a memoria, lo borra, y lo sirve como
 * descarga HTTP real vía `Content-Disposition: attachment`; nunca un
 * diálogo nativo, que no existe en un navegador).
 *
 * PENDIENTES — Desktop-only, estructural (no pueden tener ruta HTTP):
 * `impresora*` (selección de impresora física), `comprobantesImprimir`
 * (impresión silenciosa), `backups*` (obsoleto en ambas plataformas desde
 * la migración a Supabase — la pantalla ya lo dice, no es un gap de Web).
 *
 * El resto de los métodos quedan como stubs (`pendiente(...)`) que tiran
 * un error CLARO si se llaman — nunca devuelven datos falsos ni fallan en
 * silencio.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

/** Arma un query string a partir de un objeto de filtro, omitiendo
 * undefined/null. Los booleans se mandan como "true"/"false" — el mismo
 * formato que espera `zBooleanQuery` en las rutas del backend. */
function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    usp.set(clave, String(valor));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
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
  // Conectados en Fase 12D: ambos tenían ruta HTTP ya construida
  // (system.route.ts, search.route.ts), sin ningún consumidor en webApi.ts.
  obtenerEstadoSistema: () => get("/system/status"),
  ping: () => get<{ ok: boolean }>("/health").then((r) => r.ok),
  buscarGlobal: (texto) => get(`/search${buildQuery({ q: texto })}`),

  // --- Configuración: identidad del laboratorio, conectada en esta etapa (Fase 10B) ---
  configLaboratorioObtener: () => get("/config/laboratorio"),
  configLaboratorioGuardar: (nombre) => put("/config/laboratorio", { nombre }).then(() => undefined),

  // --- Odontólogos: solo lectura conectada en esta etapa (Fase 4A) ---
  odontologosListar: (filtro) => get(`/odontologos${buildQuery(filtro ?? {})}`),
  odontologosObtener: (id) => get(`/odontologos/${id}`),
  odontologosEstadisticas: (id) => get(`/odontologos/${id}/estadisticas`),
  odontologosUltimaActividad: () => get("/odontologos/ultima-actividad"),
  // --- Odontólogos: escrituras conectadas en esta etapa (Fase 4B) ---
  odontologosCrear: (data) => post<number>("/odontologos", data),
  odontologosActualizar: (id, data) => put<{ ok: true }>(`/odontologos/${id}`, data).then(() => undefined),
  odontologosAsignarLista: (id, listaPrecioId) =>
    patch<{ ok: true }>(`/odontologos/${id}/lista-precio`, { listaPrecioId }).then(() => undefined),
  odontologosAsignarClinica: (id, clinicaId) =>
    patch<{ ok: true }>(`/odontologos/${id}/clinica`, { clinicaId }).then(() => undefined),
  odontologosSetActivo: (id, activo) => patch<{ ok: true }>(`/odontologos/${id}/activo`, { activo }).then(() => undefined),

  // --- Clínicas: lectura (Fase 5A) + escritura (Fase 5B) conectadas ---
  clinicasListar: (filtro) => get(`/clinicas${buildQuery(filtro ?? {})}`),
  clinicasObtener: (id) => get(`/clinicas/${id}`),
  clinicasEstadisticas: (id) => get(`/clinicas/${id}/estadisticas`),
  clinicasCrear: (data) => post<number>("/clinicas", data),
  clinicasActualizar: (id, data) => put<{ ok: true }>(`/clinicas/${id}`, data).then(() => undefined),
  clinicasSetActiva: (id, activo) => patch<{ ok: true }>(`/clinicas/${id}/activo`, { activo }).then(() => undefined),
  clinicasUso: (id) => get(`/clinicas/${id}/uso`),
  clinicasEliminar: (id) => del<{ ok: true }>(`/clinicas/${id}`).then(() => undefined),

  // --- Pacientes: lectura (Fase 6A) + escritura (Fase 12D) ---
  pacientesListar: (filtro) => get(`/pacientes${buildQuery(filtro ?? {})}`),
  pacientesObtener: (id) => get(`/pacientes/${id}`),
  pacientesCrear: (data) => post<number>("/pacientes", data),
  pacientesActualizar: (id, data) => put<{ ok: true }>(`/pacientes/${id}`, data).then(() => undefined),
  pacientesSetActivo: (id, activo) => patch<{ ok: true }>(`/pacientes/${id}/activo`, { activo }).then(() => undefined),
  pacientesCantidadTrabajos: (id) => get(`/pacientes/${id}/cantidad-trabajos`),
  // Eliminación segura (Bloque 2): borrado físico si no tiene historial,
  // inactivación si sí lo tiene — mismo criterio exacto que Desktop.
  pacientesEliminar: (id) => del(`/pacientes/${id}`),

  // --- Precios / Categorías: conectadas en esta etapa (Fase 12A) ---
  categoriasListar: (soloActivas) => get(`/precios/categorias${buildQuery({ soloActivas })}`),
  categoriasCrear: (nombre) => post<number>("/precios/categorias", { nombre }),
  categoriasActualizar: (id, nombre) => put<{ ok: true }>(`/precios/categorias/${id}`, { nombre }).then(() => undefined),
  categoriasSetActiva: (id, activo) =>
    patch<{ ok: true }>(`/precios/categorias/${id}/activo`, { activo }).then(() => undefined),
  categoriasMover: (id, direccion) =>
    patch<{ ok: true }>(`/precios/categorias/${id}/mover`, { direccion }).then(() => undefined),
  categoriasUso: (id) => get(`/precios/categorias/${id}/uso`),
  // Eliminación segura (Bloque 2): bloqueada si hay historial.
  categoriasEliminar: (id) => del<{ ok: true }>(`/precios/categorias/${id}`).then(() => undefined),

  // --- Precios / Prestaciones: conectadas en esta etapa (Fase 12A) ---
  prestacionesListar: (filtro) => get(`/precios/prestaciones${buildQuery(filtro ?? {})}`),
  prestacionesObtener: (id) => get(`/precios/prestaciones/${id}`),
  prestacionesCrear: (data) => post<number>("/precios/prestaciones", data),
  prestacionesActualizar: (id, data) => put<{ ok: true }>(`/precios/prestaciones/${id}`, data).then(() => undefined),
  prestacionesSetActiva: (id, activo) =>
    patch<{ ok: true }>(`/precios/prestaciones/${id}/activo`, { activo }).then(() => undefined),
  prestacionesUso: (id) => get(`/precios/prestaciones/${id}/uso`),
  // Eliminación segura (Bloque 2): bloqueada si hay historial.
  prestacionesEliminar: (id) => del<{ ok: true }>(`/precios/prestaciones/${id}`).then(() => undefined),

  // --- Listas de precio: conectadas en esta etapa (Fase 12A) ---
  listasPrecioListar: (soloActivas) => get(`/listas-precio${buildQuery({ soloActivas })}`),
  listasPrecioObtener: (id) => get(`/listas-precio/${id}`),
  listasPrecioCrear: (data) => post<number>("/listas-precio", data),
  listasPrecioActualizar: (id, nombre) => put<{ ok: true }>(`/listas-precio/${id}`, { nombre }).then(() => undefined),
  listasPrecioSetActiva: (id, activo) =>
    patch<{ ok: true }>(`/listas-precio/${id}/activo`, { activo }).then(() => undefined),
  listasPrecioItems: (listaId, soloActivas) => get(`/listas-precio/${listaId}/items${buildQuery({ soloActivas })}`),
  listasPrecioHistorialItem: (listaId, prestacionId) =>
    get(`/listas-precio/${listaId}/items/${prestacionId}/historial`),
  listasPrecioCambiarPrecio: (listaId, prestacionId, nuevoPrecioCentavos) =>
    patch<{ ok: true }>(`/listas-precio/${listaId}/items/${prestacionId}/precio`, { nuevoPrecioCentavos }).then(
      () => undefined
    ),
  listasPrecioUso: (id) => get(`/listas-precio/${id}/uso`),
  // Eliminación segura (Bloque 2): bloqueada si está asignada a algún
  // odontólogo o tiene uso histórico.
  listasPrecioEliminar: (id) => del<{ ok: true }>(`/listas-precio/${id}`).then(() => undefined),

  // PDF de lista de precios (Bloque 2 / Parte C): genera y sube a Storage
  // (bucket "documentos", prefijo "listas-precio/") vía
  // src/server/listaPreciosWeb.ts, mismo patrón que Comprobantes/Cuentas.
  // Puramente informativo — no crea ningún registro ni toca precios.
  listaPreciosGenerar: (opciones) => post("/listas-precio/pdf", opciones),
  listaPreciosVerPdf: (pdfPath) =>
    abrirPdfEnNuevaPestana(() => getBlob(`/listas-precio/pdf${buildQuery({ path: pdfPath })}`)),

  // --- Trabajos/OT: lectura (Fase 7A) + escritura (Fase 7B) conectadas ---
  ordenesListar: (filtro) => get(`/trabajos${buildQuery(filtro ?? {})}`),
  ordenesObtener: (id) => get(`/trabajos/${id}`),
  ordenesCrear: (data) => post<Orden>("/trabajos", data),
  ordenesEditar: (id, data) => put<Orden>(`/trabajos/${id}`, data),
  ordenesAnular: (id, motivo) => patch<{ ok: true }>(`/trabajos/${id}/anular`, { motivo }).then(() => undefined),
  ordenesEliminar: (id, motivo) => del<{ ok: true }>(`/trabajos/${id}`, { motivo }).then(() => undefined),
  ordenesEditarFecha: (id, fechaTrabajo) =>
    patch<{ ok: true }>(`/trabajos/${id}/fecha`, { fechaTrabajo }).then(() => undefined),

  // --- Comprobantes: conectados en esta etapa (Fase 12B) ---
  comprobantesGenerar: (ordenId) => post("/comprobantes", { ordenId }),
  comprobantesObtenerPorOrden: (ordenId) => get(`/comprobantes/orden/${ordenId}`),
  comprobantesListar: (filtro) => get(`/comprobantes${buildQuery(filtro ?? {})}`),
  // Igual patrón que cuentasVerPdfResumen (Fase 8D): descarga autenticada
  // vía GET /comprobantes/:id/pdf (nunca un path elegido por el cliente),
  // abierta en una pestaña nueva a partir de un blob local.
  comprobantesVerPdf: (comprobanteId) => abrirPdfEnNuevaPestana(() => getBlob(`/comprobantes/${comprobanteId}/pdf`)),
  // Impresión física silenciosa: sin equivalente web, no existe ruta HTTP
  // (fuera de alcance de Fase 12B — ver informe).
  comprobantesImprimir: pendiente("comprobantesImprimir"),

  // --- Cuentas: solo lectura conectada en esta etapa (Fase 8B) ---
  cuentasSaldos: (odontologoId) => get(`/cuentas/${odontologoId}/saldos`),
  cuentasSaldosClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/saldos`),
  cuentasListarSaldos: () => get("/cuentas/saldos"),
  cuentasListarSaldosClinicas: () => get("/cuentas/saldos/clinicas"),
  cuentasMovimientos: (odontologoId) => get(`/cuentas/${odontologoId}/movimientos`),
  cuentasMovimientosClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/movimientos`),
  cuentasResumenMes: (odontologoId, periodo) => get(`/cuentas/${odontologoId}/resumen-mes${buildQuery(periodo)}`),
  cuentasResumenMesClinica: (clinicaId, periodo) => get(`/cuentas/clinica/${clinicaId}/resumen-mes${buildQuery(periodo)}`),
  // Fase 8C: generan el registro real (resumenes_mensuales) igual que
  // Desktop. Fase 8D: el PDF ahora se sube a Storage (bucket "documentos",
  // prefijo "estados-cuenta/") vía src/server/cuentasWeb.ts, mismo patrón
  // que Comprobantes — pdf_path pasa a ser el object path, nunca una ruta
  // local ni una URL pública.
  cuentasImprimirEstadoDeCuenta: (odontologoId, periodo) =>
    post<ResumenMensual[]>(`/cuentas/${odontologoId}/generar-resumen`, periodo),
  cuentasImprimirEstadoDeCuentaClinica: (clinicaId, periodo) =>
    post<ResumenMensual[]>(`/cuentas/clinica/${clinicaId}/generar-resumen`, periodo),
  cuentasListarResumenes: (odontologoId) => get(`/cuentas/${odontologoId}/resumenes`),
  cuentasListarResumenesClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/resumenes`),
  // Fase 8D: descarga autenticada vía GET /cuentas/resumenes/:id/pdf (nunca
  // un path elegido por el cliente) y lo abre en una pestaña nueva a partir
  // de un blob local — nunca una URL pública de Supabase.
  cuentasVerPdfResumen: (resumenId) => abrirPdfEnNuevaPestana(() => getBlob(`/cuentas/resumenes/${resumenId}/pdf`)),
  cuentasTienePagos: (titular) => get(`/cuentas/tiene-pagos${buildQuery(titular)}`),

  // --- Pagos: solo lectura conectada en esta etapa (Fase 8A) ---
  pagosListar: (odontologoId) => get(`/pagos${buildQuery({ odontologoId })}`),
  pagosListarClinica: (clinicaId) => get(`/pagos/clinica/${clinicaId}`),
  // El backend responde 409 (no 2xx) para "posible duplicado, confirmá
  // explícitamente" — no es un error real, es parte del contrato normal
  // de ResultadoRegistrarPagoDto, así que acá se traduce de vuelta a un
  // valor resuelto en vez de dejar que se propague como ApiError.
  pagosRegistrar: async (data, confirmarDuplicado) => {
    try {
      return await post<{ creado: true; pago: Pago }>("/pagos", { ...data, confirmarDuplicado });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        return { creado: false, posibleDuplicado: true };
      }
      throw err;
    }
  },
  pagosAnular: (id, motivo) => patch<{ ok: true }>(`/pagos/${id}/anular`, { motivo }).then(() => undefined),
  mediosPagoListar: () => get("/pagos/medios"),
  mediosPagoCrear: (nombre) => post<number>("/pagos/medios", { nombre }),
  pagosListarUltimos: (limite) => get(`/pagos/ultimos${buildQuery({ limite })}`),

  // --- Estadísticas: solo lectura conectada en esta etapa (Fase 9A) ---
  estadisticasKpis: (rango) => get(`/estadisticas/kpis${buildQuery(rango)}`),
  estadisticasTrabajosPorDia: (rango) => get(`/estadisticas/trabajos-por-dia${buildQuery(rango)}`),
  estadisticasIngresosPorOdontologo: (rango) => get(`/estadisticas/ingresos-por-odontologo${buildQuery(rango)}`),
  estadisticasTrabajosPorCategoria: (rango) => get(`/estadisticas/trabajos-por-categoria${buildQuery(rango)}`),
  estadisticasEvolucion: (rango) => get(`/estadisticas/evolucion${buildQuery(rango)}`),
  estadisticasRankingOdontologos: (rango) => get(`/estadisticas/ranking-odontologos${buildQuery(rango)}`),
  estadisticasRankingClinicas: (rango) => get(`/estadisticas/ranking-clinicas${buildQuery(rango)}`),
  estadisticasPrestacionesRanking: (rango) => get(`/estadisticas/prestaciones-ranking${buildQuery(rango)}`),
  estadisticasSaldosPendientesTop: (limite) => get(`/estadisticas/saldos-pendientes-top${buildQuery({ limite })}`),
  // Sin permiso ni protección — igual que en el backend/Desktop (alimenta Inicio).
  estadisticasResumenOperativo: (rango) => get(`/estadisticas/resumen-operativo${buildQuery(rango)}`),

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

  // --- Implementados de verdad en esta etapa (Fase 1+2+3) ---
  authLogin: (nombreUsuario, password) => post("/auth/login", { nombreUsuario, password }),
  authLogout: () => post("/auth/logout"),
  authSesionActual: () => get("/auth/session"),
  authUsuariosDisponibles: () => get("/auth/usuarios-disponibles"),

  // --- Usuarios: completo salvo eliminación (Fase 10A lectura + Bloque 1 escritura) ---
  usuariosListar: () => get("/usuarios"),
  usuariosListarRoles: () => get("/usuarios/roles"),
  usuariosCrear: (data, password) => post<number>("/usuarios", { ...data, password }),
  usuariosActualizar: (id, data) => put<{ ok: true }>(`/usuarios/${id}`, data).then(() => undefined),
  usuariosCambiarPassword: (id, nuevaPassword) =>
    patch<{ ok: true }>(`/usuarios/${id}/password`, { nuevaPassword }).then(() => undefined),
  usuariosSetActivo: (id, activo) => patch<{ ok: true }>(`/usuarios/${id}/activo`, { activo }).then(() => undefined),
  // Eliminación segura (Bloque 2): bloqueada si el usuario tiene cualquier
  // historial asociado; nunca permite eliminar el propio usuario conectado.
  usuariosEliminar: (id) => del<{ ok: true }>(`/usuarios/${id}`).then(() => undefined),

  // --- Auditoría: solo lectura conectada en esta etapa (Fase 10A) ---
  auditoriaListar: (filtro) => get(`/auditoria${buildQuery(filtro ?? {})}`),
  auditoriaOpcionesFiltro: () => get("/auditoria/opciones-filtro"),

  // Exportación (Bloque 2 / Parte A): descarga real vía el navegador
  // (Content-Disposition: attachment) — nunca un diálogo nativo, que no
  // existe en la web. Devuelve el nombre de archivo real como "ruta" (en
  // Desktop era la ruta local elegida en el diálogo; acá no hay una ruta
  // de disco del lado del cliente, así que el nombre de archivo es el
  // dato equivalente más útil para mostrar).
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

  // Protección de Cuentas/Estadísticas — completo (Fase 8B lectura/
  // desbloqueo + Fase 10C administración). El desbloqueo y el bloqueo son
  // por sesión HTTP (nunca un estado global compartido entre navegadores).
  proteccionEstado: () => get("/proteccion/estado"),
  proteccionBloquear: () => post("/proteccion/bloquear").then(() => undefined),
  proteccionDesbloquear: (password) => post<{ ok: boolean }>("/proteccion/verificar", { password }).then((r) => r.ok),
  proteccionActivar: (data) => post("/proteccion/activar", data),
  proteccionDesactivar: (passwordActual) => post("/proteccion/desactivar", { passwordActual }).then(() => undefined),
  proteccionCambiarPassword: (data) => post("/proteccion/cambiar-password", data).then(() => undefined),
  proteccionGenerarCodigo: () => post("/proteccion/generar-codigo"),
  proteccionVerificarCodigo: (codigo) =>
    post<{ ok: boolean }>("/proteccion/verificar-codigo", { codigo }).then((r) => r.ok),
  proteccionRestablecerConCodigo: (data) => post("/proteccion/restablecer-con-codigo", data)
};
