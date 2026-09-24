import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { login, logout } from "../services/authService";
import { getSesionActual } from "../services/sessionService";
import { listarUsuariosActivosParaSeleccion } from "../db/repositories/usuariosRepo";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña.")
});

export function registrarHandlersAuth(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, data) => {
    try {
      const validado = esquemaLogin.parse(data);
      return await login(db, validado.nombreUsuario, validado.password);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    const sesion = getSesionActual();
    if (sesion) await logout(db, sesion.usuarioId);
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_SESION_ACTUAL, () => getSesionActual());

  // Sin requerirPermiso a propósito: se llama ANTES de autenticarse, para
  // poblar el selector "¿Quién va a utilizar Densz?" — por eso el
  // repositorio solo devuelve id/usuario/nombre/rol de usuarios activos,
  // nunca nada sensible (ver UsuarioParaSeleccion).
  ipcMain.handle(IPC_CHANNELS.AUTH_USUARIOS_DISPONIBLES, () => listarUsuariosActivosParaSeleccion(db));
}
