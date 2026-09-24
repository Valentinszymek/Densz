import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarPacientes,
  obtenerPaciente,
  crearPaciente,
  actualizarPaciente,
  setActivoPaciente,
  contarTrabajosPaciente,
  eliminarOInactivarPaciente
} from "../db/repositories/pacientesRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaDatos = z.object({
  nombreCompleto: z.string().trim().min(2, "Ingresá el nombre y apellido del paciente."),
  odontologoId: z.number().int().positive("Seleccioná un odontólogo.")
});

const esquemaFiltro = z
  .object({
    odontologoId: z.number().int().positive().optional(),
    soloActivos: z.boolean().optional(),
    busqueda: z.string().optional(),
    orden: z.enum(["nombre_asc", "nombre_desc", "reciente", "antiguo"]).optional()
  })
  .optional();

export function registrarHandlersPacientes(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.PACIENTES_LISTAR, (_e, filtro) => {
    return listarPacientes(db, esquemaFiltro.parse(filtro) ?? {});
  });

  ipcMain.handle(IPC_CHANNELS.PACIENTES_OBTENER, (_e, id: number) => {
    return obtenerPaciente(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.PACIENTES_CREAR, async (_e, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      const id = await crearPaciente(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "crear",
        entidad: "pacientes",
        entidadId: id,
        detalle: { nombreCompleto: validado.nombreCompleto }
      });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PACIENTES_ACTUALIZAR, async (_e, id: number, data) => {
    try {
      const validado = esquemaDatos.parse(data);
      await actualizarPaciente(db, id, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "modificar",
        entidad: "pacientes",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PACIENTES_SET_ACTIVO, async (_e, id: number, activo: boolean) => {
    try {
      await setActivoPaciente(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: activo ? "activar" : "desactivar",
        entidad: "pacientes",
        entidadId: id
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PACIENTES_CANTIDAD_TRABAJOS, (_e, id: number) => contarTrabajosPaciente(db, id));

  ipcMain.handle(IPC_CHANNELS.PACIENTES_ELIMINAR, async (_e, id: number) => {
    try {
      const paciente = await obtenerPaciente(db, id);
      const resultado = await eliminarOInactivarPaciente(db, id);
      // "Eliminar paciente" es una única acción para quien la usa, pero la
      // auditoría deja constancia honesta de qué pasó realmente adentro:
      // borrado físico si no tenía historial, o inactivación si sí lo tenía
      // (nunca se pierde ni se rompe una OT/comprobante/pago histórico).
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "eliminar",
        entidad: "pacientes",
        entidadId: id,
        detalle: {
          nombre: paciente?.nombreCompleto,
          resultado: resultado.eliminadoFisicamente ? "eliminado_fisicamente" : "inactivado_por_historial",
          ...(resultado.eliminadoFisicamente ? {} : { cantidadTrabajos: resultado.cantidadTrabajos })
        }
      });
      return resultado;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
