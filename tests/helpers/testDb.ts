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
  /** El laboratorio de prueba propio de este test (plan multi-laboratorio)
   * — aislado, nadie más lo ve, desaparece con el ROLLBACK. Sirve para
   * escribir tests de aislamiento cruzado (crear un SEGUNDO laboratorio
   * a mano con `crearLaboratorioDePrueba` y comparar). */
  laboratorioId: number;
  finalizar: () => Promise<void>;
}

/** Fija el laboratorio actual de la conexión — mismo GUC que usa
 * `attachTenantDb` (src/server/middleware/tenantDb.ts) en producción. */
async function fijarLaboratorioDePrueba(client: PoolClient, laboratorioId: number): Promise<void> {
  await client.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [String(laboratorioId)]);
}

/** Da de alta un laboratorio de prueba nuevo, con el seed mínimo que
 * cualquier laboratorio necesita para poder operar (lista "General" +
 * numeradores OT-/CB- en 0) — mismo criterio que va a usar el alta real
 * de un laboratorio nuevo (ver plan, Etapa de Stripe, todavía no
 * implementada como función reutilizable).
 *
 * Insertar ese seed exige, por las políticas RLS (WITH CHECK), que el
 * GUC de la conexión YA apunte a este laboratorio nuevo — así que se fija
 * acá temporalmente, mientras se inserta, y se restaura el valor que
 * tenía la conexión antes de entrar (puede no ser ninguno) al salir: así
 * esta función es segura de usar tanto para el laboratorio "principal" de
 * un test como para un SEGUNDO laboratorio en un test de aislamiento
 * cruzado, sin pisarle el contexto a quien la llamó. */
export async function crearLaboratorioDePrueba(client: PoolClient, nombre = "Laboratorio de prueba"): Promise<number> {
  const { rows: previoRows } = await client.query<{ valor: string | null }>(
    "SELECT current_setting('app.current_laboratorio_id', true) AS valor"
  );
  const valorPrevio = previoRows[0]?.valor ?? "";

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO laboratorios (nombre, email_contacto, plan, estado_suscripcion, activo)
     VALUES ($1, 'test@example.com', 'trial', 'active', 1) RETURNING id`,
    [nombre]
  );
  const laboratorioId = rows[0].id;

  await fijarLaboratorioDePrueba(client, laboratorioId);
  await client.query(
    "INSERT INTO listas_precio (nombre, moneda, laboratorio_id) VALUES ('General', 'ARS', $1)",
    [laboratorioId]
  );
  await client.query(
    `INSERT INTO numeradores (tipo, prefijo, digitos, ultimo_numero, laboratorio_id) VALUES
     ('orden', 'OT-', 8, 0, $1), ('comprobante', 'CB-', 8, 0, $1)`,
    [laboratorioId]
  );
  await client.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [valorPrevio]);

  return laboratorioId;
}

/**
 * Abre una conexión de test dentro de una transacción que SIEMPRE se
 * revierte al final (ROLLBACK) — mismo aislamiento por test que antes
 * daba una base SQLite en memoria nueva por test, ahora contra Postgres
 * real (el proyecto Supabase dedicado a tests — nunca el de producción,
 * ver TEST_DATABASE_URL en .env). Cada test debe llamar `finalizar()` en
 * su `afterEach`.
 *
 * Plan multi-laboratorio: además arma un laboratorio de prueba propio y
 * lo fija como el actual de la conexión (RLS exige esto para ver/crear
 * cualquier fila) — aislado por completo de los datos reales de
 * producción y de cualquier otro test, desaparece con el ROLLBACK.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = await getPool().connect();
  await client.query("BEGIN");
  const laboratorioId = await crearLaboratorioDePrueba(client);
  await fijarLaboratorioDePrueba(client, laboratorioId);
  return {
    db: client,
    laboratorioId,
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
