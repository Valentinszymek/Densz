import { ipcMain } from "electron";
import { z } from "zod";
import {
  listarImpresoras,
  obtenerImpresoraSeleccionada,
  seleccionarImpresora,
  imprimirPaginaDePrueba,
  imprimirPdf
} from "../services/impresoraService";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersImpresora(): void {
  ipcMain.handle(IPC_CHANNELS.IMPRESORA_LISTAR, () => listarImpresoras());

  ipcMain.handle(IPC_CHANNELS.IMPRESORA_OBTENER_SELECCIONADA, () => obtenerImpresoraSeleccionada());

  // La auditoría de esta selección ya la hace el backend (PUT
  // /config/impresora, ver config.route.ts) — nada que repetir acá.
  ipcMain.handle(IPC_CHANNELS.IMPRESORA_SELECCIONAR, (_e, nombreDispositivo: string, nombreVisible: string) =>
    seleccionarImpresora(z.string().trim().min(1).parse(nombreDispositivo), z.string().trim().min(1).parse(nombreVisible))
  );

  ipcMain.handle(IPC_CHANNELS.IMPRESORA_PRUEBA, (_e, nombreDispositivo: string) =>
    imprimirPaginaDePrueba(z.string().trim().min(1).parse(nombreDispositivo))
  );

  // Imprime cualquier PDF ya generado por Densz (lista de precios, etc.)
  // directo a la impresora configurada, sin diálogo.
  ipcMain.handle(IPC_CHANNELS.IMPRESORA_IMPRIMIR_PDF, (_e, pdfPath: string) =>
    imprimirPdf(z.string().trim().min(1).parse(pdfPath))
  );
}
