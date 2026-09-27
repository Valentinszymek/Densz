import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generarPdfDesdeHtmlWeb, cerrarNavegadorPdfWeb } from "../../src/server/pdf";
import { generarHtmlComprobante, ANCHO_PAGINA_COMPROBANTE_MM, ALTO_PAGINA_COMPROBANTE_MM } from "../../src/main/services/comprobanteHtmlTemplate";
import { generarHtmlEstadoCuenta } from "../../src/main/services/estadoCuentaHtmlTemplate";

const PUNTOS_POR_MM = 72 / 25.4;

/** Lee el /MediaBox real del PDF (en puntos PostScript, 1/72 pulgada) —
 * verifica el tamaño de página que Chromium efectivamente grabó en el
 * archivo, no solo el que se le pidió a la API. */
function leerMediaBoxPdfMm(buffer: Buffer): { anchoMm: number; altoMm: number } {
  const texto = buffer.toString("latin1");
  const match = texto.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!match) throw new Error("No se encontró /MediaBox en el PDF generado.");
  const [, x0, y0, x1, y1] = match.map(Number);
  return {
    anchoMm: (x1 - x0) / PUNTOS_POR_MM,
    altoMm: (y1 - y0) / PUNTOS_POR_MM
  };
}

/**
 * Prueba el generador de PDF del servidor web (Puppeteer) contra las
 * plantillas HTML REALES de Densz (mismas que usa el escritorio), pero con
 * datos de ejemplo fabricados — nunca contra la base de datos, nunca datos
 * reales del laboratorio. Verifica que:
 * - el archivo resultante es un PDF real y no está vacío;
 * - el /MediaBox real del PDF (no solo el parámetro pedido) coincide con el
 *   tamaño de página esperado: ~109.982×150.114mm para el comprobante, A4
 *   (210×297mm) para el estado de cuenta.
 */
describe("server/pdf (Puppeteer)", () => {
  const dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "densz-pdf-test-"));

  afterAll(async () => {
    await cerrarNavegadorPdfWeb();
    fs.rmSync(dirTemporal, { recursive: true, force: true });
  });

  it("genera un PDF real de comprobante (tamaño ~110x150mm) a partir de la plantilla real de Densz", async () => {
    const html = generarHtmlComprobante({
      laboratorioNombre: "Laboratorio de Prueba",
      direccion: "Calle Falsa 123",
      telefono: "11-0000-0000",
      comprobante: { numero: "CB-TEST0001", fechaEmision: "2026-01-01" },
      orden: {
        numero: "OT-TEST0001",
        fechaTrabajo: "2026-01-01",
        moneda: "ARS",
        totalCentavos: 500000,
        prestaciones: [
          { nombre: "Corona de prueba", piezasFdi: [16], cantidad: 1, precioUnitarioCentavos: 500000, subtotalCentavos: 500000 }
        ]
      },
      odontologoNombre: "Dr. Prueba",
      clinicaNombre: null,
      pacienteNombreCompleto: "Paciente de Prueba"
    });

    const outputPath = path.join(dirTemporal, "comprobante-test.pdf");
    await generarPdfDesdeHtmlWeb(html, outputPath, {
      width: ANCHO_PAGINA_COMPROBANTE_MM / 25.4,
      height: ALTO_PAGINA_COMPROBANTE_MM / 25.4
    });

    expect(fs.existsSync(outputPath)).toBe(true);
    const buffer = fs.readFileSync(outputPath);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.byteLength).toBeGreaterThan(500);

    const { anchoMm, altoMm } = leerMediaBoxPdfMm(buffer);
    expect(anchoMm).toBeCloseTo(ANCHO_PAGINA_COMPROBANTE_MM, 0);
    expect(altoMm).toBeCloseTo(ALTO_PAGINA_COMPROBANTE_MM, 0);
  });

  it("genera un PDF real de estado de cuenta (A4) a partir de la plantilla real de Densz", async () => {
    const html = generarHtmlEstadoCuenta({
      laboratorio: { nombre: "Laboratorio de Prueba", direccion: "Calle Falsa 123", telefono: "11-0000-0000" },
      titularNombre: "Dr. Prueba",
      mostrarProfesional: false,
      generadoEn: new Date().toISOString(),
      anio: 2026,
      mes: 1,
      bloques: [
        {
          moneda: "ARS",
          trabajos: [],
          pagosDelMes: [],
          saldoAnteriorCentavos: 0,
          totalTrabajosCentavos: 500000,
          totalPagosCentavos: 0,
          saldoPendienteCentavos: 500000
        }
      ]
    });

    const outputPath = path.join(dirTemporal, "estado-cuenta-test.pdf");
    await generarPdfDesdeHtmlWeb(html, outputPath, "A4");

    expect(fs.existsSync(outputPath)).toBe(true);
    const buffer = fs.readFileSync(outputPath);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.byteLength).toBeGreaterThan(500);

    const { anchoMm, altoMm } = leerMediaBoxPdfMm(buffer);
    expect(anchoMm).toBeCloseTo(210, 0);
    expect(altoMm).toBeCloseTo(297, 0);
  });
});
