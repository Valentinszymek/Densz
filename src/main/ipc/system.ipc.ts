import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersSistema(): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PING, () => apiClient.ping());
  ipcMain.handle(IPC_CHANNELS.SYSTEM_STATUS, () => apiClient.obtenerEstadoSistema());
}
