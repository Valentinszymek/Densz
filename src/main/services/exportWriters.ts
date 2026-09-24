import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { generarPdfDesdeHtml } from "./pdfService";

export interface ColumnaExport {
  clave: string;
  titulo: string;
}

function valorCelda(fila: Record<string, unknown>, clave: string): string | number {
  const valor = fila[clave];
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return valor as string | number;
}

export function escribirCsv(filas: Record<string, unknown>[], columnas: ColumnaExport[], destino: string): void {
  const registros = filas.map((fila) => {
    const registro: Record<string, string | number> = {};
    for (const col of columnas) registro[col.titulo] = valorCelda(fila, col.clave);
    return registro;
  });
  const csv = stringify(registros, { header: true, columns: columnas.map((c) => c.titulo) });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  // BOM para que Excel abra el UTF-8 (tildes, ñ) correctamente en Windows.
  fs.writeFileSync(destino, `﻿${csv}`, "utf-8");
}

export async function escribirXlsx(
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  destino: string,
  hoja = "Datos"
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(hoja);
  worksheet.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(c.titulo.length + 4, 14) }));
  worksheet.getRow(1).font = { bold: true };
  for (const fila of filas) {
    const registro: Record<string, unknown> = {};
    for (const col of columnas) registro[col.clave] = valorCelda(fila, col.clave);
    worksheet.addRow(registro);
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await workbook.xlsx.writeFile(destino);
}

export async function escribirPdfTabla(
  titulo: string,
  subtitulo: string,
  filas: Record<string, unknown>[],
  columnas: ColumnaExport[],
  destino: string
): Promise<void> {
  const encabezados = columnas.map((c) => `<th>${c.titulo}</th>`).join("");
  const cuerpo = filas
    .map((fila) => `<tr>${columnas.map((c) => `<td>${valorCelda(fila, c.clave)}</td>`).join("")}</tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0E0E10; margin: 0; padding: 32px 36px; font-size: 11.5px; }
  h1 { font-size: 16px; margin: 0 0 2px; border-bottom: 2px solid #C9A24B; padding-bottom: 10px; }
  .sub { color: #777; font-size: 11px; margin: 8px 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #777; border-bottom: 1px solid #ddd; padding: 6px 5px; }
  td { padding: 6px 5px; border-bottom: 1px solid #f0f0f0; }
</style></head>
<body>
  <h1>${titulo}</h1>
  <div class="sub">${subtitulo}</div>
  <table><thead><tr>${encabezados}</tr></thead><tbody>${cuerpo}</tbody></table>
</body></html>`;

  await generarPdfDesdeHtml(html, destino);
}
