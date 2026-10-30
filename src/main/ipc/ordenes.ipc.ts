import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersOrdenes(): void {
  ipcMain.handle(IPC_CHANNELS.ORDENES_LISTAR, (_e, filtro) => apiClient.ordenesListar(filtro));
  ipcMain.handle(IPC_CHANNELS.ORDENES_OBTENER, (_e, id: number) => apiClient.ordenesObtener(id));
  ipcMain.handle(IPC_CHANNELS.ORDENES_CREAR, (_e, data) => apiClient.ordenesCrear(data));
  // El backend (PUT /trabajos/:id) ya regenera el PDF del comprobante si la
  // OT editada tenía uno — mismo comportamiento de siempre, ahora del lado
  // del servidor (ver trabajos.route.ts), nada que replicar acá.
  ipcMain.handle(IPC_CHANNELS.ORDENES_EDITAR, (_e, id: number, data) => apiClient.ordenesEditar(id, data));
  ipcMain.handle(IPC_CHANNELS.ORDENES_ANULAR, (_e, id: number, motivo: string) => apiClient.ordenesAnular(id, motivo));
  ipcMain.handle(IPC_CHANNELS.ORDENES_ELIMINAR, (_e, id: number, motivo: string) => apiClient.ordenesEliminar(id, motivo));
  ipcMain.handle(IPC_CHANNELS.ORDENES_EDITAR_FECHA, (_e, id: number, fechaTrabajo: string) =>
    apiClient.ordenesEditarFecha(id, fechaTrabajo)
  );
}
