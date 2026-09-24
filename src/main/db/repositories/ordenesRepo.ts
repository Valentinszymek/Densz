import type { Queryable } from "../types";
import type { Orden, OrdenPrestacion, OrdenResumen, EstadoOrden, Moneda } from "../../../shared/types/entities";

// ============================================================
// LISTADO (resumen liviano, para la grilla de Trabajos)
// ============================================================

interface FilaResumen {
  id: number;
  numero: string;
  odontologo_id: number;
  odontologo_nombre: string;
  paciente_id: number;
  paciente_nombre: string;
  paciente_apellido: string | null;
  fecha_trabajo: string;
  moneda: Moneda;
  clinica_id: number | null;
  clinica_nombre: string | null;
  total_centavos: number;
  estado: EstadoOrden;
  cantidad_piezas: number;
  cantidad_prestaciones: number;
}

const SELECT_RESUMEN = `
  SELECT
    o.id, o.numero, o.odontologo_id, od.nombre AS odontologo_nombre,
    o.paciente_id, pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido,
    o.fecha_trabajo, o.moneda, o.clinica_id, o.clinica_nombre, o.total_centavos, o.estado,
    (SELECT COUNT(*) FROM orden_prestacion_piezas opz
       JOIN orden_prestaciones opr ON opr.id = opz.orden_prestacion_id
       WHERE opr.orden_id = o.id) AS cantidad_piezas,
    (SELECT COUNT(*) FROM orden_prestaciones opr WHERE opr.orden_id = o.id) AS cantidad_prestaciones
  FROM ordenes o
  JOIN odontologos od ON od.id = o.odontologo_id
  JOIN pacientes pa ON pa.id = o.paciente_id
`;

function mapearResumen(f: FilaResumen): OrdenResumen {
  return {
    id: f.id,
    numero: f.numero,
    odontologoId: f.odontologo_id,
    odontologoNombre: f.odontologo_nombre,
    pacienteId: f.paciente_id,
    pacienteNombreCompleto: f.paciente_apellido ? `${f.paciente_nombre} ${f.paciente_apellido}`.trim() : f.paciente_nombre,
    fechaTrabajo: f.fecha_trabajo,
    moneda: f.moneda,
    clinicaId: f.clinica_id,
    clinicaNombre: f.clinica_nombre,
    totalCentavos: f.total_centavos,
    estado: f.estado,
    cantidadPiezas: f.cantidad_piezas,
    cantidadPrestaciones: f.cantidad_prestaciones
  };
}

export interface FiltroOrdenes {
  odontologoId?: number;
  pacienteId?: number;
  clinicaId?: number;
  estado?: EstadoOrden;
  desde?: string;
  hasta?: string;
  /** Busca por N° de OT, nombre de paciente o nombre de odontólogo. */
  busqueda?: string;
  limite?: number;
}

export async function listarOrdenes(db: Queryable, filtro: FiltroOrdenes = {}): Promise<OrdenResumen[]> {
  let sql = SELECT_RESUMEN + " WHERE 1=1";
  const params: unknown[] = [];
  if (filtro.odontologoId) {
    params.push(filtro.odontologoId);
    sql += ` AND o.odontologo_id = $${params.length}`;
  }
  if (filtro.pacienteId) {
    params.push(filtro.pacienteId);
    sql += ` AND o.paciente_id = $${params.length}`;
  }
  if (filtro.clinicaId) {
    params.push(filtro.clinicaId);
    sql += ` AND o.clinica_id = $${params.length}`;
  }
  if (filtro.estado) {
    params.push(filtro.estado);
    sql += ` AND o.estado = $${params.length}`;
  }
  if (filtro.desde) {
    params.push(filtro.desde);
    sql += ` AND o.fecha_trabajo >= $${params.length}`;
  }
  if (filtro.hasta) {
    params.push(filtro.hasta);
    sql += ` AND o.fecha_trabajo <= $${params.length}`;
  }
  if (filtro.busqueda?.trim()) {
    const like = `%${filtro.busqueda.trim()}%`;
    params.push(like);
    const i1 = params.length;
    params.push(like);
    const i2 = params.length;
    params.push(like);
    const i3 = params.length;
    sql += ` AND (
      o.numero ILIKE $${i1}
      OR od.nombre ILIKE $${i2}
      OR (pa.nombre || ' ' || COALESCE(pa.apellido, '')) ILIKE $${i3}
    )`;
  }
  sql += " ORDER BY o.fecha_trabajo DESC, o.id DESC";
  if (filtro.limite) {
    params.push(filtro.limite);
    sql += ` LIMIT $${params.length}`;
  }
  const { rows } = await db.query<FilaResumen>(sql, params);
  return rows.map(mapearResumen);
}

// ============================================================
// DETALLE COMPLETO (con prestaciones y piezas anidadas)
// ============================================================

