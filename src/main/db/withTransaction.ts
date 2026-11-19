import type { Pool, PoolClient } from "pg";
import type { Queryable } from "./types";
import { logger } from "../utils/logger";

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
    // Corrección (investigación de estabilidad, 2026-11-19): la versión
    // anterior de este catch pasaba SIEMPRE el error de `fn()` a
    // release() — incluido un error de NEGOCIO común y corriente (ej.
    // "Hay una prestación sin precio", cualquier 400 de validación), que
    // no tiene absolutamente nada que ver con el estado de la conexión.
    // Eso hacía que `pg` descartara y volviera a abrir una conexión nueva
    // contra el pooler de Supabase en CADA error de validación de toda la
    // app — no solo las raras veces que la red se corta de verdad — un
    // churn de conexiones innecesario y frecuente que nunca era la
    // intención (ver el comentario original, que solo hablaba de "un
    // corte de red a mitad de una query"). El único indicador real y
    // confiable de que la conexión está rota es que el propio
    // COMMIT/ROLLBACK falle — ahí sí hay que descartarla (hallazgo real,
    // 2026-11-16: el backend de Railway quedó "vivo" pero sin poder
    // hablarle más a Postgres, y solo un reinicio del proceso -pool
    // nuevo- lo recuperó). Mismo criterio que usa attachTenantDb.ts.
    let errorDeRollback: unknown = null;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      errorDeRollback = rollbackErr;
    }
    // Visibilidad para diagnóstico (§4 del reporte de estabilidad): sin
    // esto, una conexión descartada por estar rota quedaba invisible en
    // los logs — nunca un número para saber si esto pasa una vez al mes o
    // diez veces por hora. Nunca incluye datos de la query ni parámetros.
    if (errorDeRollback) logger.warn("Conexión a Postgres descartada del pool (rota) en withTransaction.");
    client.release(errorDeRollback instanceof Error ? errorDeRollback : errorDeRollback ? new Error(String(errorDeRollback)) : undefined);
    throw err;
  }
}
