import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { registrarDeuda, anularDeuda } from "../../main/services/deudaService";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema exacto que src/main/ipc/deudas.ipc.ts (esquemaDeuda, DEUDAS_REGISTRAR).
const esquemaDeuda = z
  .object({
    odontologoId: z.number().int().positive().nullable().optional(),
    clinicaId: z.number().int().positive().nullable().optional(),
    fecha: z.string().min(1),
    importeCentavos: z.number().int().positive("El importe debe ser mayor a cero."),
    moneda: z.enum(["ARS", "USD"]),
    descripcion: z.string().trim().min(1, "Ingresá una descripción.").max(200)
  })
  .transform((d) => ({ ...d, odontologoId: d.odontologoId ?? null, clinicaId: d.clinicaId ?? null }));

const esquemaMotivo = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.");

/**
 * Equivalente de src/main/ipc/deudas.ipc.ts — deuda agregada a mano, sin
 * ninguna orden detrás (ej. saldo previo a Densz). Misma paridad de
 * permisos que pagos.route.ts: solo exige sesión (requireAuth), sin
 * chequeo de permiso nuevo.
 */
export function crearRouterDeudas(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireActiveSubscription);
  router.use(attachTenantDb(db));

  router.post("/", async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const validado = esquemaDeuda.parse(req.body);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const movimiento = await registrarDeuda(db, validado, usuarioId);
      res.status(201).json(movimiento);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/anular", async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const id = esquemaId.parse(req.params.id);
      const motivo = esquemaMotivo.parse(req.body.motivo);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      await anularDeuda(db, id, motivo, usuarioId);
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      const status = error.message === "La deuda no existe." ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  });

  return router;
}
