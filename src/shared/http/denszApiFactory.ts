import type { DenszApi } from "../types/ipc-contracts";
import type { Orden, ResumenMensual, Pago, MovimientoCuenta } from "../types/entities";
import { ApiError } from "./ApiError";

/**
 * Fábrica compartida de los métodos de `DenszApi` que son un simple
 * GET/POST/PUT/PATCH/DELETE — sin ninguna dependencia de navegador (sin
 * `window`, sin `document`, sin stores de Zustand) ni de Node/Electron, así
 * que la misma función sirve tanto para `src/renderer/webApi.ts` (navegador,
 * cookie de sesión) como para el cliente HTTP del escritorio
 * (`src/main/services/apiClient.ts`, proceso principal de Electron, token
 * `Authorization: Bearer`) — cada uno le pasa sus propias primitivas
 * (`get`/`post`/`put`/`patch`/`del`), ya resueltas contra su propia base de
 * sesión.
 *
 * Quedan AFUERA de esta fábrica (y se implementan a mano en cada
 * plataforma) los métodos con una dependencia genuinamente distinta por
 * plataforma: todo `auth*` (login/logout — la forma de conseguir/guardar la
 * sesión difiere), los que devuelven un PDF para mostrar
 * (`comprobantesVerPdf`, `cuentasVerPdfResumen`, `listaPreciosVerPdf`,
 * `comprobantesImprimir` — blob + pestaña del navegador vs blob + ventana
 * nativa), `exportGenerar` (descarga del navegador vs diálogo nativo de
 * guardado), `impresora*`/`backups*` (Electron nativo, sin equivalente
 * real en la web) y `onActualizacionLista`/`reiniciarParaActualizar`
 * (actualización del instalador, no existe en un navegador).
 */

/** Las primitivas HTTP que cada plataforma le inyecta a la fábrica — ya
 * resueltas contra su propia forma de llevar la sesión (cookie para la web,
 * header `Authorization` para el escritorio). */
export interface HttpPrimitives {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string, body?: unknown): Promise<T>;
}

/** Métodos de `DenszApi` que cada plataforma implementa a mano — ver el
 * comentario de arriba para el motivo de cada uno. */
export type MetodosEspecificosPorPlataforma =
  | "plataforma"
  | "authLogin"
  | "authLoginGoogle"
  | "authRegistrarseConGoogle"
  | "authLogout"
  | "authSesionActual"
  | "authUsuariosDisponibles"
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
  | "reiniciarParaActualizar";

/** Arma un query string a partir de un objeto de filtro, omitiendo
 * undefined/null. Los booleans se mandan como "true"/"false" — el mismo
 * formato que espera `zBooleanQuery` en las rutas del backend. */
