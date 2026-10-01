import type { Queryable } from "../types";
import type {
  MovimientoCuenta,
  SaldoPorMoneda,
  SaldoOdontologoConNombre,
  SaldoClinicaConNombre,
  TrabajoFacturadoMes,
  Moneda
} from "../../../shared/types/entities";

/** El "titular" de un movimiento es un odontólogo O una clínica, nunca
 * ambos (§6: si la OT es de un profesional de una clínica, la deuda es
 * de la clínica). Quién REALIZÓ el trabajo sigue disponible siempre a
 * través de ordenes.odontologo_id — no se pierde esa referencia. */
export interface TitularCuenta {
  odontologoId: number | null;
  clinicaId: number | null;
}

export async function registrarMovimientoDebe(
  db: Queryable,
  data: TitularCuenta & { ordenId: number; importeCentavos: number; moneda: Moneda; fecha: string; descripcion: string }
): Promise<void> {
  await db.query(
    `INSERT INTO movimientos_cuenta (odontologo_id, clinica_id, tipo, orden_id, importe_centavos, moneda, fecha, descripcion)
     VALUES ($1, $2, 'debe', $3, $4, $5, $6, $7)`,
    [data.odontologoId, data.clinicaId, data.ordenId, data.importeCentavos, data.moneda, data.fecha, data.descripcion]
  );
}

export async function registrarMovimientoHaber(
  db: Queryable,
  data: TitularCuenta & { pagoId: number; importeCentavos: number; moneda: Moneda; fecha: string; descripcion: string }
): Promise<void> {
  await db.query(
    `INSERT INTO movimientos_cuenta (odontologo_id, clinica_id, tipo, pago_id, importe_centavos, moneda, fecha, descripcion)
     VALUES ($1, $2, 'haber', $3, $4, $5, $6, $7)`,
    [data.odontologoId, data.clinicaId, data.pagoId, data.importeCentavos, data.moneda, data.fecha, data.descripcion]
  );
}

/** Anula (no borra) el movimiento "debe" generado por una orden, si existe. */
export async function anularMovimientoDeOrden(db: Queryable, ordenId: number): Promise<void> {
  await db.query("UPDATE movimientos_cuenta SET anulado = 1 WHERE orden_id = $1 AND anulado = 0", [ordenId]);
}

/**
 * El movimiento "debe" ACTIVO (no anulado) de una OT ya facturada, si
 * existe — usado al editar una OT facturada para saber si el importe,
 * la moneda o el titular (odontólogo/clínica) realmente cambiaron antes
 * de tocar la cuenta corriente (§ un único impacto contable, nunca
 * duplicado). Nunca debería haber más de uno activo por OT a la vez.
 */
export async function obtenerMovimientoDebeActivoDeOrden(db: Queryable, ordenId: number): Promise<MovimientoCuenta | null> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT m.*, o.numero AS orden_numero
     FROM movimientos_cuenta m
     LEFT JOIN ordenes o ON o.id = m.orden_id
     WHERE m.orden_id = $1 AND m.tipo = 'debe' AND m.anulado = 0
     ORDER BY m.id DESC LIMIT 1`,
    [ordenId]
  );
  return rows[0] ? mapearMovimiento(rows[0]) : null;
}

/** Anula (no borra) el movimiento "haber" generado por un pago. */
export async function anularMovimientoDePago(db: Queryable, pagoId: number): Promise<void> {
  await db.query("UPDATE movimientos_cuenta SET anulado = 1 WHERE pago_id = $1 AND anulado = 0", [pagoId]);
}

/** Borra en forma definitiva los movimientos asociados a una OT eliminada (§27). */
export async function eliminarMovimientosDeOrden(db: Queryable, ordenId: number): Promise<void> {
  await db.query("DELETE FROM movimientos_cuenta WHERE orden_id = $1", [ordenId]);
}

/**
 * Solo un booleano — nunca un importe — sobre si este titular tiene algún
 * pago (movimiento "haber") registrado. A propósito vive fuera de
 * cualquier protección por contraseña: lo usa Nuevo Trabajo para advertir
 * al editar una OT facturada (§5), y esa pantalla no es "Cuentas" ni
 * muestra ninguna cifra — solo este sí/no.
 */
export async function tienePagosRegistrados(db: Queryable, titular: TitularCuenta): Promise<boolean> {
  const { rows } = await db.query<{ existe: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM movimientos_cuenta
       WHERE tipo = 'haber' AND anulado = 0
         AND ((odontologo_id = $1 AND $1::int IS NOT NULL) OR (clinica_id = $2 AND $2::int IS NOT NULL))
     ) AS existe`,
    [titular.odontologoId, titular.clinicaId]
  );
  return rows[0].existe === true;
}

