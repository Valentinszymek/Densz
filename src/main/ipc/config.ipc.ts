import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersConfig(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_LABORATORIO_OBTENER, () => apiClient.configLaboratorioObtener());
  ipcMain.handle(IPC_CHANNELS.CONFIG_LABORATORIO_GUARDAR, (_e, nombre: string) => apiClient.configLaboratorioGuardar(nombre));
  ipcMain.handle(IPC_CHANNELS.CONFIG_TAMANO_IMPRESION_OBTENER, () => apiClient.configTamanoImpresionObtener());
  ipcMain.handle(IPC_CHANNELS.CONFIG_TAMANO_IMPRESION_GUARDAR, (_e, valor: "ticket" | "a4") =>
    apiClient.configTamanoImpresionGuardar(valor)
  );
}
