import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

// Panel privado del dueño de Densz — el backend (laboratorios.route.ts)
// ya rechaza con 403 a cualquiera que no sea superAdmin, mismo chequeo que
// antes se hacía acá a mano contra la sesión local.
export function registrarHandlersLaboratorios(): void {
  ipcMain.handle(IPC_CHANNELS.LABORATORIOS_LISTAR, () => apiClient.laboratoriosListar());
}