function mapearSaldo(f: { moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }): SaldoPorMoneda {
  return {
    moneda: f.moneda,
    totalDebeCentavos: f.total_debe_centavos,
    totalHaberCentavos: f.total_haber_centavos,
    saldoCentavos: f.saldo_centavos
  };
}

// ============================================================
// ODONTÓLOGOS (profesionales independientes)
// ============================================================

interface FilaSaldoOdontologo {
  odontologo_id: number;
  odontologo_nombre: string;
  moneda: Moneda;
  total_debe_centavos: number;
  total_haber_centavos: number;
  saldo_centavos: number;
}

/** Saldo de todos los odontólogos activos con movimientos propios (no de clínica), agrupado por moneda. */
export async function listarSaldosTodos(db: Queryable): Promise<SaldoOdontologoConNombre[]> {
  const { rows } = await db.query<FilaSaldoOdontologo>(
    `SELECT o.id AS odontologo_id, o.nombre AS odontologo_nombre, v.moneda,
            v.total_debe_centavos, v.total_haber_centavos, v.saldo_centavos
     FROM odontologos o
     JOIN v_saldo_odontologo_moneda v ON v.odontologo_id = o.id
     WHERE o.activo = 1
     ORDER BY lower(o.nombre), v.moneda`
  );

  const porOdontologo = new Map<number, SaldoOdontologoConNombre>();
  for (const f of rows) {
    let entry = porOdontologo.get(f.odontologo_id);
    if (!entry) {
      entry = { odontologoId: f.odontologo_id, odontologoNombre: f.odontologo_nombre, saldos: [] };
      porOdontologo.set(f.odontologo_id, entry);
    }
    entry.saldos.push(mapearSaldo(f));
  }
  return Array.from(porOdontologo.values());
}

export async function obtenerSaldos(db: Queryable, odontologoId: number): Promise<SaldoPorMoneda[]> {
  const { rows } = await db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
    "SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_odontologo_moneda WHERE odontologo_id = $1",
    [odontologoId]
  );
  return rows.map(mapearSaldo);
}

// ============================================================
// CLÍNICAS
// ============================================================

interface FilaSaldoClinica {
  clinica_id: number;
  clinica_nombre: string;
  moneda: Moneda;
  total_debe_centavos: number;
  total_haber_centavos: number;
  saldo_centavos: number;
}

/** Saldo de todas las clínicas activas con movimientos, agrupado por moneda. */
export async function listarSaldosClinicasTodas(db: Queryable): Promise<SaldoClinicaConNombre[]> {
  const { rows } = await db.query<FilaSaldoClinica>(
    `SELECT c.id AS clinica_id, c.nombre AS clinica_nombre, v.moneda,
            v.total_debe_centavos, v.total_haber_centavos, v.saldo_centavos
     FROM clinicas c
     JOIN v_saldo_clinica_moneda v ON v.clinica_id = c.id
     WHERE c.activo = 1
     ORDER BY lower(c.nombre), v.moneda`
  );

  const porClinica = new Map<number, SaldoClinicaConNombre>();
  for (const f of rows) {
    let entry = porClinica.get(f.clinica_id);
    if (!entry) {
      entry = { clinicaId: f.clinica_id, clinicaNombre: f.clinica_nombre, saldos: [] };
      porClinica.set(f.clinica_id, entry);
    }
    entry.saldos.push(mapearSaldo(f));
  }
  return Array.from(porClinica.values());
}

export async function obtenerSaldosClinica(db: Queryable, clinicaId: number): Promise<SaldoPorMoneda[]> {
  const { rows } = await db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
    "SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_clinica_moneda WHERE clinica_id = $1",
    [clinicaId]
  );
  return rows.map(mapearSaldo);
}

// ============================================================
// MOVIMIENTOS (detalle)
// ============================================================

interface FilaMovimiento {
  id: number;
  odontologo_id: number | null;
  clinica_id: number | null;
  tipo: "debe" | "haber";
  orden_id: number | null;
  orden_numero: string | null;
  pago_id: number | null;
  importe_centavos: number;
  moneda: Moneda;
  fecha: string;
  descripcion: string;
  anulado: number;
}

function mapearMovimiento(f: FilaMovimiento): MovimientoCuenta {
  return {
    id: f.id,
    odontologoId: f.odontologo_id,
    clinicaId: f.clinica_id,
    tipo: f.tipo,
    ordenId: f.orden_id,
    ordenNumero: f.orden_numero,
    pagoId: f.pago_id,
    importeCentavos: f.importe_centavos,
    moneda: f.moneda,
    fecha: f.fecha,
    descripcion: f.descripcion,
    anulado: f.anulado === 1
  };
}

