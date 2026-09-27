import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import {
  listarUsuarios,
  listarRoles,
  crearUsuario,
  actualizarUsuario,
  cambiarPassword,
  setActivoUsuario,
  eliminarUsuario,
  obtenerUsuarioPorNombre,
  type UsuarioConCredenciales
} from "../../main/db/repositories/usuariosRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres, DenszError } from "../../main/utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";

const NOMBRE_USUARIO = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .regex(/^[a-z0-9._-]+$/i, "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos.");

// Mismos esquemas exactos que src/main/ipc/usuarios.ipc.ts.
const esquemaUsuarioCrear = z.object({
  nombreUsuario: NOMBRE_USUARIO,
  rolId: z.number().int().positive()
});

const esquemaUsuario = z.object({
  nombreUsuario: NOMBRE_USUARIO,
  nombreCompleto: z.string().trim().min(1, "Falta el nombre completo."),
  rolId: z.number().int().positive()
});

const esquemaPassword = z.string().min(6, "La contraseña debe tener al menos 6 caracteres.");

/**
 * Equivalente de src/main/ipc/usuarios.ipc.ts, completo salvo eliminación
 * (Bloque 1: Administración de Usuarios — fuera de alcance a propósito,
 * ver informe). Permiso: PERMISOS.USUARIOS_GESTIONAR en todos los canales,
 * misma regla exacta que exige usuarios.ipc.ts en cada uno. Reutiliza sin
 * modificar usuariosRepo.ts — mismas validaciones zod, mismo hash bcrypt,
 * misma auditoría.
 *
 * Diferencia deliberada con el IPC: `listarUsuarios()` en usuariosRepo.ts
 * devuelve también `passwordHash` (el hash bcrypt) en cada fila — hoy eso
 * viaja igual por IPC al proceso renderer de Electron (mismo proceso
 * confiable, la UI simplemente no lo muestra). Por HTTP el mismo dato viaja
 * por la red hasta el navegador, así que antes de responder se saca
 * `passwordHash` de cada usuario — es una precaución de transporte, no un
 * cambio de permisos ni de a quién se le muestra la lista. La contraseña
 * en texto plano nunca se guarda en auditoría ni se devuelve en ninguna
 * respuesta — solo entra en el `req.body` de /cambiar-password, se hashea
 * y se descarta.
 */
export function crearRouterUsuarios(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requirePermission(PERMISOS.USUARIOS_GESTIONAR));

  router.get("/", async (_req, res) => {
    // El cast refleja lo que la función realmente devuelve en runtime (ver
    // comentario arriba) — se usa solo para poder omitir passwordHash de
    // forma tipada, no para leer ningún dato adicional.
    const usuarios = (await listarUsuarios(db)) as unknown as UsuarioConCredenciales[];
    res.json(usuarios.map(({ passwordHash: _passwordHash, ...resto }) => resto));
  });

  router.get("/roles", async (_req, res) => {
    res.json(await listarRoles(db));
  });

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaUsuarioCrear.parse(req.body);
      const password = esquemaPassword.parse(req.body.password);

      if (await obtenerUsuarioPorNombre(db, validado.nombreUsuario)) {
        throw new DenszError("Ya existe un usuario con ese nombre.");
      }

      const hash = bcrypt.hashSync(password, 10);
      // La columna nombre_completo sigue existiendo (NOT NULL) pero ya no
      // se le pide a nadie — se completa con el propio nombreUsuario,
      // igual que usuarios.ipc.ts (§Cambio 1, sin tocar el esquema).
      const id = await crearUsuario(db, { ...validado, nombreCompleto: validado.nombreUsuario }, hash);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "usuarios",
        entidadId: id,
        detalle: { nombreUsuario: validado.nombreUsuario }
      });
      res.status(201).json(id);
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const validado = esquemaUsuario.parse(req.body);
      await actualizarUsuario(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "usuarios",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.patch("/:id/password", async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const nuevaPassword = esquemaPassword.parse(req.body.nuevaPassword);
      await cambiarPassword(db, id, bcrypt.hashSync(nuevaPassword, 10));
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "cambiar_password",
        entidad: "usuarios",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.patch("/:id/activo", async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const activo = z.boolean().parse(req.body.activo);
      const { sesion } = req as unknown as RequestConSesion;
      if (!activo && id === sesion.usuarioId) {
        throw new DenszError("No podés desactivar tu propio usuario mientras tenés la sesión iniciada.");
      }
      await setActivoUsuario(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "usuarios",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  // Eliminación segura (Bloque 2 / Parte B): reutiliza eliminarUsuario tal
  // cual — bloquea con un error claro si el usuario tiene cualquier
  // historial (órdenes, pagos, comprobantes, resúmenes, auditoría), nunca
  // borra en cascada. Mismo bloqueo de "no podés eliminarte a vos mismo"
  // que usuarios.ipc.ts.
  router.delete("/:id", async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { sesion } = req as unknown as RequestConSesion;
      if (id === sesion.usuarioId) {
        throw new DenszError("No podés eliminar el usuario con el que estás conectado.");
      }
      await eliminarUsuario(db, id);
      await registrarAuditoria(db, { usuarioId: sesion.usuarioId, accion: "eliminar", entidad: "usuarios", entidadId: id });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  return router;
}
