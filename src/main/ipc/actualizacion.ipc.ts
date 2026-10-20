import { ipcMain } from "electron";
import { reiniciarParaActualizar } from "../services/autoUpdaterService";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersActualizacion(): void {
  ipcMain.handle(IPC_CHANNELS.ACTUALIZACION_REINICIAR, () => {
    reiniciarParaActualizar();
  });
}