export async function listarMovimientos(db: Queryable, odontologoId: number, limite = 500): Promise<MovimientoCuenta[]> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT m.*, o.numero AS orden_numero
     FROM movimientos_cuenta m
     LEFT JOIN ordenes o ON o.id = m.orden_id
     WHERE m.odontologo_id = $1
     ORDER BY m.fecha DESC, m.id DESC LIMIT $2`,
    [odontologoId, limite]
  );
  return rows.map(mapearMovimiento);
}

export async function listarMovimientosClinica(db: Queryable, clinicaId: number, limite = 500): Promise<MovimientoCuenta[]> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT m.*, o.numero AS orden_numero
     FROM movimientos_cuenta m
     LEFT JOIN ordenes o ON o.id = m.orden_id
     WHERE m.clinica_id = $1
     ORDER BY m.fecha DESC, m.id DESC LIMIT $2`,
    [clinicaId, limite]
  );
  return rows.map(mapearMovimiento);
}

// ============================================================
// TRABAJOS FACTURADOS POR MES (detalle de la cuenta + resumen mensual)
// ============================================================

interface FilaTrabajoFacturado {
  orden_id: number;
  orden_numero: string;
  comprobante_numero: string | null;
  fecha_facturacion: string | null;
  paciente_nombre: string;
  paciente_apellido: string | null;
  prestaciones_resumen: string | null;
  prestaciones_detalle_json: string | null;
  profesional_nombre: string;
  estado: "pendiente_facturar" | "facturado" | "anulado";
  importe_centavos: number;
  moneda: Moneda;
  /** Flag propio de ESTE movimiento (no de la orden) — ver `mapearTrabajoFacturado`. */
  movimiento_anulado: number;
}

function mapearTrabajoFacturado(f: FilaTrabajoFacturado): TrabajoFacturadoMes {
  // `apellido` es una columna legacy: los pacientes nuevos guardan el
  // nombre completo directamente en `nombre` y dejan `apellido` en NULL
  // (igual que pacientesRepo.nombreCompleto).
  const pacienteNombreCompleto = f.paciente_apellido ? `${f.paciente_nombre} ${f.paciente_apellido}`.trim() : f.paciente_nombre;
  const prestacionesDetalle: Array<{ nombre: string; cantidad: number; cantidadPiezas: number }> =
    f.prestaciones_detalle_json && typeof f.prestaciones_detalle_json === "string"
      ? JSON.parse(f.prestaciones_detalle_json)
      : ((f.prestaciones_detalle_json as unknown as Array<{ nombre: string; cantidad: number; cantidadPiezas: number }>) ?? []);
  return {
    ordenId: f.orden_id,
    ordenNumero: f.orden_numero,
    comprobanteNumero: f.comprobante_numero,
    fechaFacturacion: f.fecha_facturacion,
    pacienteNombreCompleto,
    prestacionesResumen: f.prestaciones_resumen ?? "—",
    prestacionesDetalle,
    profesionalNombre: f.profesional_nombre,
    estado: f.estado,
    // Corrección post-auditoría (§38.1): antes se derivaba de `orden.estado`,
    // que solo distingue "la OT entera está anulada" — cuando se edita una OT
    // YA facturada (editarOrdenConPrestaciones), el movimiento DEBE viejo se
    // anula y se crea uno nuevo, pero la orden SIGUE en estado "facturado".
    // Como esta consulta puede devolver más de un movimiento para la misma
    // OT (el viejo anulado + el nuevo activo), usar `orden.estado` hacía que
    // AMBAS filas se mostraran como activas y se sumaran dos veces en el mes
    // de la edición. El flag propio del movimiento (`movimientos_cuenta.anulado`)
    // es la fuente de verdad correcta: cada mutación que anula un movimiento
    // (anular OT, o recalcular el DEBE al editar una OT facturada) ya lo
    // mantiene al día. Se conserva el OR con `orden.estado` como defensa
    // adicional, nunca como fuente primaria.
    anulado: f.movimiento_anulado === 1 || f.estado === "anulado",
    importeCentavos: f.importe_centavos,
    moneda: f.moneda
  };
}

/** `mes` es 1-12. Lista una OT por fila — con su paciente, sus
 * prestaciones, el profesional que la hizo, N° de comprobante e importe —
 * de todo lo facturado en ese mes para un odontólogo o una clínica (nunca
 * ambos). Incluye las anuladas (con `anulado: true`) para que no
 * "desaparezcan" del historial — quien llama decide si las suma o no. Se
 * ordena por fecha de facturación, que es la del comprobante
 * (`comprobantes.fecha_emision`), no la fecha del trabajo — es la fecha
 * que le importa al que cobra. */
