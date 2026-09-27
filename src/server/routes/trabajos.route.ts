import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { listarOrdenes, obtenerOrden, editarFechaTrabajo, type FiltroOrdenes } from "../../main/db/repositories/ordenesRepo";
import { obtenerComprobantePorOrden } from "../../main/db/repositories/comprobantesRepo";
import {
  crearOrdenConPrestaciones,
  editarOrdenConPrestaciones,
  anularOrden,
  eliminarOrdenDefinitivo
} from "../../main/services/ordenService";
import { regenerarPdfComprobante } from "../../main/services/comprobanteService";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { generarPdfDesdeHtmlWeb } from "../pdf";

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema exacto que src/main/ipc/ordenes.ipc.ts (ORDENES_LISTAR) — FiltroOrdenes en ordenesRepo.ts.
const esquemaFiltro = z.object({
  odontologoId: z.coerce.number().int().positive().optional(),
  pacienteId: z.coerce.number().int().positive().optional(),
  clinicaId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["pendiente_facturar", "facturado", "anulado"]).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  busqueda: z.string().optional(),
  limite: z.coerce.number().int().positive().optional()
}) satisfies z.ZodType<FiltroOrdenes>;

// Mismo esquema exacto que src/main/ipc/ordenes.ipc.ts (esquemaLinea/esquemaCrear) — ORDENES_CREAR/ORDENES_EDITAR.
const esquemaLinea = z.object({
  prestacionId: z.number().int().positive(),
  cantidad: z.number().int().positive("La cantidad debe ser mayor a cero."),
  piezasFdi: z.array(z.number().int()).default([]),
  precioManualCentavos: z.number().int().nonnegative().nullable().optional()
});

const esquemaCrear = z
  .object({
    odontologoId: z.number().int().positive(),
    pacienteId: z.number().int().positive().nullable().optional(),
    pacienteNombreCompleto: z.string().trim().min(2).optional(),
    fechaTrabajo: z.string().min(1),
    prestaciones: z.array(esquemaLinea).min(1, "Agregá al menos una prestación.")
  })
  .refine((d) => d.pacienteId != null || (d.pacienteNombreCompleto?.trim().length ?? 0) >= 2, {
    message: "Seleccioná un paciente existente o ingresá el nombre de uno nuevo.",
    path: ["pacienteNombreCompleto"]
  });

const esquemaMotivo = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.");

/**
 * Equivalente de src/main/ipc/ordenes.ipc.ts (Trabajos/Órdenes de Trabajo).
 * Reutiliza sin modificar ordenService.ts/ordenesRepo.ts — misma
 * numeración, mismos precios históricos, misma congelación de datos,
 * mismas transacciones (withTransaction, adentro de cada función del
 * servicio). Solo ORDENES_ELIMINAR exige permiso hoy en el escritorio
 * (ordenes.ipc.ts línea 95); el resto de los canales no tienen chequeo de
 * permiso — se repite exactamente ese comportamiento acá, sin inventar
 * ninguno nuevo (existen ORDENES_CREAR/ORDENES_VER en permisos.ts, pero
 * el escritorio no los usa en este archivo).
 */
export function crearRouterTrabajos(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarOrdenes(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerOrden(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaCrear.parse(req.body);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const orden = await crearOrdenConPrestaciones(db, { ...validado, creadoPor: usuarioId });
      await registrarAuditoria(db, {
        usuarioId,
        accion: "crear",
        entidad: "ordenes",
        entidadId: orden.id,
        detalle: { numero: orden.numero, totalCentavos: orden.totalCentavos, moneda: orden.moneda }
      });
      res.status(201).json(orden);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const validado = esquemaCrear.parse(req.body);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const orden = await editarOrdenConPrestaciones(db, id, { ...validado, editadoPor: usuarioId });
      // Mismo comportamiento que ordenes.ipc.ts (ORDENES_EDITAR): si la OT
      // ya tenía comprobante, se regenera su PDF con los datos nuevos —
      // reutiliza comprobanteService.ts tal cual, solo inyectando el
      // generador de PDF del servidor (Puppeteer) en vez del de Electron.
      const comprobante = await obtenerComprobantePorOrden(db, id);
      if (comprobante) {
        await regenerarPdfComprobante(db, comprobante.id, generarPdfDesdeHtmlWeb);
      }
      res.json(orden);
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
      await anularOrden(db, id, motivo, usuarioId);
      await registrarAuditoria(db, { usuarioId, accion: "anular", entidad: "ordenes", entidadId: id, detalle: { motivo } });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/fecha", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const fechaTrabajo = z.string().min(1).parse(req.body.fechaTrabajo);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      await editarFechaTrabajo(db, id, fechaTrabajo);
      await registrarAuditoria(db, { usuarioId, accion: "editar_fecha", entidad: "ordenes", entidadId: id });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Eliminación definitiva: solo ADMIN (permiso "*"), igual que
  // ordenes.ipc.ts línea 95 — la recepción trabaja con anular, nunca con
  // borrado físico. eliminarOrdenDefinitivo() ya es transaccional y ya
  // bloquea con un error claro cuando corresponde (ver ordenService.ts) —
  // no se agrega ninguna regla nueva acá.
  router.delete("/:id", requirePermission(PERMISOS.ORDENES_ELIMINAR), async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const motivo = esquemaMotivo.parse(req.body.motivo);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      await eliminarOrdenDefinitivo(db, id, usuarioId, motivo);
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
