// Contrato de los canales IPC expuestos vía preload. Se amplía en cada
// fase con los canales del dominio correspondiente (odontólogos, precios,
// órdenes, etc). En la Fase 1 solo existe el canal de estado del sistema,
// que prueba que toda la cadena renderer -> preload -> main -> SQLite funciona.

import type {
  Odontologo,
  OdontologoConEstadisticas,
  Clinica,
  ClinicaConEstadisticas,
  UsoClinica,
  Paciente,
  ResultadoEliminarPaciente,
  CategoriaPrecio,
  Prestacion,
  PrestacionEnLista,
  ListaPrecio,
  HistoricoPrecioLista,
  Orden,
  OrdenResumen,
  EstadoOrden,
  Comprobante,
  ComprobanteListado,
  Pago,
  MedioPago,
  MovimientoCuenta,
  BloqueCuentaMoneda,
  ImpresoraInfo,
  UsoCategoria,
  UsoPrestacion,
  UsoLista,
  ResumenMensual,
  SaldoPorMoneda,
  SaldoOdontologoConNombre,
  SaldoClinicaConNombre,
  PagoConOdontologo,
  RangoFechas,
  KpisPeriodo,
  ResumenOperativo,
  PuntoTrabajosPorDia,
  IngresoPorOdontologo,
  TrabajoPorCategoria,
  Evolucion,
  RankingOdontologo,
  RankingClinica,
  PrestacionRanking,
  SaldoPendienteEntidad,
  RegistroBackup,
  SesionActualDto,
  Usuario,
  UsuarioParaSeleccion,
  Rol,
  RegistroAuditoria,
  FiltroAuditoriaDto,
  ResultadoAuditoriaDto,
  OpcionesFiltroAuditoriaDto,
  Moneda
} from "./entities";

