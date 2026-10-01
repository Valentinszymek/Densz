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
 * PERMISOS — revisado antes de implementar: ningún canal de
 * src/main/ipc/pagos.ipc.ts llama a requerirPermiso hoy (existen
 * PERMISOS.PAGOS_CREAR/PAGOS_VER/PAGOS_ANULAR en permisos.ts, sin uso acá).
 * Se repite exactamente ese comportamiento — solo se exige sesión
 * (requireAuth), sin agregar ningún chequeo de permiso nuevo. Ver el
 * informe de este bloque para un hallazgo relacionado (RECEPCION no tiene
 * "pagos.anular" en su rol, pero nada lo hace cumplir hoy — ni acá ni en
 * el escritorio).
 *
 * A propósito NO se porta MEDIOS_PAGO_CREAR (crear un método de pago) —
 * fuera del alcance pedido para este bloque (solo lectura de métodos).
 */
export function crearRouterPagos(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.query.odontologoId);
      res.json(await listarPagos(db, odontologoId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/clinica/:clinicaId", async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      res.json(await listarPagosClinica(db, clinicaId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ultimos", async (req, res) => {
    try {
      const limite = req.query.limite !== undefined ? z.coerce.number().int().positive().parse(req.query.limite) : 5;
      res.json(await listarUltimosPagos(db, limite));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/", async (req, res) => {
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

  router.patch("/:id/anular", async (req, res) => {
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
    res.json(await listarMediosPago(db));
  });

  // Bloque 2 / Parte D — barrido final: tenía backend listo
  // (crearMedioPago, ya usado por los tests de este mismo router) y
  // ninguna razón para seguir pendiente. Sin permiso, igual que el resto
  // de la escritura de este router (tampoco lo exige pagos.ipc.ts).
  router.post("/medios", async (req, res) => {
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
