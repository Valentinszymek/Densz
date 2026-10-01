import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import * as repo from "../db/repositories/preciosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

// Los canales de LECTURA (listar/obtener/uso) quedan abiertos a propósito:
// Nuevo Trabajo los necesita para armar una OT (elegir prestación) sin
// importar el rol — no exponen precios ni datos sensibles, solo el
// catálogo. Los de escritura (crear/editar/activar/mover/eliminar) sí
// requieren PRECIOS_EDITAR, que RECEPCION no tiene.

const esquemaPrestacion = z.object({
  categoriaId: z.number().int().positive("Seleccioná una categoría."),
  nombre: z.string().trim().min(1, "El nombre es obligatorio.")
});

export function registrarHandlersPrecios(db: Pool): void {
  // Categorías
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_LISTAR, (_e, soloActivas?: boolean) =>
    repo.listarCategorias(db, soloActivas)
  );

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_CREAR, async (_e, nombre: string) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      const validado = z.string().trim().min(1, "El nombre es obligatorio.").parse(nombre);
      const id = await repo.crearCategoria(db, validado);
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "crear", entidad: "categorias_precio", entidadId: id });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_ACTUALIZAR, async (_e, id: number, nombre: string) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      await repo.actualizarCategoria(db, id, z.string().trim().min(1).parse(nombre));
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "modificar", entidad: "categorias_precio", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_SET_ACTIVA, async (_e, id: number, activo: boolean) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      await repo.setActivaCategoria(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "categorias_precio",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_MOVER, async (_e, id: number, direccion: "arriba" | "abajo") => {
    requerirPermiso(PERMISOS.PRECIOS_EDITAR);
    const resultado = await repo.moverCategoria(db, id, direccion);
    // Solo audita si de verdad se movió algo (resultado === null cuando ya
    // estaba en el extremo) — corrección post-auditoría (§26/§30-D).
    if (resultado) {
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "modificar",
        entidad: "categorias_precio",
        entidadId: id,
        detalle: { direccion, ...resultado }
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_USO, (_e, id: number) => repo.contarUsoCategoria(db, id));

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_ELIMINAR, async (_e, id: number) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      const uso = await repo.contarUsoCategoria(db, id);
      await repo.eliminarCategoria(db, id);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "eliminar",
        entidad: "categorias_precio",
        entidadId: id,
        detalle: { ...uso }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  // Prestaciones (catálogo — el precio vive en listasPrecio.ipc.ts)
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_LISTAR, (_e, filtro) => repo.listarPrestaciones(db, filtro ?? {}));

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_OBTENER, (_e, id: number) => repo.obtenerPrestacion(db, id));

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_CREAR, async (_e, data) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      const validado = esquemaPrestacion.parse(data);
      const id = await repo.crearPrestacion(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "prestaciones",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_ACTUALIZAR, async (_e, id: number, data) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      const validado = esquemaPrestacion.parse(data);
      await repo.actualizarPrestacion(db, id, validado);
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "modificar", entidad: "prestaciones", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_SET_ACTIVA, async (_e, id: number, activo: boolean) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      await repo.setActivaPrestacion(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "prestaciones",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_USO, (_e, id: number) => repo.contarUsoPrestacion(db, id));

  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_ELIMINAR, async (_e, id: number) => {
    try {
      requerirPermiso(PERMISOS.PRECIOS_EDITAR);
      const uso = await repo.contarUsoPrestacion(db, id);
      const prestacion = await repo.obtenerPrestacion(db, id);
      await repo.eliminarPrestacion(db, id);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "eliminar",
        entidad: "prestaciones",
        entidadId: id,
        detalle: { nombre: prestacion?.nombre, ...uso }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
