import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersClinicas(): void {
  ipcMain.handle(IPC_CHANNELS.CLINICAS_LISTAR, (_e, filtro) => apiClient.clinicasListar(filtro));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_OBTENER, (_e, id: number) => apiClient.clinicasObtener(id));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_ESTADISTICAS, (_e, id: number) => apiClient.clinicasEstadisticas(id));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_CREAR, (_e, data) => apiClient.clinicasCrear(data));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_ACTUALIZAR, (_e, id: number, data) => apiClient.clinicasActualizar(id, data));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_SET_ACTIVA, (_e, id: number, activo: boolean) => apiClient.clinicasSetActiva(id, activo));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_USO, (_e, id: number) => apiClient.clinicasUso(id));
  ipcMain.handle(IPC_CHANNELS.CLINICAS_ELIMINAR, (_e, id: number) => apiClient.clinicasEliminar(id));
}
