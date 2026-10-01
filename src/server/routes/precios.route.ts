import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import * as repo from "../../main/db/repositories/preciosRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISOS } from "../../shared/constants/permisos";
import { zBooleanQuery } from "../utils/zQuery";

const esquemaId = z.coerce.number().int().positive();
const esquemaPrestacionDatos = z.object({
  categoriaId: z.number().int().positive("Seleccioná una categoría."),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.")
});
const esquemaNombre = z.string().trim().min(1, "El nombre es obligatorio.");

// Mismo criterio que src/main/ipc/precios.ipc.ts: los canales de lectura
// (listar/obtener/uso) quedan abiertos a cualquier usuario logueado a
// propósito (catálogo, sin datos sensibles) — solo escritura pide
// PRECIOS_EDITAR, y acá todavía no se porta escritura.
const esquemaFiltroPrestaciones = z.object({
  categoriaId: z.coerce.number().int().positive().optional(),
  soloActivas: zBooleanQuery,
  busqueda: z.string().optional()
});

/** Equivalente de solo lectura de src/main/ipc/precios.ipc.ts (categorías y prestaciones). */
export function crearRouterPrecios(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/categorias", async (req, res) => {
    try {
      const soloActivas = zBooleanQuery.parse(req.query.soloActivas as string | undefined);
      res.json(await repo.listarCategorias(db, soloActivas));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/categorias/:id/uso", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await repo.contarUsoCategoria(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/prestaciones", async (req, res) => {
    try {
      const filtro = esquemaFiltroPrestaciones.parse(req.query);
      res.json(await repo.listarPrestaciones(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/prestaciones/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await repo.obtenerPrestacion(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/prestaciones/:id/uso", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await repo.contarUsoPrestacion(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Escritura: exige PRECIOS_EDITAR, igual que src/main/ipc/precios.ipc.ts
  // (líneas 30, 42, 52, 66, 96, 114, 125 exigen requerirPermiso(PERMISOS.PRECIOS_EDITAR)).
  // No se portan CATEGORIAS_ELIMINAR ni PRESTACIONES_ELIMINAR en este bloque.
  const requierePreciosEditar = requirePermission(PERMISOS.PRECIOS_EDITAR);

  router.post("/categorias", requierePreciosEditar, async (req, res) => {
    try {
      const nombre = esquemaNombre.parse(req.body.nombre);
      const id = await repo.crearCategoria(db, nombre);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "categorias_precio",
        entidadId: id
      });
      res.status(201).json(id);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.put("/categorias/:id", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const nombre = esquemaNombre.parse(req.body.nombre);
      await repo.actualizarCategoria(db, id, nombre);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "categorias_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/categorias/:id/activo", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const activo = z.boolean().parse(req.body.activo);
      await repo.setActivaCategoria(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "categorias_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/categorias/:id/mover", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const direccion = z.enum(["arriba", "abajo"]).parse(req.body.direccion);
      const resultado = await repo.moverCategoria(db, id, direccion);
      // Solo audita si de verdad se movió algo (resultado === null cuando
      // ya estaba en el extremo) — corrección post-auditoría (§26/§30-D).
      if (resultado) {
        await registrarAuditoria(db, {
          usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
          accion: "modificar",
          entidad: "categorias_precio",
          entidadId: id,
          detalle: { direccion, ...resultado }
        });
      }
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/prestaciones", requierePreciosEditar, async (req, res) => {
    try {
      const validado = esquemaPrestacionDatos.parse(req.body);
      const id = await repo.crearPrestacion(db, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "prestaciones",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      res.status(201).json(id);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.put("/prestaciones/:id", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const validado = esquemaPrestacionDatos.parse(req.body);
      await repo.actualizarPrestacion(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "prestaciones",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/prestaciones/:id/activo", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const activo = z.boolean().parse(req.body.activo);
      await repo.setActivaPrestacion(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "prestaciones",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Eliminación segura (Bloque 2 / Parte B): reutiliza eliminarCategoria/
  // eliminarPrestacion tal cual — bloquea con un error claro si hay
  // historial, nunca borra en cascada nada usado en trabajos reales.
  // Mismo permiso que el resto de la escritura de Precios (PRECIOS_EDITAR).
  router.delete("/categorias/:id", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      await repo.eliminarCategoria(db, id);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "eliminar",
        entidad: "categorias_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete("/prestaciones/:id", requierePreciosEditar, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      await repo.eliminarPrestacion(db, id);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "eliminar",
        entidad: "prestaciones",
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
