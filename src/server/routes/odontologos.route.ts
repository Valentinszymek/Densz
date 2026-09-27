import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarOdontologos,
  obtenerOdontologo,
  obtenerEstadisticasOdontologo,
  obtenerUltimaActividadOdontologos,
  crearOdontologo,
  actualizarOdontologo,
  asignarListaPrecio,
  asignarClinica,
  setActivoOdontologo
} from "../../main/db/repositories/odontologosRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { zBooleanQuery } from "../utils/zQuery";

// Mismo esquema de filtro que src/main/ipc/odontologos.ipc.ts (ODONTOLOGOS_LISTAR).
const esquemaFiltro = z.object({
  soloActivos: zBooleanQuery,
  busqueda: z.string().optional(),
  clinicaId: z.coerce.number().int().positive().optional()
});

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema que src/main/ipc/odontologos.ipc.ts (ODONTOLOGOS_CREAR/ACTUALIZAR).
const esquemaDatos = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  telefono: z.string().trim().max(50).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional(),
  listaPrecioId: z.number().int().positive("Asigná una lista de precios."),
  clinicaId: z.number().int().positive().nullable().optional()
});

/** Equivalente de solo lectura de src/main/ipc/odontologos.ipc.ts (ver docs/ARQUITECTURA_Y_MIGRACION_WEB.md). */
export function crearRouterOdontologos(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarOdontologos(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ultima-actividad", async (_req, res) => {
    res.json(await obtenerUltimaActividadOdontologos(db));
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerOdontologo(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/estadisticas", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerEstadisticasOdontologo(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Escritura: sin chequeo de permiso, igual que src/main/ipc/odontologos.ipc.ts hoy.
  // No se porta ODONTOLOGOS_ELIMINAR (no existe eliminación física de
  // odontólogos en este archivo) — no aplica.

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaDatos.parse(req.body);
      const id = await crearOdontologo(db, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "odontologos",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      res.status(201).json(id);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const validado = esquemaDatos.parse(req.body);
      await actualizarOdontologo(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "odontologos",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/lista-precio", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const listaPrecioId = z.coerce.number().int().positive().parse(req.body.listaPrecioId);
      await asignarListaPrecio(db, id, listaPrecioId);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "asignar_lista",
        entidad: "odontologos",
        entidadId: id,
        detalle: { listaPrecioId }
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/clinica", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const clinicaId = z.coerce.number().int().positive().nullable().parse(req.body.clinicaId ?? null);
      await asignarClinica(db, id, clinicaId);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "asignar_clinica",
        entidad: "odontologos",
        entidadId: id,
        detalle: { clinicaId }
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/activo", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const activo = z.boolean().parse(req.body.activo);
      await setActivoOdontologo(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "odontologos",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
