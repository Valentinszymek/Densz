import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarClinicas,
  obtenerClinica,
  obtenerEstadisticasClinica,
  crearClinica,
  actualizarClinica,
  setActivaClinica,
  contarUsoClinica,
  eliminarClinica
} from "../../main/db/repositories/clinicasRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { zBooleanQuery } from "../utils/zQuery";

// Mismo esquema de filtro que src/main/ipc/clinicas.ipc.ts (CLINICAS_LISTAR).
const esquemaFiltro = z.object({
  soloActivas: zBooleanQuery,
  busqueda: z.string().optional()
});

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema que src/main/ipc/clinicas.ipc.ts (CLINICAS_CREAR/ACTUALIZAR).
const esquemaDatos = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  telefono: z.string().trim().max(50).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional()
});

/** Equivalente de solo lectura de src/main/ipc/clinicas.ipc.ts (ver docs/ARQUITECTURA_Y_MIGRACION_WEB.md). */
export function crearRouterClinicas(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarClinicas(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerClinica(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/estadisticas", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerEstadisticasClinica(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Escritura: sin chequeo de permiso, igual que src/main/ipc/clinicas.ipc.ts hoy.

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaDatos.parse(req.body);
      const id = await crearClinica(db, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "clinicas",
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
      await actualizarClinica(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "clinicas",
        entidadId: id,
        detalle: { nombre: validado.nombre }
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
      await setActivaClinica(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "clinicas",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/uso", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await contarUsoClinica(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Eliminación segura (Bloque 2 / Parte B): reutiliza eliminarClinica tal
  // cual — bloquea si tiene cualquier historial asociado. Sin permiso,
  // igual que el resto de la escritura de este router.
  router.delete("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      await eliminarClinica(db, id);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "eliminar",
        entidad: "clinicas",
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
