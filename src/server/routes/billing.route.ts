import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { crearCheckout, cancelarSuscripcion, procesarWebhookMercadoPago } from "../../main/services/billingService";
import { obtenerFacturacionLaboratorio } from "../../main/db/repositories/laboratoriosRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";
import { requirePermission } from "../middleware/requirePermission";
import { logger } from "../../main/utils/logger";

const esquemaCheckout = z.object({
  plan: z.enum(["essential", "professional"]),
  moneda: z.enum(["ARS", "USD"])
});

const ORIGEN_WEB = process.env.WEB_ORIGIN ?? "http://localhost:5174";

/**
 * Suscripciones y pagos (docs/PLAN_COMERCIAL_DENSZ.md §7, Etapa 2). A
 * propósito separado de `/pagos` (plata que los odontólogos le deben al
 * laboratorio — un concepto completamente distinto, ver pagos.route.ts).
 *
 * Nunca pasa por `requireActiveSubscription`: es exactamente la ruta que
 * un laboratorio con la suscripción vencida necesita poder usar para
 * volver a activarse.
 */
export function crearRouterBilling(db: Pool): Router {
  const router = Router();

  // Webhook de Mercado Pago: lo llama Mercado Pago, no un navegador con
  // sesión — la autenticidad se verifica con la firma criptográfica
  // (ver billingService.ts), nunca con requireAuth. Siempre responde 200
  // salvo que Mercado Pago no pueda ni siquiera entregar el pedido: un
  // error de negocio (firma inválida, laboratorio no encontrado) no debe
  // generar reintentos agresivos por varios días.
  router.post("/webhook/mercadopago", async (req, res) => {
    try {
      const tipo = typeof req.query.type === "string" ? req.query.type : (req.body as { type?: string } | undefined)?.type;
      const dataId =
        typeof req.query["data.id"] === "string"
          ? (req.query["data.id"] as string)
          : ((req.body as { data?: { id?: string } } | undefined)?.data?.id ?? undefined);
      await procesarWebhookMercadoPago(db, {
        tipo,
        xSignature: req.header("x-signature") ?? undefined,
        xRequestId: req.header("x-request-id") ?? undefined,
        dataId
      });
    } catch (err) {
      logger.error("Error procesando webhook de Mercado Pago:", err);
    }
    res.sendStatus(200);
  });

  router.use(requireAuth);
  router.use(attachTenantDb(db));

  router.get("/estado", async (req, res) => {
    const sesion = (req as RequestConSesion).sesion;
    const dbReq = (req as RequestConTenantDb).db;
    if (!sesion.laboratorioId) {
      res.status(404).json({ error: "Esta cuenta no pertenece a ningún laboratorio." });
      return;
    }
    try {
      const info = await obtenerFacturacionLaboratorio(dbReq, sesion.laboratorioId);
      res.json(info);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Solo ADMINISTRADOR gestiona la suscripción — mismo permiso que el
  // resto de la configuración del laboratorio.
  router.use(requirePermission(PERMISOS.CONFIGURACION_EDITAR));

  router.post("/checkout", async (req, res) => {
    const sesion = (req as RequestConSesion).sesion;
    const dbReq = (req as RequestConTenantDb).db;
    if (!sesion.laboratorioId) {
      res.status(404).json({ error: "Esta cuenta no pertenece a ningún laboratorio." });
      return;
    }
    try {
      const { plan, moneda } = esquemaCheckout.parse(req.body);
      const info = await obtenerFacturacionLaboratorio(dbReq, sesion.laboratorioId);
      if (!info) {
        res.status(404).json({ error: "Laboratorio no encontrado." });
        return;
      }
      const { url } = await crearCheckout(dbReq, {
        laboratorioId: sesion.laboratorioId,
        planId: plan,
        moneda,
        email: info.emailContacto,
        origenWeb: ORIGEN_WEB
      });
      await registrarAuditoria(dbReq, {
        usuarioId: sesion.usuarioId,
        accion: "checkout_suscripcion",
        entidad: "laboratorios",
        entidadId: sesion.laboratorioId
      });
      res.json({ url });
    } catch (err) {
      logger.error("Error en POST /billing/checkout:", err);
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/cancelar", async (req, res) => {
    const sesion = (req as RequestConSesion).sesion;
    const dbReq = (req as RequestConTenantDb).db;
    if (!sesion.laboratorioId) {
      res.status(404).json({ error: "Esta cuenta no pertenece a ningún laboratorio." });
      return;
    }
    try {
      await cancelarSuscripcion(dbReq, sesion.laboratorioId);
      await registrarAuditoria(dbReq, {
        usuarioId: sesion.usuarioId,
        accion: "cancelar_suscripcion",
        entidad: "laboratorios",
        entidadId: sesion.laboratorioId
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error("Error en POST /billing/cancelar:", err);
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
