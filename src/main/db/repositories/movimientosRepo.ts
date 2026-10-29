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

/** `ordenId` acepta `null` a propósito: una OT facturada siempre pasa un id
 * real acá, pero una deuda agregada a mano (saldo previo a Densz, sin
 * ningún trabajo cargado) no tiene ninguna orden detrás — ver
 * `deudaService.registrarDeuda`. Devuelve el id del movimiento creado. */
export async function registrarMovimientoDebe(
  db: Queryable,
  data: TitularCuenta & { ordenId: number | null; importeCentavos: number; moneda: Moneda; fecha: string; descripcion: string }
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO movimientos_cuenta (odontologo_id, clinica_id, tipo, orden_id, importe_centavos, moneda, fecha, descripcion)
     VALUES ($1, $2, 'debe', $3, $4, $5, $6, $7) RETURNING id`,
    [data.odontologoId, data.clinicaId, data.ordenId, data.importeCentavos, data.moneda, data.fecha, data.descripcion]
  );
  return rows[0].id;
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

/** Anula (no borra) una deuda agregada a mano — nunca toca un movimiento
 * que venga de una orden o de un pago real (el filtro por orden_id/pago_id
 * IS NULL es a propósito, así este endpoint no puede anular nada más). */
export async function anularMovimientoManual(db: Queryable, id: number): Promise<void> {
  await db.query(
    "UPDATE movimientos_cuenta SET anulado = 1 WHERE id = $1 AND anulado = 0 AND tipo = 'debe' AND orden_id IS NULL AND pago_id IS NULL",
    [id]
  );
}

/** Corrige una deuda agregada a mano YA cargada (ej. un importe mal
 * tipeado) — a diferencia de una OT, acá no hay "recongelar y emitir un
 * movimiento nuevo": es el mismo movimiento suelto que se edita in-place,
 * auditado por deudaService.ts (con el valor anterior y el nuevo). El
 * WHERE repite las mismas condiciones que anularMovimientoManual, en
 * defensa: nunca toca un movimiento de una OT real, de un pago, ni uno ya
 * anulado, aunque algo llame a esto sin pasar por deudaService.ts. */
export async function editarMovimientoManual(
  db: Queryable,
  id: number,
  data: { importeCentavos: number; moneda: Moneda; fecha: string; descripcion: string }
): Promise<void> {
  await db.query(
    `UPDATE movimientos_cuenta
     SET importe_centavos = $1, moneda = $2, fecha = $3, descripcion = $4
     WHERE id = $5 AND anulado = 0 AND tipo = 'debe' AND orden_id IS NULL AND pago_id IS NULL`,
    [data.importeCentavos, data.moneda, data.fecha, data.descripcion, id]
  );
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

/** Saldo de todos los odontólogos activos con movimientos propios (no de clínica), agrupado por moneda.
 *
 * `v.total_debe_centavos != 0 OR v.total_haber_centavos != 0`: la vista
 * agrupa por moneda cualquier movimiento que haya existido alguna vez,
 * incluso uno ya anulado — si una OT se editó y cambió de moneda (ej.
 * porque la lista de precios del odontólogo pasó de ARS a USD), el
 * movimiento ARS viejo queda anulado (nunca se borra, por historial) y
 * sin este filtro la moneda ARS seguía apareciendo para siempre con
 * $0,00 en todo, como si debiera algo en dos monedas (2026-10-29,
 * hallazgo real con un caso así). */
export async function listarSaldosTodos(db: Queryable): Promise<SaldoOdontologoConNombre[]> {
  const { rows } = await db.query<FilaSaldoOdontologo>(
    `SELECT o.id AS odontologo_id, o.nombre AS odontologo_nombre, v.moneda,
            v.total_debe_centavos, v.total_haber_centavos, v.saldo_centavos
     FROM odontologos o
     JOIN v_saldo_odontologo_moneda v ON v.odontologo_id = o.id
     WHERE o.activo = 1 AND (v.total_debe_centavos != 0 OR v.total_haber_centavos != 0)
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

/** Ver el comentario de listarSaldosTodos sobre por qué se filtran las
 * monedas en $0,00 (actividad vieja, ya toda anulada). */
export async function obtenerSaldos(db: Queryable, odontologoId: number): Promise<SaldoPorMoneda[]> {
  const { rows } = await db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
    `SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_odontologo_moneda
     WHERE odontologo_id = $1 AND (total_debe_centavos != 0 OR total_haber_centavos != 0)`,
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

/** Saldo de todas las clínicas activas con movimientos, agrupado por moneda.
 * Ver el comentario de listarSaldosTodos sobre el filtro de monedas en $0,00. */
export async function listarSaldosClinicasTodas(db: Queryable): Promise<SaldoClinicaConNombre[]> {
  const { rows } = await db.query<FilaSaldoClinica>(
    `SELECT c.id AS clinica_id, c.nombre AS clinica_nombre, v.moneda,
            v.total_debe_centavos, v.total_haber_centavos, v.saldo_centavos
     FROM clinicas c
     JOIN v_saldo_clinica_moneda v ON v.clinica_id = c.id
     WHERE c.activo = 1 AND (v.total_debe_centavos != 0 OR v.total_haber_centavos != 0)
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

/** Ver el comentario de listarSaldosTodos sobre el filtro de monedas en $0,00. */
export async function obtenerSaldosClinica(db: Queryable, clinicaId: number): Promise<SaldoPorMoneda[]> {
  const { rows } = await db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
    `SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_clinica_moneda
     WHERE clinica_id = $1 AND (total_debe_centavos != 0 OR total_haber_centavos != 0)`,
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
  medio_pago_nombre: string | null;
  referencia: string | null;
}

/** JOIN compartido por todas las lecturas de movimientos: además de la OT
 * (si es un "debe" real), trae el medio de pago y la referencia cuando el
 * movimiento es un "haber" (pago) — esos dos datos se cargan al registrar
 * el pago (ver pagoService.ts) pero vivían solo en la tabla `pagos`, nunca
 * visibles en la propia lista de movimientos de Cuentas (2026-10-29,
 * hallazgo real: la persona los cargaba y no los volvía a ver en ningún
 * lado salvo Auditoría). */
const JOIN_DETALLE_MOVIMIENTO = `
     LEFT JOIN ordenes o ON o.id = m.orden_id
     LEFT JOIN pagos p ON p.id = m.pago_id
     LEFT JOIN medios_pago mp ON mp.id = p.medio_pago_id`;
const SELECT_DETALLE_MOVIMIENTO = `m.*, o.numero AS orden_numero, mp.nombre AS medio_pago_nombre, p.referencia`;

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
    anulado: f.anulado === 1,
    medioPagoNombre: f.medio_pago_nombre,
    referencia: f.referencia
  };
}

export async function obtenerMovimiento(db: Queryable, id: number): Promise<MovimientoCuenta | null> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT ${SELECT_DETALLE_MOVIMIENTO} FROM movimientos_cuenta m ${JOIN_DETALLE_MOVIMIENTO} WHERE m.id = $1`,
    [id]
  );
  return rows[0] ? mapearMovimiento(rows[0]) : null;
}

export async function listarMovimientos(db: Queryable, odontologoId: number, limite = 500): Promise<MovimientoCuenta[]> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT ${SELECT_DETALLE_MOVIMIENTO}
     FROM movimientos_cuenta m
     ${JOIN_DETALLE_MOVIMIENTO}
     WHERE m.odontologo_id = $1
     ORDER BY m.fecha DESC, m.id DESC LIMIT $2`,
    [odontologoId, limite]
  );
  return rows.map(mapearMovimiento);
}

export async function listarMovimientosClinica(db: Queryable, clinicaId: number, limite = 500): Promise<MovimientoCuenta[]> {
  const { rows } = await db.query<FilaMovimiento>(
    `SELECT ${SELECT_DETALLE_MOVIMIENTO}
     FROM movimientos_cuenta m
     ${JOIN_DETALLE_MOVIMIENTO}
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
 * detalle del mes (fecha de facturación del comprobante para el DEBE de
 * una OT real, fecha del pago para el HABER), para que ningún movimiento
 * quede contado dos veces ni se pierda entre un período y el siguiente.
 *
 * El DEBE incluye, además de las OTs facturadas, las "deudas" agregadas a
 * mano sin ninguna orden detrás (ver deudaService.ts — típicamente el
 * saldo previo a empezar a usar Densz): usan su propia `fecha` como
 * criterio, ya que no tienen comprobante. Antes de esto quedaban
 * completamente afuera del resumen mensual (ni acá ni en el detalle del
 * mes), así que el "saldo pendiente" del PDF podía dar de menos apenas
 * existiera una deuda cargada a mano — 2026-10-28, hallazgo real. */
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
      `SELECT moneda, SUM(importe_centavos) AS total FROM (
         SELECT m.moneda, m.importe_centavos
         FROM movimientos_cuenta m
         JOIN ordenes o ON o.id = m.orden_id
         LEFT JOIN comprobantes c ON c.orden_id = o.id
         WHERE m.tipo = 'debe' AND m.anulado = 0 AND m.${columnaTitular} = $1 AND c.fecha_emision < $2
         UNION ALL
         SELECT m.moneda, m.importe_centavos
         FROM movimientos_cuenta m
         WHERE m.tipo = 'debe' AND m.anulado = 0 AND m.orden_id IS NULL AND m.${columnaTitular} = $1 AND m.fecha < $2
       ) debe_total
       GROUP BY moneda`,
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

/** Deudas agregadas a mano (sin ninguna orden detrás — ver deudaService.ts)
 * fechadas DENTRO del período pedido — el complemento de
 * `calcularSaldoAnteriorAlPeriodo` (que ya suma las de ANTES del período).
 * Usado para mostrarlas en su propia sección del resumen mensual
 * ("Saldo previo a Densz"), separadas de los trabajos facturados reales. */
export async function listarDeudasManualesDelPeriodo(
  db: Queryable,
  titular: TitularCuenta,
  anio: number,
  mes: number
): Promise<MovimientoCuenta[]> {
  const desde = primerDiaDelMes(anio, mes);
  const hasta = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  const columnaTitular = titular.clinicaId != null ? "clinica_id" : "odontologo_id";
  const idTitular = titular.clinicaId ?? titular.odontologoId;

  const { rows } = await db.query<FilaMovimiento>(
    `SELECT ${SELECT_DETALLE_MOVIMIENTO}
     FROM movimientos_cuenta m
     ${JOIN_DETALLE_MOVIMIENTO}
     WHERE m.tipo = 'debe' AND m.anulado = 0 AND m.orden_id IS NULL
       AND m.${columnaTitular} = $1 AND m.fecha >= $2 AND m.fecha < $3
     ORDER BY m.fecha, m.id`,
    [idTitular, desde, hasta]
  );
  return rows.map(mapearMovimiento);
}