export const IPC_CHANNELS = {
  SYSTEM_STATUS: "system:status",
  SYSTEM_PING: "system:ping",
  SEARCH_GLOBAL: "search:global",

  CONFIG_LABORATORIO_OBTENER: "config:laboratorioObtener",
  CONFIG_LABORATORIO_GUARDAR: "config:laboratorioGuardar",

  ODONTOLOGOS_LISTAR: "odontologos:listar",
  ODONTOLOGOS_OBTENER: "odontologos:obtener",
  ODONTOLOGOS_ESTADISTICAS: "odontologos:estadisticas",
  ODONTOLOGOS_ULTIMA_ACTIVIDAD: "odontologos:ultimaActividad",
  ODONTOLOGOS_CREAR: "odontologos:crear",
  ODONTOLOGOS_ACTUALIZAR: "odontologos:actualizar",
  ODONTOLOGOS_ASIGNAR_LISTA: "odontologos:asignarLista",
  ODONTOLOGOS_ASIGNAR_CLINICA: "odontologos:asignarClinica",
  ODONTOLOGOS_SET_ACTIVO: "odontologos:setActivo",

  CLINICAS_LISTAR: "clinicas:listar",
  CLINICAS_OBTENER: "clinicas:obtener",
  CLINICAS_ESTADISTICAS: "clinicas:estadisticas",
  CLINICAS_CREAR: "clinicas:crear",
  CLINICAS_ACTUALIZAR: "clinicas:actualizar",
  CLINICAS_SET_ACTIVA: "clinicas:setActiva",
  CLINICAS_USO: "clinicas:uso",
  CLINICAS_ELIMINAR: "clinicas:eliminar",

  PACIENTES_LISTAR: "pacientes:listar",
  PACIENTES_OBTENER: "pacientes:obtener",
  PACIENTES_CREAR: "pacientes:crear",
  PACIENTES_ACTUALIZAR: "pacientes:actualizar",
  PACIENTES_SET_ACTIVO: "pacientes:setActivo",
  PACIENTES_CANTIDAD_TRABAJOS: "pacientes:cantidadTrabajos",
  PACIENTES_ELIMINAR: "pacientes:eliminar",

  CATEGORIAS_LISTAR: "precios:categorias:listar",
  CATEGORIAS_CREAR: "precios:categorias:crear",
  CATEGORIAS_ACTUALIZAR: "precios:categorias:actualizar",
  CATEGORIAS_SET_ACTIVA: "precios:categorias:setActiva",
  CATEGORIAS_MOVER: "precios:categorias:mover",
  CATEGORIAS_USO: "precios:categorias:uso",
  CATEGORIAS_ELIMINAR: "precios:categorias:eliminar",

  PRESTACIONES_LISTAR: "precios:prestaciones:listar",
  PRESTACIONES_OBTENER: "precios:prestaciones:obtener",
  PRESTACIONES_CREAR: "precios:prestaciones:crear",
  PRESTACIONES_ACTUALIZAR: "precios:prestaciones:actualizar",
  PRESTACIONES_SET_ACTIVA: "precios:prestaciones:setActiva",
  PRESTACIONES_USO: "precios:prestaciones:uso",
  PRESTACIONES_ELIMINAR: "precios:prestaciones:eliminar",

  LISTAS_PRECIO_LISTAR: "listasPrecio:listar",
  LISTAS_PRECIO_OBTENER: "listasPrecio:obtener",
  LISTAS_PRECIO_CREAR: "listasPrecio:crear",
  LISTAS_PRECIO_ACTUALIZAR: "listasPrecio:actualizar",
  LISTAS_PRECIO_SET_ACTIVA: "listasPrecio:setActiva",
  LISTAS_PRECIO_ITEMS: "listasPrecio:items",
  LISTAS_PRECIO_HISTORIAL_ITEM: "listasPrecio:historialItem",
  LISTAS_PRECIO_CAMBIAR_PRECIO: "listasPrecio:cambiarPrecio",
  LISTAS_PRECIO_USO: "listasPrecio:uso",
  LISTAS_PRECIO_ELIMINAR: "listasPrecio:eliminar",

  LISTA_PRECIOS_GENERAR: "listaPrecios:generar",
  LISTA_PRECIOS_VER_PDF: "listaPrecios:verPdf",

  ORDENES_LISTAR: "ordenes:listar",
  ORDENES_OBTENER: "ordenes:obtener",
  ORDENES_CREAR: "ordenes:crear",
  ORDENES_EDITAR: "ordenes:editar",
  ORDENES_ANULAR: "ordenes:anular",
  ORDENES_ELIMINAR: "ordenes:eliminar",
  ORDENES_EDITAR_FECHA: "ordenes:editarFecha",

  COMPROBANTES_GENERAR: "comprobantes:generar",
  COMPROBANTES_OBTENER_POR_ORDEN: "comprobantes:obtenerPorOrden",
  COMPROBANTES_LISTAR: "comprobantes:listar",
  COMPROBANTES_VER_PDF: "comprobantes:verPdf",

  CUENTAS_SALDOS: "cuentas:saldos",
  CUENTAS_SALDOS_CLINICA: "cuentas:saldosClinica",
  CUENTAS_LISTAR_SALDOS: "cuentas:listarSaldos",
  CUENTAS_LISTAR_SALDOS_CLINICAS: "cuentas:listarSaldosClinicas",
  CUENTAS_MOVIMIENTOS: "cuentas:movimientos",
  CUENTAS_MOVIMIENTOS_CLINICA: "cuentas:movimientosClinica",
  CUENTAS_RESUMEN_MES: "cuentas:resumenMes",
  CUENTAS_RESUMEN_MES_CLINICA: "cuentas:resumenMesClinica",
  CUENTAS_IMPRIMIR_ESTADO: "cuentas:imprimirEstadoDeCuenta",
  CUENTAS_IMPRIMIR_ESTADO_CLINICA: "cuentas:imprimirEstadoDeCuentaClinica",
  CUENTAS_LISTAR_RESUMENES: "cuentas:listarResumenes",
  CUENTAS_LISTAR_RESUMENES_CLINICA: "cuentas:listarResumenesClinica",
  CUENTAS_VER_PDF_RESUMEN: "cuentas:verPdfResumen",
  /** A propósito NUNCA protegido por contraseña: solo devuelve un booleano
   * (nunca un importe) y lo usa Nuevo Trabajo para la advertencia de "esta
   * cuenta tiene pagos registrados" al editar una OT facturada — no tiene
   * nada que ver con "entrar a Cuentas". */
  CUENTAS_TIENE_PAGOS: "cuentas:tienePagos",

  PAGOS_LISTAR: "pagos:listar",
  PAGOS_LISTAR_CLINICA: "pagos:listarClinica",
  PAGOS_REGISTRAR: "pagos:registrar",
  PAGOS_ANULAR: "pagos:anular",
  MEDIOS_PAGO_LISTAR: "mediosPago:listar",
  MEDIOS_PAGO_CREAR: "mediosPago:crear",
  PAGOS_LISTAR_ULTIMOS: "pagos:listarUltimos",

  ESTADISTICAS_KPIS: "estadisticas:kpis",
  ESTADISTICAS_TRABAJOS_POR_DIA: "estadisticas:trabajosPorDia",
  ESTADISTICAS_INGRESOS_POR_ODONTOLOGO: "estadisticas:ingresosPorOdontologo",
  ESTADISTICAS_TRABAJOS_POR_CATEGORIA: "estadisticas:trabajosPorCategoria",
  ESTADISTICAS_EVOLUCION: "estadisticas:evolucion",
  ESTADISTICAS_RANKING_ODONTOLOGOS: "estadisticas:rankingOdontologos",
  ESTADISTICAS_RANKING_CLINICAS: "estadisticas:rankingClinicas",
  ESTADISTICAS_PRESTACIONES_RANKING: "estadisticas:prestacionesRanking",
  ESTADISTICAS_SALDOS_PENDIENTES_TOP: "estadisticas:saldosPendientesTop",
  /** A propósito NUNCA protegido por contraseña ni con ningún importe: es
   * el que usa Inicio para el "Resumen operativo" (solo cantidades). El
   * resto de los canales de estadísticas sí quedan detrás de la
   * protección opcional cuando está activada. */
  ESTADISTICAS_RESUMEN_OPERATIVO: "estadisticas:resumenOperativo",

  BACKUPS_LISTAR: "backups:listar",
  BACKUPS_CREAR: "backups:crear",
  BACKUPS_VERIFICAR: "backups:verificar",
  BACKUPS_ELEGIR_ARCHIVO: "backups:elegirArchivo",
  BACKUPS_RESTAURAR: "backups:restaurar",
  BACKUPS_LISTAR_UNIDADES: "backups:listarUnidades",
  BACKUPS_UBICACION_DISPONIBLE: "backups:ubicacionDisponible",
  BACKUPS_OBTENER_CONFIG: "backups:obtenerConfig",
  BACKUPS_GUARDAR_CONFIG: "backups:guardarConfig",

  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_SESION_ACTUAL: "auth:sesionActual",
  AUTH_USUARIOS_DISPONIBLES: "auth:usuariosDisponibles",

  USUARIOS_LISTAR: "usuarios:listar",
  USUARIOS_LISTAR_ROLES: "usuarios:listarRoles",
  USUARIOS_CREAR: "usuarios:crear",
  USUARIOS_ACTUALIZAR: "usuarios:actualizar",
  USUARIOS_CAMBIAR_PASSWORD: "usuarios:cambiarPassword",
  USUARIOS_SET_ACTIVO: "usuarios:setActivo",
  USUARIOS_ELIMINAR: "usuarios:eliminar",

  AUDITORIA_LISTAR: "auditoria:listar",
  AUDITORIA_OPCIONES_FILTRO: "auditoria:opcionesFiltro",

  EXPORT_GENERAR: "export:generar",

  IMPRESORA_LISTAR: "impresora:listar",
  IMPRESORA_OBTENER_SELECCIONADA: "impresora:obtenerSeleccionada",
  IMPRESORA_SELECCIONAR: "impresora:seleccionar",
  IMPRESORA_PRUEBA: "impresora:prueba",
  IMPRESORA_IMPRIMIR_PDF: "impresora:imprimirPdf",
  COMPROBANTES_IMPRIMIR: "comprobantes:imprimir",

  PROTECCION_ESTADO: "proteccion:estado",
  PROTECCION_BLOQUEAR: "proteccion:bloquear",
  PROTECCION_DESBLOQUEAR: "proteccion:desbloquear",
  PROTECCION_ACTIVAR: "proteccion:activar",
  PROTECCION_DESACTIVAR: "proteccion:desactivar",
  PROTECCION_CAMBIAR_PASSWORD: "proteccion:cambiarPassword",
  PROTECCION_GENERAR_CODIGO: "proteccion:generarCodigo",
  PROTECCION_VERIFICAR_CODIGO: "proteccion:verificarCodigo",
  PROTECCION_RESTABLECER_CON_CODIGO: "proteccion:restablecerConCodigo"
} as const;

