import { ipcMain } from "electron";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarPassword,
  setActivoUsuario,
  eliminarUsuario,
  listarRoles,
  obtenerUsuarioPorNombre
} from "../db/repositories/usuariosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { traducirErrorPostgres, DenszError } from "../utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const NOMBRE_USUARIO = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .regex(/^[a-z0-9._-]+$/i, "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos.");

// Usado para crear: ya no pide nombre completo (§Cambio 1) — la columna
// nombre_completo de la base sigue existiendo (NOT NULL) pero se completa
// sola con el propio nombreUsuario, sin pedírselo a nadie ni tocar el
// esquema de la base.
const esquemaUsuarioCrear = z.object({
  nombreUsuario: NOMBRE_USUARIO,
  rolId: z.number().int().positive()
});

// Usado para actualizar: sigue aceptando nombreCompleto porque
// actualizarUsuario() y la columna no cambiaron — UsuarioDetalle ahora
// simplemente reenvía el valor existente sin ofrecer editarlo.
const esquemaUsuario = z.object({
  nombreUsuario: NOMBRE_USUARIO,
  nombreCompleto: z.string().trim().min(1, "Falta el nombre completo."),
  rolId: z.number().int().positive()
});

const esquemaPassword = z.string().min(6, "La contraseña debe tener al menos 6 caracteres.");

export function registrarHandlersUsuarios(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.USUARIOS_LISTAR, () => {
    requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
    return listarUsuarios(db);
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_LISTAR_ROLES, () => {
    requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
    return listarRoles(db);
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_CREAR, async (_e, data, password: string) => {
    try {
      requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
      const validado = esquemaUsuarioCrear.parse(data);
      const passwordValidada = esquemaPassword.parse(password);

      if (await obtenerUsuarioPorNombre(db, validado.nombreUsuario)) {
        throw new DenszError("Ya existe un usuario con ese nombre.");
      }

      const hash = bcrypt.hashSync(passwordValidada, 10);
      const id = await crearUsuario(db, { ...validado, nombreCompleto: validado.nombreUsuario }, hash);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "usuarios",
        entidadId: id,
        detalle: { nombreUsuario: validado.nombreUsuario }
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_ACTUALIZAR, async (_e, id: number, data) => {
    try {
      requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
      const validado = esquemaUsuario.parse(data);
      await actualizarUsuario(db, id, validado);
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "modificar", entidad: "usuarios", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_CAMBIAR_PASSWORD, async (_e, id: number, nuevaPassword: string) => {
    try {
      requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
      const passwordValidada = esquemaPassword.parse(nuevaPassword);
      await cambiarPassword(db, id, bcrypt.hashSync(passwordValidada, 10));
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "cambiar_password", entidad: "usuarios", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_SET_ACTIVO, async (_e, id: number, activo: boolean) => {
    try {
      requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
      if (!activo && id === getUsuarioActualId()) {
        throw new DenszError("No podés desactivar tu propio usuario mientras tenés la sesión iniciada.");
      }
      await setActivoUsuario(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "usuarios",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.USUARIOS_ELIMINAR, async (_e, id: number) => {
    try {
      requerirPermiso(PERMISOS.USUARIOS_GESTIONAR);
      if (id === getUsuarioActualId()) {
        throw new DenszError("No podés eliminar el usuario con el que estás conectado.");
      }
      // eliminarUsuario() ya bloquea (con DenszError) si el usuario tiene
      // cualquier historial asociado — nunca borra en cascada ni rompe
      // referencias (ver usuariosRepo.ts).
      await eliminarUsuario(db, id);
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "eliminar", entidad: "usuarios", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
