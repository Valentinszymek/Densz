import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import {
  obtenerEstadoProteccion,
  verificarPasswordProteccion,
  bloquearProteccion,
  activarProteccion,
  desactivarProteccion,
  cambiarPasswordProteccion,
  generarNuevoCodigoRecuperacion,
  verificarCodigoRecuperacion,
  restablecerPasswordConCodigo
} from "../services/proteccionService";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaPassword = z.string().min(1);

export function registrarHandlersProteccion(db: Pool): void {
  // Consulta de estado, desbloqueo y bloqueo: disponibles para cualquier
  // usuario con sesión iniciada (Administrador o Recepción) — es un
  // candado compartido para VER, no una función administrativa.
  ipcMain.handle(IPC_CHANNELS.PROTECCION_ESTADO, () => obtenerEstadoProteccion(db));

  ipcMain.handle(IPC_CHANNELS.PROTECCION_DESBLOQUEAR, async (_e, password: string) => {
    try {
      return await verificarPasswordProteccion(db, esquemaPassword.parse(password));
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  // Lo llama el frontend cada vez que se sale de Cuentas/Estadísticas
  // (navegación afuera, cambio entre las dos, "Atrás", o recarga) — la
  // autorización nunca debe sobrevivir a eso (§ regla fundamental).
  ipcMain.handle(IPC_CHANNELS.PROTECCION_BLOQUEAR, () => {
    bloquearProteccion();
  });

  // Administrar la protección en sí (activar/desactivar/cambiar/recuperar)
  // queda restringido al Administrador (§16) — mismo permiso que el resto
  // de Configuración.
  ipcMain.handle(IPC_CHANNELS.PROTECCION_ACTIVAR, async (_e, data) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const esquema = z.object({ password: esquemaPassword, confirmarPassword: esquemaPassword });
      const validado = esquema.parse(data);
      return await activarProteccion(db, { ...validado, usuarioId: getUsuarioActualId() });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROTECCION_DESACTIVAR, async (_e, passwordActual: string) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      await desactivarProteccion(db, { passwordActual: esquemaPassword.parse(passwordActual), usuarioId: getUsuarioActualId() });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROTECCION_CAMBIAR_PASSWORD, async (_e, data) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const esquema = z.object({
        passwordActual: esquemaPassword,
        passwordNueva: esquemaPassword,
        confirmarNueva: esquemaPassword
      });
      const validado = esquema.parse(data);
      await cambiarPasswordProteccion(db, { ...validado, usuarioId: getUsuarioActualId() });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROTECCION_GENERAR_CODIGO, async () => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      return await generarNuevoCodigoRecuperacion(db, { usuarioId: getUsuarioActualId() });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  // Verificar/restablecer con el código de recuperación son, en el fondo,
  // también una forma de "cambiar" la protección — quedan igual de
  // restringidas al Administrador (§16), aunque se invoquen desde la
  // pantalla de acceso y no desde Configuración.
  ipcMain.handle(IPC_CHANNELS.PROTECCION_VERIFICAR_CODIGO, async (_e, codigo: string) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      return await verificarCodigoRecuperacion(db, esquemaPassword.parse(codigo));
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROTECCION_RESTABLECER_CON_CODIGO, async (_e, data) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const esquema = z.object({ codigo: esquemaPassword, passwordNueva: esquemaPassword, confirmarNueva: esquemaPassword });
      const validado = esquema.parse(data);
      return await restablecerPasswordConCodigo(db, { ...validado, usuarioId: getUsuarioActualId() });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
