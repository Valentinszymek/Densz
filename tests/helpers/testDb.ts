import { Pool, type PoolClient } from "pg";
import { loadEnvFile, getTestDatabaseUrl } from "../../src/main/utils/appPaths";
import { ensureBootstrapUser } from "../../src/main/db/ensureBootstrapUser";
import { registrarParsersPostgres } from "../../src/main/db/pgTypes";

loadEnvFile();
registrarParsersPostgres();

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    // El Session Pooler del proyecto de tests tiene un límite duro de 15
    // conexiones concurrentes (plan Free) — vitest.config.ts fuerza los
    // archivos de test a correr secuencialmente (no en paralelo) para que
    // nunca haya más de un pool de este tamaño abierto a la vez.
    pool = new Pool({ connectionString: getTestDatabaseUrl(), ssl: { rejectUnauthorized: false }, max: 8 });
  }
  return pool;
}

export interface TestDb {
  db: PoolClient;
  finalizar: () => Promise<void>;
}

/**
 * Abre una conexión de test dentro de una transacción que SIEMPRE se
 * revierte al final (ROLLBACK) — mismo aislamiento por test que antes
 * daba una base SQLite en memoria nueva por test, ahora contra Postgres
 * real (el proyecto Supabase dedicado a tests — nunca el de producción,
 * ver TEST_DATABASE_URL en .env). Cada test debe llamar `finalizar()` en
 * su `afterEach`.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = await getPool().connect();
  await client.query("BEGIN");
  return {
    db: client,
    finalizar: async () => {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  };
}

/** Igual que createTestDb, pero además garantiza un usuario válido (para OT/pagos/comprobantes). */
export async function createTestDbConUsuario(): Promise<TestDb & { usuarioId: number }> {
  const ctx = await createTestDb();
  const usuarioId = await ensureBootstrapUser(ctx.db);
  return { ...ctx, usuarioId };
}

/** La migración de listas_precio siempre incluye una lista "General" (ARS)
 * por defecto, para que todo odontólogo tenga una lista asignada. */
export async function idListaGeneral(db: PoolClient): Promise<number> {
  const { rows } = await db.query<{ id: number }>("SELECT id FROM listas_precio WHERE nombre = 'General'");
  return rows[0].id;
}

export async function cerrarPoolDeTests(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
