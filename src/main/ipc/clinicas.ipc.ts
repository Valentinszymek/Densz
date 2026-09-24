import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarClinicas,
  obtenerClinica,
  crearClinica,
  actualizarClinica,
  setActivaClinica,
  obtenerEstadisticasClinica,
  contarUsoClinica,
  eliminarClinica
} from "../db/repositories/clinicasRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaDatos = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio."),
  telefono: z.string().trim().max(50).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional()
});

const esquemaFiltro = z
  .object({
    soloActivas: z.boolean().optional(),
    busqueda: z.string().optional()
  })
  .optional();

export function registrarHandlersClinicas(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.CLINICAS_LISTAR, (_e, filtro) => listarClinicas(db, esquemaFiltro.parse(filtro) ?? {}));

  ipcMain.handle(IPC_CHANNELS.CLINICAS_OBTENER, (_e, id: number) => obtenerClinica(db, id));

  ipcMain.handle(IPC_CHANNELS.CLINICAS_ESTADISTICAS, (_e, id: number) => obtenerEstadisticasClinica(db, id));

  ipcMain.handle(IPC_CHANNELS.CLINICAS_CREAR, async (_e, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      const id = await crearClinica(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "clinicas",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLINICAS_ACTUALIZAR, async (_e, id: number, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      await actualizarClinica(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "modificar",
        entidad: "clinicas",
        entidadId: id,
        detalle: { nombre: validado.nombre }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLINICAS_SET_ACTIVA, async (_e, id: number, activo: boolean) => {
    try {
      // Desactivar no borra nada: los profesionales y OTs de la clínica
      // quedan intactos, solo deja de aparecer en listados activos (§26).
      await setActivaClinica(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "clinicas",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLINICAS_USO, (_e, id: number) => contarUsoClinica(db, id));

  ipcMain.handle(IPC_CHANNELS.CLINICAS_ELIMINAR, async (_e, id: number) => {
    try {
      const uso = await contarUsoClinica(db, id);
      const clinica = await obtenerClinica(db, id);
      await eliminarClinica(db, id);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "eliminar",
        entidad: "clinicas",
        entidadId: id,
        detalle: { nombre: clinica?.nombre, ...uso }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
