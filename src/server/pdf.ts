import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer";

/**
 * Reemplazo del pdfService.ts de Electron (src/main/services/pdfService.ts)
 * para el servidor web: mismo contrato de función (GenerarPdf, definido de
 * forma local en comprobanteService.ts/cuentaService.ts) para que esos dos
 * servicios puedan inyectar esta implementación sin cambiar una sola línea
 * de su lógica de negocio — nunca se modificó pdfService.ts original, esto
 * es una implementación separada, pensada para correr en un servidor Node
 * sin Electron.
 *
 * `pageSize` respeta exactamente el mismo formato que ya usan ambos
 * servicios: un string tipo "A4"/"A6" (Electron.PrintToPDFOptions), o un
 * objeto { width, height } en PULGADAS (así arma la constante
 * TAMANO_PAGINA_COMPROBANTE en comprobanteService.ts, a partir de mm/25.4).
 */
type PageSize = string | { width: number; height: number };

const FORMATOS_VALIDOS = new Set([
  "letter",
  "legal",
  "tabloid",
  "ledger",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6"
]);

let navegadorPromesa: Promise<Browser> | null = null;

/** Una única instancia de Chromium reutilizada entre generaciones — mismo
 * criterio que pdfService.ts reutiliza una sola BrowserWindow oculta.
 *
 * `--no-sandbox`/`--disable-setuid-sandbox`: el contenedor de Railway
 * (Dockerfile, sin `USER` propio) corre como root — el sandbox de Chromium
 * se niega a arrancar como root sin este flag ("No usable sandbox!"), y
 * sin él `puppeteer.launch()` rechaza la promesa en cada intento. Es el
 * motivo real por el que el PDF seguía fallando incluso después de
 * agregar el Dockerfile con las librerías de sistema correctas — esas
 * librerías eran necesarias pero no alcanzaban solas. Nunca afecta a un
 * entorno de desarrollo local (Windows/Mac fuera de Docker): el flag se
 * ignora sin problema ahí. */
function getNavegador(): Promise<Browser> {
  if (!navegadorPromesa) {
    navegadorPromesa = puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  }
  return navegadorPromesa;
}

export async function generarPdfDesdeHtmlWeb(html: string, outputPath: string, pageSize: PageSize = "A4"): Promise<void> {
  const browser = await getNavegador();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Sin márgenes propios: igual que pdfService.ts (`margins: {marginType:
    // "none"}`), el margen visual lo define el propio HTML/CSS, nunca
    // Chromium — evita el mismo bug de margen duplicado ya documentado ahí.
    const opciones: Parameters<typeof page.pdf>[0] = {
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" }
    };

    if (typeof pageSize === "string") {
      const formato = pageSize.toLowerCase();
      opciones.format = (FORMATOS_VALIDOS.has(formato) ? formato : "a4") as typeof opciones.format;
    } else {
      opciones.width = `${pageSize.width}in`;
      opciones.height = `${pageSize.height}in`;
    }

    const buffer = await page.pdf(opciones);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  } finally {
    await page.close();
  }
}

/** Cierra el navegador reutilizado — para apagar limpio el servidor o entre tests. */
export async function cerrarNavegadorPdfWeb(): Promise<void> {
  if (navegadorPromesa) {
    const browser = await navegadorPromesa;
    navegadorPromesa = null;
    await browser.close();
  }
}
