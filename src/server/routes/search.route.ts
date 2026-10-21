import { Router } from "express";
import type { Pool } from "pg";
import { buscarGlobal } from "../../main/services/searchService";
import { requireAuth } from "../middleware/requireAuth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";

/** Equivalente de src/main/ipc/search.ipc.ts (SEARCH_GLOBAL) — sin chequeo de permiso, igual que hoy. */
export function crearRouterSearch(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireActiveSubscription);
  router.use(attachTenantDb(db));

  router.get("/", async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    const texto = typeof req.query.q === "string" ? req.query.q : "";
    res.json(await buscarGlobal(db, texto));
  });

  return router;
}
