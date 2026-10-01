import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { generarComprobante, regenerarPdfComprobante } from "../../src/main/services/comprobanteService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import { obtenerSaldos } from "../../src/main/db/repositories/movimientosRepo";
import { setPdfPath } from "../../src/main/db/repositories/comprobantesRepo";

/**
 * Corrección post-auditoría (docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md, Bloque
 * 1-A). Causa raíz real del problema reportado en producción: Puppeteer
 * no podía arrancar Chromium en Railway (librerías de sistema nunca
 * instaladas — ver Dockerfile nuevo), y cuando el paso de generar el PDF
 * fallaba, `comprobanteService.generarComprobante` dejaba que ese error
 * tapara el éxito real de la operación contable (que ya había hecho
 * COMMIT antes de llegar al PDF) — el usuario veía un error genérico
 * aunque el trabajo, el comprobante y el movimiento DEBE ya estaban
 * guardados.
 *
 * Esta suite prueba, SIN depender de Puppeteer real (se inyecta un
 * generador de PDF falso que puede "funcionar" o "fallar" a propósito):
 * - el caso de éxito completo (ya cubierto en otros tests, se repite acá
 *   mínimamente como control);
 * - el caso de fallo del PDF: nunca se lanza un error que tape el éxito
 *   contable, nunca se duplica el comprobante ni el movimiento al
 *   reintentar, y la recuperación posterior (regenerar con un generador
 *   que sí funciona) deja todo correcto;
 * - el bug encontrado al revisar el flujo completo de "Ver PDF": un
 *   pdf_path que ya es una ruta de Storage no se reutiliza como ruta de
 *   disco al regenerar.
 */

const pdfOk = vi.fn(async () => {});
const pdfQueFalla = vi.fn(async () => {
  throw new Error("No se pudo lanzar el navegador (Chromium) — fallo simulado de Puppeteer.");
});

// Mocks de Storage y del generador de PDF web para la segunda suite (no
// deben vivir dentro del describe: vi.mock se hoistea al tope del archivo,
// así que las variables que su factory usa también tienen que declararse
// acá afuera — mismo patrón que cuentasWebStorage.test.ts).
const subirDocumentoMock = vi.fn();
const descargarDocumentoMock = vi.fn();
const eliminarDocumentoMock = vi.fn();
vi.mock("../../src/server/storage", () => ({
  subirDocumento: (...args: unknown[]) => subirDocumentoMock(...args),
  descargarDocumento: (...args: unknown[]) => descargarDocumentoMock(...args),
  eliminarDocumento: (...args: unknown[]) => eliminarDocumentoMock(...args)
}));

const generarPdfWebMock = vi.fn(async (_html: string, outputPath: string) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, "PDF-FALSO-PARA-TEST");
});
vi.mock("../../src/server/pdf", () => ({
  generarPdfDesdeHtmlWeb: (...args: [string, string]) => generarPdfWebMock(...args)
}));

describe("comprobanteService.generarComprobante — el trabajo guardado nunca queda tapado por un fallo del PDF", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let coronaId: number;

  beforeEach(async () => {
    pdfOk.mockClear();
    pdfQueFalla.mockClear();
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. PDF Falla Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "PROTESIS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  async function crearOrdenSinFacturar() {
    const { db, usuarioId } = ctx;
    return crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente PDF Falla",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
  }

  it("caso de éxito: el PDF se genera bien, el comprobante queda con pdfPath", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSinFacturar();
    const comprobante = await generarComprobante(db, orden.id, usuarioId, pdfOk);
    expect(comprobante.pdfPath).toBeTruthy();
    expect(pdfOk).toHaveBeenCalledTimes(1);
  });

  it("caso de fallo del PDF: generarComprobante NO lanza error, devuelve el comprobante con pdfPath null", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSinFacturar();

    const comprobante = await generarComprobante(db, orden.id, usuarioId, pdfQueFalla);

    expect(comprobante).toBeDefined();
    expect(comprobante.numero).toMatch(/^CB-/);
    expect(comprobante.pdfPath).toBeNull();
    expect(pdfQueFalla).toHaveBeenCalledTimes(1);
  });

  it("caso de fallo del PDF: la orden queda facturada y el movimiento DEBE existe igual (nunca se tapa el éxito contable)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSinFacturar();

    await generarComprobante(db, orden.id, usuarioId, pdfQueFalla);

    const ordenActualizada = await obtenerOrden(db, orden.id);
    expect(ordenActualizada?.estado).toBe("facturado");

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(900000);
  });

  it("caso de fallo del PDF: reintentar generarComprobante sobre la MISMA orden rechaza con el mensaje de siempre, nunca duplica el comprobante ni el movimiento", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSinFacturar();

    await generarComprobante(db, orden.id, usuarioId, pdfQueFalla);

    await expect(generarComprobante(db, orden.id, usuarioId, pdfOk)).rejects.toThrow(/ya tiene un comprobante generado/i);

    // Un único movimiento, un único saldo — el reintento no duplicó nada.
    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(900000);
  });

  it("recuperación: después de un fallo de PDF, regenerarPdfComprobante con un generador que SÍ funciona deja el comprobante con su PDF", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSinFacturar();

    const comprobanteConFallo = await generarComprobante(db, orden.id, usuarioId, pdfQueFalla);
    expect(comprobanteConFallo.pdfPath).toBeNull();

    // "Ver PDF" / reintentar: mismo comprobante, mismo número — nunca se crea uno nuevo.
    const rutaRegenerada = await regenerarPdfComprobante(db, comprobanteConFallo.id, pdfOk);
    expect(rutaRegenerada).toBeTruthy();
    expect(pdfOk).toHaveBeenCalledTimes(1);
  });
});

