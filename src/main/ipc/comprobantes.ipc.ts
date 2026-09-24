import { ipcMain, BrowserWindow } from "electron";
import type { Pool } from "pg";
import { generarComprobante, construirHtmlComprobante, regenerarPdfComprobante } from "../services/comprobanteService";
import { imprimirComprobanteHtml } from "../services/impresoraService";
import {
  obtenerComprobantePorOrden,
  obtenerComprobante,
  listarComprobantes
} from "../db/repositories/comprobantesRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres, DenszError } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersComprobantes(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_GENERAR, async (_e, ordenId: number) => {
    try {
      const usuarioId = getUsuarioActualId();
      const comprobante = await generarComprobante(db, ordenId, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar",
        entidad: "comprobantes",
        entidadId: comprobante.id,
        detalle: { numero: comprobante.numero, ordenId }
      });
      return comprobante;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_OBTENER_POR_ORDEN, (_e, ordenId: number) =>
    obtenerComprobantePorOrden(db, ordenId)
  );

  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_LISTAR, (_e, filtro) => listarComprobantes(db, filtro ?? {}));

  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_VER_PDF, async (_e, comprobanteId: number) => {
    const comprobante = await obtenerComprobante(db, comprobanteId);
    if (!comprobante) {
      throw new DenszError("Este comprobante ya no existe.");
    }
    // Se regenera el PDF antes de mostrarlo (misma plantilla y mismos
    // datos que "Imprimir" — construirHtmlComprobante, §13) para que
    // nunca pueda quedar desactualizado respecto de un archivo viejo,
    // por ejemplo si cambió la dirección/teléfono del odontólogo o
    // clínica desde que se generó el comprobante por primera vez.
    const pdfPath = await regenerarPdfComprobante(db, comprobanteId);
    // Chromium (la base de Electron) tiene un visor de PDF nativo: al
    // cargar el archivo directamente se obtiene vista previa + impresión
    // sin necesidad de un visor propio.
    const ventana = new BrowserWindow({
      width: 760,
      height: 900,
      title: `Comprobante ${comprobante.numero}`,
      webPreferences: { sandbox: true }
    });
    ventana.loadURL(`file://${pdfPath.replace(/\\/g, "/")}`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_IMPRIMIR, async (_e, comprobanteId: number) => {
    try {
      // Misma plantilla exacta que "Ver PDF" (construirHtmlComprobante,
      // §13), impresa directamente sin pasar por el archivo .pdf ya
      // generado — ver el comentario en imprimirComprobanteHtml sobre
      // por qué.
      const { html, comprobante } = await construirHtmlComprobante(db, comprobanteId);
      await imprimirComprobanteHtml(db, html);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "imprimir",
        entidad: "comprobantes",
        entidadId: comprobanteId,
        detalle: { numero: comprobante.numero }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