export function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null) continue;
    usp.set(clave, String(valor));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export function crearMetodosHttpComunes(http: HttpPrimitives): Omit<DenszApi, MetodosEspecificosPorPlataforma> {
  const { get, post, put, patch, del } = http;

  return {
    obtenerEstadoSistema: () => get("/system/status"),
    ping: () => get<{ ok: boolean }>("/health").then((r) => r.ok),
    buscarGlobal: (texto) => get(`/search${buildQuery({ q: texto })}`),

    // --- Configuración: identidad del laboratorio ---
    configLaboratorioObtener: () => get("/config/laboratorio"),
    configLaboratorioGuardar: (nombre) => put("/config/laboratorio", { nombre }).then(() => undefined),

    configTamanoImpresionObtener: () => get("/config/tamano-impresion"),
    configTamanoImpresionGuardar: (valor) => put("/config/tamano-impresion", { valor }).then(() => undefined),

    // --- Odontólogos ---
    odontologosListar: (filtro) => get(`/odontologos${buildQuery(filtro ?? {})}`),
    odontologosObtener: (id) => get(`/odontologos/${id}`),
    odontologosEstadisticas: (id) => get(`/odontologos/${id}/estadisticas`),
    odontologosUltimaActividad: () => get("/odontologos/ultima-actividad"),
    odontologosCrear: (data) => post<number>("/odontologos", data),
    odontologosActualizar: (id, data) => put<{ ok: true }>(`/odontologos/${id}`, data).then(() => undefined),
    odontologosAsignarLista: (id, listaPrecioId) =>
      patch<{ ok: true }>(`/odontologos/${id}/lista-precio`, { listaPrecioId }).then(() => undefined),
    odontologosAsignarClinica: (id, clinicaId) =>
      patch<{ ok: true }>(`/odontologos/${id}/clinica`, { clinicaId }).then(() => undefined),
    odontologosSetActivo: (id, activo) => patch<{ ok: true }>(`/odontologos/${id}/activo`, { activo }).then(() => undefined),

    // --- Clínicas ---
    clinicasListar: (filtro) => get(`/clinicas${buildQuery(filtro ?? {})}`),
    clinicasObtener: (id) => get(`/clinicas/${id}`),
    clinicasEstadisticas: (id) => get(`/clinicas/${id}/estadisticas`),
    clinicasCrear: (data) => post<number>("/clinicas", data),
    clinicasActualizar: (id, data) => put<{ ok: true }>(`/clinicas/${id}`, data).then(() => undefined),
    clinicasSetActiva: (id, activo) => patch<{ ok: true }>(`/clinicas/${id}/activo`, { activo }).then(() => undefined),
    clinicasUso: (id) => get(`/clinicas/${id}/uso`),
    clinicasEliminar: (id) => del<{ ok: true }>(`/clinicas/${id}`).then(() => undefined),

    // --- Pacientes ---
    pacientesListar: (filtro) => get(`/pacientes${buildQuery(filtro ?? {})}`),
    pacientesObtener: (id) => get(`/pacientes/${id}`),
    pacientesCrear: (data) => post<number>("/pacientes", data),
    pacientesActualizar: (id, data) => put<{ ok: true }>(`/pacientes/${id}`, data).then(() => undefined),
    pacientesSetActivo: (id, activo) => patch<{ ok: true }>(`/pacientes/${id}/activo`, { activo }).then(() => undefined),
    pacientesCantidadTrabajos: (id) => get(`/pacientes/${id}/cantidad-trabajos`),
    // Eliminación segura: borrado físico si no tiene historial, inactivación si sí lo tiene.
    pacientesEliminar: (id) => del(`/pacientes/${id}`),

    // --- Precios / Categorías ---
    categoriasListar: (soloActivas) => get(`/precios/categorias${buildQuery({ soloActivas })}`),
    categoriasCrear: (nombre) => post<number>("/precios/categorias", { nombre }),
    categoriasActualizar: (id, nombre) => put<{ ok: true }>(`/precios/categorias/${id}`, { nombre }).then(() => undefined),
    categoriasSetActiva: (id, activo) =>
      patch<{ ok: true }>(`/precios/categorias/${id}/activo`, { activo }).then(() => undefined),
    categoriasMover: (id, direccion) =>
      patch<{ ok: true }>(`/precios/categorias/${id}/mover`, { direccion }).then(() => undefined),
    categoriasUso: (id) => get(`/precios/categorias/${id}/uso`),
    categoriasEliminar: (id) => del<{ ok: true }>(`/precios/categorias/${id}`).then(() => undefined),

    // --- Precios / Prestaciones ---
    prestacionesListar: (filtro) => get(`/precios/prestaciones${buildQuery(filtro ?? {})}`),
    prestacionesObtener: (id) => get(`/precios/prestaciones/${id}`),
    prestacionesCrear: (data) => post<number>("/precios/prestaciones", data),
    prestacionesActualizar: (id, data) => put<{ ok: true }>(`/precios/prestaciones/${id}`, data).then(() => undefined),
    prestacionesSetActiva: (id, activo) =>
      patch<{ ok: true }>(`/precios/prestaciones/${id}/activo`, { activo }).then(() => undefined),
    prestacionesUso: (id) => get(`/precios/prestaciones/${id}/uso`),
    prestacionesEliminar: (id) => del<{ ok: true }>(`/precios/prestaciones/${id}`).then(() => undefined),

    // --- Listas de precio ---
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
    listasPrecioEliminar: (id) => del<{ ok: true }>(`/listas-precio/${id}`).then(() => undefined),
    // Genera y sube el PDF a Storage — devuelve el path, el visor
    // (platform-specific) es quien lo descarga y muestra.
    listaPreciosGenerar: (opciones) => post("/listas-precio/pdf", opciones),

    // --- Trabajos/OT ---
    ordenesListar: (filtro) => get(`/trabajos${buildQuery(filtro ?? {})}`),
    ordenesObtener: (id) => get(`/trabajos/${id}`),
    ordenesCrear: (data) => post<Orden>("/trabajos", data),
    ordenesEditar: (id, data) => put<Orden>(`/trabajos/${id}`, data),
    ordenesAnular: (id, motivo) => patch<{ ok: true }>(`/trabajos/${id}/anular`, { motivo }).then(() => undefined),
    ordenesEliminar: (id, motivo) => del<{ ok: true }>(`/trabajos/${id}`, { motivo }).then(() => undefined),
    ordenesEditarFecha: (id, fechaTrabajo) =>
      patch<{ ok: true }>(`/trabajos/${id}/fecha`, { fechaTrabajo }).then(() => undefined),

    // --- Comprobantes ---
    comprobantesGenerar: (ordenId) => post("/comprobantes", { ordenId }),
    comprobantesObtenerPorOrden: (ordenId) => get(`/comprobantes/orden/${ordenId}`),
    comprobantesListar: (filtro) => get(`/comprobantes${buildQuery(filtro ?? {})}`),

    // --- Cuentas ---
    cuentasSaldos: (odontologoId) => get(`/cuentas/${odontologoId}/saldos`),
    cuentasSaldosClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/saldos`),
    cuentasListarSaldos: () => get("/cuentas/saldos"),
    cuentasListarSaldosClinicas: () => get("/cuentas/saldos/clinicas"),
    cuentasMovimientos: (odontologoId) => get(`/cuentas/${odontologoId}/movimientos`),
    cuentasMovimientosClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/movimientos`),
    cuentasResumenMes: (odontologoId, periodo) => get(`/cuentas/${odontologoId}/resumen-mes${buildQuery(periodo)}`),
    cuentasResumenMesClinica: (clinicaId, periodo) =>
      get(`/cuentas/clinica/${clinicaId}/resumen-mes${buildQuery(periodo)}`),
    // Genera el registro real (resumenes_mensuales) y sube el PDF a Storage
    // — el visor (platform-specific) es quien lo descarga y muestra.
    cuentasImprimirEstadoDeCuenta: (odontologoId, periodo) =>
      post<ResumenMensual[]>(`/cuentas/${odontologoId}/generar-resumen`, periodo),
    cuentasImprimirEstadoDeCuentaClinica: (clinicaId, periodo) =>
      post<ResumenMensual[]>(`/cuentas/clinica/${clinicaId}/generar-resumen`, periodo),
    cuentasListarResumenes: (odontologoId) => get(`/cuentas/${odontologoId}/resumenes`),
    cuentasListarResumenesClinica: (clinicaId) => get(`/cuentas/clinica/${clinicaId}/resumenes`),
    cuentasTienePagos: (titular) => get(`/cuentas/tiene-pagos${buildQuery(titular)}`),

    // --- Pagos ---
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
    deudasRegistrar: (data) => post<MovimientoCuenta>("/deudas", data),
    deudasEditar: (id, data) => patch<MovimientoCuenta>(`/deudas/${id}`, data),
    deudasAnular: (id, motivo) => patch<{ ok: true }>(`/deudas/${id}/anular`, { motivo }).then(() => undefined),

    // --- Estadísticas ---
    estadisticasKpis: (rango) => get(`/estadisticas/kpis${buildQuery(rango)}`),
    estadisticasTrabajosPorDia: (rango) => get(`/estadisticas/trabajos-por-dia${buildQuery(rango)}`),
    estadisticasIngresosPorOdontologo: (rango) => get(`/estadisticas/ingresos-por-odontologo${buildQuery(rango)}`),
    estadisticasTrabajosPorCategoria: (rango) => get(`/estadisticas/trabajos-por-categoria${buildQuery(rango)}`),
    estadisticasEvolucion: (rango) => get(`/estadisticas/evolucion${buildQuery(rango)}`),
    estadisticasRankingOdontologos: (rango) => get(`/estadisticas/ranking-odontologos${buildQuery(rango)}`),
    estadisticasRankingClinicas: (rango) => get(`/estadisticas/ranking-clinicas${buildQuery(rango)}`),
    estadisticasPrestacionesRanking: (rango) => get(`/estadisticas/prestaciones-ranking${buildQuery(rango)}`),
    estadisticasSaldosPendientesTop: (limite) => get(`/estadisticas/saldos-pendientes-top${buildQuery({ limite })}`),
    // Sin permiso ni protección — igual que en el backend (alimenta Inicio).
    estadisticasResumenOperativo: (rango) => get(`/estadisticas/resumen-operativo${buildQuery(rango)}`),

    // --- Usuarios ---
    usuariosListar: () => get("/usuarios"),
    usuariosListarRoles: () => get("/usuarios/roles"),
    usuariosCrear: (data, password) => post<number>("/usuarios", { ...data, password }),
    usuariosActualizar: (id, data) => put<{ ok: true }>(`/usuarios/${id}`, data).then(() => undefined),
    usuariosCambiarPassword: (id, nuevaPassword) =>
      patch<{ ok: true }>(`/usuarios/${id}/password`, { nuevaPassword }).then(() => undefined),
    usuariosSetActivo: (id, activo) => patch<{ ok: true }>(`/usuarios/${id}/activo`, { activo }).then(() => undefined),
    // Eliminación segura: bloqueada si el usuario tiene cualquier historial
    // asociado; nunca permite eliminar el propio usuario conectado.
    usuariosEliminar: (id) => del<{ ok: true }>(`/usuarios/${id}`).then(() => undefined),

    // --- Auditoría ---
    auditoriaListar: (filtro) => get(`/auditoria${buildQuery(filtro ?? {})}`),
    auditoriaOpcionesFiltro: () => get("/auditoria/opciones-filtro"),

    laboratoriosListar: () => get("/laboratorios"),

    billingEstado: () => get("/billing/estado"),
    billingCheckout: (plan, moneda) => post("/billing/checkout", { plan, moneda }),
    billingCancelar: () => post<{ ok: true }>("/billing/cancelar").then(() => undefined),

    // --- Protección de Cuentas/Estadísticas ---
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
}
