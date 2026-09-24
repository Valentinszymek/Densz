import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import {
  listarImpresoras,
  obtenerImpresoraSeleccionada,
  seleccionarImpresora,
  imprimirPaginaDePrueba,
  imprimirPdf
} from "../services/impresoraService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersImpresora(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.IMPRESORA_LISTAR, async () => {
    try {
      return await listarImpresoras();
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.IMPRESORA_OBTENER_SELECCIONADA, () => obtenerImpresoraSeleccionada(db));

  ipcMain.handle(IPC_CHANNELS.IMPRESORA_SELECCIONAR, async (_e, nombreDispositivo: string, nombreVisible: string) => {
    try {
      const dispositivo = z.string().trim().min(1).parse(nombreDispositivo);
      const visible = z.string().trim().min(1).parse(nombreVisible);
      await seleccionarImpresora(db, dispositivo, visible);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "seleccionar_impresora",
        entidad: "configuracion",
        detalle: { nombreDispositivo: dispositivo, nombreVisible: visible }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.IMPRESORA_PRUEBA, async (_e, nombreDispositivo: string) => {
    try {
      await imprimirPaginaDePrueba(z.string().trim().min(1).parse(nombreDispositivo));
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  // Imprime cualquier PDF ya generado por Densz (lista de precios, etc.)
  // directo a la impresora configurada, sin diálogo.
  ipcMain.handle(IPC_CHANNELS.IMPRESORA_IMPRIMIR_PDF, async (_e, pdfPath: string) => {
    try {
      await imprimirPdf(db, z.string().trim().min(1).parse(pdfPath));
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
