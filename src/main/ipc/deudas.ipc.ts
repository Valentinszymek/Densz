import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersDeudas(): void {
  ipcMain.handle(IPC_CHANNELS.DEUDAS_REGISTRAR, (_e, data) => apiClient.deudasRegistrar(data));
  ipcMain.handle(IPC_CHANNELS.DEUDAS_EDITAR, (_e, id: number, data) => apiClient.deudasEditar(id, data));
  ipcMain.handle(IPC_CHANNELS.DEUDAS_ANULAR, (_e, id: number, motivo: string) => apiClient.deudasAnular(id, motivo));
}
