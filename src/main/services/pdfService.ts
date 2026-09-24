import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

// Se reutiliza una única ventana oculta para generar PDFs (en vez de crear
// una nueva por cada comprobante), tal como recomienda el plan de riesgos.
let ventanaOculta: BrowserWindow | null = null;

function getVentanaOculta(): BrowserWindow {
  if (ventanaOculta && !ventanaOculta.isDestroyed()) return ventanaOculta;
  ventanaOculta = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true }
  });
  return ventanaOculta;
}

/** Renderiza un HTML autocontenido (sin recursos externos) a un archivo PDF
 * real. `pageSize` por defecto A4 (estados de cuenta, resúmenes); los
 * comprobantes pasan `"A6"` para no gastar una hoja A4 entera en un
 * documento chico (§11 del pedido).
 *
 * OJO — trampa real que ya nos mordió una vez: `printToPDF` espera un
 * tamaño a medida en PULGADAS (`{width, height}`), NO en micrones. El
 * método `webContents.print()` (impresión física, en impresoraService.ts)
 * es al revés: ahí sí espera micrones. Son dos unidades distintas para
 * dos métodos de la misma API — pasar micrones acá pide una página de
 * ~2700 km y el PDF sale vacío. Por eso, para tamaños estándar como A6,
 * mejor usar directamente el string `"A6"` (soportado por printToPDF) y
 * evitar la conversión de unidades por completo. */
export async function generarPdfDesdeHtml(
  html: string,
  outputPath: string,
  pageSize: Electron.PrintToPDFOptions["pageSize"] = "A4"
): Promise<void> {
  const win = getVentanaOculta();
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await win.loadURL(dataUrl);

  const buffer = await win.webContents.printToPDF({
    pageSize,
    printBackground: true,
    // Sin esto, Chromium agrega su propio margen por defecto ENCIMA del
    // padding que ya define el HTML — en una página chica (A6) ese
    // margen duplicado es justamente lo que corría el contenido y
    // achicaba el área útil real. El margen visual lo da el propio
    // documento (ver comprobanteHtmlTemplate.ts), no printToPDF.
    margins: { marginType: "none" }
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

export function cerrarVentanaPdf(): void {
  if (ventanaOculta && !ventanaOculta.isDestroyed()) {
    ventanaOculta.destroy();
  }
  ventanaOculta = null;
}
