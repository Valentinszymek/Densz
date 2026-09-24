import type { Queryable } from "../types";
import type { Paciente } from "../../../shared/types/entities";

interface FilaPaciente {
  id: number;
  nombre: string;
  apellido: string | null;
  odontologo_id: number;
  odontologo_nombre?: string;
  fecha_alta: string;
  activo: number;
}

function nombreCompleto(nombre: string, apellido: string | null): string {
  return apellido ? `${nombre} ${apellido}`.trim() : nombre.trim();
}

function mapear(fila: FilaPaciente): Paciente {
  return {
    id: fila.id,
    nombre: fila.nombre,
    apellido: fila.apellido,
    nombreCompleto: nombreCompleto(fila.nombre, fila.apellido),
    odontologoId: fila.odontologo_id,
    odontologoNombre: fila.odontologo_nombre,
    fechaAlta: fila.fecha_alta,
    activo: fila.activo === 1
  };
}

const SELECT_BASE = `
  SELECT p.*, o.nombre AS odontologo_nombre
  FROM pacientes p
  JOIN odontologos o ON o.id = p.odontologo_id
`;

export type OrdenPacientes = "nombre_asc" | "nombre_desc" | "reciente" | "antiguo";

const ORDER_BY: Record<OrdenPacientes, string> = {
  nombre_asc: "lower(p.nombre) ASC, lower(p.apellido) ASC",
  nombre_desc: "lower(p.nombre) DESC, lower(p.apellido) DESC",
  // fecha_alta es NOT NULL con default densz_now() desde el origen del
  // esquema — todo paciente, viejo o nuevo, tiene una fecha real y
  // confiable; `p.id` como desempate para los que comparten el mismo
  // instante (ej. varios cargados en la misma migración).
  reciente: "p.fecha_alta DESC, p.id DESC",
  antiguo: "p.fecha_alta ASC, p.id ASC"
};

export interface FiltroPacientes {
  odontologoId?: number;
  soloActivos?: boolean;
  busqueda?: string;
  orden?: OrdenPacientes;
}

export async function listarPacientes(db: Queryable, filtro: FiltroPacientes = {}): Promise<Paciente[]> {
  let sql = SELECT_BASE + " WHERE 1=1";
  const params: unknown[] = [];
  if (filtro.odontologoId) {
    params.push(filtro.odontologoId);
    sql += ` AND p.odontologo_id = $${params.length}`;
  }
  if (filtro.soloActivos) sql += " AND p.activo = 1";
  if (filtro.busqueda && filtro.busqueda.trim()) {
    params.push(`%${filtro.busqueda.trim()}%`);
    sql += ` AND (p.nombre || ' ' || COALESCE(p.apellido, '')) ILIKE $${params.length}`;
  }
  sql += ` ORDER BY ${ORDER_BY[filtro.orden ?? "nombre_asc"]}`;
  const { rows } = await db.query<FilaPaciente>(sql, params);
  return rows.map(mapear);
}

export async function obtenerPaciente(db: Queryable, id: number): Promise<Paciente | null> {
  const { rows } = await db.query<FilaPaciente>(SELECT_BASE + " WHERE p.id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

/**
 * Busca un paciente ACTIVO del odontólogo cuyo nombre completo coincide
 * exactamente (sin importar mayúsculas/espacios sobrantes) con el dado.
 * Se usa al crear un paciente "sobre la marcha" desde Nuevo Trabajo para
 * evitar duplicados: si ya existe uno con ese nombre, se reutiliza en vez
 * de insertar uno nuevo. Nunca reutiliza un paciente inactivo (eso sería
 * "reactivarlo" sin que nadie lo haya pedido explícitamente).
 */
export async function buscarPacienteActivoPorNombre(
  db: Queryable,
  odontologoId: number,
  nombreCompletoBuscado: string
): Promise<Paciente | null> {
  const q = nombreCompletoBuscado.trim();
  if (!q) return null;
  const { rows } = await db.query<FilaPaciente>(
    SELECT_BASE +
      " WHERE p.odontologo_id = $1 AND p.activo = 1" +
      " AND TRIM(p.nombre || ' ' || COALESCE(p.apellido, '')) ILIKE $2",
    [odontologoId, q]
  );
  return rows[0] ? mapear(rows[0]) : null;
}

export interface DatosPaciente {
  /** Nombre y apellido tal como se escriben en un único campo de la UI. */
  nombreCompleto: string;
  odontologoId: number;
}

export async function crearPaciente(db: Queryable, data: DatosPaciente): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO pacientes (nombre, apellido, odontologo_id) VALUES ($1, NULL, $2) RETURNING id",
    [data.nombreCompleto.trim(), data.odontologoId]
  );
  return rows[0].id;
}

export async function actualizarPaciente(db: Queryable, id: number, data: DatosPaciente): Promise<void> {
  // Al editar, se unifica siempre en el campo `nombre` (deja de depender
  // de `apellido`, que solo sobrevive en registros migrados sin tocar).
  await db.query("UPDATE pacientes SET nombre = $1, apellido = NULL, odontologo_id = $2 WHERE id = $3", [
    data.nombreCompleto.trim(),
    data.odontologoId,
    id
  ]);
}

export async function setActivoPaciente(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE pacientes SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export async function contarTrabajosPaciente(db: Queryable, id: number): Promise<number> {
  const { rows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM ordenes WHERE paciente_id = $1", [id]);
  return rows[0].c;
}

export type ResultadoEliminarPaciente =
  | { eliminadoFisicamente: true }
  | { eliminadoFisicamente: false; cantidadTrabajos: number };

/**
 * "Eliminar paciente" desde el punto de vista del usuario es una única
 * acción, pero internamente elige la estrategia segura: si el paciente no
 * tiene ningún trabajo histórico, se borra la fila de verdad; si tiene
 * alguno, `ordenes.paciente_id` tiene `ON DELETE RESTRICT` (no se puede
 * borrar sin romper esas OT), así que en cambio se lo inactiva — deja de
 * aparecer como paciente activo, pero sus OT/comprobantes/pagos siguen
 * intactos y consultables (el nombre se resuelve siempre por JOIN en vivo
 * contra esta misma fila, así que nunca deja de mostrarse correctamente).
 */
export async function eliminarOInactivarPaciente(db: Queryable, id: number): Promise<ResultadoEliminarPaciente> {
  const cantidadTrabajos = await contarTrabajosPaciente(db, id);
  if (cantidadTrabajos > 0) {
    await db.query("UPDATE pacientes SET activo = 0 WHERE id = $1", [id]);
    return { eliminadoFisicamente: false, cantidadTrabajos };
  }
  await db.query("DELETE FROM pacientes WHERE id = $1", [id]);
  return { eliminadoFisicamente: true };
}
