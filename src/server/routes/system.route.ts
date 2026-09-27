import { Router } from "express";
import type { Pool } from "pg";
import { checkConnection } from "../../main/db/connection";
import { requireAuth } from "../middleware/requireAuth";

// Mismas reglas que src/main/ipc/system.ipc.ts (SYSTEM_STATUS): nunca
// exponer la cadena de conexión completa, solo el host; y excluir tablas
// que no son de negocio.
const TABLAS_EXCLUIDAS = new Set(["schema_migrations", "busqueda_global"]);

function hostDeConexion(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `Supabase (${url.hostname})`;
  } catch {
    return "Supabase";
  }
}

async function tablasDeNegocio(db: Pool): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map((f) => f.table_name).filter((t) => !TABLAS_EXCLUIDAS.has(t));
}

/** Equivalente de solo lectura de src/main/ipc/system.ipc.ts (SYSTEM_STATUS). */
export function crearRouterSystem(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/status", async (_req, res) => {
    const tablas = await tablasDeNegocio(db);
    const conteos = await Promise.all(
      tablas.map(async (tabla) => {
        const { rows } = await db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM "${tabla}"`);
        return { tabla, filas: rows[0].c };
      })
    );

    res.json({
      dbPath: hostDeConexion(),
      migracionesAplicadas: [],
      integridadOk: await checkConnection(db),
      conteos,
      appVersion: process.env.npm_package_version ?? "0.1.0"
    });
  });

  return router;
}
