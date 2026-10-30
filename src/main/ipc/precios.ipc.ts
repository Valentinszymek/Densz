import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersPrecios(): void {
  // Categorías
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_LISTAR, (_e, soloActivas?: boolean) => apiClient.categoriasListar(soloActivas));
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_CREAR, (_e, nombre: string) => apiClient.categoriasCrear(nombre));
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_ACTUALIZAR, (_e, id: number, nombre: string) => apiClient.categoriasActualizar(id, nombre));
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_SET_ACTIVA, (_e, id: number, activo: boolean) => apiClient.categoriasSetActiva(id, activo));
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_MOVER, (_e, id: number, direccion: "arriba" | "abajo") =>
    apiClient.categoriasMover(id, direccion)
  );
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_USO, (_e, id: number) => apiClient.categoriasUso(id));
  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_ELIMINAR, (_e, id: number) => apiClient.categoriasEliminar(id));

  // Prestaciones (catálogo — el precio vive en listasPrecio.ipc.ts)
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_LISTAR, (_e, filtro) => apiClient.prestacionesListar(filtro));
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_OBTENER, (_e, id: number) => apiClient.prestacionesObtener(id));
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_CREAR, (_e, data) => apiClient.prestacionesCrear(data));
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_ACTUALIZAR, (_e, id: number, data) => apiClient.prestacionesActualizar(id, data));
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_SET_ACTIVA, (_e, id: number, activo: boolean) =>
    apiClient.prestacionesSetActiva(id, activo)
  );
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_USO, (_e, id: number) => apiClient.prestacionesUso(id));
  ipcMain.handle(IPC_CHANNELS.PRESTACIONES_ELIMINAR, (_e, id: number) => apiClient.prestacionesEliminar(id));
}
