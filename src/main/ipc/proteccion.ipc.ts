import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type {
  DatosActivarProteccionDto,
  DatosCambiarPasswordProteccionDto,
  DatosRestablecerProteccionDto
} from "../../shared/types/ipc-contracts";

// El desbloqueo/bloqueo de Cuentas/Estadísticas ahora vive del lado del
// backend, por sesión HTTP (desbloqueosProteccion en session.ts) — igual
// que ya funcionaba para la web, en vez de la variable en memoria del
// proceso local (proteccionService.ts, que sigue existiendo pero solo
// para el servidor/tests, nunca para el escritorio de acá en más).
export function registrarHandlersProteccion(): void {
  ipcMain.handle(IPC_CHANNELS.PROTECCION_ESTADO, () => apiClient.proteccionEstado());
  ipcMain.handle(IPC_CHANNELS.PROTECCION_DESBLOQUEAR, (_e, password: string) => apiClient.proteccionDesbloquear(password));
  ipcMain.handle(IPC_CHANNELS.PROTECCION_BLOQUEAR, () => apiClient.proteccionBloquear());
  ipcMain.handle(IPC_CHANNELS.PROTECCION_ACTIVAR, (_e, data: DatosActivarProteccionDto) => apiClient.proteccionActivar(data));
  ipcMain.handle(IPC_CHANNELS.PROTECCION_DESACTIVAR, (_e, passwordActual: string) => apiClient.proteccionDesactivar(passwordActual));
  ipcMain.handle(IPC_CHANNELS.PROTECCION_CAMBIAR_PASSWORD, (_e, data: DatosCambiarPasswordProteccionDto) =>
    apiClient.proteccionCambiarPassword(data)
  );
  ipcMain.handle(IPC_CHANNELS.PROTECCION_GENERAR_CODIGO, () => apiClient.proteccionGenerarCodigo());
  ipcMain.handle(IPC_CHANNELS.PROTECCION_VERIFICAR_CODIGO, (_e, codigo: string) => apiClient.proteccionVerificarCodigo(codigo));
  ipcMain.handle(IPC_CHANNELS.PROTECCION_RESTABLECER_CON_CODIGO, (_e, data: DatosRestablecerProteccionDto) =>
    apiClient.proteccionRestablecerConCodigo(data)
  );
}
