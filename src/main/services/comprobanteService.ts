import type { Queryable } from "../db/types";
import path from "node:path";
import { withTransaction } from "../db/withTransaction";
import { siguienteNumero } from "../utils/numbering";
import { obtenerOrden, marcarFacturada } from "../db/repositories/ordenesRepo";
import { getConfig } from "../db/repositories/configRepo";
import { obtenerOdontologo } from "../db/repositories/odontologosRepo";
import { logger } from "../utils/logger";
import { obtenerClinica } from "../db/repositories/clinicasRepo";
import {
  insertarComprobante,
  obtenerComprobante,
  obtenerComprobantePorOrden,
  setPdfPath,
  anularComprobanteDb
} from "../db/repositories/comprobantesRepo";
import { registrarMovimientoDebe, anularMovimientoDeOrden } from "../db/repositories/movimientosRepo";
import { generarHtmlComprobante, ANCHO_PAGINA_COMPROBANTE_MM, ALTO_PAGINA_COMPROBANTE_MM } from "./comprobanteHtmlTemplate";
import { generarPdfDesdeHtml } from "./pdfService";
import { getComprobantesDir } from "../utils/appPaths";
import { DenszError } from "../utils/errors";
import type { Comprobante } from "../../shared/types/entities";

const MM_POR_PULGADA = 25.4;
/** Tamaño de página EXACTO de la hoja física "DENSZ" (110×150mm), en
 * pulgadas — la unidad que espera `printToPDF` para un tamaño a medida
 * (ver comentario en pdfService.ts). Mismo tamaño para "Ver PDF" y para
 * "Imprimir" (§13): una sola fuente de verdad para el documento. */
const TAMANO_PAGINA_COMPROBANTE = {
  width: ANCHO_PAGINA_COMPROBANTE_MM / MM_POR_PULGADA,
  height: ALTO_PAGINA_COMPROBANTE_MM / MM_POR_PULGADA
};

type GenerarPdf = (html: string, outputPath: string, pageSize?: Electron.PrintToPDFOptions["pageSize"]) => Promise<void>;

/** Dirección y teléfono a mostrar en el comprobante: siempre los del
 * odontólogo o clínica dueños de la orden (nunca los del laboratorio) —
 * la clínica cuando la OT quedó a su nombre (§6), el odontólogo si no. Se
 * obtienen en vivo (no se congelan): si cambian más adelante, el
 * comprobante refleja el dato actual. */
async function obtenerDatosContacto(db: Queryable, odontologoId: number, clinicaId: number | null) {
  if (clinicaId) {
    const clinica = await obtenerClinica(db, clinicaId);
    return { direccion: clinica?.direccion ?? null, telefono: clinica?.telefono ?? null };
  }
  const odontologo = await obtenerOdontologo(db, odontologoId);
  return { direccion: odontologo?.direccion ?? null, telefono: odontologo?.telefono ?? null };
}

/** Reconstruye el HTML del comprobante a partir de los datos YA
 * congelados de la orden y del comprobante (nunca datos "actuales" del
 * catálogo) — misma fuente de verdad que usan tanto "Ver PDF" como
 * "Imprimir" (vía `imprimirComprobanteHtml`, en impresoraService.ts),
 * para que ambos muestren siempre exactamente el mismo documento (§13). */
export async function construirHtmlComprobante(
  db: Queryable,
  comprobanteId: number
): Promise<{ html: string; comprobante: Comprobante }> {
  const comprobante = await obtenerComprobante(db, comprobanteId);
  if (!comprobante) throw new DenszError("El comprobante no existe.");
  const orden = await obtenerOrden(db, comprobante.ordenId);
  if (!orden) throw new DenszError("La orden asociada a este comprobante ya no existe.");

  const { direccion, telefono } = await obtenerDatosContacto(db, orden.odontologoId, orden.clinicaId);

  const html = generarHtmlComprobante({
    laboratorioNombre: comprobante.laboratorioNombre,
    direccion,
    telefono,
    comprobante: { numero: comprobante.numero, fechaEmision: comprobante.fechaEmision },
    orden: {
      numero: orden.numero,
      fechaTrabajo: orden.fechaTrabajo,
      moneda: orden.moneda,
      totalCentavos: orden.totalCentavos,
      prestaciones: orden.prestaciones.map((p) => ({
        nombre: p.prestacionNombre,
        piezasFdi: p.piezasFdi,
        cantidad: p.cantidad,
        precioUnitarioCentavos: p.precioUnitarioCentavos,
        subtotalCentavos: p.subtotalCentavos
      }))
    },
    odontologoNombre: orden.odontologoNombre ?? "",
    clinicaNombre: orden.clinicaNombre,
    pacienteNombreCompleto: orden.pacienteNombreCompleto ?? ""
  });

  return { html, comprobante };
}

/** Regenera el archivo PDF del comprobante en el mismo `pdfPath` — usado
 * tanto al generar el comprobante por primera vez, como para recuperar un
 * PDF roto, como cada vez que se abre "Ver PDF" (para que nunca pueda
 * quedar desactualizado respecto de "Imprimir" — §13) — nunca toca
 * ningún dato de negocio. */
