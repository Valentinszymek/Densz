import { ipcMain } from "electron";
import type { Pool } from "pg";
import { requerirPermiso } from "../services/sessionService";
import { DenszError } from "../utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import { logger } from "../utils/logger";

/**
 * El módulo de backups basado en copiar el archivo `.db` (VACUUM INTO,
 * USB, restauración local) no tiene equivalente contra una base
 * hosteada en Supabase — la continuidad y las copias de seguridad ahora
 * las gestiona Supabase del lado del servidor. Estos handlers quedan
 * como mensajes informativos en vez de eliminarse, para no romper el
 * contrato IPC existente con el renderer.
 */
const MENSAJE_NO_DISPONIBLE =
  "El backup local ya no aplica: Densz guarda todos los datos en Supabase. La continuidad de los datos depende del respaldo del proyecto de Supabase, no de un archivo local.";

export function registrarHandlersBackups(_db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.BACKUPS_LISTAR, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_CREAR, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    throw new DenszError(MENSAJE_NO_DISPONIBLE);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_VERIFICAR, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    throw new DenszError(MENSAJE_NO_DISPONIBLE);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_ELEGIR_ARCHIVO, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_RESTAURAR, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    throw new DenszError(MENSAJE_NO_DISPONIBLE);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_LISTAR_UNIDADES, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_UBICACION_DISPONIBLE, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_OBTENER_CONFIG, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    return { ubicacion: "", frecuenciaHoras: 24, cantidadConservar: 10, minimoConservar: 3 };
  });

  ipcMain.handle(IPC_CHANNELS.BACKUPS_GUARDAR_CONFIG, () => {
    requerirPermiso(PERMISOS.BACKUPS_GESTIONAR);
    throw new DenszError(MENSAJE_NO_DISPONIBLE);
  });

  logger.info("Handlers de backups registrados (modo informativo — datos migrados a Supabase).");
}
