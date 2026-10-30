import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { abrirPdfDescargado } from "../services/pdfLocalViewer";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersListaPrecios(): void {
  ipcMain.handle(IPC_CHANNELS.LISTA_PRECIOS_GENERAR, (_e, opciones) => apiClient.listaPreciosGenerar(opciones));

  ipcMain.handle(IPC_CHANNELS.LISTA_PRECIOS_VER_PDF, (_e, pdfPath: string) =>
    abrirPdfDescargado(`/listas-precio/pdf?path=${encodeURIComponent(pdfPath)}`, "lista-de-precios.pdf", "Lista de precios")
  );
}
