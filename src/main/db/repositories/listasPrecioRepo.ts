import type { Queryable } from "../types";
import type { ListaPrecio, PrestacionEnLista, HistoricoPrecioLista, Moneda } from "../../../shared/types/entities";
import { DenszError } from "../../utils/errors";
import { withTransaction } from "../withTransaction";

interface FilaLista {
  id: number;
  nombre: string;
  moneda: Moneda;
  orden: number;
  activo: number;
  creado_en: string;
}

function mapearLista(f: FilaLista): ListaPrecio {
  return { id: f.id, nombre: f.nombre, moneda: f.moneda, orden: f.orden, activo: f.activo === 1, creadoEn: f.creado_en };
}

export async function listarListas(db: Queryable, soloActivas = false): Promise<ListaPrecio[]> {
  const sql = `SELECT * FROM listas_precio ${soloActivas ? "WHERE activo = 1" : ""} ORDER BY orden, lower(nombre)`;
  const { rows } = await db.query<FilaLista>(sql);
  return rows.map(mapearLista);
}

export async function obtenerLista(db: Queryable, id: number): Promise<ListaPrecio | null> {
  const { rows } = await db.query<FilaLista>("SELECT * FROM listas_precio WHERE id = $1", [id]);
  return rows[0] ? mapearLista(rows[0]) : null;
}

export async function crearLista(db: Queryable, data: { nombre: string; moneda: Moneda }): Promise<number> {
  const { rows: maxRows } = await db.query<{ m: number }>("SELECT COALESCE(MAX(orden), -1) AS m FROM listas_precio");
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO listas_precio (nombre, moneda, orden) VALUES ($1, $2, $3) RETURNING id",
    [data.nombre.trim(), data.moneda, maxRows[0].m + 1]
  );
  return rows[0].id;
}

export async function actualizarLista(db: Queryable, id: number, data: { nombre: string }): Promise<void> {
  // La moneda de una lista NUNCA se cambia una vez creada: mezclar OTs ya
  // creadas en su moneda original con una lista que después cambia de
  // moneda rompería la regla de "una OT no mezcla monedas". Si hace falta
  // otra moneda, se crea una lista nueva.
  await db.query("UPDATE listas_precio SET nombre = $1 WHERE id = $2", [data.nombre.trim(), id]);
}

export async function setActivaLista(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE listas_precio SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export interface UsoLista {
  /** Odontólogos que tienen esta lista asignada hoy — bloquea el borrado hasta reasignarlos. */
  odontologosAsignados: number;
  /** OT (histórico) creadas con esta lista — si hay alguna, el borrado queda bloqueado (§6). */
  usosHistoricos: number;
}

export async function contarUsoLista(db: Queryable, id: number): Promise<UsoLista> {
  const [{ rows: odontologosRows }, { rows: usosRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) c FROM odontologos WHERE lista_precio_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM ordenes WHERE lista_precio_id = $1", [id])
  ]);
  return { odontologosAsignados: odontologosRows[0].c, usosHistoricos: usosRows[0].c };
}

/** Elimina una lista de precios — solo si no está asignada a ningún
 * odontólogo hoy y nunca se usó en una OT. Cualquiera de las dos bloquea
 * el borrado por completo: reasignar a los odontólogos, o desactivar la
 * lista en cambio si ya tiene historial. */
export async function eliminarLista(pool: Queryable, id: number): Promise<void> {
  const uso = await contarUsoLista(pool, id);
  if (uso.odontologosAsignados > 0) {
    throw new DenszError(
      `No se puede eliminar: está asignada a ${uso.odontologosAsignados} odontólogo(s). Reasignalos a otra lista antes de eliminarla.`
    );
  }
  if (uso.usosHistoricos > 0) {
    throw new DenszError(
      `No se puede eliminar: se usó en ${uso.usosHistoricos} trabajo(s) histórico(s), que nunca se modifican. Desactivala en cambio.`
    );
  }
  await withTransaction(pool, async (client) => {
    await client.query("DELETE FROM lista_precio_items WHERE lista_id = $1", [id]);
    await client.query("DELETE FROM listas_precio WHERE id = $1", [id]);
  });
}

