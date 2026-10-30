import { ipcMain } from "electron";
import { z } from "zod";
import { apiClient, getTokenActual } from "../services/apiClient";
import { getSesionActual, setSesionConToken, limpiarSesion } from "../services/sessionService";
import { iniciarLoginGoogleEscritorio, iniciarRegistroLaboratorioEscritorio } from "../services/googleOAuthDesktop";
import { borrarSesionGuardada } from "../services/supabaseSessionStorage";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña.")
});

const esquemaRegistroLaboratorio = z.object({
  nombreLaboratorio: z.string().trim().min(1, "Ingresá el nombre de tu laboratorio.")
});

/**
 * Plan de seguridad del escritorio, Etapa 3: estos handlers ya no llaman a
 * ningún servicio con una conexión local a Postgres — hablan por HTTP con
 * Railway a través de `apiClient` (mismos endpoints que ya usa la web). Los
 * errores que llegan acá ya son `ApiError`, con un mensaje claro armado por
 * el backend — `traducirErrorPostgres` ya no hace falta para esos casos
 * (no hay ningún código SQLSTATE que traducir del lado del cliente), solo
 * se mantiene para `esquemaLogin.parse` (validación local, antes de
 * siquiera pedir red).
 */
export function registrarHandlersAuth(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, data) => {
    let validado: z.infer<typeof esquemaLogin>;
    try {
      validado = esquemaLogin.parse(data);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
    const sesion = await apiClient.authLogin(validado.nombreUsuario, validado.password);
    setSesionConToken(sesion, getTokenActual()!);
    return sesion;
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN_GOOGLE, () => iniciarLoginGoogleEscritorio());

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTRAR_LABORATORIO, async (_e, data) => {
    let validado: z.infer<typeof esquemaRegistroLaboratorio>;
    try {
      validado = esquemaRegistroLaboratorio.parse(data);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
    return iniciarRegistroLaboratorioEscritorio(validado.nombreLaboratorio);
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    try {
      await apiClient.authLogout();
    } finally {
      limpiarSesion();
      // Por si la sesión era de Google: se borra el archivo guardado — si
      // no, el próximo arranque la restauraría sola sin pedir login de
      // nuevo, contradiciendo "cerrar sesión". No-op si no existe.
      // apiClient.authLogout() ya borró el token HTTP guardado por su lado.
      borrarSesionGuardada();
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_SESION_ACTUAL, () => getSesionActual());

  // Sin sesión a propósito: se llama ANTES de autenticarse, para poblar el
  // selector "¿Quién va a utilizar Densz?" — mismo endpoint sin
  // requireAuth que ya usa la web (GET /auth/usuarios-disponibles).
  ipcMain.handle(IPC_CHANNELS.AUTH_USUARIOS_DISPONIBLES, () => apiClient.authUsuariosDisponibles());
}
