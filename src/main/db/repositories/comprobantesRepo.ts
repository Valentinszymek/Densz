import type { Queryable } from "../types";
import type { Comprobante, ComprobanteListado, Moneda } from "../../../shared/types/entities";

interface FilaComprobante {
  id: number;
  numero: string;
  orden_id: number;
  fecha_emision: string;
  pdf_path: string | null;
  anulado: number;
  laboratorio_nombre: string | null;
}

function mapear(f: FilaComprobante): Comprobante {
  return {
    id: f.id,
    numero: f.numero,
    ordenId: f.orden_id,
    fechaEmision: f.fecha_emision,
    pdfPath: f.pdf_path,
    anulado: f.anulado === 1,
    laboratorioNombre: f.laboratorio_nombre
  };
}

export async function insertarComprobante(
  db: Queryable,
  data: { numero: string; ordenId: number; creadoPor: number; laboratorioNombre: string | null }
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO comprobantes (numero, orden_id, creado_por, laboratorio_nombre) VALUES ($1, $2, $3, $4) RETURNING id",
    [data.numero, data.ordenId, data.creadoPor, data.laboratorioNombre]
  );
  return rows[0].id;
}

export async function setPdfPath(db: Queryable, id: number, pdfPath: string): Promise<void> {
  await db.query("UPDATE comprobantes SET pdf_path = $1 WHERE id = $2", [pdfPath, id]);
}

export async function obtenerComprobante(db: Queryable, id: number): Promise<Comprobante | null> {
  const { rows } = await db.query<FilaComprobante>("SELECT * FROM comprobantes WHERE id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

export async function obtenerComprobantePorOrden(db: Queryable, ordenId: number): Promise<Comprobante | null> {
  const { rows } = await db.query<FilaComprobante>("SELECT * FROM comprobantes WHERE orden_id = $1", [ordenId]);
  return rows[0] ? mapear(rows[0]) : null;
}

export interface FiltroComprobantes {
  odontologoId?: number;
  clinicaId?: number;
  busqueda?: string;
  limite?: number;
}

export async function listarComprobantes(db: Queryable, filtro: FiltroComprobantes = {}): Promise<ComprobanteListado[]> {
  let sql = `
    SELECT c.*, o.numero AS orden_numero, o.total_centavos AS total_centavos, o.moneda AS moneda,
           o.clinica_nombre AS clinica_nombre,
           od.nombre AS odontologo_nombre, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
    FROM comprobantes c
    JOIN ordenes o ON o.id = c.orden_id
    JOIN odontologos od ON od.id = o.odontologo_id
    JOIN pacientes p ON p.id = o.paciente_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (filtro.odontologoId) {
    params.push(filtro.odontologoId);
    sql += ` AND o.odontologo_id = $${params.length}`;
  }
  if (filtro.clinicaId) {
    params.push(filtro.clinicaId);
    sql += ` AND o.clinica_id = $${params.length}`;
  }
  if (filtro.busqueda?.trim()) {
    params.push(`%${filtro.busqueda.trim()}%`);
    const idx1 = params.length;
    params.push(`%${filtro.busqueda.trim()}%`);
    const idx2 = params.length;
    sql += ` AND (c.numero ILIKE $${idx1} OR o.numero ILIKE $${idx2})`;
  }
  sql += " ORDER BY c.fecha_emision DESC, c.id DESC";
  if (filtro.limite) {
    params.push(filtro.limite);
    sql += ` LIMIT $${params.length}`;
  }

  const { rows } = await db.query<
    FilaComprobante & {
      orden_numero: string;
      total_centavos: number;
      moneda: Moneda;
      clinica_nombre: string | null;
      odontologo_nombre: string;
      paciente_nombre: string;
      paciente_apellido: string | null;
    }
  >(sql, params);

  return rows.map((f) => ({
    ...mapear(f),
    ordenNumero: f.orden_numero,
    odontologoNombre: f.odontologo_nombre,
    clinicaNombre: f.clinica_nombre,
    pacienteNombreCompleto: f.paciente_apellido ? `${f.paciente_nombre} ${f.paciente_apellido}`.trim() : f.paciente_nombre,
    moneda: f.moneda,
    totalCentavos: f.total_centavos
  }));
}

export async function anularComprobanteDb(db: Queryable, id: number, usuarioId: number): Promise<void> {
  await db.query(
    "UPDATE comprobantes SET anulado = 1, anulado_por = $1, anulado_en = densz_now() WHERE id = $2",
    [usuarioId, id]
  );
}

/** Borra en forma definitiva el comprobante de una OT (parte del flujo de
 * "Eliminar OT" — §20). No se usa para anulaciones normales. */
export async function eliminarComprobantePorOrden(db: Queryable, ordenId: number): Promise<void> {
  await db.query("DELETE FROM comprobantes WHERE orden_id = $1", [ordenId]);
}
