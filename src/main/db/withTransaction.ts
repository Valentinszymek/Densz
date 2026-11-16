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
    client.release();
    return resultado;
  } catch (err) {
    // La conexión puede estar realmente rota (ej. un corte de red a
    // mitad de una query) — en ese caso el propio ROLLBACK también va a
    // fallar, pero igual hay que intentarlo antes de soltarla. Pasarle el
    // error a release() (en vez de release() sin nada) le dice al pool
    // que DESCARTE esta conexión en vez de devolverla "sana" para el
    // próximo pedido — sin esto, una conexión rota quedaba reciclada
    // igual, y el próximo que la agarrara fallaba también, hasta agotar
    // de a poco las conexiones del pool (hallazgo real, 2026-11-16: el
    // backend de Railway quedó "vivo" pero sin poder hablarle más a
    // Postgres, y solo un reinicio del proceso -pool nuevo- lo recuperó).
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignorado a propósito: si la conexión ya está rota, no hay
      // ROLLBACK que mandar — se descarta igual más abajo.
    }
    client.release(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}
