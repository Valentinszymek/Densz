import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersOdontologos(): void {
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_LISTAR, (_e, filtro) => apiClient.odontologosListar(filtro));
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_OBTENER, (_e, id: number) => apiClient.odontologosObtener(id));
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ESTADISTICAS, (_e, id: number) => apiClient.odontologosEstadisticas(id));
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ULTIMA_ACTIVIDAD, () => apiClient.odontologosUltimaActividad());
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_CREAR, (_e, data) => apiClient.odontologosCrear(data));
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ACTUALIZAR, (_e, id: number, data) => apiClient.odontologosActualizar(id, data));
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_LISTA, (_e, id: number, listaPrecioId: number) =>
    apiClient.odontologosAsignarLista(id, listaPrecioId)
  );
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_ASIGNAR_CLINICA, (_e, id: number, clinicaId: number | null) =>
    apiClient.odontologosAsignarClinica(id, clinicaId)
  );
  ipcMain.handle(IPC_CHANNELS.ODONTOLOGOS_SET_ACTIVO, (_e, id: number, activo: boolean) =>
    apiClient.odontologosSetActivo(id, activo)
  );
}