describe("comprobantesWeb — mismo comportamiento del lado Web (Storage y generador de PDF simulados)", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let coronaId: number;

  beforeEach(async () => {
    subirDocumentoMock.mockReset();
    descargarDocumentoMock.mockReset();
    eliminarDocumentoMock.mockReset();
    generarPdfWebMock.mockClear();
    subirDocumentoMock.mockImplementation(async (carpeta: string, nombre: string) => `${carpeta}/${nombre}`);

    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. PDF Falla Web Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "PROTESIS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("caso de éxito completo: generarComprobanteWeb sube el PDF a Storage y pdfPath apunta ahí", async () => {
    const { db, usuarioId } = ctx;
    const { generarComprobanteWeb } = await import("../../src/server/comprobantesWeb");
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Web OK",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });

    const comprobante = await generarComprobanteWeb(db, orden.id, usuarioId);
    expect(comprobante.pdfPath).toBe(`comprobantes/${comprobante.numero}.pdf`);
    expect(subirDocumentoMock).toHaveBeenCalledTimes(1);
  });

  it("caso de fallo del PDF: generarComprobanteWeb NO lanza, devuelve el comprobante con pdfPath null, y NUNCA intenta subir nada a Storage", async () => {
    const { db, usuarioId } = ctx;
    generarPdfWebMock.mockImplementationOnce(async () => {
      throw new Error("No se pudo lanzar el navegador (Chromium) — fallo simulado de Puppeteer.");
    });
    const { generarComprobanteWeb } = await import("../../src/server/comprobantesWeb");
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Web Falla",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });

    const comprobante = await generarComprobanteWeb(db, orden.id, usuarioId);

    expect(comprobante.pdfPath).toBeNull();
    expect(subirDocumentoMock).not.toHaveBeenCalled();

    const ordenActualizada = await obtenerOrden(db, orden.id);
    expect(ordenActualizada?.estado).toBe("facturado");
  });

  it('bug corregido: un pdf_path que YA es una ruta de Storage (no de disco) se limpia antes de regenerar, en vez de reutilizarse como ruta de disco', async () => {
    const { db, usuarioId } = ctx;
    const { regenerarComprobanteWeb } = await import("../../src/server/comprobantesWeb");
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Ruta Storage",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    const comprobante = await generarComprobante(db, orden.id, usuarioId, pdfOk);
    // Simula el estado real post-migración: pdf_path ya es una clave de
    // Storage (como quedaron los comprobantes CB-00000071/73 en
    // producción), nunca una ruta de disco.
    await setPdfPath(db, comprobante.id, `comprobantes/${comprobante.numero}.pdf`);
    generarPdfWebMock.mockClear();

    const rutaFinal = await regenerarComprobanteWeb(db, comprobante.id);

    // generarPdfDesdeHtmlWeb se llamó con una ruta de DISCO real (contiene
    // una carpeta tipo "data/comprobantes" o similar, nunca exactamente
    // "comprobantes/CB-....pdf" sin más) — nunca la clave de Storage tal cual.
    expect(generarPdfWebMock).toHaveBeenCalledTimes(1);
    const rutaUsadaParaEscribir = generarPdfWebMock.mock.calls[0][1] as string;
    expect(rutaUsadaParaEscribir).not.toBe(`comprobantes/${comprobante.numero}.pdf`);
    expect(rutaFinal).toBe(`comprobantes/${comprobante.numero}.pdf`);
    expect(subirDocumentoMock).toHaveBeenCalledTimes(1);
  });
});
