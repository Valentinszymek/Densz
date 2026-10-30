import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersPacientes(): void {
  ipcMain.handle(IPC_CHANNELS.PACIENTES_LISTAR, (_e, filtro) => apiClient.pacientesListar(filtro));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_OBTENER, (_e, id: number) => apiClient.pacientesObtener(id));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_CREAR, (_e, data) => apiClient.pacientesCrear(data));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_ACTUALIZAR, (_e, id: number, data) => apiClient.pacientesActualizar(id, data));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_SET_ACTIVO, (_e, id: number, activo: boolean) => apiClient.pacientesSetActivo(id, activo));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_CANTIDAD_TRABAJOS, (_e, id: number) => apiClient.pacientesCantidadTrabajos(id));
  ipcMain.handle(IPC_CHANNELS.PACIENTES_ELIMINAR, (_e, id: number) => apiClient.pacientesEliminar(id));
}
