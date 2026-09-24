import type { Queryable } from "../types";
import { withTransaction } from "../withTransaction";

export async function getConfig(db: Queryable, clave: string): Promise<string | null> {
  const { rows } = await db.query<{ valor: string }>("SELECT valor FROM configuracion WHERE clave = $1", [clave]);
  return rows[0]?.valor ?? null;
}

export async function getConfigMultiple(db: Queryable, claves: string[]): Promise<Record<string, string>> {
  if (claves.length === 0) return {};
  const { rows } = await db.query<{ clave: string; valor: string }>(
    "SELECT clave, valor FROM configuracion WHERE clave = ANY($1)",
    [claves]
  );
  const resultado: Record<string, string> = {};
  for (const f of rows) resultado[f.clave] = f.valor;
  return resultado;
}

export async function getConfigPrefijo(db: Queryable, prefijo: string): Promise<Record<string, string>> {
  const { rows } = await db.query<{ clave: string; valor: string }>(
    "SELECT clave, valor FROM configuracion WHERE clave LIKE $1",
    [`${prefijo}%`]
  );
  const resultado: Record<string, string> = {};
  for (const f of rows) resultado[f.clave] = f.valor;
  return resultado;
}

export async function setConfig(db: Queryable, clave: string, valor: string): Promise<void> {
  await db.query(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES ($1, $2, densz_now())
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = densz_now()`,
    [clave, valor]
  );
}

export async function setConfigMultiple(pool: Queryable, valores: Record<string, string>): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const [clave, valor] of Object.entries(valores)) {
      await setConfig(client, clave, valor);
    }
  });
}

export async function listarTodaLaConfig(db: Queryable): Promise<Record<string, string>> {
  const { rows } = await db.query<{ clave: string; valor: string }>("SELECT clave, valor FROM configuracion");
  const resultado: Record<string, string> = {};
  for (const f of rows) resultado[f.clave] = f.valor;
  return resultado;
}
