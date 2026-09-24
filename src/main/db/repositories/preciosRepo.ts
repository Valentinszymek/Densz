import type { Queryable } from "../types";
import type { CategoriaPrecio, Prestacion } from "../../../shared/types/entities";
import { DenszError } from "../../utils/errors";
import { withTransaction } from "../withTransaction";

// ============================================================
// CATEGORÍAS
// ============================================================

interface FilaCategoria {
  id: number;
  nombre: string;
  orden: number;
  activo: number;
}

function mapearCategoria(f: FilaCategoria): CategoriaPrecio {
  return { id: f.id, nombre: f.nombre, orden: f.orden, activo: f.activo === 1 };
}

export async function listarCategorias(db: Queryable, soloActivas = false): Promise<CategoriaPrecio[]> {
  const sql = `SELECT * FROM categorias_precio ${soloActivas ? "WHERE activo = 1" : ""} ORDER BY orden, lower(nombre)`;
  const { rows } = await db.query<FilaCategoria>(sql);
  return rows.map(mapearCategoria);
}

export async function crearCategoria(db: Queryable, nombre: string): Promise<number> {
  const { rows: maxRows } = await db.query<{ m: number }>("SELECT COALESCE(MAX(orden), -1) AS m FROM categorias_precio");
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO categorias_precio (nombre, orden) VALUES ($1, $2) RETURNING id",
    [nombre.trim(), maxRows[0].m + 1]
  );
  return rows[0].id;
}

export async function actualizarCategoria(db: Queryable, id: number, nombre: string): Promise<void> {
  await db.query("UPDATE categorias_precio SET nombre = $1 WHERE id = $2", [nombre.trim(), id]);
}

export async function setActivaCategoria(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE categorias_precio SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export async function moverCategoria(pool: Queryable, id: number, direccion: "arriba" | "abajo"): Promise<void> {
  const categorias = await listarCategorias(pool);
  const idx = categorias.findIndex((c) => c.id === id);
  const idxVecino = direccion === "arriba" ? idx - 1 : idx + 1;
  if (idx < 0 || idxVecino < 0 || idxVecino >= categorias.length) return;

  const actual = categorias[idx];
  const vecino = categorias[idxVecino];
  await withTransaction(pool, async (client) => {
    await client.query("UPDATE categorias_precio SET orden = $1 WHERE id = $2", [vecino.orden, actual.id]);
    await client.query("UPDATE categorias_precio SET orden = $1 WHERE id = $2", [actual.orden, vecino.id]);
  });
}

export interface UsoCategoria {
  cantidadPrestaciones: number;
  /** Prestaciones de esta categoría que ya se usaron en algún trabajo — bloquean el borrado (§6, histórico congelado). */
  prestacionesConHistorial: number;
}

export async function contarUsoCategoria(db: Queryable, id: number): Promise<UsoCategoria> {
  const [{ rows: prestacionesRows }, { rows: historialRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) c FROM prestaciones WHERE categoria_id = $1", [id]),
    db.query<{ c: number }>(
      `SELECT COUNT(DISTINCT p.id) c FROM prestaciones p
       JOIN orden_prestaciones op ON op.prestacion_id = p.id
       WHERE p.categoria_id = $1`,
      [id]
    )
  ]);
  return { cantidadPrestaciones: prestacionesRows[0].c, prestacionesConHistorial: historialRows[0].c };
}

/** Elimina la categoría y sus prestaciones — solo si NINGUNA de sus
 * prestaciones se usó jamás en un trabajo. Si alguna tiene historial, se
 * bloquea por completo (nunca se toca un trabajo ya facturado): hay que
 * desactivar o mover esas prestaciones a otra categoría primero. */
export async function eliminarCategoria(pool: Queryable, id: number): Promise<void> {
  const uso = await contarUsoCategoria(pool, id);
  if (uso.prestacionesConHistorial > 0) {
    throw new DenszError(
      `No se puede eliminar: tiene ${uso.prestacionesConHistorial} prestación(es) usada(s) en trabajos históricos, que nunca se modifican. Desactivá esas prestaciones o movelas a otra categoría antes de eliminarla.`
    );
  }
  await withTransaction(pool, async (client) => {
    const { rows: prestacionesRows } = await client.query<{ id: number }>(
      "SELECT id FROM prestaciones WHERE categoria_id = $1",
      [id]
    );
    for (const { id: prestacionId } of prestacionesRows) {
      await client.query("DELETE FROM lista_precio_items WHERE prestacion_id = $1", [prestacionId]);
    }
    await client.query("DELETE FROM prestaciones WHERE categoria_id = $1", [id]);
    await client.query("DELETE FROM categorias_precio WHERE id = $1", [id]);
  });
}

// ============================================================
// PRESTACIONES (catálogo — el precio vive en las listas de precios)
// ============================================================

interface FilaPrestacion {
  id: number;
  categoria_id: number;
  categoria_nombre: string;
  nombre: string;
  orden: number;
  activo: number;
}

