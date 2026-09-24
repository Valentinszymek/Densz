import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarOdontologos,
  obtenerOdontologo,
  crearOdontologo,
  actualizarOdontologo,
  asignarListaPrecio,
  asignarClinica,
  setActivoOdontologo,
  obtenerEstadisticasOdontologo,
  obtenerUltimaActividadOdontologos
} from "../db/repositories/odontologosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaDatos = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  telefono: z.string().trim().max(50).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional(),
  listaPrecioId: z.number().int().positive("Asigná una lista de precios."),
  clinicaId: z.number().int().positive().nullable().optional()
});

const esquemaFiltro = z
  .object({
    soloActivos: z.boolean().optional(),
    busqueda: z.string().optional(),
    clinicaId: z.number().int().positive().nullable().optional()
  })
  .optional();

export function registrarHandlersOdontologos(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_LISTAR, (_e, filtro) => {
    return listarOdontologos(db, esquemaFiltro.parse(filtro) ?? {});
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_OBTENER, (_e, id: number) => {
    return obtenerOdontologo(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ESTADISTICAS, (_e, id: number) => {
    return obtenerEstadisticasOdontologo(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ULTIMA_ACTIVIDAD, () => {
    return obtenerUltimaActividadOdontologos(db);
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_CREAR, async (_e, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      const id = await crearOdontologo(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "odontologos",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ACTUALIZAR, async (_e, id: number, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      await actualizarOdontologo(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "modificar",
        entidad: "odontologos",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_LISTA, async (_e, id: number, listaPrecioId: number) => {
    try {
      await asignarListaPrecio(db, id, z.number().int().positive().parse(listaPrecioId));
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "asignar_lista",
        entidad: "odontologos",
        entidadId: id,
        detalle: { listaPrecioId }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_CLINICA, async (_e, id: number, clinicaId: number | null) => {
    try {
      await asignarClinica(db, id, clinicaId);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "asignar_clinica",
        entidad: "odontologos",
        entidadId: id,
        detalle: { clinicaId }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_SET_ACTIVO, async (_e, id: number, activo: boolean) => {
    try {
      // Desactivar (no eliminar físicamente) siempre está permitido: es el
      // mecanismo pensado para odontólogos con historial (§19). El
      // historial de sus OTs queda intacto.
      await setActivoOdontologo(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "odontologos",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
