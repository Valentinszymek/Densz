import type { Queryable } from "../types";
import type { Pago, MedioPago, PagoConOdontologo, Moneda } from "../../../shared/types/entities";

interface FilaPago {
  id: number;
  odontologo_id: number | null;
  clinica_id: number | null;
  fecha: string;
  importe_centavos: number;
  moneda: Moneda;
  medio_pago_id: number;
  medio_pago_nombre: string;
  referencia: string | null;
  anulado: number;
  motivo_anulacion: string | null;
  creado_por_nombre: string | null;
}

const SELECT_BASE = `
  SELECT p.*, m.nombre AS medio_pago_nombre, u.nombre_completo AS creado_por_nombre
  FROM pagos p
  JOIN medios_pago m ON m.id = p.medio_pago_id
  LEFT JOIN usuarios u ON u.id = p.creado_por
`;

function mapear(f: FilaPago): Pago {
  return {
    id: f.id,
    odontologoId: f.odontologo_id,
    clinicaId: f.clinica_id,
    fecha: f.fecha,
    importeCentavos: f.importe_centavos,
    moneda: f.moneda,
    medioPagoId: f.medio_pago_id,
    medioPagoNombre: f.medio_pago_nombre,
    referencia: f.referencia,
    anulado: f.anulado === 1,
    motivoAnulacion: f.motivo_anulacion,
    creadoPorNombre: f.creado_por_nombre ?? undefined
  };
}

export async function listarPagos(db: Queryable, odontologoId: number, limite = 500): Promise<Pago[]> {
  const { rows } = await db.query<FilaPago>(
    SELECT_BASE + " WHERE p.odontologo_id = $1 ORDER BY p.fecha DESC, p.id DESC LIMIT $2",
    [odontologoId, limite]
  );
  return rows.map(mapear);
}

export async function listarPagosClinica(db: Queryable, clinicaId: number, limite = 500): Promise<Pago[]> {
  const { rows } = await db.query<FilaPago>(
    SELECT_BASE + " WHERE p.clinica_id = $1 ORDER BY p.fecha DESC, p.id DESC LIMIT $2",
    [clinicaId, limite]
  );
  return rows.map(mapear);
}

/** Últimos pagos (de odontólogos y de clínicas) para el Dashboard. */
export async function listarUltimosPagos(db: Queryable, limite = 5): Promise<PagoConOdontologo[]> {
  const { rows } = await db.query<FilaPago & { odontologo_nombre_join: string | null; clinica_nombre_join: string | null }>(
    `SELECT p.*, m.nombre AS medio_pago_nombre, o.nombre AS odontologo_nombre_join, c.nombre AS clinica_nombre_join
     FROM pagos p
     JOIN medios_pago m ON m.id = p.medio_pago_id
     LEFT JOIN odontologos o ON o.id = p.odontologo_id
     LEFT JOIN clinicas c ON c.id = p.clinica_id
     WHERE p.anulado = 0
     ORDER BY p.fecha DESC, p.id DESC
     LIMIT $1`,
    [limite]
  );
  return rows.map((f) => ({ ...mapear(f), odontologoNombre: f.odontologo_nombre_join, clinicaNombre: f.clinica_nombre_join }));
}

export async function obtenerPago(db: Queryable, id: number): Promise<Pago | null> {
  const { rows } = await db.query<FilaPago>(SELECT_BASE + " WHERE p.id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

export interface DatosNuevoPago {
  /** Exactamente uno de los dos: pago de un odontólogo independiente, o de una clínica. */
  odontologoId: number | null;
  clinicaId: number | null;
  fecha: string;
  importeCentavos: number;
  moneda: Moneda;
  medioPagoId: number;
  referencia?: string | null;
  creadoPor: number;
}

export async function existePagoSimilarReciente(db: Queryable, data: Omit<DatosNuevoPago, "creadoPor">): Promise<boolean> {
  const { rows } = await db.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM pagos
     WHERE odontologo_id IS NOT DISTINCT FROM $1 AND clinica_id IS NOT DISTINCT FROM $2
       AND importe_centavos = $3 AND moneda = $4 AND fecha = $5 AND medio_pago_id = $6 AND anulado = 0`,
    [data.odontologoId, data.clinicaId, data.importeCentavos, data.moneda, data.fecha, data.medioPagoId]
  );
  return rows[0].c > 0;
}

export async function insertarPago(db: Queryable, data: DatosNuevoPago): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO pagos (odontologo_id, clinica_id, fecha, importe_centavos, moneda, medio_pago_id, referencia, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      data.odontologoId,
      data.clinicaId,
      data.fecha,
      data.importeCentavos,
      data.moneda,
      data.medioPagoId,
      data.referencia ?? null,
      data.creadoPor
    ]
  );
  return rows[0].id;
}

export async function anularPagoDb(db: Queryable, id: number, motivo: string, usuarioId: number): Promise<void> {
  await db.query(
    `UPDATE pagos SET anulado = 1, motivo_anulacion = $1, anulado_por = $2, anulado_en = densz_now() WHERE id = $3`,
    [motivo, usuarioId, id]
  );
}

// Medios de pago
interface FilaMedioPago {
  id: number;
  nombre: string;
  activo: number;
}

export async function listarMediosPago(db: Queryable, soloActivos = true): Promise<MedioPago[]> {
  const sql = `SELECT * FROM medios_pago ${soloActivos ? "WHERE activo = 1" : ""} ORDER BY id`;
  const { rows } = await db.query<FilaMedioPago>(sql);
  return rows.map((f) => ({ id: f.id, nombre: f.nombre, activo: f.activo === 1 }));
}

export async function crearMedioPago(db: Queryable, nombre: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>("INSERT INTO medios_pago (nombre) VALUES ($1) RETURNING id", [nombre.trim()]);
  return rows[0].id;
}

export async function setActivoMedioPago(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE medios_pago SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}
