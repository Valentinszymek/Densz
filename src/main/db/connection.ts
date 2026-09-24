import { Pool } from "pg";
import { registrarParsersPostgres } from "./pgTypes";

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
export async function checkConnection(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
