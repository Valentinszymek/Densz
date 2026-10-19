import { Pool, type PoolClient } from "pg";
import { registrarParsersPostgres } from "./pgTypes";
import type { Queryable } from "./types";
import { getLaboratorioActualId } from "../services/sessionService";
import { fijarLaboratorioEnConexion } from "./tenantContext";

registrarParsersPostgres();

let poolInstance: Pool | null = null;

/**
 * Abre (o reutiliza) el pool de conexiones a Postgres. A diferencia de
 * SQLite, esto no garantiza que la base esté disponible: la primera query
 * real recién confirma la conexión (ver `checkConnection` / `ConexionGate`
 * en el renderer).
 */
export function openDatabase(connectionString: string): Pool {
  if (poolInstance) return poolInstance;

  poolInstance = new Pool({
    connectionString,
    // El certificado del pooler de Supabase no siempre valida contra el
    // almacén de CAs por defecto de Node en todos los entornos Windows;
    // se mantiene TLS pero sin verificación estricta de la cadena.
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  poolInstance.on("error", (err) => {
    // Error en un cliente inactivo del pool (ej. la red se cae mientras no
    // hay queries en curso) — no debe tirar abajo el proceso principal.
    // eslint-disable-next-line no-console
    console.error("Error inesperado en el pool de Postgres:", err);
  });

  // Fija el laboratorio actual (RLS) en CADA conexión que se saca del
  // pool — no solo la primera vez que se abre la conexión física. Esto
  // es lo que necesita el escritorio (un solo proceso, una sola persona
  // usándolo, sin "por pedido" como en la web): el evento `connect` de
  // `pg` solo dispara una vez por conexión FÍSICA nueva, así que si nos
  // quedáramos solo con eso, una conexión abierta ANTES del login (sin
  // laboratorio todavía) quedaría con el GUC sin actualizar para
  // siempre, aunque el pool la reutilice después de loguearse. Por eso
  // se envuelve `connect()` en sí (el mismo método que usan tanto
  // `pool.query()` como `withTransaction` por debajo).
  //
  // IMPORTANTE: `pg-pool` internamente SIEMPRE usa la forma con callback
  // de `connect()` — incluso cuando quien llama a `pool.query()` lo hace
  // con la forma de Promise, `query()` por dentro hace
  // `this.connect((err, client) => {...})`. Una primera versión de este
  // arreglo solo cubría la forma de Promise (asumiendo, mal, que nadie
  // usaba la de callback) y dejaba pasar la de callback sin tocar —
  // dejaba el 100% de los `pool.query()` normales sin el GUC fijado.
  // Confirmado en vivo: con RLS ya activa, el escritorio mostraba cero
  // filas en el panel principal pese a tener sesión iniciada. Por eso
  // acá se envuelven las DOS formas.
  const connectOriginal = poolInstance.connect.bind(poolInstance);
  poolInstance.connect = ((
    callback?: (err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void
  ) => {
    if (typeof callback === "function") {
      connectOriginal((err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => {
        if (err || !client) {
          callback(err, client, done);
          return;
        }
        fijarLaboratorioEnConexion(client, getLaboratorioActualId())
          .then(() => callback(undefined, client, done))
          .catch((gucErr: Error) => callback(gucErr, undefined, done));
      });
      return;
    }
    return connectOriginal().then(async (client) => {
      await fijarLaboratorioEnConexion(client, getLaboratorioActualId());
      return client;
    });
  }) as Pool["connect"];

  // En el servidor web este valor queda pisado de inmediato por
  // `attachTenantDb` en cada pedido real (fija su propio valor por
  // transacción) — por eso es inofensivo tener este wrapper también ahí,
  // aunque la sesión de escritorio (`sessionService`) no tenga sentido
  // conceptual del lado del servidor: para cuando una ruta real llega a
  // consultar algo, su propio `set_config` ya corrió después de este.

  return poolInstance;
}

export function getDatabase(): Pool {
  if (!poolInstance) {
    throw new Error("La base de datos no fue inicializada. Llamá a openDatabase() primero.");
  }
  return poolInstance;
}

export async function closeDatabase(): Promise<void> {
  if (poolInstance) {
    const pool = poolInstance;
    poolInstance = null;
    await pool.end();
  }
}

/** Prueba real de conectividad (no solo "el pool existe"): usado por el gate de conexión al arrancar. */
export async function checkConnection(db: Queryable): Promise<boolean> {
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
