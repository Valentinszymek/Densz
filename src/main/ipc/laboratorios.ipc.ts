import { ipcMain } from "electron";
import type { Pool } from "pg";
import { listarTodosLosLaboratorios } from "../db/repositories/laboratoriosRepo";
import { getSesionActual } from "../services/sessionService";
import { DenszError, traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

/** Panel privado del dueño de Densz — ver laboratorios.route.ts (web) para
 * el mismo chequeo del lado del servidor. Acá no hay RLS que lo filtre
 * (`laboratorios` no tiene), así que `superAdmin` es la única barrera. */
export function registrarHandlersLaboratorios(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.LABORATORIOS_LISTAR, async () => {
    try {
      if (!getSesionActual()?.superAdmin) {
        throw new DenszError("No tenés acceso a esta sección.");
      }
      return await listarTodosLosLaboratorios(db);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