export interface TablaConteo {
  tabla: string;
  filas: number;
}

export interface EstadoSistema {
  dbPath: string;
  migracionesAplicadas: string[];
  integridadOk: boolean;
  conteos: TablaConteo[];
  appVersion: string;
}

export type TipoResultadoBusqueda = "odontologo" | "clinica" | "paciente" | "orden" | "comprobante";

export interface ResultadoBusqueda {
  tipo: TipoResultadoBusqueda;
  refId: number;
  texto: string;
}

export interface DatosOdontologoDto {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  listaPrecioId: number;
  clinicaId?: number | null;
}

export interface FiltroOdontologosDto {
  soloActivos?: boolean;
  busqueda?: string;
  clinicaId?: number | null;
}

export interface DatosClinicaDto {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
}

export interface FiltroClinicasDto {
  soloActivas?: boolean;
  busqueda?: string;
}

export interface DatosPacienteDto {
  nombreCompleto: string;
  odontologoId: number;
}

export interface FiltroPacientesDto {
  odontologoId?: number;
  soloActivos?: boolean;
  busqueda?: string;
  orden?: "nombre_asc" | "nombre_desc" | "reciente" | "antiguo";
}

export interface DatosPrestacionDto {
  categoriaId: number;
  nombre: string;
}

export interface FiltroPrestacionesDto {
  categoriaId?: number;
  soloActivas?: boolean;
  busqueda?: string;
}

