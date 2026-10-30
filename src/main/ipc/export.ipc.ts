import { ipcMain, dialog, shell } from "electron";
import fs from "node:fs";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { RangoFechas, FiltroAuditoriaDto } from "../../shared/types/entities";

const FILTROS: Record<"csv" | "xlsx" | "pdf", Electron.FileFilter> = {
  csv: { name: "CSV", extensions: ["csv"] },
  xlsx: { name: "Excel", extensions: ["xlsx"] },
  pdf: { name: "PDF", extensions: ["pdf"] }
};

// El backend (POST /export) ya hace todo lo que antes vivía acá contra
// Postgres directo: el permiso especial de Auditoría y la auditoría de la
// exportación en sí (ver export.route.ts). Lo único que sigue siendo
// genuinamente del escritorio es el diálogo nativo de "Guardar como" —
// elegido ANTES de pedir el archivo, igual que siempre, así nunca se
// descarga nada si la persona cancela.
export function registrarHandlersExport(): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_GENERAR,
    async (
      _e,
      tipo: "odontologos" | "clinicas" | "pacientes" | "trabajos" | "cuenta" | "pagos" | "estadisticas" | "auditoria",
      formato: "csv" | "xlsx" | "pdf",
      nombreSugerido: string,
      opciones?: { odontologoId?: number; clinicaId?: number; rango?: RangoFechas; filtroAuditoria?: FiltroAuditoriaDto }
    ) => {
      const resultado = await dialog.showSaveDialog({
        title: "Exportar",
        defaultPath: `${nombreSugerido}.${formato}`,
        filters: [FILTROS[formato]]
      });
      if (resultado.canceled || !resultado.filePath) return null;

      const { buffer } = await apiClient.postBuffer("/export", { tipo, formato, nombreSugerido, opciones });
      fs.writeFileSync(resultado.filePath, buffer);

      shell.showItemInFolder(resultado.filePath);
      return resultado.filePath;
    }
  );
}
