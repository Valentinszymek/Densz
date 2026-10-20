import { Router } from "express";
import type { Pool } from "pg";
import { listarTodosLosLaboratorios } from "../../main/db/repositories/laboratoriosRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";

/**
 * Panel privado del dueño de Densz — lista todos los laboratorios
 * registrados (nombre, plan, estado de suscripción). A propósito NUNCA
 * pasa por `attachTenantDb`: la consulta necesita ver todos los
 * laboratorios a la vez, no uno solo (igual criterio que /auth/google-*,
 * que también usan el pool crudo). `requireSuperAdmin` es lo único que
 * evita que cualquier usuario logueado de cualquier laboratorio la vea
 * — `laboratorios` no tiene RLS.
 */
export function crearRouterLaboratorios(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireSuperAdmin);

  router.get("/", async (_req, res) => {
    try {
      res.json(await listarTodosLosLaboratorios(db));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
