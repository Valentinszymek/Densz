import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import { generarComprobante, regenerarPdfComprobante } from "../main/services/comprobanteService";
import { setPdfPath, obtenerComprobante } from "../main/db/repositories/comprobantesRepo";
import type { Comprobante, TamanoImpresionComprobante, PosicionTicketA4 } from "../shared/types/entities";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import { subirDocumento, descargarDocumento, eliminarDocumento } from "./storage";

/**
 * Capa de orquestación EXCLUSIVA del servidor web: conecta
 * comprobanteService.ts (sin modificar su lógica de negocio) con Supabase
 * Storage. No duplica ninguna regla de facturación ni de tamaño de
 * página — ni siquiera lo elige: comprobanteService.ts ya resuelve solo a
 * qué tamaño generar el PDF según la preferencia guardada del laboratorio
 * (ver obtenerTamanoImpresionComprobante ahí, Configuración → Tamaño de
 * impresión), el mismo criterio tanto para escritorio como para Web — esta
 * capa solo agrega, después de que la transacción de comprobanteService.ts
 * ya confirmó, la subida del PDF ya generado al bucket privado "documentos".
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
  const comprobante = await generarComprobante(db, ordenId, usuarioId, generarPdfDesdeHtmlWeb);
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
  await regenerarPdfComprobante(db, comprobanteId, generarPdfDesdeHtmlWeb);
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

/**
 * Variante de `descargarPdfComprobanteWeb` con un tamaño de página y/o una
 * esquina (en modo "a4", ver PosicionTicketA4) elegidos puntualmente DESDE
 * ESTA COMPUTADORA (preferencia guardada local, nunca en la base — ver
 * `tamanoImpresionLocal.ts`/`posicionImpresionLocal.ts` en el renderer),
 * que puede no coincidir con la preferencia del laboratorio (Configuración
 * → Tamaño de impresión). A propósito, esta variante NUNCA toca Storage ni
 * `pdf_path`: ese archivo compartido sigue reflejando siempre la
 * preferencia real del laboratorio, para cualquier otra persona/compu que
 * lo abra — generar acá un PDF con un tamaño/esquina distinto no debe
 * "filtrarse" a nadie más. Se genera a un archivo local descartable y se
 * borra apenas se lee, sin dejar rastro en pdf_path. `tamano` es opcional
 * a propósito: pedir solo una esquina distinta, sin cambiar el tamaño, es
 * un caso real (rotar las 4 esquinas de una hoja A4 sin tocar la
 * preferencia de tamaño del laboratorio, que ya es "a4"). */
export async function descargarPdfComprobanteWebConTamano(
  db: Pool | PoolClient,
  comprobanteId: number,
  tamano?: TamanoImpresionComprobante,
  posicion?: PosicionTicketA4
): Promise<Buffer> {
  await limpiarPdfPathSiEsDeStorage(db, comprobanteId);
  await regenerarPdfComprobante(db, comprobanteId, generarPdfDesdeHtmlWeb, undefined, { tamanoPagina: tamano, posicion });
  const comprobante = (await obtenerComprobante(db, comprobanteId))!;
  const rutaLocal = comprobante.pdfPath;
  if (!rutaLocal) throw new Error("No se pudo generar el PDF del comprobante.");
  const buffer = fs.readFileSync(rutaLocal);
  fs.rmSync(rutaLocal, { force: true });
  // Vuelve a null (no a la ruta local que recién se borró, ni a una de
  // Storage que nunca se subió) — así el próximo pedido, con o sin
  // override, siempre regenera de cero en vez de arrastrar esta ruta
  // puntual.
  await setPdfPath(db, comprobanteId, null);
  return buffer;
}
