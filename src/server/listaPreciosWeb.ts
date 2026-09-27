import fs from "node:fs";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { generarListaPreciosPdf, type OpcionesListaPrecios } from "../main/services/listaPreciosService";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import { subirDocumento, descargarDocumento } from "./storage";

/**
 * Capa de orquestación EXCLUSIVA del servidor web para el PDF de listas de
 * precios — mismo patrón que comprobantesWeb.ts/cuentasWeb.ts: reutiliza
 * generarListaPreciosPdf() (sin modificarla, ya acepta un generador de PDF
 * inyectable) y sube el resultado a Storage en vez de dejarlo en disco
 * local. Este PDF es puramente informativo (no genera ningún registro en
 * la base, no toca precios ni trabajos), así que no hay ninguna columna
 * tipo `pdf_path` que actualizar — el objeto en Storage es efímero, se
 * genera de nuevo cada vez que se pide.
 */

/** Nombre de objeto siempre aleatorio (UUID) — nunca basado en el nombre
 * de la lista o del odontólogo. Esto es lo que permite validar después,
 * en descargarListaPreciosWeb(), que el path que un cliente manda de
 * vuelta es exactamente uno que esta función pudo haber generado, sin
 * necesitar una tabla propia para registrarlo (ver PATH_VALIDO abajo). */
function nombreArchivoStorage(): string {
  return `${crypto.randomUUID()}.pdf`;
}

export async function generarListaPreciosWeb(
  db: Pool | PoolClient,
  opciones: OpcionesListaPrecios
): Promise<{ pdfPath: string }> {
  const { pdfPath: rutaLocal } = await generarListaPreciosPdf(db, opciones, generarPdfDesdeHtmlWeb);
  try {
    const buffer = fs.readFileSync(rutaLocal);
    const rutaStorage = await subirDocumento("listas-precio", nombreArchivoStorage(), buffer);
    return { pdfPath: rutaStorage };
  } finally {
    fs.rmSync(rutaLocal, { force: true });
  }
}

// UUID v4 + ".pdf", siempre dentro de "listas-precio/" — nunca acepta
// "comprobantes/...", "estados-cuenta/..." ni ningún otro path arbitrario
// que un cliente pudiera inventar o adivinar.
const PATH_VALIDO = /^listas-precio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export async function descargarListaPreciosWeb(pdfPath: string): Promise<Buffer> {
  if (!PATH_VALIDO.test(pdfPath)) {
    throw new Error("No se pudo encontrar el documento solicitado.");
  }
  return descargarDocumento(pdfPath);
}
