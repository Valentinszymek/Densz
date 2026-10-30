import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersBusqueda(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_GLOBAL, (_e, texto: string) => apiClient.buscarGlobal(texto));
}