export async function regenerarPdfComprobante(
  db: Queryable,
  comprobanteId: number,
  generarPdf: GenerarPdf = generarPdfDesdeHtml
): Promise<string> {
  const { html, comprobante } = await construirHtmlComprobante(db, comprobanteId);
  const pdfPath = comprobante.pdfPath ?? path.join(getComprobantesDir(), `${comprobante.numero}.pdf`);
  await generarPdf(html, pdfPath, TAMANO_PAGINA_COMPROBANTE);
  await setPdfPath(db, comprobanteId, pdfPath);
  return pdfPath;
}

/**
 * "Guardar y generar comprobante" en un solo paso: numera el comprobante,
 * pasa la orden a facturado, registra el movimiento "debe" en la cuenta
 * corriente (en la moneda de la orden) y genera el PDF real con TODAS las
 * prestaciones de la orden. Todo en una única operación coherente.
 *
 * Corrección (docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md, Bloque 1-A): la parte
 * contable (numeración, `marcarFacturada`, movimiento DEBE) y la
 * generación del archivo PDF son dos pasos distintos, con una diferencia
 * importante — la contable ya hizo COMMIT cuando se intenta el PDF, así
 * que un fallo del PDF (ej. el generador no pudo arrancar) NUNCA debe
 * hacer parecer que la operación entera falló: el comprobante ya existe,
 * numerado y facturado, de verdad. Por eso un error en este paso
 * puntual no se vuelve a lanzar — se devuelve igual el comprobante ya
 * creado (con `pdfPath` en `null`, el estado real), y se loguea el error
 * para quien revise el servidor. Quien llama puede distinguir ambos casos
 * mirando `comprobante.pdfPath`. Reintentar más tarde (ej. "Ver PDF") es
 * seguro: `regenerarPdfComprobante` solo regenera el archivo de un
 * comprobante que ya existe, nunca crea uno nuevo ni vuelve a facturar —
 * y esta misma función ya rechaza arriba una orden que ya está
 * "facturado", así que no hay forma de duplicar el comprobante ni el
 * movimiento DEBE reintentando.
 */
export async function generarComprobante(
  pool: Queryable,
  ordenId: number,
  usuarioId: number,
  // Inyectable para tests: evita depender de una BrowserWindow real de
  // Electron (no disponible fuera de la app) para probar la lógica de
  // negocio (numeración, estado, ledger).
  generarPdf: GenerarPdf = generarPdfDesdeHtml
): Promise<Comprobante> {
  const orden = await obtenerOrden(pool, ordenId);
  if (!orden) throw new DenszError("La orden no existe.");
  if (orden.estado === "anulado") throw new DenszError("No se puede facturar una orden anulada.");
  if (orden.estado === "facturado") throw new DenszError("Esta orden ya tiene un comprobante generado.");

  const existente = await obtenerComprobantePorOrden(pool, ordenId);
  if (existente) throw new DenszError("Esta orden ya tiene un comprobante generado.");

  const comprobanteId = await withTransaction(pool, async (db) => {
    const numero = await siguienteNumero(db, "comprobante");
    // Se congela el nombre del laboratorio tal como está en este momento
    // (§11): si más adelante se cambia en Configuración, este comprobante
    // ya generado no debe verse afectado. "Densz" es el valor de fábrica
    // (nunca configurado por el laboratorio) — equivale a "sin nombre
    // propio todavía", así que no se muestra como "By Densz".
    const nombreConfigurado = await getConfig(db, "laboratorio.nombre");
    const laboratorioNombre = nombreConfigurado && nombreConfigurado.trim() !== "Densz" ? nombreConfigurado.trim() : null;
    const id = await insertarComprobante(db, { numero, ordenId, creadoPor: usuarioId, laboratorioNombre });
    await marcarFacturada(db, ordenId);
    // La deuda es de la clínica cuando la OT quedó congelada con una
    // (§6) — el profesional que la realizó sigue disponible en
    // orden.odontologoId (siempre se guarda), aunque el titular del
    // movimiento sea la clínica.
    await registrarMovimientoDebe(db, {
      odontologoId: orden.clinicaId ? null : orden.odontologoId,
      clinicaId: orden.clinicaId,
      ordenId,
      importeCentavos: orden.totalCentavos,
      moneda: orden.moneda,
      fecha: orden.fechaTrabajo,
      descripcion: `Orden ${orden.numero}${orden.clinicaId ? ` — ${orden.odontologoNombre}` : ""}`
    });
    return id;
  });

  try {
    await regenerarPdfComprobante(pool, comprobanteId, generarPdf);
  } catch (errorPdf) {
    logger.error(
      `No se pudo generar el PDF del comprobante ${comprobanteId} (orden ${ordenId}) — el comprobante ya quedó guardado y facturado igual, se puede reintentar el PDF desde "Ver PDF".`,
      errorPdf
    );
  }
  return (await obtenerComprobante(pool, comprobanteId))!;
}

export async function anularComprobantePorOrden(db: Queryable, ordenId: number, usuarioId: number): Promise<void> {
  const comprobante = await obtenerComprobantePorOrden(db, ordenId);
  if (comprobante && !comprobante.anulado) {
    await anularComprobanteDb(db, comprobante.id, usuarioId);
  }
  await anularMovimientoDeOrden(db, ordenId);
}