export interface DatosListaPrecioDto {
  nombre: string;
  moneda: Moneda;
}

/** Fecha del trabajo (no anulado) más reciente de cada odontólogo —
 * solo para ordenar el listado por actividad reciente. No incluye a los
 * odontólogos sin ningún trabajo registrado. */
export interface UltimaActividadOdontologo {
  odontologoId: number;
  ultimoTrabajoFecha: string;
}

export interface DenszApi {
  obtenerEstadoSistema: () => Promise<EstadoSistema>;
  /** Chequeo liviano de conectividad con la base (SELECT 1) — usado por
   * el gate de conexión en el arranque, no trae ni cuenta ninguna tabla. */
  ping: () => Promise<boolean>;
  buscarGlobal: (texto: string) => Promise<ResultadoBusqueda[]>;

  /** Nombre propio del laboratorio (Configuración → Identidad del
   * laboratorio) — se usa en los comprobantes nuevos como "By [nombre]".
   * `null` = todavía no configurado. */
  configLaboratorioObtener: () => Promise<string | null>;
  configLaboratorioGuardar: (nombre: string) => Promise<void>;

  odontologosListar: (filtro?: FiltroOdontologosDto) => Promise<Odontologo[]>;
  odontologosObtener: (id: number) => Promise<Odontologo | null>;
  odontologosEstadisticas: (id: number) => Promise<OdontologoConEstadisticas | null>;
  odontologosUltimaActividad: () => Promise<UltimaActividadOdontologo[]>;
  odontologosCrear: (data: DatosOdontologoDto) => Promise<number>;
  odontologosActualizar: (id: number, data: DatosOdontologoDto) => Promise<void>;
  odontologosAsignarLista: (id: number, listaPrecioId: number) => Promise<void>;
  odontologosAsignarClinica: (id: number, clinicaId: number | null) => Promise<void>;
  odontologosSetActivo: (id: number, activo: boolean) => Promise<void>;