function mapearPrestacion(f: FilaPrestacion): Prestacion {
  return {
    id: f.id,
    categoriaId: f.categoria_id,
    categoriaNombre: f.categoria_nombre,
    nombre: f.nombre,
    orden: f.orden,
    activo: f.activo === 1
  };
}

const SELECT_PRESTACIONES = `
  SELECT p.*, c.nombre AS categoria_nombre
  FROM prestaciones p
  JOIN categorias_precio c ON c.id = p.categoria_id
`;

export interface FiltroPrestaciones {
  categoriaId?: number;
  soloActivas?: boolean;
  busqueda?: string;
}

export async function listarPrestaciones(db: Queryable, filtro: FiltroPrestaciones = {}): Promise<Prestacion[]> {
  let sql = SELECT_PRESTACIONES + " WHERE 1=1";
  const params: unknown[] = [];
  if (filtro.categoriaId) {
    params.push(filtro.categoriaId);
    sql += ` AND p.categoria_id = $${params.length}`;
  }
  if (filtro.soloActivas) sql += " AND p.activo = 1";
  if (filtro.busqueda?.trim()) {
    params.push(`%${filtro.busqueda.trim()}%`);
    sql += ` AND p.nombre ILIKE $${params.length}`;
  }
  sql += " ORDER BY p.orden, lower(p.nombre)";
  const { rows } = await db.query<FilaPrestacion>(sql, params);
  return rows.map(mapearPrestacion);
}

export async function obtenerPrestacion(db: Queryable, id: number): Promise<Prestacion | null> {
  const { rows } = await db.query<FilaPrestacion>(SELECT_PRESTACIONES + " WHERE p.id = $1", [id]);
  return rows[0] ? mapearPrestacion(rows[0]) : null;
}

export async function crearPrestacion(db: Queryable, data: { categoriaId: number; nombre: string }): Promise<number> {
  const { rows: maxRows } = await db.query<{ m: number }>(
    "SELECT COALESCE(MAX(orden), -1) AS m FROM prestaciones WHERE categoria_id = $1",
    [data.categoriaId]
  );
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO prestaciones (categoria_id, nombre, orden) VALUES ($1, $2, $3) RETURNING id",
    [data.categoriaId, data.nombre.trim(), maxRows[0].m + 1]
  );
  return rows[0].id;
}

export async function actualizarPrestacion(
  db: Queryable,
  id: number,
  data: { categoriaId: number; nombre: string }
): Promise<void> {
  await db.query("UPDATE prestaciones SET categoria_id = $1, nombre = $2 WHERE id = $3", [
    data.categoriaId,
    data.nombre.trim(),
    id
  ]);
}

export async function setActivaPrestacion(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE prestaciones SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export interface UsoPrestacion {
  /** Trabajos (histórico) que usaron esta prestación — si hay alguno, el borrado queda bloqueado. */
  enTrabajosHistoricos: number;
  /** Listas de precios que hoy tienen un precio vigente para esta prestación. */
  enListasActuales: number;
  /** Odontólogos cuya lista asignada es una de las anteriores. */
  odontologosAfectados: number;
}

export async function contarUsoPrestacion(db: Queryable, id: number): Promise<UsoPrestacion> {
  const [{ rows: historicosRows }, { rows: listasRows }, { rows: odontologosRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) c FROM orden_prestaciones WHERE prestacion_id = $1", [id]),
    db.query<{ c: number }>(
      "SELECT COUNT(DISTINCT lista_id) c FROM lista_precio_items WHERE prestacion_id = $1 AND vigente_hasta IS NULL",
      [id]
    ),
    db.query<{ c: number }>(
      `SELECT COUNT(DISTINCT o.id) c FROM odontologos o
       WHERE o.lista_precio_id IN (
         SELECT DISTINCT lista_id FROM lista_precio_items WHERE prestacion_id = $1 AND vigente_hasta IS NULL
       )`,
      [id]
    )
  ]);
  return {
    enTrabajosHistoricos: historicosRows[0].c,
    enListasActuales: listasRows[0].c,
    odontologosAfectados: odontologosRows[0].c
  };
}

/** Elimina una prestación del catálogo — solo si NUNCA se usó en un
 * trabajo. Si tiene historial, se bloquea (§6: el pasado no cambia);
 * desactivarla es la vía correcta para sacarla del catálogo activo sin
 * perder esa referencia. Si no tiene historial pero sí precios vigentes en
 * alguna lista, esos se limpian junto con la prestación. */
export async function eliminarPrestacion(pool: Queryable, id: number): Promise<void> {
  const uso = await contarUsoPrestacion(pool, id);
  if (uso.enTrabajosHistoricos > 0) {
    throw new DenszError(
      `No se puede eliminar: se usó en ${uso.enTrabajosHistoricos} trabajo(s) histórico(s), que nunca se modifican. Desactivala en cambio para sacarla del catálogo activo sin perder esa referencia.`
    );
  }
  await withTransaction(pool, async (client) => {
    await client.query("DELETE FROM lista_precio_items WHERE prestacion_id = $1", [id]);
    await client.query("DELETE FROM prestaciones WHERE id = $1", [id]);
  });
}