async function listarTrabajosFacturadosPorMes(
  db: Queryable,
  titular: TitularCuenta,
  anio: number,
  mes: number
): Promise<TrabajoFacturadoMes[]> {
  const periodo = `${anio}-${String(mes).padStart(2, "0")}`;
  const columnaTitular = titular.clinicaId != null ? "m.clinica_id" : "m.odontologo_id";
  const idTitular = titular.clinicaId ?? titular.odontologoId;
  const { rows } = await db.query<FilaTrabajoFacturado>(
    `SELECT o.id AS orden_id, o.numero AS orden_numero, o.estado,
            c.numero AS comprobante_numero, c.fecha_emision AS fecha_facturacion,
            p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
            prof.nombre AS profesional_nombre,
            (SELECT string_agg(prestacion_nombre, ', ') FROM orden_prestaciones WHERE orden_id = o.id) AS prestaciones_resumen,
            (SELECT json_agg(json_build_object(
                'nombre', op.prestacion_nombre,
                'cantidad', op.cantidad,
                'cantidadPiezas', (SELECT COUNT(*) FROM orden_prestacion_piezas opp WHERE opp.orden_prestacion_id = op.id)
              ))
               FROM (SELECT id, prestacion_nombre, cantidad FROM orden_prestaciones WHERE orden_id = o.id ORDER BY orden_index) op
            ) AS prestaciones_detalle_json,
            m.importe_centavos, m.moneda, m.anulado AS movimiento_anulado
     FROM movimientos_cuenta m
     JOIN ordenes o ON o.id = m.orden_id
     JOIN pacientes p ON p.id = o.paciente_id
     JOIN odontologos prof ON prof.id = o.odontologo_id
     LEFT JOIN comprobantes c ON c.orden_id = o.id
     WHERE m.tipo = 'debe' AND ${columnaTitular} = $1
       AND substr(c.fecha_emision, 1, 7) = $2
     ORDER BY c.fecha_emision ASC, o.numero ASC`,
    [idTitular, periodo]
  );
  return rows.map(mapearTrabajoFacturado);
}

export async function listarTrabajosFacturadosPorMesOdontologo(
  db: Queryable,
  odontologoId: number,
  anio: number,
  mes: number
): Promise<TrabajoFacturadoMes[]> {
  return listarTrabajosFacturadosPorMes(db, { odontologoId, clinicaId: null }, anio, mes);
}

export async function listarTrabajosFacturadosPorMesClinica(
  db: Queryable,
  clinicaId: number,
  anio: number,
  mes: number
): Promise<TrabajoFacturadoMes[]> {
  return listarTrabajosFacturadosPorMes(db, { odontologoId: null, clinicaId }, anio, mes);
}

/** Primer día del mes, como texto "YYYY-MM-01" — como las fechas
 * guardadas son TEXT en formato ISO ("YYYY-MM-DD..."), comparar
 * lexicográficamente contra este límite equivale a comparar por fecha. */
function primerDiaDelMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

/** Saldo (DEBE no anulado − HABER no anulado, agrupado por moneda) de
 * TODO lo anterior al primer día de `anio`/`mes` — el "saldo anterior" que
 * arrastra el resumen mensual. Usa el mismo criterio de fecha que el
 * detalle del mes (fecha de facturación del comprobante para el DEBE,
 * fecha del pago para el HABER), para que ningún movimiento quede contado
 * dos veces ni se pierda entre un período y el siguiente. */
export async function calcularSaldoAnteriorAlPeriodo(
  db: Queryable,
  titular: TitularCuenta,
  anio: number,
  mes: number
): Promise<Map<Moneda, number>> {
  const limite = primerDiaDelMes(anio, mes);
  const columnaTitular = titular.clinicaId != null ? "clinica_id" : "odontologo_id";
  const idTitular = titular.clinicaId ?? titular.odontologoId;

  const [{ rows: debe }, { rows: haber }] = await Promise.all([
    db.query<{ moneda: Moneda; total: number }>(
      `SELECT m.moneda, SUM(m.importe_centavos) AS total
       FROM movimientos_cuenta m
       JOIN ordenes o ON o.id = m.orden_id
       LEFT JOIN comprobantes c ON c.orden_id = o.id
       WHERE m.tipo = 'debe' AND m.anulado = 0 AND m.${columnaTitular} = $1 AND c.fecha_emision < $2
       GROUP BY m.moneda`,
      [idTitular, limite]
    ),
    db.query<{ moneda: Moneda; total: number }>(
      `SELECT moneda, SUM(importe_centavos) AS total
       FROM movimientos_cuenta
       WHERE tipo = 'haber' AND anulado = 0 AND ${columnaTitular} = $1 AND fecha < $2
       GROUP BY moneda`,
      [idTitular, limite]
    )
  ]);

  const saldos = new Map<Moneda, number>();
  for (const d of debe) saldos.set(d.moneda, (saldos.get(d.moneda) ?? 0) + Number(d.total));
  for (const h of haber) saldos.set(h.moneda, (saldos.get(h.moneda) ?? 0) - Number(h.total));
  return saldos;
}
