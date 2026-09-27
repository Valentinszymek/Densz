import fs from "node:fs";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../main/db/withTransaction";
import { generarPdfEstadoCuenta, generarPdfEstadoCuentaClinica } from "../main/services/cuentaService";
import {
  actualizarPdfPathResumen,
  obtenerResumenMensual,
  eliminarResumenMensual
} from "../main/db/repositories/resumenesMensualesRepo";
import { DenszError } from "../main/utils/errors";
import type { ResumenMensual } from "../shared/types/entities";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import { subirDocumento, descargarDocumento, eliminarDocumento } from "./storage";

/**
 * Capa de orquestación EXCLUSIVA del servidor web: conecta cuentaService.ts
 * (sin modificar su cálculo de DEBE/HABER/saldo) con Supabase Storage —
 * mismo patrón que comprobantesWeb.ts, adaptado a la única diferencia real:
 * una generación de resumen crea UNA fila de `resumenes_mensuales` por
 * moneda con actividad, pero las comparte todas en UN SOLO PDF (el mismo
 * `pdfPath` que cuentaService.ts ya les asigna a todas). Por eso acá se
 * sube el PDF una vez y se actualizan todas esas filas juntas, dentro de
 * una única transacción: o quedan todas apuntando al objeto de Storage, o
 * ninguna (y el objeto recién subido se borra).
 *
 * Por diseño (sin tocar cuentaService.ts): generarPdfEstadoCuenta/Clinica
 * SIEMPRE escribe primero el PDF en disco local del servidor
 * (getUserDataDir()) y graba esa ruta local en pdf_path de cada fila — es
 * exactamente lo mismo que hace hoy el escritorio. Esta capa toma ese
 * archivo recién escrito, lo sube a Storage bajo el prefijo
 * "estados-cuenta/", reemplaza pdf_path por la ruta del objeto (nunca una
 * URL) en todas las filas de esa generación, y borra el archivo local
 * temporal.
 *
 * CORRECCIÓN (post-revisión, Fase 8D): a diferencia de Comprobantes —donde
 * dejar `pdf_path` apuntando al archivo local es aceptable porque existe
 * `regenerarComprobanteWeb()` para reintentar— acá NO hay ningún mecanismo
 * de "regenerar resumen". Dejar un resumen Web nuevo con un path local (o
 * apuntando a un objeto que no llegó a existir) sería un estado inútil e
 * inconsistente: el navegador nunca puede leer un path del filesystem del
 * servidor, y no hay forma de repararlo después. Por eso, si la subida a
 * Storage O la actualización de `pdf_path` fallan, esta capa revierte la
 * generación entera: borra las filas de `resumenes_mensuales` que
 * cuentaService.ts acababa de crear (y el objeto de Storage, si llegó a
 * subirse) — nunca las deja con un path local ni roto. El PDF local
 * también se borra en ese camino. `cuentaService.ts` no se modificó: sigue
 * creando esas filas exactamente igual para Desktop.
 */

/** `Date.now()` solo no alcanza para evitar colisiones: dos generaciones
 * del mismo período pueden caer en el mismo milisegundo (§12 — Desktop
 * permite duplicados a propósito, así que esto pasa en la práctica). Un
 * sufijo aleatorio garantiza un nombre de archivo único siempre, para que
 * la segunda generación nunca pise el PDF de la primera en Storage
 * (`subirDocumento` usa `upsert: true`, que sobreescribiría silenciosamente
 * si el nombre coincidiera). */
function nombreArchivoStorage(prefijo: string): string {
  return `${prefijo}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`;
}

/**
 * Best-effort: borra cada resumen recién creado por esta generación web que
 * está fallando — nunca debe sobrevivir uno con path local o roto. Cada
 * borrado se intenta de forma independiente (si uno fallara, no debe
 * impedir que se intenten los demás); el error original de la generación
 * siempre se propaga después, sin importar si la limpieza fue perfecta.
 */
async function revertirResumenesGenerados(db: Pool | PoolClient, resumenes: ResumenMensual[]): Promise<void> {
  for (const r of resumenes) {
    try {
      await eliminarResumenMensual(db, r.id);
    } catch {
      // No hay más que hacer acá — el error original de la generación ya
      // se propaga de todas formas; un resumen que no se pudo borrar es
      // preferible a nunca haber intentado la limpieza.
    }
  }
}

