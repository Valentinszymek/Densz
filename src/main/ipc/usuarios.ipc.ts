import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { DatosUsuarioCrearDto, DatosUsuarioDto } from "../../shared/types/ipc-contracts";

export function registrarHandlersUsuarios(): void {
  ipcMain.handle(IPC_CHANNELS.USUARIOS_LISTAR, () => apiClient.usuariosListar());
  ipcMain.handle(IPC_CHANNELS.USUARIOS_LISTAR_ROLES, () => apiClient.usuariosListarRoles());
  ipcMain.handle(IPC_CHANNELS.USUARIOS_CREAR, (_e, data: DatosUsuarioCrearDto, password: string) => apiClient.usuariosCrear(data, password));
  ipcMain.handle(IPC_CHANNELS.USUARIOS_ACTUALIZAR, (_e, id: number, data: DatosUsuarioDto) => apiClient.usuariosActualizar(id, data));
  ipcMain.handle(IPC_CHANNELS.USUARIOS_CAMBIAR_PASSWORD, (_e, id: number, nuevaPassword: string) =>
    apiClient.usuariosCambiarPassword(id, nuevaPassword)
  );
  ipcMain.handle(IPC_CHANNELS.USUARIOS_SET_ACTIVO, (_e, id: number, activo: boolean) => apiClient.usuariosSetActivo(id, activo));
  ipcMain.handle(IPC_CHANNELS.USUARIOS_ELIMINAR, (_e, id: number) => apiClient.usuariosEliminar(id));
}
