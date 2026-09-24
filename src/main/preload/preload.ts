import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DenszApi } from "../../shared/types/ipc-contracts";

// Nota: este archivo se empaqueta con esbuild (scripts/bundle-preload.mjs)
// en un único .js sin requires locales, porque con sandbox: true el
// preload de Electron no puede resolver otros archivos del proyecto en
// tiempo de ejecución (ver README, sección de arquitectura). Gracias al
// bundling, sí se puede importar IPC_CHANNELS normalmente como en
// cualquier otro archivo del proceso main.

const api: DenszApi = {
  obtenerEstadoSistema: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_STATUS),
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PING),
  buscarGlobal: (texto) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_GLOBAL, texto),

  configLaboratorioObtener: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LABORATORIO_OBTENER),
  configLaboratorioGuardar: (nombre) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LABORATORIO_GUARDAR, nombre),

  odontologosListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_LISTAR, filtro),
  odontologosObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_OBTENER, id),
  odontologosEstadisticas: (id) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_ESTADISTICAS, id),
  odontologosUltimaActividad: () => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_ULTIMA_ACTIVIDAD),
  odontologosCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_CREAR, data),
  odontologosActualizar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_ACTUALIZAR, id, data),
  odontologosAsignarLista: (id, listaPrecioId) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_LISTA, id, listaPrecioId),
  odontologosAsignarClinica: (id, clinicaId) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_CLINICA, id, clinicaId),
  odontologosSetActivo: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.ODONTOLOGOS_SET_ACTIVO, id, activo),

  clinicasListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_LISTAR, filtro),
  clinicasObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_OBTENER, id),
  clinicasEstadisticas: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_ESTADISTICAS, id),
  clinicasCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_CREAR, data),
  clinicasActualizar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_ACTUALIZAR, id, data),
  clinicasSetActiva: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_SET_ACTIVA, id, activo),
  clinicasUso: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_USO, id),
  clinicasEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLINICAS_ELIMINAR, id),

  pacientesListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_LISTAR, filtro),
  pacientesObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_OBTENER, id),
  pacientesCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_CREAR, data),
  pacientesActualizar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_ACTUALIZAR, id, data),
  pacientesSetActivo: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_SET_ACTIVO, id, activo),
  pacientesCantidadTrabajos: (id) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_CANTIDAD_TRABAJOS, id),
  pacientesEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.PACIENTES_ELIMINAR, id),

  categoriasListar: (soloActivas) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_LISTAR, soloActivas),
  categoriasCrear: (nombre) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_CREAR, nombre),
  categoriasActualizar: (id, nombre) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_ACTUALIZAR, id, nombre),
  categoriasSetActiva: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_SET_ACTIVA, id, activo),
  categoriasMover: (id, direccion) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_MOVER, id, direccion),
  categoriasUso: (id) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_USO, id),
  categoriasEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_ELIMINAR, id),

  prestacionesListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_LISTAR, filtro),
  prestacionesObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_OBTENER, id),
  prestacionesCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_CREAR, data),
  prestacionesActualizar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_ACTUALIZAR, id, data),
  prestacionesSetActiva: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_SET_ACTIVA, id, activo),
  prestacionesUso: (id) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_USO, id),
  prestacionesEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.PRESTACIONES_ELIMINAR, id),

  listasPrecioListar: (soloActivas) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_LISTAR, soloActivas),
  listasPrecioObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_OBTENER, id),
  listasPrecioCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_CREAR, data),
  listasPrecioActualizar: (id, nombre) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_ACTUALIZAR, id, nombre),
  listasPrecioSetActiva: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_SET_ACTIVA, id, activo),
  listasPrecioItems: (listaId, soloActivas) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_ITEMS, listaId, soloActivas),
  listasPrecioHistorialItem: (listaId, prestacionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_HISTORIAL_ITEM, listaId, prestacionId),
  listasPrecioCambiarPrecio: (listaId, prestacionId, nuevoPrecioCentavos) =>
    ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_CAMBIAR_PRECIO, listaId, prestacionId, nuevoPrecioCentavos),
  listasPrecioUso: (id) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_USO, id),
  listasPrecioEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.LISTAS_PRECIO_ELIMINAR, id),

  listaPreciosGenerar: (opciones) => ipcRenderer.invoke(IPC_CHANNELS.LISTA_PRECIOS_GENERAR, opciones),
  listaPreciosVerPdf: (pdfPath) => ipcRenderer.invoke(IPC_CHANNELS.LISTA_PRECIOS_VER_PDF, pdfPath),

  ordenesListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_LISTAR, filtro),
  ordenesObtener: (id) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_OBTENER, id),
  ordenesCrear: (data) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_CREAR, data),
  ordenesEditar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_EDITAR, id, data),
  ordenesAnular: (id, motivo) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_ANULAR, id, motivo),
  ordenesEliminar: (id, motivo) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_ELIMINAR, id, motivo),
  ordenesEditarFecha: (id, fechaTrabajo) => ipcRenderer.invoke(IPC_CHANNELS.ORDENES_EDITAR_FECHA, id, fechaTrabajo),

  comprobantesGenerar: (ordenId) => ipcRenderer.invoke(IPC_CHANNELS.COMPROBANTES_GENERAR, ordenId),
  comprobantesObtenerPorOrden: (ordenId) => ipcRenderer.invoke(IPC_CHANNELS.COMPROBANTES_OBTENER_POR_ORDEN, ordenId),
  comprobantesListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.COMPROBANTES_LISTAR, filtro),
  comprobantesVerPdf: (comprobanteId) => ipcRenderer.invoke(IPC_CHANNELS.COMPROBANTES_VER_PDF, comprobanteId),
  comprobantesImprimir: (comprobanteId) => ipcRenderer.invoke(IPC_CHANNELS.COMPROBANTES_IMPRIMIR, comprobanteId),

  proteccionEstado: () => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_ESTADO),
  proteccionBloquear: () => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_BLOQUEAR),
  proteccionDesbloquear: (password) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_DESBLOQUEAR, password),
  proteccionActivar: (data) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_ACTIVAR, data),
  proteccionDesactivar: (passwordActual) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_DESACTIVAR, passwordActual),
  proteccionCambiarPassword: (data) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_CAMBIAR_PASSWORD, data),
  proteccionGenerarCodigo: () => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_GENERAR_CODIGO),
  proteccionVerificarCodigo: (codigo) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_VERIFICAR_CODIGO, codigo),
  proteccionRestablecerConCodigo: (data) => ipcRenderer.invoke(IPC_CHANNELS.PROTECCION_RESTABLECER_CON_CODIGO, data),

  cuentasSaldos: (odontologoId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_SALDOS, odontologoId),
  cuentasSaldosClinica: (clinicaId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_SALDOS_CLINICA, clinicaId),
  cuentasListarSaldos: () => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS),
  cuentasListarSaldosClinicas: () => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS_CLINICAS),
  cuentasMovimientos: (odontologoId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_MOVIMIENTOS, odontologoId),
  cuentasMovimientosClinica: (clinicaId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_MOVIMIENTOS_CLINICA, clinicaId),
  cuentasResumenMes: (odontologoId, periodo) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_RESUMEN_MES, odontologoId, periodo),
  cuentasResumenMesClinica: (clinicaId, periodo) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_RESUMEN_MES_CLINICA, clinicaId, periodo),
  cuentasImprimirEstadoDeCuenta: (odontologoId, periodo) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO, odontologoId, periodo),
  cuentasImprimirEstadoDeCuentaClinica: (clinicaId, periodo) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO_CLINICA, clinicaId, periodo),
  cuentasListarResumenes: (odontologoId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES, odontologoId),
  cuentasListarResumenesClinica: (clinicaId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES_CLINICA, clinicaId),
  cuentasVerPdfResumen: (resumenId) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_VER_PDF_RESUMEN, resumenId),
  cuentasTienePagos: (titular) => ipcRenderer.invoke(IPC_CHANNELS.CUENTAS_TIENE_PAGOS, titular),

  pagosListar: (odontologoId) => ipcRenderer.invoke(IPC_CHANNELS.PAGOS_LISTAR, odontologoId),
  pagosListarClinica: (clinicaId) => ipcRenderer.invoke(IPC_CHANNELS.PAGOS_LISTAR_CLINICA, clinicaId),
  pagosRegistrar: (data, confirmarDuplicado) =>
    ipcRenderer.invoke(IPC_CHANNELS.PAGOS_REGISTRAR, data, confirmarDuplicado),
  pagosAnular: (id, motivo) => ipcRenderer.invoke(IPC_CHANNELS.PAGOS_ANULAR, id, motivo),
  mediosPagoListar: () => ipcRenderer.invoke(IPC_CHANNELS.MEDIOS_PAGO_LISTAR),
  mediosPagoCrear: (nombre) => ipcRenderer.invoke(IPC_CHANNELS.MEDIOS_PAGO_CREAR, nombre),
  pagosListarUltimos: (limite) => ipcRenderer.invoke(IPC_CHANNELS.PAGOS_LISTAR_ULTIMOS, limite),

  estadisticasKpis: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_KPIS, rango),
  estadisticasTrabajosPorDia: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_DIA, rango),
  estadisticasIngresosPorOdontologo: (rango) =>
    ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_INGRESOS_POR_ODONTOLOGO, rango),
  estadisticasTrabajosPorCategoria: (rango) =>
    ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_CATEGORIA, rango),
  estadisticasEvolucion: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_EVOLUCION, rango),
  estadisticasRankingOdontologos: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_RANKING_ODONTOLOGOS, rango),
  estadisticasRankingClinicas: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_RANKING_CLINICAS, rango),
  estadisticasPrestacionesRanking: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_PRESTACIONES_RANKING, rango),
  estadisticasSaldosPendientesTop: (limite) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_SALDOS_PENDIENTES_TOP, limite),
  estadisticasResumenOperativo: (rango) => ipcRenderer.invoke(IPC_CHANNELS.ESTADISTICAS_RESUMEN_OPERATIVO, rango),

  backupsListar: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_LISTAR),
  backupsCrear: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_CREAR),
  backupsVerificar: (ruta) => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_VERIFICAR, ruta),
  backupsElegirArchivo: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_ELEGIR_ARCHIVO),
  backupsRestaurar: (ruta) => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_RESTAURAR, ruta),
  backupsListarUnidades: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_LISTAR_UNIDADES),
  backupsUbicacionDisponible: (ruta) => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_UBICACION_DISPONIBLE, ruta),
  backupsObtenerConfig: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_OBTENER_CONFIG),
  backupsGuardarConfig: (data) => ipcRenderer.invoke(IPC_CHANNELS.BACKUPS_GUARDAR_CONFIG, data),

  authLogin: (nombreUsuario, password) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, { nombreUsuario, password }),
  authLogout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  authSesionActual: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SESION_ACTUAL),
  authUsuariosDisponibles: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_USUARIOS_DISPONIBLES),

  usuariosListar: () => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_LISTAR),
  usuariosListarRoles: () => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_LISTAR_ROLES),
  usuariosCrear: (data, password) => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_CREAR, data, password),
  usuariosActualizar: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_ACTUALIZAR, id, data),
  usuariosCambiarPassword: (id, nuevaPassword) =>
    ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_CAMBIAR_PASSWORD, id, nuevaPassword),
  usuariosSetActivo: (id, activo) => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_SET_ACTIVO, id, activo),
  usuariosEliminar: (id) => ipcRenderer.invoke(IPC_CHANNELS.USUARIOS_ELIMINAR, id),

  auditoriaListar: (filtro) => ipcRenderer.invoke(IPC_CHANNELS.AUDITORIA_LISTAR, filtro),
  auditoriaOpcionesFiltro: () => ipcRenderer.invoke(IPC_CHANNELS.AUDITORIA_OPCIONES_FILTRO),

  exportGenerar: (tipo, formato, nombreSugerido, opciones) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_GENERAR, tipo, formato, nombreSugerido, opciones),

  impresoraListar: () => ipcRenderer.invoke(IPC_CHANNELS.IMPRESORA_LISTAR),
  impresoraObtenerSeleccionada: () => ipcRenderer.invoke(IPC_CHANNELS.IMPRESORA_OBTENER_SELECCIONADA),
  impresoraSeleccionar: (nombreDispositivo, nombreVisible) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPRESORA_SELECCIONAR, nombreDispositivo, nombreVisible),
  impresoraPrueba: (nombreDispositivo) => ipcRenderer.invoke(IPC_CHANNELS.IMPRESORA_PRUEBA, nombreDispositivo),
  impresoraImprimirPdf: (pdfPath) => ipcRenderer.invoke(IPC_CHANNELS.IMPRESORA_IMPRIMIR_PDF, pdfPath)
};

contextBridge.exposeInMainWorld("densz", api);
