import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import { generarComprobante, regenerarPdfComprobante } from "../main/services/comprobanteService";
import { setPdfPath, obtenerComprobante } from "../main/db/repositories/comprobantesRepo";
import type { Comprobante } from "../shared/types/entities";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import { subirDocumento, descargarDocumento, eliminarDocumento } from "./storage";

/**
 * Capa de orquestación EXCLUSIVA del servidor web: conecta
 * comprobanteService.ts (sin modificarlo) con Supabase Storage. No
 * duplica ninguna regla de facturación — solo agrega, después de que la
 * transacción de comprobanteService.ts ya confirmó, la subida del PDF ya
 * generado al bucket privado "documentos".
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
