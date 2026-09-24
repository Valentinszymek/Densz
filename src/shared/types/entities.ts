// Tipos compartidos entre el proceso main y el renderer.
// Representan las entidades tal como las consume la UI (camelCase),
// independientemente de cómo estén guardadas las columnas en SQLite.

export type EstadoOrden = "pendiente_facturar" | "facturado" | "anulado";
export type OrigenPrecio = "lista" | "manual";
export type TipoMovimiento = "debe" | "haber";
export type TipoBackup = "manual" | "automatico" | "pre_restauracion";
export type EstadoBackup = "ok" | "error";
export type Moneda = "ARS" | "USD";

export interface SesionActualDto {
  usuarioId: number;
  nombreUsuario: string;
  nombreCompleto: string;
  rolNombre: string;
  permisos: string[];
}

export interface Rol {
  id: number;
  nombre: string;
  permisos: string[];
}

export interface Usuario {
  id: number;
  nombreUsuario: string;
  nombreCompleto: string;
  rolId: number;
  rolNombre?: string;
  activo: boolean;
  creadoEn: string;
  ultimoAcceso: string | null;
}

/** Datos mínimos y no sensibles para el selector de usuario en la
 * pantalla de login — se piden ANTES de autenticarse, así que nunca
 * incluye permisos, hash de contraseña ni último acceso. */
export interface UsuarioParaSeleccion {
  id: number;
  nombreUsuario: string;
  nombreCompleto: string;
  rolNombre: string;
}

export interface Odontologo {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  listaPrecioId: number;
  listaPrecioNombre?: string;
  listaPrecioMoneda?: Moneda;
  /** Si pertenece a una clínica, sus trabajos se facturan/cobran a nombre de la clínica (§6). */
  clinicaId: number | null;
  clinicaNombre?: string | null;
  fechaAlta: string;
  activo: boolean;
}

export interface Clinica {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  fechaAlta: string;
  activo: boolean;
}

export interface ClinicaConEstadisticas extends Clinica {
  cantidadProfesionales: number;
  cantidadTrabajos: number;
  saldos: SaldoPorMoneda[];
}

export interface UsoClinica {
  cantidadProfesionales: number;
  cantidadTrabajos: number;
  cantidadComprobantes: number;
  cantidadPagos: number;
  cantidadMovimientos: number;
}

export interface SaldoPorMoneda {
  moneda: Moneda;
  totalDebeCentavos: number;
  totalHaberCentavos: number;
  saldoCentavos: number;
}

export interface OdontologoConEstadisticas extends Odontologo {
  cantidadTrabajos: number;
  saldos: SaldoPorMoneda[];
  ultimoTrabajoFecha: string | null;
}

export interface Paciente {
  id: number;
  nombre: string;
  apellido: string | null;
  /** Nombre completo listo para mostrar: "Nombre Apellido" (o solo nombre si no hay apellido). */
  nombreCompleto: string;
  odontologoId: number;
  odontologoNombre?: string;
  fechaAlta: string;
  activo: boolean;
}

/** Resultado real de "Eliminar paciente": borrado físico si no tenía
 * historial, o inactivación si sí lo tenía (para no romper OT/comprobantes/
 * pagos ya registrados) — desde la UI ambos casos se piden como una sola
 * acción, pero el resultado dice honestamente cuál de los dos pasó. */
export type ResultadoEliminarPaciente =
  | { eliminadoFisicamente: true }
  | { eliminadoFisicamente: false; cantidadTrabajos: number };

