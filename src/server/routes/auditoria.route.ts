import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { listarAuditoriaFiltrada, obtenerOpcionesFiltroAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth } from "../middleware/requireAuth";
import { requireActiveSubscription, requirePlan } from "../middleware/requireActiveSubscription";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";
import { requirePermission } from "../middleware/requirePermission";

// Mismo esquema que FiltroAuditoriaDto (src/shared/types/entities.ts).
const esquemaFiltro = z.object({
  busqueda: z.string().optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  accion: z.string().optional(),
  entidad: z.string().optional(),
  periodo: z.enum(["todos", "hoy", "ultimos7", "esteMes", "mesAnterior", "ultimos30", "personalizado"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().positive().optional()
});

/**
 * Equivalente de solo lectura de src/main/ipc/auditoria.ipc.ts
 * (AUDITORIA_LISTAR, AUDITORIA_OPCIONES_FILTRO). Permiso: PERMISOS.AUDITORIA_VER,
 * misma regla exacta que auditoria.ipc.ts líneas 10-18 exige en ambos canales.
 */
export function crearRouterAuditoria(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireActiveSubscription);
  router.use(requirePlan("professional"));
  router.use(attachTenantDb(db));
  router.use(requirePermission(PERMISOS.AUDITORIA_VER));

  router.get("/", async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarAuditoriaFiltrada(db, filtro));
    } catch {
      res.status(400).json({ error: "Filtro de auditoría inválido." });
    }
  });

  router.get("/opciones-filtro", async (_req, res) => {
    const db = (_req as unknown as RequestConTenantDb).db;
    res.json(await obtenerOpcionesFiltroAuditoria(db));
  });

  return router;
}
