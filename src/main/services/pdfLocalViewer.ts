import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { apiClient } from "./apiClient";

/**
 * Plan de seguridad del escritorio: antes, "ver un PDF" generaba el
 * archivo LOCAL (Postgres directo + `printToPDF` de Electron, ver
 * pdfService.ts) y lo abría directo. Ahora el PDF ya lo generó el
 * servidor (mismo camino que ya usa la web, vía Puppeteer —
 * src/server/pdf.ts) — este helper descarga esos bytes por HTTP
 * (apiClient.getBuffer), los guarda en un archivo temporal local, y recién
 * ahí abre la misma ventana nativa de Chromium que ya se usaba (con su
 * visor de PDF incorporado) — misma UX final, distinto origen de los
 * bytes. Compartido por comprobantes/cuentas/listaPrecios (los 3 lugares
 * que hoy abren un PDF en una ventana propia).
 */
async function descargarYGuardarTemp(rutaHttp: string, nombreArchivo: string): Promise<string> {
  const buffer = await apiClient.getBuffer(rutaHttp);
  const destino = path.join(os.tmpdir(), "densz-pdf", nombreArchivo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
  return destino;
}

export async function abrirPdfDescargado(rutaHttp: string, nombreArchivo: string, titulo: string): Promise<void> {
  const rutaLocal = await descargarYGuardarTemp(rutaHttp, nombreArchivo);
  const ventana = new BrowserWindow({
    width: 760,
    height: 900,
    title: titulo,
    webPreferences: { sandbox: true }
  });
  ventana.loadURL(`file://${rutaLocal.replace(/\\/g, "/")}`);
}
