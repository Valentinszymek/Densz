import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarPacientes,
  obtenerPaciente,
  contarTrabajosPaciente,
  crearPaciente,
  actualizarPaciente,
  setActivoPaciente,
  eliminarOInactivarPaciente
} from "../../main/db/repositories/pacientesRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { zBooleanQuery } from "../utils/zQuery";

// Mismo esquema de filtro que src/main/ipc/pacientes.ipc.ts (PACIENTES_LISTAR).
const esquemaFiltro = z.object({
  odontologoId: z.coerce.number().int().positive().optional(),
  soloActivos: zBooleanQuery,
  busqueda: z.string().optional(),
  orden: z.enum(["nombre_asc", "nombre_desc", "reciente", "antiguo"]).optional()
});

const esquemaId = z.coerce.number().int().positive();

// Mismo esquema que src/main/ipc/pacientes.ipc.ts (PACIENTES_CREAR/ACTUALIZAR).
const esquemaDatos = z.object({
  nombreCompleto: z.string().trim().min(2, "Ingresá el nombre y apellido del paciente."),
  odontologoId: z.number().int().positive("Seleccioná un odontólogo.")
});

/** Equivalente de solo lectura de src/main/ipc/pacientes.ipc.ts (ver docs/ARQUITECTURA_Y_MIGRACION_WEB.md). */
export function crearRouterPacientes(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const filtro = esquemaFiltro.parse(req.query);
      res.json(await listarPacientes(db, filtro));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await obtenerPaciente(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/cantidad-trabajos", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await contarTrabajosPaciente(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Escritura: sin chequeo de permiso, igual que src/main/ipc/pacientes.ipc.ts
  // hoy. No se porta PACIENTES_ELIMINAR (borrado físico condicional) en este bloque.

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaDatos.parse(req.body);
      const id = await crearPaciente(db, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "pacientes",
        entidadId: id,
        detalle: { nombreCompleto: validado.nombreCompleto }
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
      await actualizarPaciente(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "pacientes",
        entidadId: id
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
      await setActivoPaciente(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "pacientes",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Eliminación segura (Bloque 2 / Parte B): reutiliza
  // eliminarOInactivarPaciente tal cual — si tiene trabajos históricos lo
  // inactiva en vez de borrarlo, nunca rompe una OT/comprobante existente.
  // Sin permiso, igual que el resto de la escritura de este router.
  router.delete("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const paciente = await obtenerPaciente(db, id);
      const resultado = await eliminarOInactivarPaciente(db, id);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "eliminar",
        entidad: "pacientes",
        entidadId: id,
        detalle: {
          nombre: paciente?.nombreCompleto,
          resultado: resultado.eliminadoFisicamente ? "eliminado_fisicamente" : "inactivado_por_historial",
          ...(resultado.eliminadoFisicamente ? {} : { cantidadTrabajos: resultado.cantidadTrabajos })
        }
      });
      res.json(resultado);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