interface FilaOrden {
  id: number;
  numero: string;
  odontologo_id: number;
  odontologo_nombre: string;
  paciente_id: number;
  paciente_nombre: string;
  paciente_apellido: string | null;
  fecha_trabajo: string;
  fecha_registro: string;
  moneda: Moneda;
  lista_precio_id: number | null;
  lista_precio_nombre: string;
  clinica_id: number | null;
  clinica_nombre: string | null;
  total_centavos: number;
  estado: EstadoOrden;
  motivo_anulacion: string | null;
  creado_en: string;
}

const SELECT_ORDEN = `
  SELECT o.*, od.nombre AS odontologo_nombre, pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido
  FROM ordenes o
  JOIN odontologos od ON od.id = o.odontologo_id
  JOIN pacientes pa ON pa.id = o.paciente_id
`;

interface FilaOrdenPrestacion {
  id: number;
  orden_id: number;
  prestacion_id: number;
  prestacion_nombre: string;
  categoria_nombre: string;
  cantidad: number;
  precio_unitario_centavos: number;
  origen_precio: "lista" | "manual";
  subtotal_centavos: number;
  orden_index: number;
  piezas: string | null;
}

async function obtenerPrestacionesDeOrden(db: Queryable, ordenId: number): Promise<OrdenPrestacion[]> {
  const { rows } = await db.query<FilaOrdenPrestacion>(
    `SELECT op.*, string_agg(opz.pieza_fdi::text, ',') AS piezas
     FROM orden_prestaciones op
     LEFT JOIN orden_prestacion_piezas opz ON opz.orden_prestacion_id = op.id
     WHERE op.orden_id = $1
     GROUP BY op.id
     ORDER BY op.orden_index, op.id`,
    [ordenId]
  );

  return rows.map((f) => ({
    id: f.id,
    ordenId: f.orden_id,
    prestacionId: f.prestacion_id,
    prestacionNombre: f.prestacion_nombre,
    categoriaNombre: f.categoria_nombre,
    cantidad: f.cantidad,
    precioUnitarioCentavos: f.precio_unitario_centavos,
    origenPrecio: f.origen_precio,
    subtotalCentavos: f.subtotal_centavos,
    ordenIndex: f.orden_index,
    piezasFdi: f.piezas
      ? f.piezas
          .split(",")
          .map(Number)
          .sort((a, b) => a - b)
      : []
  }));
}

function mapearOrden(f: FilaOrden, prestaciones: OrdenPrestacion[]): Orden {
  return {
    id: f.id,
    numero: f.numero,
    odontologoId: f.odontologo_id,
    odontologoNombre: f.odontologo_nombre,
    pacienteId: f.paciente_id,
    pacienteNombreCompleto: f.paciente_apellido ? `${f.paciente_nombre} ${f.paciente_apellido}`.trim() : f.paciente_nombre,
    fechaTrabajo: f.fecha_trabajo,
    fechaRegistro: f.fecha_registro,
    moneda: f.moneda,
    listaPrecioId: f.lista_precio_id,
    listaPrecioNombre: f.lista_precio_nombre,
    clinicaId: f.clinica_id,
    clinicaNombre: f.clinica_nombre,
    totalCentavos: f.total_centavos,
    estado: f.estado,
    prestaciones,
    motivoAnulacion: f.motivo_anulacion,
    creadoEn: f.creado_en
  };
}

export async function obtenerOrden(db: Queryable, id: number): Promise<Orden | null> {
  const { rows } = await db.query<FilaOrden>(SELECT_ORDEN + " WHERE o.id = $1", [id]);
  if (!rows[0]) return null;
  return mapearOrden(rows[0], await obtenerPrestacionesDeOrden(db, id));
}

export async function obtenerOrdenPorNumero(db: Queryable, numero: string): Promise<Orden | null> {
  const { rows } = await db.query<FilaOrden>(SELECT_ORDEN + " WHERE o.numero = $1", [numero]);
  if (!rows[0]) return null;
  return mapearOrden(rows[0], await obtenerPrestacionesDeOrden(db, rows[0].id));
}

// ============================================================
// ESCRITURA (usada por ordenService dentro de una transacción)
// ============================================================

export interface DatosLineaOrden {
  prestacionId: number;
  prestacionNombre: string;
  categoriaNombre: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  origenPrecio: "lista" | "manual";
  piezasFdi: number[];
}

export interface DatosNuevaOrden {
  numero: string;
  odontologoId: number;
  pacienteId: number;
  fechaTrabajo: string;
  moneda: Moneda;
  listaPrecioId: number | null;
  listaPrecioNombre: string;
  /** Congelados desde el profesional al momento de crear la OT (§6, §24). */
  clinicaId: number | null;
  clinicaNombre: string | null;
  totalCentavos: number;
  lineas: DatosLineaOrden[];
  creadoPor: number;
}

async function insertarLineas(db: Queryable, ordenId: number, lineas: DatosLineaOrden[]): Promise<void> {
  for (const [idx, linea] of lineas.entries()) {
    const subtotal = linea.precioUnitarioCentavos * linea.cantidad;
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO orden_prestaciones
        (orden_id, prestacion_id, prestacion_nombre, categoria_nombre, cantidad,
         precio_unitario_centavos, origen_precio, subtotal_centavos, orden_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        ordenId,
        linea.prestacionId,
        linea.prestacionNombre,
        linea.categoriaNombre,
        linea.cantidad,
        linea.precioUnitarioCentavos,
        linea.origenPrecio,
        subtotal,
        idx
      ]
    );
    const lineaId = rows[0].id;
    for (const pieza of linea.piezasFdi) {
      await db.query("INSERT INTO orden_prestacion_piezas (orden_prestacion_id, pieza_fdi) VALUES ($1, $2)", [lineaId, pieza]);
    }
  }
}