  clinicasListar: (filtro?: FiltroClinicasDto) => Promise<Clinica[]>;
  clinicasObtener: (id: number) => Promise<Clinica | null>;
  clinicasEstadisticas: (id: number) => Promise<ClinicaConEstadisticas | null>;
  clinicasCrear: (data: DatosClinicaDto) => Promise<number>;
  clinicasActualizar: (id: number, data: DatosClinicaDto) => Promise<void>;
  clinicasSetActiva: (id: number, activo: boolean) => Promise<void>;
  clinicasUso: (id: number) => Promise<UsoClinica>;
  clinicasEliminar: (id: number) => Promise<void>;

  pacientesListar: (filtro?: FiltroPacientesDto) => Promise<Paciente[]>;
  pacientesObtener: (id: number) => Promise<Paciente | null>;
  pacientesCrear: (data: DatosPacienteDto) => Promise<number>;
  pacientesActualizar: (id: number, data: DatosPacienteDto) => Promise<void>;
  pacientesSetActivo: (id: number, activo: boolean) => Promise<void>;
  pacientesCantidadTrabajos: (id: number) => Promise<number>;
  pacientesEliminar: (id: number) => Promise<ResultadoEliminarPaciente>;

  categoriasListar: (soloActivas?: boolean) => Promise<CategoriaPrecio[]>;
  categoriasCrear: (nombre: string) => Promise<number>;
  categoriasActualizar: (id: number, nombre: string) => Promise<void>;
  categoriasSetActiva: (id: number, activo: boolean) => Promise<void>;
  categoriasMover: (id: number, direccion: "arriba" | "abajo") => Promise<void>;
  categoriasUso: (id: number) => Promise<UsoCategoria>;
  categoriasEliminar: (id: number) => Promise<void>;

  prestacionesListar: (filtro?: FiltroPrestacionesDto) => Promise<Prestacion[]>;
  prestacionesObtener: (id: number) => Promise<Prestacion | null>;
  prestacionesCrear: (data: DatosPrestacionDto) => Promise<number>;
  prestacionesActualizar: (id: number, data: DatosPrestacionDto) => Promise<void>;
  prestacionesSetActiva: (id: number, activo: boolean) => Promise<void>;
  prestacionesUso: (id: number) => Promise<UsoPrestacion>;
  prestacionesEliminar: (id: number) => Promise<void>;

  listasPrecioListar: (soloActivas?: boolean) => Promise<ListaPrecio[]>;
  listasPrecioObtener: (id: number) => Promise<ListaPrecio | null>;
  listasPrecioCrear: (data: DatosListaPrecioDto) => Promise<number>;
  listasPrecioActualizar: (id: number, nombre: string) => Promise<void>;
  listasPrecioSetActiva: (id: number, activo: boolean) => Promise<void>;
  listasPrecioItems: (listaId: number, soloActivas?: boolean) => Promise<PrestacionEnLista[]>;
  listasPrecioHistorialItem: (listaId: number, prestacionId: number) => Promise<HistoricoPrecioLista[]>;
  listasPrecioCambiarPrecio: (listaId: number, prestacionId: number, nuevoPrecioCentavos: number) => Promise<void>;
  listasPrecioUso: (id: number) => Promise<UsoLista>;
  listasPrecioEliminar: (id: number) => Promise<void>;