/**
 * Sube el PDF ya generado a Storage y actualiza `pdf_path` en todas las
 * filas de esta generación (una única transacción: o todas apuntan al
 * objeto de Storage, o ninguna). Si CUALQUIER paso falla —la subida misma,
 * o la actualización posterior— nunca debe sobrevivir un resumen Web con
 * un path local ni roto (ver nota de corrección arriba): se revierte la
 * generación entera (se borran las filas recién creadas) y, si el objeto
 * llegó a subirse, también se lo borra (huérfano). El PDF local temporal
 * se borra siempre, haya salido bien o mal.
 */
async function subirPdfLocalYActualizarResumenes(
  db: Pool | PoolClient,
  pdfPathLocal: string,
  resumenes: ResumenMensual[],
  prefijoArchivo: string
): Promise<ResumenMensual[]> {
  let rutaStorage: string | null = null;
  try {
    const buffer = fs.readFileSync(pdfPathLocal);
    rutaStorage = await subirDocumento("estados-cuenta", nombreArchivoStorage(prefijoArchivo), buffer);
    await withTransaction(db, async (tx) => {
      for (const r of resumenes) {
        await actualizarPdfPathResumen(tx, r.id, rutaStorage!);
      }
    });
  } catch (err) {
    if (rutaStorage) {
      try {
        await eliminarDocumento(rutaStorage);
      } catch {
        // Si ni siquiera se puede limpiar el huérfano, no hay más para
        // hacer acá — el error original ya se va a propagar igual.
      }
    }
    await revertirResumenesGenerados(db, resumenes);
    fs.rmSync(pdfPathLocal, { force: true });
    throw err;
  }
  fs.rmSync(pdfPathLocal, { force: true });
  const actualizados = await Promise.all(resumenes.map((r) => obtenerResumenMensual(db, r.id)));
  return actualizados.filter((r): r is ResumenMensual => r !== null);
}

/**
 * Genera el resumen (cabecera + cálculo financiero + PDF local, todo vía
 * cuentaService.ts sin cambios) y sube el PDF a Storage. Si Storage falla
 * (subida o actualización de pdf_path), la generación entera se revierte
 * — nunca queda un resumen Web nuevo con un path local o roto — y esta
 * función propaga el error (la ruta HTTP responde con un error, no con un
 * 201 de un resumen inconsistente).
 */
export async function generarResumenOdontologoWeb(
  db: Pool | PoolClient,
  odontologoId: number,
  anio: number,
  mes: number,
  usuarioId: number
): Promise<ResumenMensual[]> {
  const { pdfPath, resumenes } = await generarPdfEstadoCuenta(db, odontologoId, anio, mes, usuarioId, generarPdfDesdeHtmlWeb);
  return subirPdfLocalYActualizarResumenes(
    db,
    pdfPath,
    resumenes,
    `estado-cuenta-odontologo-${odontologoId}-${anio}-${String(mes).padStart(2, "0")}`
  );
}

export async function generarResumenClinicaWeb(
  db: Pool | PoolClient,
  clinicaId: number,
  anio: number,
  mes: number,
  usuarioId: number
): Promise<ResumenMensual[]> {
  const { pdfPath, resumenes } = await generarPdfEstadoCuentaClinica(db, clinicaId, anio, mes, usuarioId, generarPdfDesdeHtmlWeb);
  return subirPdfLocalYActualizarResumenes(
    db,
    pdfPath,
    resumenes,
    `estado-cuenta-clinica-${clinicaId}-${anio}-${String(mes).padStart(2, "0")}`
  );
}

/** Descarga el PDF de un resumen mensual ya generado — la ruta del objeto
 * nunca la elige quien llama: se lee siempre de `pdf_path` en la base
 * (nunca de un path recibido en el pedido), y se exige que empiece con el
 * prefijo "estados-cuenta/" (nunca se le pasa a Storage un path fuera de
 * ese prefijo, ni una ruta local de disco). Un resumen sin `pdf_path`, o
 * con una ruta local vieja (generado antes de esta integración, o desde el
 * escritorio), da un error controlado en vez de intentar Storage. */
export async function descargarPdfResumenWeb(db: Pool | PoolClient, resumenId: number): Promise<Buffer> {
  const resumen = await obtenerResumenMensual(db, resumenId);
  if (!resumen || !resumen.pdfPath) {
    throw new DenszError("No se encontró el PDF de ese resumen.");
  }
  if (!resumen.pdfPath.startsWith("estados-cuenta/")) {
    throw new DenszError("El PDF de este resumen todavía no está disponible para descargar desde la web.");
  }
  return descargarDocumento(resumen.pdfPath);
}
