import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import { generarComprobante, regenerarPdfComprobante } from "../main/services/comprobanteService";
import { setPdfPath, obtenerComprobante } from "../main/db/repositories/comprobantesRepo";
import type { Comprobante } from "../shared/types/entities";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import { subirDocumento, descargarDocumento, eliminarDocumento } from "./storage";
import { ANCHO_PAGINA_COMPROBANTE_MM, ALTO_PAGINA_COMPROBANTE_MM } from "../main/services/comprobanteHtmlTemplate";

const MM_POR_PULGADA = 25.4;

/**
 * Tamaño de página SOLO para el PDF que se imprime desde la Web (2026-10-28):
 * a diferencia del escritorio (que imprime la hoja A4 completa con el ticket
 * dibujado en su esquina — ver el comentario largo en
 * comprobanteHtmlTemplate.ts — porque esa ruta se confirmó que funciona
 * bien ahí), la Web siempre termina en el diálogo de impresión NATIVO del
 * navegador, sin forma de que Densz le fuerce un tamaño de hoja (al
 * revés de impresoraService.ts, que sí se lo dice directo a Windows). Se
 * confirmó en vivo (fotos reales) que el papel que realmente se carga en
 * la impresora para estos comprobantes YA viene precortado al tamaño del
 * ticket (105×148.5mm, un cuarto de A4) — nunca una hoja A4 entera — así
 * que pedirle al navegador un PDF de hoja A4 completa (con el ticket
 * dibujado en una esquina) hacía que, apenas el usuario elegía "Escala:
 * Tamaño real" en el diálogo de Chrome (en vez de dejar que el driver
 * ajustara solo, que es lo que "salvaba" por accidente al escritorio), el
 * comprobante saliera recortado/corrido en ese papel chico. Generar
 * directamente un PDF del tamaño real del ticket evita depender de que el
 * navegador adivine nada. Mismo HTML/diseño que el escritorio (§13, nunca
 * se duplica la plantilla) — solo cambia a qué tamaño de página se renderiza.
 */
const TAMANO_PAGINA_TICKET_WEB = {
  width: ANCHO_PAGINA_COMPROBANTE_MM / MM_POR_PULGADA,
  height: ALTO_PAGINA_COMPROBANTE_MM / MM_POR_PULGADA
};

/**
 * Capa de orquestación EXCLUSIVA del servidor web: conecta
 * comprobanteService.ts (sin tocar su lógica de negocio — solo le pasa un
 * tamaño de página distinto, ver TAMANO_PAGINA_TICKET_WEB arriba) con
 * Supabase Storage. No duplica ninguna regla de facturación — solo agrega,
 * después de que la transacción de comprobanteService.ts ya confirmó, la
 * subida del PDF ya generado al bucket privado "documentos".
 *
 * Por diseño (sin tocar comprobanteService.ts): regenerarPdfComprobante()
 * SIEMPRE escribe primero el PDF en disco local del servidor
 * (getComprobantesDir()) y graba esa ruta local en pdf_path — es
 * exactamente lo mismo que hace hoy el escritorio. Esta capa toma ese
 * archivo recién escrito, lo sube a Storage, reemplaza pdf_path por la
 * ruta del objeto (nunca una URL) y borra el archivo local temporal.
 */

function nombreArchivoStorage(numero: string): string {
  return `${numero}.pdf`;
}

/** Prefijo real de cualquier `pdf_path` que ya sea una ruta de OBJETO EN
 * STORAGE (nunca una ruta de disco) — ver `limpiarPdfPathSiEsDeStorage`. */
const PREFIJO_STORAGE = "comprobantes/";

/**
 * Corrección (docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md, Bloque 1-A — bug
 * encontrado al revisar el flujo completo de "Ver PDF", no reportado
 * originalmente): `comprobanteService.regenerarPdfComprobante`
 * (compartido con Desktop) reutiliza `comprobante.pdfPath` TAL CUAL como
 * ruta de SALIDA en disco si ya tiene un valor — correcto en Desktop,
 * donde `pdf_path` siempre es una ruta real de Windows, pero roto acá: en
 * cuanto un comprobante ya subió su PDF a Storage, `pdf_path` pasa a ser
 * la ruta del OBJETO ("comprobantes/CB-...pdf", relativa, nunca una ruta
 * de disco real) — reusarla como ruta de disco escribiría el archivo en
 * un lugar equivocado del filesystem del servidor en vez de la carpeta
 * local esperada. Antes de pedirle a la capa compartida que regenere, si
 * el `pdf_path` actual ya es una ruta de Storage, se limpia a `null` para
 * que esa capa vuelva a calcular una ruta local real por su cuenta — sin
 * tocar `comprobanteService.ts` para esto, el arreglo queda enteramente
 * del lado Web.
 */
