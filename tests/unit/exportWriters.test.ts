import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escribirCsv, escribirXlsx } from "../../src/main/services/exportWriters";
import ExcelJS from "exceljs";

describe("exportWriters", () => {
  const archivosTemporales: string[] = [];

  afterEach(() => {
    for (const f of archivosTemporales) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    archivosTemporales.length = 0;
  });

  it("escribirCsv genera un CSV real con encabezados traducidos y BOM UTF-8", () => {
    const destino = path.join(os.tmpdir(), `densz-export-${Date.now()}.csv`);
    archivosTemporales.push(destino);

    escribirCsv(
      [{ nombre: "Dr. Pérez", activo: true }, { nombre: "Dra. Gómez", activo: false }],
      [
        { clave: "nombre", titulo: "Nombre" },
        { clave: "activo", titulo: "Activo" }
      ],
      destino
    );

    const contenido = fs.readFileSync(destino, "utf-8");
    expect(contenido).toContain("Nombre,Activo");
    expect(contenido).toContain("Dr. Pérez,Sí");
    expect(contenido).toContain("Dra. Gómez,No");
  });

  it("escribirXlsx genera un archivo Excel real y legible", async () => {
    const destino = path.join(os.tmpdir(), `densz-export-${Date.now()}.xlsx`);
    archivosTemporales.push(destino);

    await escribirXlsx(
      [{ nombre: "Dr. Pérez", total: 220000 }],
      [
        { clave: "nombre", titulo: "Nombre" },
        { clave: "total", titulo: "Total" }
      ],
      destino
    );

    expect(fs.existsSync(destino)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destino);
    const hoja = workbook.worksheets[0];
    expect(hoja.getRow(1).getCell(1).value).toBe("Nombre");
    expect(hoja.getRow(2).getCell(1).value).toBe("Dr. Pérez");
    expect(hoja.getRow(2).getCell(2).value).toBe(220000);
  });
});
