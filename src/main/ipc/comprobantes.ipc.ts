import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { abrirPdfDescargado } from "../services/pdfLocalViewer";
import { imprimirComprobanteHtml } from "../services/impresoraService";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersComprobantes(): void {
  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_GENERAR, (_e, ordenId: number) => apiClient.comprobantesGenerar(ordenId));
  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_OBTENER_POR_ORDEN, (_e, ordenId: number) => apiClient.comprobantesObtenerPorOrden(ordenId));
  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_LISTAR, (_e, filtro) => apiClient.comprobantesListar(filtro));

  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_VER_PDF, (_e, comprobanteId: number) =>
    abrirPdfDescargado(`/comprobantes/${comprobanteId}/pdf`, `comprobante-${comprobanteId}.pdf`, "Comprobante")
  );

  // Imprime directo desde el HTML (mismo origen de datos que "Ver PDF",
  // ver construirHtmlComprobante en comprobanteService.ts, ahora servido
  // por el backend vía GET /comprobantes/:id/html) — nunca el .pdf ya
  // generado, por el bug conocido de Chromium documentado en
  // impresoraService.ts. Solo audita si la impresión realmente terminó
  // bien (igual que antes).
  ipcMain.handle(IPC_CHANNELS.COMPROBANTES_IMPRIMIR, async (_e, comprobanteId: number) => {
    const { html } = await apiClient.get<{ html: string; numero: string }>(`/comprobantes/${comprobanteId}/html`);
    await imprimirComprobanteHtml(html);
    await apiClient.post(`/comprobantes/${comprobanteId}/registrar-impresion`);
  });
}
