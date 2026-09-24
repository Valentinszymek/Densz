import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import * as repo from "../db/repositories/listasPrecioRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaLista = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  moneda: z.enum(["ARS", "USD"])
});

const esquemaPrecio = z.number().int().nonnegative("El precio no puede ser negativo.");

export function registrarHandlersListasPrecio(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_LISTAR, (_e, soloActivas?: boolean) => repo.listarListas(db, soloActivas));

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_OBTENER, (_e, id: number) => repo.obtenerLista(db, id));

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_CREAR, async (_e, data) => {
    try {
      const validado = esquemaLista.parse(data);
      const id = await repo.crearLista(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "listas_precio",
        entidadId: id,
        detalle: validado
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ACTUALIZAR, async (_e, id: number, nombre: string) => {
    try {
      await repo.actualizarLista(db, id, { nombre: z.string().trim().min(1).parse(nombre) });
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "modificar", entidad: "listas_precio", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_SET_ACTIVA, async (_e, id: number, activo: boolean) => {
    try {
      await repo.setActivaLista(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "listas_precio",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ITEMS, (_e, listaId: number, soloActivas?: boolean) =>
    repo.listarPrestacionesDeLista(db, listaId, soloActivas ?? false)
  );

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_HISTORIAL_ITEM, (_e, listaId: number, prestacionId: number) =>
    repo.historialPrecioEnLista(db, listaId, prestacionId)
  );

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_CAMBIAR_PRECIO, async (_e, listaId: number, prestacionId: number, nuevoPrecioCentavos: number) => {
    try {
      const precio = esquemaPrecio.parse(nuevoPrecioCentavos);
      await repo.cambiarPrecioEnLista(db, listaId, prestacionId, precio);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "cambiar_precio",
        entidad: "lista_precio_items",
        entidadId: prestacionId,
        detalle: { listaId, nuevoPrecioCentavos: precio }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_USO, (_e, id: number) => repo.contarUsoLista(db, id));

  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ELIMINAR, async (_e, id: number) => {
    try {
      const uso = await repo.contarUsoLista(db, id);
      const lista = await repo.obtenerLista(db, id);
      await repo.eliminarLista(db, id);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "eliminar",
        entidad: "listas_precio",
        entidadId: id,
        detalle: { nombre: lista?.nombre, ...uso }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
