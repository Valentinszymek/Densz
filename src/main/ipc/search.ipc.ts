import { ipcMain } from "electron";
import type { Pool } from "pg";
import { buscarGlobal } from "../services/searchService";
import { IPC_CHANNELS, type ResultadoBusqueda } from "../../shared/types/ipc-contracts";

export function registrarHandlersBusqueda(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_GLOBAL, (_evt, texto: string): Promise<ResultadoBusqueda[]> => {
    return buscarGlobal(db, texto);
  });
}
