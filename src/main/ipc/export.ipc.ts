import { ipcMain, dialog, shell } from "electron";
import type { Pool } from "pg";
import { exportarDatos, type TipoExport, type FormatoExport } from "../services/exportService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { RangoFechas, FiltroAuditoriaDto } from "../../shared/types/entities";

const FILTROS: Record<FormatoExport, Electron.FileFilter> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  pdf: { name: "PDF", extensions: ["pdf"] }
};

export function registrarHandlersExport(db: Pool): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_GENERAR,
    async (
      _e,
      tipo: TipoExport,
      formato: FormatoExport,
      nombreSugerido: string,
      opciones: { odontologoId?: number; clinicaId?: number; rango?: RangoFechas; filtroAuditoria?: FiltroAuditoriaDto }
    ) => {
      try {
        // Auditoría es la única exportación que necesita su propio
        // permiso: es información sensible restringida a ADMINISTRADOR
        // (§10) — el resto de los tipos ya se comportaba así antes de
        // esta tarea y no se toca.
        if (tipo === "auditoria") requerirPermiso(PERMISOS.AUDITORIA_VER);

        const resultado = await dialog.showSaveDialog({
          title: "Exportar",
          defaultPath: `${nombreSugerido}.${formato}`,
          filters: [FILTROS[formato]]
        });
        if (resultado.canceled || !resultado.filePath) return null;

        await exportarDatos(db, tipo, formato, resultado.filePath, opciones);

        await registrarAuditoria(db, {
          usuarioId: getUsuarioActualId(),
          accion: "exportar",
          entidad: tipo,
          detalle: { formato, ruta: resultado.filePath }
        });

        shell.showItemInFolder(resultado.filePath);
        return resultado.filePath;
      } catch (err) {
        throw traducirErrorPostgres(err);
      }
    }
  );
}
