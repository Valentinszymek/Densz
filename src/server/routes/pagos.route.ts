import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarPagos,
  listarPagosClinica,
  listarUltimosPagos,
  listarMediosPago,
  crearMedioPago
} from "../../main/db/repositories/pagosRepo";
import { registrarPago, anularPago } from "../../main/services/pagoService";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISOS } from "../../shared/constants/permisos";

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema exacto que src/main/ipc/pagos.ipc.ts (esquemaPago, PAGOS_REGISTRAR).
const esquemaPago = z
  .object({
    odontologoId: z.number().int().positive().nullable().optional(),
    clinicaId: z.number().int().positive().nullable().optional(),
    fecha: z.string().min(1),
    importeCentavos: z.number().int().positive("El importe debe ser mayor a cero."),
    moneda: z.enum(["ARS", "USD"]),
    medioPagoId: z.number().int().positive(),
    referencia: z.string().trim().max(200).nullable().optional()
  })
  .transform((d) => ({ ...d, odontologoId: d.odontologoId ?? null, clinicaId: d.clinicaId ?? null }));

const esquemaMotivo = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.");

/**
 * Equivalente de src/main/ipc/pagos.ipc.ts (Pagos). Reutiliza sin
 * modificar pagoService.ts/pagosRepo.ts — misma detección de duplicados,
 * mismo mecanismo de movimientos DEBE/HABER (via movimientosRepo, llamado
 * adentro de pagoService.ts), misma transacción.
 *
 * PERMISOS — corrección pre-lanzamiento comercial (2026-10-20): hasta
 * acá, ningún canal de pagos (ni este router ni pagos.ipc.ts) exigía
 * PAGOS_CREAR/PAGOS_VER/PAGOS_ANULAR — solo sesión iniciada. El botón de
 * "Anular" se ocultaba según el rol del lado de la pantalla, pero nada
 * lo hacía cumplir del lado del servidor: un rol sin pagos.anular (ej.
 * RECEPCION) igual podía anular llamando al endpoint directo. Con Densz
 * vendiéndose a otros laboratorios, cada uno carga sus propios roles
 * confiando en que esa restricción es real — se agrega acá y en
 * pagos.ipc.ts (mismo permiso, misma regla en las dos plataformas).
 *
 * MEDIOS_PAGO_CREAR (/medios) queda tal cual, sin permiso — no es parte
 * de este hallazgo (no hay anulación ni dato sensible de por medio) y
 * ninguna constante de permiso lo cubre todavía.
 */
export function crearRouterPagos(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireActiveSubscription);
  router.use(attachTenantDb(db));

  const requierePagosVer = requirePermission(PERMISOS.PAGOS_VER);
  const requierePagosCrear = requirePermission(PERMISOS.PAGOS_CREAR);
  const requierePagosAnular = requirePermission(PERMISOS.PAGOS_ANULAR);

  router.get("/", requierePagosVer, async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const odontologoId = esquemaId.parse(req.query.odontologoId);
      res.json(await listarPagos(db, odontologoId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/clinica/:clinicaId", requierePagosVer, async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      res.json(await listarPagosClinica(db, clinicaId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ultimos", requierePagosVer, async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const limite = req.query.limite !== undefined ? z.coerce.number().int().positive().parse(req.query.limite) : 5;
      res.json(await listarUltimosPagos(db, limite));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/", requierePagosCrear, async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const validado = esquemaPago.parse(req.body);
      const confirmarDuplicado = req.body.confirmarDuplicado === true;
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      // registrarPago ya audita "crear" adentro de su propia transacción
      // (corrección post-auditoría §26/§30-D) — no duplicar acá.
      const resultado = await registrarPago(db, validado, usuarioId, confirmarDuplicado);
      if (resultado.creado) {
        res.status(201).json(resultado);
      } else {
        // Mismo criterio que el escritorio: no es un error, es una
        // advertencia — el cliente tiene que reintentar con
        // confirmarDuplicado=true si de verdad quiere registrarlo.
        res.status(409).json(resultado);
      }
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/anular", requierePagosAnular, async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const id = esquemaId.parse(req.params.id);
      const motivo = esquemaMotivo.parse(req.body.motivo);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      // anularPago ya audita "anular" adentro de su propia transacción
      // (corrección post-auditoría §26/§30-D) — no duplicar acá.
      await anularPago(db, id, motivo, usuarioId);
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      const status = error.message === "El pago no existe." ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  });

  router.get("/medios", async (_req, res) => {
    const db = (_req as unknown as RequestConTenantDb).db;
    res.json(await listarMediosPago(db));
  });

  // Bloque 2 / Parte D — barrido final: tenía backend listo
  // (crearMedioPago, ya usado por los tests de este mismo router) y
  // ninguna razón para seguir pendiente. Sin permiso, igual que el resto
  // de la escritura de este router (tampoco lo exige pagos.ipc.ts).
  router.post("/medios", async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const nombre = z.string().trim().min(1).parse(req.body.nombre);
      const id = await crearMedioPago(db, nombre);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "medios_pago",
        entidadId: id
      });
      res.status(201).json(id);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
