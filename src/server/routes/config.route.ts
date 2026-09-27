import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { getConfig, setConfig } from "../../main/db/repositories/configRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";

const CLAVE_LABORATORIO_NOMBRE = "laboratorio.nombre";
// Mismo valor de fábrica que src/main/ipc/config.ipc.ts — nunca se muestra
// como si fuera un nombre real elegido por el laboratorio.
const VALOR_DE_FABRICA = "Densz";

/** Equivalente de solo lectura de src/main/ipc/config.ipc.ts (CONFIG_LABORATORIO_OBTENER). */
export function crearRouterConfig(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/laboratorio", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (_req, res) => {
    const valor = await getConfig(db, CLAVE_LABORATORIO_NOMBRE);
    res.json(valor && valor.trim() !== VALOR_DE_FABRICA ? valor.trim() : null);
  });

  // Escritura: mismo permiso que la lectura (CONFIGURACION_EDITAR),
  // igual que src/main/ipc/config.ipc.ts línea 26.
  router.put("/laboratorio", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (req, res) => {
    try {
      const nombre = z.string().trim().min(1, "Ingresá un nombre.").max(100).parse(req.body.nombre);
      await setConfig(db, CLAVE_LABORATORIO_NOMBRE, nombre);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "configuracion",
        detalle: { clave: CLAVE_LABORATORIO_NOMBRE, valor: nombre }
      });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Ingresá un nombre válido (máximo 100 caracteres)." });
    }
  });

  return router;
}