/** Inserción de bajo nivel (orden + prestaciones + piezas). La resolución
 * de precios y la numeración se hacen en ordenService, que envuelve esto
 * en una única transacción. */
export async function insertarOrden(db: Queryable, data: DatosNuevaOrden): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ordenes
      (numero, odontologo_id, paciente_id, fecha_trabajo, moneda, lista_precio_id, lista_precio_nombre,
       clinica_id, clinica_nombre, total_centavos, estado, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendiente_facturar', $11) RETURNING id`,
    [
      data.numero,
      data.odontologoId,
      data.pacienteId,
      data.fechaTrabajo,
      data.moneda,
      data.listaPrecioId,
      data.listaPrecioNombre,
      data.clinicaId,
      data.clinicaNombre,
      data.totalCentavos,
      data.creadoPor
    ]
  );
  const ordenId = rows[0].id;
  await insertarLineas(db, ordenId, data.lineas);
  return ordenId;
}

export interface DatosActualizarOrden {
  odontologoId: number;
  pacienteId: number;
  fechaTrabajo: string;
  moneda: Moneda;
  listaPrecioId: number | null;
  listaPrecioNombre: string;
  clinicaId: number | null;
  clinicaNombre: string | null;
  totalCentavos: number;
  lineas: DatosLineaOrden[];
}

/**
 * Actualiza una OT YA EXISTENTE con datos nuevos: la cabecera se
 * sobreescribe (mismo id, mismo número, misma fecha de creación/origen —
 * nada de eso se toca) y las líneas (prestaciones + piezas) se reemplazan
 * enteras. Reemplazar en vez de "diffear" línea por línea es
 * deliberadamente más simple y menos propenso a errores; el antes/después
 * completo de la edición queda igual disponible porque quien llama a esto
 * (ordenService.editarOrdenConPrestaciones) lo registra en Auditoría
 * ANTES de reemplazar nada. Las piezas se van solas en cascada al borrar
 * sus `orden_prestaciones` (ON DELETE CASCADE) — no hay ninguna otra
 * tabla con ON DELETE RESTRICT hacia `orden_prestaciones`, así que este
 * reemplazo es seguro incluso para una OT ya facturada.
 */
export async function actualizarOrdenConLineas(db: Queryable, ordenId: number, data: DatosActualizarOrden): Promise<void> {
  await db.query(
    `UPDATE ordenes SET
       odontologo_id = $1, paciente_id = $2, fecha_trabajo = $3, moneda = $4,
       lista_precio_id = $5, lista_precio_nombre = $6, clinica_id = $7, clinica_nombre = $8,
       total_centavos = $9, actualizado_en = densz_now()
     WHERE id = $10`,
    [
      data.odontologoId,
      data.pacienteId,
      data.fechaTrabajo,
      data.moneda,
      data.listaPrecioId,
      data.listaPrecioNombre,
      data.clinicaId,
      data.clinicaNombre,
      data.totalCentavos,
      ordenId
    ]
  );

  await db.query("DELETE FROM orden_prestaciones WHERE orden_id = $1", [ordenId]);
  await insertarLineas(db, ordenId, data.lineas);
}

export async function marcarFacturada(db: Queryable, id: number): Promise<void> {
  await db.query("UPDATE ordenes SET estado = 'facturado', actualizado_en = densz_now() WHERE id = $1", [id]);
}

export async function anularOrdenDb(db: Queryable, id: number, motivo: string, usuarioId: number): Promise<void> {
  await db.query(
    `UPDATE ordenes SET estado = 'anulado', motivo_anulacion = $1, anulado_por = $2, anulado_en = densz_now(),
     actualizado_en = densz_now() WHERE id = $3`,
    [motivo, usuarioId, id]
  );
}

export async function editarFechaTrabajo(db: Queryable, id: number, fechaTrabajo: string): Promise<void> {
  await db.query("UPDATE ordenes SET fecha_trabajo = $1, actualizado_en = densz_now() WHERE id = $2", [fechaTrabajo, id]);
}

/** Elimina la OT definitivamente (prestaciones y piezas se van en cascada).
 * Quien llama a esto (ordenService.eliminarOrdenDefinitivo) es responsable
 * de borrar antes los comprobantes y movimientos de cuenta asociados,
 * porque esas tablas usan ON DELETE RESTRICT a propósito para que un
 * borrado accidental nunca se lleve puesto un comprobante o un movimiento
 * sin que quede explícitamente decidido acá. */
export async function eliminarOrdenDb(db: Queryable, id: number): Promise<void> {
  await db.query("DELETE FROM ordenes WHERE id = $1", [id]);
}
