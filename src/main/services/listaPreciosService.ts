import type { Queryable } from "../db/types";
import path from "node:path";
import { listarPrestacionesDeLista, obtenerLista } from "../db/repositories/listasPrecioRepo";
import { obtenerOdontologo } from "../db/repositories/odontologosRepo";
import { getConfigMultiple } from "../db/repositories/configRepo";
import { generarHtmlListaPrecios } from "./listaPreciosHtmlTemplate";
import { generarPdfDesdeHtml } from "./pdfService";
import { getUserDataDir } from "../utils/appPaths";
import { DenszError } from "../utils/errors";

export interface OpcionesListaPrecios {
  /** Modo "lista general": una lista de precios directa. Excluyente con `odontologoId`. */
  listaId?: number;
  /** Modo "odontólogo": usa SU lista de precios personalizada asignada. Excluyente con `listaId`. */
  odontologoId?: number;
}

type GenerarPdf = (html: string, outputPath: string) => Promise<void>;

function nombreArchivoSeguro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Genera el PDF de una lista de precios lista para mandarle al odontólogo —
 * puramente informativo: no crea comprobante, no toca precios ni trabajos,
 * no afecta cuentas corrientes. Usa siempre el precio ACTUALMENTE vigente
 * (nunca uno histórico) en la lista elegida — o en la lista personalizada
 * del odontólogo, si se pidió por ese lado, respetando así sus precios
 * personalizados en vez de los generales.
 */
export async function generarListaPreciosPdf(
  db: Queryable,
  opciones: OpcionesListaPrecios,
  generarPdf: GenerarPdf = generarPdfDesdeHtml
): Promise<{ pdfPath: string }> {
  if (!opciones.listaId && !opciones.odontologoId) {
    throw new DenszError("Elegí una lista de precios o un odontólogo.");
  }
  if (opciones.listaId && opciones.odontologoId) {
    throw new DenszError("Elegí una lista de precios o un odontólogo, no ambos.");
  }

  let listaId: number;
  let odontologoNombre: string | null = null;
  let nombreArchivoBase: string;

  if (opciones.odontologoId) {
    const odontologo = await obtenerOdontologo(db, opciones.odontologoId);
    if (!odontologo) throw new DenszError("El odontólogo no existe.");
    listaId = odontologo.listaPrecioId;
    odontologoNombre = odontologo.nombre;
    nombreArchivoBase = `lista-precios-${nombreArchivoSeguro(odontologo.nombre)}`;
  } else {
    listaId = opciones.listaId!;
    nombreArchivoBase = "lista-precios";
  }

  const lista = await obtenerLista(db, listaId);
  if (!lista) throw new DenszError("La lista de precios no existe.");

  // Solo activas y con precio configurado: nunca se le manda al odontólogo
  // una prestación descontinuada o sin precio (§ "sin información técnica
  // innecesaria").
  const itemsCrudos = await listarPrestacionesDeLista(db, listaId, true);
  const items = itemsCrudos.filter((it) => it.precioCentavos !== null);

  const config = await getConfigMultiple(db, ["laboratorio.nombre", "laboratorio.direccion", "laboratorio.telefono"]);

  const html = generarHtmlListaPrecios({
    laboratorio: {
      nombre: config["laboratorio.nombre"] || "Densz",
      direccion: config["laboratorio.direccion"] || "",
      telefono: config["laboratorio.telefono"] || ""
    },
    odontologoNombre,
    moneda: lista.moneda,
    generadoEn: new Date().toISOString(),
    items
  });

  const pdfPath = path.join(getUserDataDir(), "listas-precios", `${nombreArchivoBase}-${Date.now()}.pdf`);
  await generarPdf(html, pdfPath);
  return { pdfPath };
}
