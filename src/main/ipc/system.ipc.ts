import { ipcMain } from "electron";
import type { Pool } from "pg";
import { checkConnection } from "../db/connection";
import { IPC_CHANNELS, type EstadoSistema, type TablaConteo } from "../../shared/types/ipc-contracts";

/** Tablas "de sistema" que no interesa mostrar en el diagnóstico. */
const TABLAS_EXCLUIDAS = new Set(["schema_migrations", "busqueda_global"]);

/** Nombre de host de la conexión (sin usuario ni contraseña) — nunca se
 * expone la cadena de conexión completa hacia el renderer. */
function hostDeConexion(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `Supabase (${url.hostname})`;
  } catch {
    return "Supabase";
  }
}

/** Lista las tablas reales de negocio directamente desde information_schema
 * en vez de mantener un array a mano — así este chequeo nunca vuelve a
 * quedar desactualizado cuando una migración agrega/renombra una tabla.
 * Excluye la tabla de control de migraciones y la de búsqueda global. */
async function tablasDeNegocio(db: Pool): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((f) => f.table_name).filter((t) => !TABLAS_EXCLUIDAS.has(t));
}

export function registrarHandlersSistema(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, (): Promise<boolean> => checkConnection(db));

  ipcMain.handle(IPC_CHANNELS.SYSTEM_STATUS, async (): Promise<EstadoSistema> => {
    const tablas = await tablasDeNegocio(db);
    const conteos: TablaConteo[] = await Promise.all(
      tablas.map(async (tabla) => {
        const { rows } = await db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${tabla}"`);
        return { tabla, filas: rows[0].c };
      })
    );

    return {
      dbPath: hostDeConexion(),
      migracionesAplicadas: [],
      integridadOk: await checkConnection(db),
      conteos,
      appVersion: process.env.npm_package_version ?? "0.1.0"
    };
  });
}