  listaPreciosGenerar: (opciones: OpcionesListaPreciosDto) => Promise<{ pdfPath: string }>;
  listaPreciosVerPdf: (pdfPath: string) => Promise<void>;

  ordenesListar: (filtro?: FiltroOrdenesDto) => Promise<OrdenResumen[]>;
  ordenesObtener: (id: number) => Promise<Orden | null>;
  ordenesCrear: (data: DatosCrearOrdenDto) => Promise<Orden>;
  ordenesEditar: (id: number, data: DatosEditarOrdenDto) => Promise<Orden>;
  ordenesAnular: (id: number, motivo: string) => Promise<void>;
  ordenesEliminar: (id: number, motivo: string) => Promise<void>;
  ordenesEditarFecha: (id: number, fechaTrabajo: string) => Promise<void>;

  comprobantesGenerar: (ordenId: number) => Promise<Comprobante>;
  comprobantesObtenerPorOrden: (ordenId: number) => Promise<Comprobante | null>;
  comprobantesListar: (filtro?: { odontologoId?: number; clinicaId?: number; busqueda?: string; limite?: number }) => Promise<ComprobanteListado[]>;
  comprobantesVerPdf: (comprobanteId: number) => Promise<void>;

  cuentasSaldos: (odontologoId: number) => Promise<SaldoPorMoneda[]>;
  cuentasSaldosClinica: (clinicaId: number) => Promise<SaldoPorMoneda[]>;
  cuentasListarSaldos: () => Promise<SaldoOdontologoConNombre[]>;
  cuentasListarSaldosClinicas: () => Promise<SaldoClinicaConNombre[]>;
  cuentasMovimientos: (odontologoId: number) => Promise<MovimientoCuenta[]>;
  cuentasMovimientosClinica: (clinicaId: number) => Promise<MovimientoCuenta[]>;
  cuentasResumenMes: (odontologoId: number, periodo: PeriodoMesDto) => Promise<BloqueCuentaMoneda[]>;
  cuentasResumenMesClinica: (clinicaId: number, periodo: PeriodoMesDto) => Promise<BloqueCuentaMoneda[]>;
  cuentasImprimirEstadoDeCuenta: (odontologoId: number, periodo: PeriodoMesDto) => Promise<ResumenMensual[]>;
  cuentasImprimirEstadoDeCuentaClinica: (clinicaId: number, periodo: PeriodoMesDto) => Promise<ResumenMensual[]>;
  cuentasListarResumenes: (odontologoId: number) => Promise<ResumenMensual[]>;
  cuentasListarResumenesClinica: (clinicaId: number) => Promise<ResumenMensual[]>;
  cuentasVerPdfResumen: (resumenId: number) => Promise<void>;
  cuentasTienePagos: (titular: { odontologoId?: number | null; clinicaId?: number | null }) => Promise<boolean>;

  pagosListar: (odontologoId: number) => Promise<Pago[]>;
  pagosListarClinica: (clinicaId: number) => Promise<Pago[]>;
  pagosRegistrar: (data: DatosNuevoPagoDto, confirmarDuplicado?: boolean) => Promise<ResultadoRegistrarPagoDto>;
  pagosAnular: (id: number, motivo: string) => Promise<void>;
  mediosPagoListar: () => Promise<MedioPago[]>;
  mediosPagoCrear: (nombre: string) => Promise<number>;
  pagosListarUltimos: (limite?: number) => Promise<PagoConOdontologo[]>;