// ============================================================
// ÍTEMS DE LA LISTA (precios históricos por lista + prestación)
// ============================================================

interface FilaItem {
  id: number;
  categoria_id: number;
  categoria_nombre: string;
  nombre: string;
  orden: number;
  activo: number;
  precio_centavos: number | null;
  vigente_desde: string | null;
}

function mapearItem(f: FilaItem): PrestacionEnLista {
  return {
    id: f.id,
    categoriaId: f.categoria_id,
    categoriaNombre: f.categoria_nombre,
    nombre: f.nombre,
    orden: f.orden,
    activo: f.activo === 1,
    precioCentavos: f.precio_centavos,
    vigenteDesde: f.vigente_desde
  };
}

/** Todas las prestaciones (activas por defecto) con su precio vigente en esta lista (null si nunca se le puso precio). */
export async function listarPrestacionesDeLista(
  db: Queryable,
  listaId: number,
  soloActivas = false
): Promise<PrestacionEnLista[]> {
  const sql = `
    SELECT p.id, p.categoria_id, c.nombre AS categoria_nombre, p.nombre, p.orden, p.activo,
           li.precio_centavos, li.vigente_desde
    FROM prestaciones p
    JOIN categorias_precio c ON c.id = p.categoria_id
    LEFT JOIN lista_precio_items li ON li.prestacion_id = p.id AND li.lista_id = $1 AND li.vigente_hasta IS NULL
    ${soloActivas ? "WHERE p.activo = 1" : ""}
    ORDER BY c.orden, p.orden, lower(p.nombre)
  `;
  const { rows } = await db.query<FilaItem>(sql, [listaId]);
  return rows.map(mapearItem);
}

export async function precioVigenteEnLista(
  db: Queryable,
  listaId: number,
  prestacionId: number
): Promise<{ precioCentavos: number; vigenteDesde: string } | null> {
  const { rows } = await db.query<{ precio_centavos: number; vigente_desde: string }>(
    "SELECT precio_centavos, vigente_desde FROM lista_precio_items WHERE lista_id = $1 AND prestacion_id = $2 AND vigente_hasta IS NULL",
    [listaId, prestacionId]
  );
  return rows[0] ? { precioCentavos: rows[0].precio_centavos, vigenteDesde: rows[0].vigente_desde } : null;
}

export async function historialPrecioEnLista(db: Queryable, listaId: number, prestacionId: number): Promise<HistoricoPrecioLista[]> {
  const { rows } = await db.query<{ id: number; precio_centavos: number; vigente_desde: string; vigente_hasta: string | null }>(
    "SELECT id, precio_centavos, vigente_desde, vigente_hasta FROM lista_precio_items WHERE lista_id = $1 AND prestacion_id = $2 ORDER BY vigente_desde DESC",
    [listaId, prestacionId]
  );
  return rows.map((f) => ({ id: f.id, precioCentavos: f.precio_centavos, vigenteDesde: f.vigente_desde, vigenteHasta: f.vigente_hasta }));
}

/**
 * Cambia el precio de una prestación dentro de una lista: nunca pisa el
 * precio anterior (queda cerrado con vigente_hasta). Las OT ya creadas
 * conservan el precio_unitario_centavos que tenían congelado en
 * orden_prestaciones — esto solo afecta a las próximas OT que se creen.
 */
export async function cambiarPrecioEnLista(
  pool: Queryable,
  listaId: number,
  prestacionId: number,
  nuevoPrecioCentavos: number
): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query(
      "UPDATE lista_precio_items SET vigente_hasta = densz_now() WHERE lista_id = $1 AND prestacion_id = $2 AND vigente_hasta IS NULL",
      [listaId, prestacionId]
    );
    await client.query("INSERT INTO lista_precio_items (lista_id, prestacion_id, precio_centavos) VALUES ($1, $2, $3)", [
      listaId,
      prestacionId,
      nuevoPrecioCentavos
    ]);
  });
}
