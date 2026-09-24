import { BrowserWindow } from "electron";
import fs from "node:fs";
import type { Queryable } from "../db/types";
import { getConfig, setConfig } from "../db/repositories/configRepo";
import { DenszError } from "../utils/errors";
import type { ImpresoraInfo } from "../../shared/types/entities";

const CLAVE_IMPRESORA = "impresora.nombreDispositivo";
const CLAVE_IMPRESORA_VISIBLE = "impresora.nombreVisible";

let ventanaAuxiliar: BrowserWindow | null = null;
function getVentanaAuxiliar(): BrowserWindow {
  if (ventanaAuxiliar && !ventanaAuxiliar.isDestroyed()) return ventanaAuxiliar;
  ventanaAuxiliar = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  return ventanaAuxiliar;
}

/** Impresoras que Windows tiene instaladas, tal como las ve Electron. */
export async function listarImpresoras(): Promise<ImpresoraInfo[]> {
  const win = getVentanaAuxiliar();
  const impresoras = await win.webContents.getPrintersAsync();
  return impresoras.map((p) => ({
    nombreDispositivo: p.name,
    nombreVisible: p.displayName || p.name,
    predeterminadaDelSistema: p.isDefault,
    disponible: p.status === 0
  }));
}

export interface ImpresoraSeleccionada {
  nombreDispositivo: string;
  nombreVisible: string;
}

export async function obtenerImpresoraSeleccionada(db: Queryable): Promise<ImpresoraSeleccionada | null> {
  const nombreDispositivo = await getConfig(db, CLAVE_IMPRESORA);
  if (!nombreDispositivo) return null;
  const nombreVisible = (await getConfig(db, CLAVE_IMPRESORA_VISIBLE)) ?? nombreDispositivo;
  return { nombreDispositivo, nombreVisible };
}

export async function seleccionarImpresora(db: Queryable, nombreDispositivo: string, nombreVisible: string): Promise<void> {
  await setConfig(db, CLAVE_IMPRESORA, nombreDispositivo);
  await setConfig(db, CLAVE_IMPRESORA_VISIBLE, nombreVisible);
}

/** Imprime un archivo (PDF u otro que Chromium pueda mostrar) directo a la
 * impresora indicada, sin diálogo.
 *
 * OJO — esta función es SOLO para los documentos grandes tipo A4 (lista de
 * precios, resúmenes mensuales, reportes). El comprobante de entrega tiene
 * su propio camino de impresión separado, con su propio tamaño explícito
 * (imprimirComprobanteHtml, más abajo) — nunca pasa por acá.
 *
 * Se fuerza `pageSize: "A4"` a propósito: antes esta función confiaba en
 * que Chromium iba a respetar el tamaño con el que el PDF fue generado,
 * pero en la práctica (comprobado con una impresora Epson) el driver cae
 * en el último tamaño de papel que haya quedado configurado — que puede
 * ser el tamaño chico del comprobante — en vez de leerlo del documento.
 * Pasar el tamaño explícito acá es lo único que garantiza que estos
 * documentos salgan en A4 sin tener que cambiar nada a mano en Windows. */