export interface CategoriaPrecio {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface Prestacion {
  id: number;
  categoriaId: number;
  categoriaNombre?: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

/** Prestación tal como aparece dentro de una lista de precios concreta. */
export interface PrestacionEnLista extends Prestacion {
  precioCentavos: number | null;
  vigenteDesde: string | null;
}

export interface ListaPrecio {
  id: number;
  nombre: string;
  moneda: Moneda;
  orden: number;
  activo: boolean;
  creadoEn: string;
}

export interface HistoricoPrecioLista {
  id: number;
  precioCentavos: number;
  vigenteDesde: string;
  vigenteHasta: string | null;
}

export interface PiezaOrdenPrestacion {
  piezaFdi: number;
}

export interface OrdenPrestacion {
  id: number;
  ordenId: number;
  prestacionId: number;
  prestacionNombre: string;
  categoriaNombre: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  origenPrecio: OrigenPrecio;
  subtotalCentavos: number;
  ordenIndex: number;
  piezasFdi: number[];
}

export interface Orden {
  id: number;
  numero: string;
  odontologoId: number;
  odontologoNombre?: string;
  pacienteId: number;
  pacienteNombreCompleto?: string;
  fechaTrabajo: string;
  fechaRegistro: string;
  moneda: Moneda;
  listaPrecioId: number | null;
  listaPrecioNombre: string;
  /** Clínica congelada al crear la OT (si el profesional pertenecía a una en ese momento) — §6, §24. */
  clinicaId: number | null;
  clinicaNombre: string | null;
  totalCentavos: number;
  estado: EstadoOrden;
  prestaciones: OrdenPrestacion[];
  motivoAnulacion: string | null;
  creadoEn: string;
}

/** Fila liviana para el listado de Trabajos (sin las prestaciones anidadas). */
export interface OrdenResumen {
  id: number;
  numero: string;
  odontologoId: number;
  odontologoNombre: string;
  pacienteId: number;
  pacienteNombreCompleto: string;
  fechaTrabajo: string;
  moneda: Moneda;
  clinicaId: number | null;
  clinicaNombre: string | null;
  totalCentavos: number;
  estado: EstadoOrden;
  cantidadPiezas: number;
  cantidadPrestaciones: number;
}

export interface Comprobante {
  id: number;
  numero: string;
  ordenId: number;
  fechaEmision: string;
  pdfPath: string | null;
  anulado: boolean;
  /** Nombre del laboratorio congelado al generar este comprobante — `null`
   * en comprobantes generados antes de que existiera este campo. */
  laboratorioNombre: string | null;
}

export interface ComprobanteListado extends Comprobante {
  ordenNumero: string;
  odontologoNombre: string;
  pacienteNombreCompleto: string;
  clinicaNombre: string | null;
  moneda: Moneda;
  totalCentavos: number;
}

export interface MedioPago {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Pago {
  id: number;
  /** Un pago es de un odontólogo independiente O de una clínica, nunca ambos. */
  odontologoId: number | null;
  clinicaId: number | null;
  fecha: string;
  importeCentavos: number;
  moneda: Moneda;
  medioPagoId: number;
  medioPagoNombre?: string;
  referencia: string | null;
  anulado: boolean;
  motivoAnulacion?: string | null;
  creadoPorNombre?: string;
}

export interface PagoConOdontologo extends Pago {
  odontologoNombre: string | null;
  clinicaNombre: string | null;
}

export interface MovimientoCuenta {
  id: number;
  /** El "titular" del movimiento (a quién le afecta el saldo): un odontólogo O una clínica. */
  odontologoId: number | null;
  clinicaId: number | null;
  tipo: TipoMovimiento;
  ordenId: number | null;
  ordenNumero?: string | null;
  pagoId: number | null;
  importeCentavos: number;
  moneda: Moneda;
  fecha: string;
  descripcion: string;
  anulado: boolean;
}

/** Una OT facturada en un mes concreto, para el detalle de la cuenta y el
 * resumen que se le manda al odontólogo/clínica a fin de mes ("estos son
 * los trabajos que tuviste este mes, esto es lo que me tenés que pagar").
 * Incluye las anuladas (para que no "desaparezcan" del historial) — el
 * consumidor decide si las suma o no según `anulado`. */
export interface TrabajoFacturadoMes {
  ordenId: number;
  ordenNumero: string;
  comprobanteNumero: string | null;
  fechaFacturacion: string | null;
  pacienteNombreCompleto: string;
  /** Ej: "Corona de zirconio, T-Base, Carilla" — todas las prestaciones de la OT, una sola fila por OT. */
  prestacionesResumen: string;
  /** Igual que `prestacionesResumen`, pero con el detalle de cada prestación
   * por separado — pensado para el PDF del resumen mensual, donde cada una
   * se muestra en su propia línea dentro de la misma fila de la OT. Usa
   * siempre los valores congelados en la propia OT, nunca el catálogo
   * actual. `cantidadPiezas` y `cantidad` son conceptos distintos: una
   * corona puede tener 10 piezas dentales seleccionadas (cantidadPiezas)
   * mientras que un "Modelo 3D" no usa piezas y solo tiene `cantidad`
   * (unidades del servicio) — nunca se inventa una cantidad de piezas que
   * no exista. */
  prestacionesDetalle: Array<{ nombre: string; cantidad: number; cantidadPiezas: number }>;
  /** Quién realizó el trabajo — siempre presente; relevante sobre todo en cuentas de clínica. */
  profesionalNombre: string;
  estado: EstadoOrden;
  anulado: boolean;
  importeCentavos: number;
  moneda: Moneda;
}

export interface ImpresoraInfo {
  /** Nombre técnico (deviceName) — el que se usa para imprimir. */
  nombreDispositivo: string;
  nombreVisible: string;
  predeterminadaDelSistema: boolean;
  disponible: boolean;
}

export interface UsoCategoria {
  cantidadPrestaciones: number;
  prestacionesConHistorial: number;
}

export interface UsoPrestacion {
  enTrabajosHistoricos: number;
  enListasActuales: number;
  odontologosAfectados: number;
}

export interface UsoLista {
  odontologosAsignados: number;
  usosHistoricos: number;
}

/** Cálculo completo de un mes para UNA moneda: saldo anterior + trabajos
 * del mes (con anuladas incluidas, sin sumar) + pagos del mes + saldo
 * resultante. Es la MISMA estructura que consume tanto la vista previa en
 * pantalla como el PDF del resumen — una sola fuente de verdad para el
 * cálculo, nunca se recalcula distinto en un lado y en el otro. */
export interface BloqueCuentaMoneda {
  moneda: Moneda;
  trabajos: TrabajoFacturadoMes[];
  pagosDelMes: Pago[];
  saldoAnteriorCentavos: number;
  totalTrabajosCentavos: number;
  totalPagosCentavos: number;
  saldoPendienteCentavos: number;
}

/** Registro congelado de un resumen mensual ya generado — los totales
 * quedan tal como se calcularon en `generadoEn`, nunca se recalculan. */
export interface ResumenMensual {
  id: number;
  odontologoId: number | null;
  clinicaId: number | null;
  anio: number;
  /** 1-12 */
  mes: number;
  moneda: Moneda;
  saldoAnteriorCentavos: number;
  totalTrabajosCentavos: number;
  totalPagosCentavos: number;
  saldoPendienteCentavos: number;
  cantidadTrabajos: number;
  pdfPath: string | null;
  generadoPor: number;
  generadoPorNombre?: string;
  generadoEn: string;
}

export interface SaldoOdontologoConNombre {
  odontologoId: number;
  odontologoNombre: string;
  saldos: SaldoPorMoneda[];
}

export interface SaldoClinicaConNombre {
  clinicaId: number;
  clinicaNombre: string;
  saldos: SaldoPorMoneda[];
}

export interface RegistroBackup {
  id: number;
  fecha: string;
  ruta: string;
  tamanoBytes: number | null;
  checksumSha256: string | null;
  estado: EstadoBackup;
  tipo: TipoBackup;
  mensaje: string | null;
}

export interface RangoFechas {
  desde: string;
  hasta: string;
}

export interface KpiPorMoneda {
  moneda: Moneda;
  totalRegistradoCentavos: number;
  pendienteCobroCentavos: number;
  pagosRecibidosCentavos: number;
  /** Trabajos (no anulados) del período en ESTA moneda puntual — separado
   * para poder calcular el ticket promedio sin mezclar ARS con USD. */
  cantidadTrabajos: number;
  /** totalRegistradoCentavos / cantidadTrabajos, en esta moneda — 0 si no
   * hubo trabajos (nunca se divide por cero). */
  ticketPromedioCentavos: number;
}

export interface KpisPeriodo {
  cantidadTrabajos: number;
  /** Odontólogos distintos con al menos un trabajo (no anulado) en el período. */
  cantidadOdontologosConTrabajos: number;
  /** Clínicas distintas con al menos un trabajo (no anulado) en el período. */
  cantidadClinicasConTrabajos: number;
  /** Piezas dentales (no unidades de servicio) trabajadas en el período —
   * suma de todas las piezas seleccionadas en todas las prestaciones de
   * todas las OT no anuladas. No mezcla con `cantidad` de servicio. */
  cantidadPiezasTotal: number;
  /** Desglose operativo por estado, sin importes — para Inicio. */
  cantidadPendientesFacturar: number;
  cantidadFacturados: number;
  cantidadAnulados: number;
  porMoneda: KpiPorMoneda[];
}

/** Versión SIN NADA financiero de los KPIs del período — la usa Inicio, a
 * propósito nunca protegida por contraseña, para el "Resumen operativo"
 * (§ Inicio debe ser seguro para mostrar frente a terceros). */
export interface ResumenOperativo {
  cantidadTrabajos: number;
  cantidadPendientesFacturar: number;
  cantidadFacturados: number;
  cantidadAnulados: number;
}

export interface PuntoTrabajosPorDia {
  fecha: string;
  cantidad: number;
  totalCentavos: number;
}

export interface IngresoPorOdontologo {
  odontologoId: number;
  odontologoNombre: string;
  moneda: Moneda;
  cantidad: number;
  totalCentavos: number;
}

export interface TrabajoPorCategoria {
  categoriaNombre: string;
  moneda: Moneda;
  cantidad: number;
  totalCentavos: number;
}

/** Un punto de la evolución del período: agrupado por día si el rango es
 * corto, o por mes si es largo (§7) — nunca mezcla ARS y USD entre sí. */
export interface PuntoEvolucion {
  /** "YYYY-MM-DD" si granularidad = "dia", "YYYY-MM" si granularidad = "mes". */
  bucket: string;
  moneda: Moneda;
  cantidadTrabajos: number;
  facturadoCentavos: number;
  cobradoCentavos: number;
}

export interface Evolucion {
  granularidad: "dia" | "mes";
  puntos: PuntoEvolucion[];
}

/** Fila de ranking por odontólogo o clínica — una fila por moneda en la
 * que tuvo actividad, para no mezclar nunca ARS con USD (§8, §9). */
export interface RankingOdontologo {
  odontologoId: number;
  odontologoNombre: string;
  moneda: Moneda;
  cantidadTrabajos: number;
  facturadoCentavos: number;
  cobradoCentavos: number;
  saldoPendienteCentavos: number;
}

export interface RankingClinica {
  clinicaId: number;
  clinicaNombre: string;
  moneda: Moneda;
  cantidadTrabajos: number;
  facturadoCentavos: number;
  cobradoCentavos: number;
  saldoPendienteCentavos: number;
}

/** Volumen y facturación por prestación en el período (§10, §11) — usa el
 * nombre congelado en cada trabajo, nunca el catálogo actual. */
export interface PrestacionRanking {
  prestacionNombre: string;
  moneda: Moneda;
  cantidad: number;
  totalCentavos: number;
}

/** Mayor deudor (odontólogo o clínica) — es un saldo ACTUAL, no acotado al
 * período (§12): "quién nos debe dinero ahora". */
export interface SaldoPendienteEntidad {
  tipo: "odontologo" | "clinica";
  id: number;
  nombre: string;
  moneda: Moneda;
  saldoCentavos: number;
}

export interface RegistroAuditoria {
  id: number;
  usuarioId: number | null;
  /** Nombre de usuario de quien hizo la acción — `null` si el usuario fue borrado o la acción no tenía sesión (ej. arranque). */
  usuarioNombre: string | null;
  /** Nombre de acceso (username) de quien hizo la acción — mismo criterio de `null` que usuarioNombre. */
  usuarioLogin: string | null;
  fecha: string;
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown> | null;
}

export type PeriodoAuditoria = "todos" | "hoy" | "ultimos7" | "esteMes" | "mesAnterior" | "ultimos30" | "personalizado";

export interface FiltroAuditoriaDto {
  busqueda?: string;
  usuarioId?: number;
  accion?: string;
  entidad?: string;
  periodo?: PeriodoAuditoria;
  /** Solo cuando periodo = "personalizado" — fechas locales "YYYY-MM-DD", inclusive. */
  desde?: string;
  hasta?: string;
  pagina?: number;
}

export interface ResultadoAuditoriaDto {
  items: RegistroAuditoria[];
  total: number;
  pagina: number;
  tamanoPagina: number;
}

export interface OpcionesFiltroAuditoriaDto {
  usuarios: Array<{ id: number; nombre: string; nombreUsuario: string }>;
  acciones: string[];
  entidades: string[];
}
