import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersListasPrecio(): void {
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_LISTAR, (_e, soloActivas?: boolean) => apiClient.listasPrecioListar(soloActivas));
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_OBTENER, (_e, id: number) => apiClient.listasPrecioObtener(id));
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_CREAR, (_e, data) => apiClient.listasPrecioCrear(data));
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ACTUALIZAR, (_e, id: number, nombre: string) => apiClient.listasPrecioActualizar(id, nombre));
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_SET_ACTIVA, (_e, id: number, activo: boolean) =>
    apiClient.listasPrecioSetActiva(id, activo)
  );
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ITEMS, (_e, listaId: number, soloActivas?: boolean) =>
    apiClient.listasPrecioItems(listaId, soloActivas)
  );
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_HISTORIAL_ITEM, (_e, listaId: number, prestacionId: number) =>
    apiClient.listasPrecioHistorialItem(listaId, prestacionId)
  );
  ipcMain.handle(
    IPC_CHANNELS.LISTAS_PRECIO_CAMBIAR_PRECIO,
    (_e, listaId: number, prestacionId: number, nuevoPrecioCentavos: number) =>
      apiClient.listasPrecioCambiarPrecio(listaId, prestacionId, nuevoPrecioCentavos)
  );
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_USO, (_e, id: number) => apiClient.listasPrecioUso(id));
  ipcMain.handle(IPC_CHANNELS.LISTAS_PRECIO_ELIMINAR, (_e, id: number) => apiClient.listasPrecioEliminar(id));
}
