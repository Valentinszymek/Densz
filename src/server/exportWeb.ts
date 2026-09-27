import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { exportarDatos, type TipoExport, type FormatoExport } from "../main/services/exportService";
import { generarPdfDesdeHtmlWeb } from "./pdf";
import type { RangoFechas, FiltroAuditoriaDto } from "../shared/types/entities";

/**
 * Capa de orquestación EXCLUSIVA del servidor web para exportaciones —
 * reutiliza exportarDatos()/exportService.ts sin modificar su lógica de
 * datos (mismas columnas, mismos formatos, mismo criterio ARS/USD que ya
 * usaba Desktop). La única diferencia real es la entrega: Desktop le
 * pregunta al usuario dónde guardar el archivo (dialog.showSaveDialog);
 * acá no hay ningún diálogo nativo posible — se escribe a un archivo
 * temporal LOCAL DEL SERVIDOR (nunca visible para el cliente), se lee ese
 * archivo a memoria, se borra el temporal, y el buffer resultante se sirve
 * como una descarga HTTP normal (Content-Disposition: attachment) — el
 * navegador se encarga de la descarga, no Densz.
 */

const CONTENT_TYPES: Record<FormatoExport, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf"
};

export interface OpcionesExportWeb {
  odontologoId?: number;
  clinicaId?: number;
  rango?: RangoFechas;
  filtroAuditoria?: FiltroAuditoriaDto;
}

export async function generarExportWeb(
  db: Pool | PoolClient,
  tipo: TipoExport,
  formato: FormatoExport,
  opciones: OpcionesExportWeb = {}
): Promise<{ buffer: Buffer; contentType: string }> {
  const rutaTemp = path.join(os.tmpdir(), `densz-export-${crypto.randomUUID()}.${formato}`);
  try {
    await exportarDatos(db, tipo, formato, rutaTemp, opciones, formato === "pdf" ? generarPdfDesdeHtmlWeb : undefined);
    const buffer = fs.readFileSync(rutaTemp);
    return { buffer, contentType: CONTENT_TYPES[formato] };
  } finally {
    fs.rmSync(rutaTemp, { force: true });
  }
}

/** Nombre de archivo seguro para Content-Disposition — nunca usa el
 * `nombreSugerido` crudo que manda el cliente (podría traer comillas,
 * saltos de línea, barras, etc.). */
export function nombreArchivoSeguro(nombreSugerido: string, formato: FormatoExport): string {
  const base = nombreSugerido.replace(/[^a-zA-Z0-9._ -]/g, "").trim() || "export";
  return `${base}.${formato}`;
}