async function imprimirArchivo(rutaArchivo: string, deviceName: string): Promise<void> {
  if (!fs.existsSync(rutaArchivo)) {
    throw new DenszError("No se encontró el archivo a imprimir.");
  }
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL(`file://${rutaArchivo.replace(/\\/g, "/")}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: true, deviceName, printBackground: true, pageSize: "A4" },
        (exito, motivo) => {
          if (exito) resolve();
          else reject(new DenszError(`No se pudo imprimir porque la impresora seleccionada no está disponible. (${motivo})`));
        }
      );
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Imprime un PDF de un documento A4 (lista de precios, resumen mensual,
 * reporte, etc.) en la impresora predeterminada — sin preguntar, sin
 * diálogo, siempre en A4 (ver comentario en imprimirArchivo). El
 * comprobante de entrega NUNCA usa esta función — tiene su propio tamaño
 * fijo vía imprimirComprobanteHtml. */
export async function imprimirPdf(db: Queryable, pdfPath: string): Promise<void> {
  const impresora = await obtenerImpresoraSeleccionada(db);
  if (!impresora) {
    throw new DenszError("No hay una impresora predeterminada configurada. Configurala en Configuración → Impresora.");
  }
  await imprimirArchivo(pdfPath, impresora.nombreDispositivo);
}

/** Imprime el comprobante directamente desde su HTML (la misma fuente que
 * genera el PDF de "Ver PDF" — ver `construirHtmlComprobante` en
 * comprobanteService.ts) en vez de cargar el archivo .pdf ya generado.
 *
 * Por qué no reutilizar `imprimirPdf` acá: cargar un .pdf con
 * `loadURL('file://...')` y llamar a `print()` inmediatamente dispara un
 * bug conocido de Chromium/Electron — el visor de PDF interno todavía no
 * terminó de pintar el documento cuando arranca el trabajo de impresión,
 * y el resultado es una hoja negra o en blanco (esto es lo que estaba
 * rompiendo "Imprimir"; "Ver PDF" nunca lo sufrió porque ahí es el propio
 * usuario quien imprime desde el visor ya renderizado, no un print()
 * disparado a los pocos milisegundos de cargar). Imprimir el HTML
 * directamente evita por completo ese visor de PDF y su carrera de
 * renderizado.
 *
 * Tamaño de página: el formulario de papel "DENSZ" (110×150mm) que ya
 * está registrado en el driver de la Xerox Phaser 3020 en Windows —
 * confirmado con `System.Drawing.Printing.PrinterSettings.PaperSizes`:
 * Windows lo reporta con RawKind=20480 y dimensiones exactas de 433×591
 * centésimas de pulgada (109.982 × 150.114mm — de ahí la constante de
 * abajo, no un redondeo). Antes se probó con el string con nombre `"A6"`
 * y con tamaños personalizados sin registrar (105×148mm, 110×150mm
 * "a mano"): ninguno de esos existía en la lista real de tamaños que el
 * driver reporta soportar, así que en todos los casos Windows caía en
 * silencio a su tamaño por defecto (A4) — eso era la causa real del
 * desplazamiento/espacio en blanco en la impresión física (nunca en
 * "Ver PDF", que es 100% software y no depende de ningún driver). Al
 * pedir exactamente el tamaño que el driver SÍ tiene registrado, deja
 * de haber margen para que sustituya nada. */
const ANCHO_PAGINA_DENSZ_MICRONES = 109982;
const ALTO_PAGINA_DENSZ_MICRONES = 150114;
export async function imprimirComprobanteHtml(db: Queryable, html: string): Promise<void> {
  const impresora = await obtenerImpresoraSeleccionada(db);
  if (!impresora) {
    throw new DenszError("No hay una impresora predeterminada configurada. Configurala en Configuración → Impresora.");
  }
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          deviceName: impresora.nombreDispositivo,
          printBackground: true,
          pageSize: { width: ANCHO_PAGINA_DENSZ_MICRONES, height: ALTO_PAGINA_DENSZ_MICRONES },
          // `color` no default es `true` (modo color) — Electron nunca lo
          // aclara solo, y enviar un trabajo a color a una impresora
          // monocromática (Xerox Phaser 3020) fuerza una conversión
          // color→blanco y negro en el camino que sale lavada/con
          // rayado, en vez de un negro sólido nativo. Acá SÍ hay una
          // sola impresora física a la que Densz imprime (la configurada
          // en Configuración → Impresora), así que no hace falta
          // detectar si es color o monocromática: se fuerza escala de
          // grises siempre, que es lo correcto para un comprobante que
          // nunca lleva color de por sí.
          color: false,
          // Sin esto, el margen por defecto del driver/impresora se suma
          // al padding que ya define el propio HTML — en una hoja de
          // 148mm de alto eso es una fracción grande de la página, y es
          // una de las causas reales de que el contenido apareciera
          // corrido hacia abajo y cortado en la impresión física (mismo
          // ajuste aplicado en pdfService.ts para "Ver PDF"). El margen
          // visual real lo da el documento (comprobanteHtmlTemplate.ts).
          margins: { marginType: "none" },
          copies: 1
        },
        (exito, motivo) => {
          if (exito) resolve();
          else reject(new DenszError(`No se pudo imprimir porque la impresora seleccionada no está disponible. (${motivo})`));
        }
      );
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Página de prueba real (no simulada): sirve para comprobar impresora, conexión, tamaño y orientación. */
export async function imprimirPaginaDePrueba(deviceName: string): Promise<void> {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { width: 105mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 6mm; font-size: 9px; color: #0E0E10; }
  h1 { font-size: 12px; margin: 0 0 3mm; color: #8A6F35; }
  p { margin: 1.5mm 0; }
  .marco { border: 1px dashed #C9A24B; padding: 4mm; margin-top: 4mm; text-align: center; font-size: 8px; color: #777; }
</style></head>
<body>
  <h1>Densz — Página de prueba</h1>
  <p><strong>Impresora:</strong> ${deviceName}</p>
  <p>Si podés leer este texto con nitidez y el papel salió del tamaño esperado (~10,5 × 14,8 cm), la impresora está bien configurada para Densz.</p>
  <div class="marco">Márgenes, tamaño y orientación de prueba</div>
</body></html>`;
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: true, deviceName, printBackground: true, pageSize: "A6", margins: { marginType: "none" } },
        (exito, motivo) => {
          if (exito) resolve();
          else reject(new DenszError(`No se pudo imprimir la página de prueba: ${motivo}`));
        }
      );
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
