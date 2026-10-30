import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { FiltroAuditoriaDto } from "../../shared/types/entities";

export function registrarHandlersAuditoria(): void {
  ipcMain.handle(IPC_CHANNELS.AUDITORIA_LISTAR, (_e, filtro?: FiltroAuditoriaDto) => apiClient.auditoriaListar(filtro));
  ipcMain.handle(IPC_CHANNELS.AUDITORIA_OPCIONES_FILTRO, () => apiClient.auditoriaOpcionesFiltro());
}
