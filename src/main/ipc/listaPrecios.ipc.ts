import { ipcMain, BrowserWindow } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { generarListaPreciosPdf } from "../services/listaPreciosService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaOpciones = z.object({
  listaId: z.number().int().positive().optional(),
  odontologoId: z.number().int().positive().optional()
});

function abrirVentanaPdf(pdfPath: string, titulo: string): void {
  const ventana = new BrowserWindow({
    width: 760,
    height: 900,
    title: titulo,
    webPreferences: { sandbox: true }
  });
  ventana.loadURL(`file://${pdfPath.replace(/\\/g, "/")}`);
}

export function registrarHandlersListaPrecios(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.LISTA_PRECIOS_GENERAR, async (_e, opciones) => {
    try {
      const validado = esquemaOpciones.parse(opciones);
      const resultado = await generarListaPreciosPdf(db, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "generar",
        entidad: "lista_precios",
        detalle: validado
      });
      return resultado;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.LISTA_PRECIOS_VER_PDF, (_e, pdfPath: string) => {
    abrirVentanaPdf(z.string().trim().min(1).parse(pdfPath), "Lista de precios");
  });
}
