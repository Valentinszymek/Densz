import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { obtenerComprobantePorOrden, listarComprobantes, type FiltroComprobantes } from "../../main/db/repositories/comprobantesRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { generarComprobanteWeb, descargarPdfComprobanteWeb } from "../comprobantesWeb";

const esquemaId = z.coerce.number().int().positive();
const esquemaFiltro = z.object({
  odontologoId: z.coerce.number().int().positive().optional(),
  clinicaId: z.coerce.number().int().positive().optional(),
  busqueda: z.string().optional(),
  limite: z.coerce.number().int().positive().optional()
}) satisfies z.ZodType<FiltroComprobantes>;

/**
 * Equivalente de src/main/ipc/comprobantes.ipc.ts (Comprobantes).
 * Reutiliza comprobanteService.ts/comprobantesRepo.ts sin modificarlos —
 * ver src/server/comprobantesWeb.ts para la capa que conecta la
 * generación del PDF (Puppeteer) con Supabase Storage.
 *
 * PERMISOS — revisado antes de implementar: ningún canal de
 * comprobantes.ipc.ts llama a requerirPermiso hoy (existen
 * PERMISOS.COMPROBANTES_CREAR/COMPROBANTES_VER en permisos.ts, sin uso
 * acá). Se repite exactamente ese comportamiento: solo requireAuth.
 *
 * NO se porta COMPROBANTES_IMPRIMIR (impresión física) — fuera de
 * alcance, depende del diálogo de impresión del navegador (etapa
 * posterior).
 */
export function crearRouterComprobantes(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarComprobantes(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/orden/:ordenId", async (req, res) => {
    try {
      const ordenId = esquemaId.parse(req.params.ordenId);
      res.json(await obtenerComprobantePorOrden(db, ordenId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const ordenId = esquemaId.parse(req.body.ordenId);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const comprobante = await generarComprobanteWeb(db, ordenId, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar",
        entidad: "comprobantes",
        entidadId: comprobante.id,
        detalle: { numero: comprobante.numero, ordenId }
      });
      res.status(201).json(comprobante);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // La ruta del objeto en Storage nunca la elige el cliente: se
  // reconstruye siempre a partir del comprobante real (id validado),
  // nunca de un path recibido en el pedido.
  router.get("/:id/pdf", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const buffer = await descargarPdfComprobanteWeb(db, id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="comprobante-${id}.pdf"`);
      res.send(buffer);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
