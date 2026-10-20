import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { login, logout } from "../services/authService";
import { getSesionActual } from "../services/sessionService";
import { iniciarLoginGoogleEscritorio, iniciarRegistroLaboratorioEscritorio } from "../services/googleOAuthDesktop";
import { borrarSesionGuardada } from "../services/supabaseSessionStorage";
import { listarUsuariosActivosParaSeleccion } from "../db/repositories/usuariosRepo";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña.")
});

const esquemaRegistroLaboratorio = z.object({
  nombreLaboratorio: z.string().trim().min(1, "Ingresá el nombre de tu laboratorio.")
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

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN_GOOGLE, async () => {
    try {
      return await iniciarLoginGoogleEscritorio(db);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTRAR_LABORATORIO, async (_e, data) => {
    try {
      const { nombreLaboratorio } = esquemaRegistroLaboratorio.parse(data);
      return await iniciarRegistroLaboratorioEscritorio(db, nombreLaboratorio);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    const sesion = getSesionActual();
    if (sesion) await logout(db, sesion.usuarioId);
    // Por si la sesión era de Google: se borra el archivo guardado — si
    // no, el próximo arranque la restauraría sola sin pedir login de
    // nuevo, contradiciendo "cerrar sesión". No-op si no existe.
    borrarSesionGuardada();
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_SESION_ACTUAL, () => getSesionActual());

  // Sin requerirPermiso a propósito: se llama ANTES de autenticarse, para
  // poblar el selector "¿Quién va a utilizar Densz?" — por eso el
  // repositorio solo devuelve id/usuario/nombre/rol de usuarios activos,
  // nunca nada sensible (ver UsuarioParaSeleccion).
  ipcMain.handle(IPC_CHANNELS.AUTH_USUARIOS_DISPONIBLES, () => listarUsuariosActivosParaSeleccion(db));
}