async function limpiarPdfPathSiEsDeStorage(db: Pool | PoolClient, comprobanteId: number): Promise<void> {
  const actual = await obtenerComprobante(db, comprobanteId);
  if (actual?.pdfPath?.startsWith(PREFIJO_STORAGE)) {
    await setPdfPath(db, comprobanteId, null);
  }
}

/**
 * Si el `UPDATE` de `pdf_path` falla DESPUÉS de que el archivo ya se subió
 * a Storage con éxito, ese objeto quedaría huérfano (subido, pero sin
 * ningún comprobante que lo referencie) — se lo borra explícitamente
 * (nunca ningún otro objeto: siempre exactamente `rutaStorage`, la ruta
 * que esta misma llamada acaba de subir) y se vuelve a lanzar el error
 * original, para que el llamador sepa que esto falló. El archivo local
 * NUNCA se borra en este camino (regenerarPdfComprobante ya lo dejó
 * grabado en pdf_path antes de llegar acá) — el comprobante sigue siendo
 * regenerable con los datos que ya tenía.
 */
async function subirPdfLocalAStorage(db: Pool | PoolClient, comprobante: Comprobante): Promise<Comprobante> {
  if (!comprobante.pdfPath) return comprobante;
  const rutaLocal = comprobante.pdfPath;
  const buffer = fs.readFileSync(rutaLocal);
  const rutaStorage = await subirDocumento("comprobantes", nombreArchivoStorage(comprobante.numero), buffer);
  try {
    await setPdfPath(db, comprobante.id, rutaStorage);
  } catch (err) {
    try {
      await eliminarDocumento(rutaStorage);
    } catch {
      // Si ni siquiera se puede limpiar el huérfano, no hay más para
      // hacer acá — el error original ya se va a propagar igual.
    }
    throw err;
  }
  fs.rmSync(rutaLocal, { force: true });
  return (await obtenerComprobante(db, comprobante.id))!;
}

/**
 * Genera el comprobante (numeración + facturación + movimiento DEBE, todo
 * atómico vía comprobanteService.generarComprobante — sin cambios) y sube
 * el PDF a Storage. Si la subida a Storage falla, el comprobante YA quedó
 * registrado y la OT YA quedó facturada (la transacción de
 * comprobanteService.ts ya confirmó antes de tocar el PDF, igual que en
 * el escritorio) — el error de Storage no se propaga como si la
 * generación hubiera fallado entera; `pdf_path` queda apuntando al
 * archivo local hasta que se reintente con regenerarComprobanteWeb().
 */
export async function generarComprobanteWeb(db: Pool | PoolClient, ordenId: number, usuarioId: number): Promise<Comprobante> {
  const comprobante = await generarComprobante(db, ordenId, usuarioId, generarPdfDesdeHtmlWeb, TAMANO_PAGINA_TICKET_WEB);
  try {
    return await subirPdfLocalAStorage(db, comprobante);
  } catch {
    return comprobante;
  }
}

/**
 * Regenera el PDF (mismo criterio que "Ver PDF" en el escritorio: siempre
 * se regenera antes de mostrar, para que nunca quede desactualizado) y lo
 * vuelve a subir a Storage. Es también el camino de recuperación cuando
 * la subida a Storage falló la primera vez — nunca crea un comprobante
 * nuevo, solo repite la generación/subida del PDF de uno ya existente.
 */
export async function regenerarComprobanteWeb(db: Pool | PoolClient, comprobanteId: number): Promise<string> {
  await limpiarPdfPathSiEsDeStorage(db, comprobanteId);
  await regenerarPdfComprobante(db, comprobanteId, generarPdfDesdeHtmlWeb, TAMANO_PAGINA_TICKET_WEB);
  const comprobante = (await obtenerComprobante(db, comprobanteId))!;
  const actualizado = await subirPdfLocalAStorage(db, comprobante);
  if (!actualizado.pdfPath) throw new Error("No se pudo generar ni subir el PDF del comprobante.");
  return actualizado.pdfPath;
}

/** Descarga el PDF de un comprobante — siempre lo regenera primero (igual
 * que el escritorio), nunca sirve un archivo viejo. */
export async function descargarPdfComprobanteWeb(db: Pool | PoolClient, comprobanteId: number): Promise<Buffer> {
  const rutaStorage = await regenerarComprobanteWeb(db, comprobanteId);
  return descargarDocumento(rutaStorage);
}
