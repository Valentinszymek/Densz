import { ipcMain } from "electron";
import type { Pool } from "pg";
import { listarAuditoriaFiltrada, obtenerOpcionesFiltroAuditoria } from "../db/repositories/auditoriaRepo";
import { requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { FiltroAuditoriaDto } from "../../shared/types/entities";

export function registrarHandlersAuditoria(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.AUDITORIA_LISTAR, (_e, filtro?: FiltroAuditoriaDto) => {
    requerirPermiso(PERMISOS.AUDITORIA_VER);
    return listarAuditoriaFiltrada(db, filtro ?? {});
  });

  ipcMain.handle(IPC_CHANNELS.AUDITORIA_OPCIONES_FILTRO, () => {
    requerirPermiso(PERMISOS.AUDITORIA_VER);
    return obtenerOpcionesFiltroAuditoria(db);
  });
}