  estadisticasKpis: (rango: RangoFechas) => Promise<KpisPeriodo>;
  estadisticasTrabajosPorDia: (rango: RangoFechas) => Promise<PuntoTrabajosPorDia[]>;
  estadisticasIngresosPorOdontologo: (rango: RangoFechas) => Promise<IngresoPorOdontologo[]>;
  estadisticasTrabajosPorCategoria: (rango: RangoFechas) => Promise<TrabajoPorCategoria[]>;
  estadisticasEvolucion: (rango: RangoFechas) => Promise<Evolucion>;
  estadisticasRankingOdontologos: (rango: RangoFechas) => Promise<RankingOdontologo[]>;
  estadisticasRankingClinicas: (rango: RangoFechas) => Promise<RankingClinica[]>;
  estadisticasPrestacionesRanking: (rango: RangoFechas) => Promise<PrestacionRanking[]>;
  estadisticasSaldosPendientesTop: (limite?: number) => Promise<SaldoPendienteEntidad[]>;
  estadisticasResumenOperativo: (rango: RangoFechas) => Promise<ResumenOperativo>;

  backupsListar: () => Promise<RegistroBackup[]>;
  backupsCrear: () => Promise<RegistroBackup[]>;
  backupsVerificar: (ruta: string) => Promise<{ ok: boolean; mensaje?: string; tamanoBytes?: number; checksumSha256?: string }>;
  backupsElegirArchivo: () => Promise<string | null>;
  backupsRestaurar: (ruta: string) => Promise<void>;
  backupsListarUnidades: () => Promise<Array<{ letra: string; etiqueta: string }>>;
  backupsUbicacionDisponible: (ruta: string) => Promise<boolean>;
  backupsObtenerConfig: () => Promise<ConfigBackupsDto>;
  backupsGuardarConfig: (data: ConfigBackupsDto) => Promise<void>;

  authLogin: (nombreUsuario: string, password: string) => Promise<SesionActualDto>;
  authLogout: () => Promise<void>;
  authSesionActual: () => Promise<SesionActualDto | null>;
  authUsuariosDisponibles: () => Promise<UsuarioParaSeleccion[]>;

  usuariosListar: () => Promise<Usuario[]>;
  usuariosListarRoles: () => Promise<Rol[]>;
  usuariosCrear: (data: DatosUsuarioCrearDto, password: string) => Promise<number>;
  usuariosActualizar: (id: number, data: DatosUsuarioDto) => Promise<void>;
  usuariosCambiarPassword: (id: number, nuevaPassword: string) => Promise<void>;
  usuariosSetActivo: (id: number, activo: boolean) => Promise<void>;
  usuariosEliminar: (id: number) => Promise<void>;

  auditoriaListar: (filtro?: FiltroAuditoriaDto) => Promise<ResultadoAuditoriaDto>;
  auditoriaOpcionesFiltro: () => Promise<OpcionesFiltroAuditoriaDto>;

  exportGenerar: (
    tipo: "odontologos" | "clinicas" | "pacientes" | "trabajos" | "cuenta" | "pagos" | "estadisticas" | "auditoria",
    formato: "csv" | "xlsx" | "pdf",
    nombreSugerido: string,
    opciones?: { odontologoId?: number; clinicaId?: number; rango?: RangoFechas; filtroAuditoria?: FiltroAuditoriaDto }
  ) => Promise<string | null>;

  impresoraListar: () => Promise<ImpresoraInfo[]>;
  impresoraObtenerSeleccionada: () => Promise<{ nombreDispositivo: string; nombreVisible: string } | null>;
  impresoraSeleccionar: (nombreDispositivo: string, nombreVisible: string) => Promise<void>;
  impresoraPrueba: (nombreDispositivo: string) => Promise<void>;
  impresoraImprimirPdf: (pdfPath: string) => Promise<void>;
  comprobantesImprimir: (comprobanteId: number) => Promise<void>;

  proteccionEstado: () => Promise<EstadoProteccionDto>;
  proteccionBloquear: () => Promise<void>;
  proteccionDesbloquear: (password: string) => Promise<boolean>;
  proteccionActivar: (data: DatosActivarProteccionDto) => Promise<CodigoRecuperacionDto>;
  proteccionDesactivar: (passwordActual: string) => Promise<void>;
  proteccionCambiarPassword: (data: DatosCambiarPasswordProteccionDto) => Promise<void>;
  proteccionGenerarCodigo: () => Promise<CodigoRecuperacionDto>;
  proteccionVerificarCodigo: (codigo: string) => Promise<boolean>;
  proteccionRestablecerConCodigo: (data: DatosRestablecerProteccionDto) => Promise<CodigoRecuperacionDto>;
}

