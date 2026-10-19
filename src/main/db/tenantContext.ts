import type { Queryable } from "./types";

/**
 * Fija `app.current_laboratorio_id` (RLS) en esta conexión/cliente para
 * lo que resta de su vida (sesión, no transacción — `set_config(...,
 * false)`). `null` se manda como `''`: la política RLS y el DEFAULT de
 * `laboratorio_id` usan `NULLIF(..., '')::integer` (ver migración
 * `multitenant_fix_guc_vacio_nullif`), así que nunca revienta con
 * "invalid input syntax for type integer" — simplemente no matchea
 * ninguna fila, que es lo correcto antes de saber el laboratorio.
 *
 * Usado por los dos login (bcrypt y Google) justo después de resolver
 * QUIÉN es la persona (con una función `SECURITY DEFINER` que mira todos
 * los laboratorios a la vez, ver usuariosRepo.ts) y ANTES de cualquier
 * otra consulta normal sobre esa misma conexión (auditoría, último
 * acceso, re-fetch del usuario) — si no, esas consultas siguientes
 * seguirían viendo el laboratorio sin resolver y no encontrarían nada.
 */
export async function fijarLaboratorioEnConexion(db: Queryable, laboratorioId: number | null): Promise<void> {
  const valor = laboratorioId === null ? "" : String(laboratorioId);
  await db.query("SELECT set_config('app.current_laboratorio_id', $1, false)", [valor]);
}
