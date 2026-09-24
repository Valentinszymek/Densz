import type { Pool, PoolClient } from "pg";
import type { Queryable } from "./types";

/**
 * `PoolClient` también expone un método `.connect()` (lo hereda de la
 * clase `Client` de la que en verdad es instancia) — así que no sirve para
 * distinguirlo de un `Pool` real. `.release()`, en cambio, solo existe en
 * una conexión ya sacada del pool.
 */
function esPoolClient(db: Queryable): db is PoolClient {
  return typeof (db as PoolClient).release === "function";
}

/**
 * Corre `fn` dentro de una única transacción Postgres: toma una conexión
 * del pool, hace BEGIN, y COMMIT si `fn` resuelve o ROLLBACK si tira. La
 * conexión siempre se libera al pool al final, haya salido bien o mal.
 * Reemplaza al `db.transaction(() => {...})()` síncrono de better-sqlite3.
 *
 * Si `db` ya es una conexión suelta (`PoolClient`) en vez de un `Pool`
 * -algo que pasa en los tests, donde cada test corre entero dentro de su
 * propia transacción con ROLLBACK, y en llamadas anidadas- no abre una
 * transacción nueva (Postgres no soporta transacciones anidadas reales
 * sin SAVEPOINT): simplemente corre `fn` sobre esa misma conexión, y la
 * transacción externa (del test, o de quien llamó primero) decide el
 * COMMIT/ROLLBACK final.
 */
export async function withTransaction<T>(db: Queryable, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (esPoolClient(db)) {
    return fn(db);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