export interface DatosUsuarioDto {
  nombreUsuario: string;
  nombreCompleto: string;
  rolId: number;
}

/** Datos que pide el modal "Nuevo usuario" — ya no incluye nombreCompleto
 * (eliminado de la creación de usuarios); el backend lo completa con el
 * propio nombreUsuario para no tocar la columna NOT NULL existente. */
export interface DatosUsuarioCrearDto {
  nombreUsuario: string;
  rolId: number;
}

export interface ConfigBackupsDto {
  ubicacion: string;
  frecuenciaHoras: number;
  cantidadConservar: number;
  minimoConservar: number;
}

export interface PeriodoMesDto {
  anio: number;
  /** 1-12 */
  mes: number;
}

export interface DatosNuevoPagoDto {
  /** Exactamente uno de los dos. */
  odontologoId?: number | null;
  clinicaId?: number | null;
  fecha: string;
  importeCentavos: number;
  moneda: Moneda;
  medioPagoId: number;
  referencia?: string | null;
}

export type ResultadoRegistrarPagoDto = { creado: true; pago: Pago } | { creado: false; posibleDuplicado: true };

export interface FiltroOrdenesDto {
  odontologoId?: number;
  pacienteId?: number;
  clinicaId?: number;
  estado?: EstadoOrden;
  desde?: string;
  hasta?: string;
  busqueda?: string;
  limite?: number;
}

export interface OpcionesListaPreciosDto {
  /** Modo "lista general": una lista de precios directa. Excluyente con `odontologoId`. */
  listaId?: number;
  /** Modo "odontólogo": usa SU lista de precios personalizada asignada. Excluyente con `listaId`. */
  odontologoId?: number;
}

export interface DatosLineaPrestacionDto {
  prestacionId: number;
  cantidad: number;
  piezasFdi: number[];
  precioManualCentavos?: number | null;
}

export interface DatosCrearOrdenDto {
  odontologoId: number;
  /** Paciente ya existente del odontólogo — excluyente con `pacienteNombreCompleto`. */
  pacienteId?: number | null;
  /** Solo si no se pasa `pacienteId`: crea (o reutiliza, si ya existe uno
   * activo con ese nombre para este odontólogo) un paciente con este
   * nombre, en la misma transacción que la orden. */
  pacienteNombreCompleto?: string;
  fechaTrabajo: string;
  prestaciones: DatosLineaPrestacionDto[];
}

/** Igual forma que `DatosCrearOrdenDto` — editar una OT ya existente es,
 * a propósito, la misma ficha con los mismos campos, solo que aplicada
 * sobre una orden ya creada en vez de insertar una nueva (§ no crear una
 * pantalla distinta para editar). */
export type DatosEditarOrdenDto = DatosCrearOrdenDto;

export interface EstadoProteccionDto {
  activada: boolean;
}

export interface DatosActivarProteccionDto {
  password: string;
  confirmarPassword: string;
}

export interface DatosCambiarPasswordProteccionDto {
  passwordActual: string;
  passwordNueva: string;
  confirmarNueva: string;
}

export interface DatosRestablecerProteccionDto {
  codigo: string;
  passwordNueva: string;
  confirmarNueva: string;
}

/** El código de recuperación se devuelve en texto plano UNA sola vez, en
 * el momento exacto de crearlo (activar / generar nuevo / restablecer) —
 * después nunca vuelve a estar disponible: solo se guarda su hash. */
export interface CodigoRecuperacionDto {
  codigoRecuperacion: string;
}

declare global {
  interface Window {
    densz: DenszApi;
  }
}
