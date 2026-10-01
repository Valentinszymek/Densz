import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";

/**
 * Corrección post-auditoría (docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md, Bloque
 * 1-A) — verificación del flujo de PDF de listas de precios: a diferencia
 * de comprobantesWeb.ts (donde la parte contable ya hizo COMMIT antes de
 * intentar el PDF), listaPreciosWeb.ts no crea NINGÚN registro en la base
 * — es puramente informativo. Por eso, si el generador de PDF falla, no
 * hace falta ningún manejo especial: la función entera debe simplemente
 * rechazar, sin dejar nada a medio guardar ni intentar subir nada a
 * Storage. Esta prueba confirma ese comportamiento (no requirió ningún
 * cambio de código, solo esta verificación).
 */

const subirDocumentoMock = vi.fn();
const descargarDocumentoMock = vi.fn();
vi.mock("../../src/server/storage", () => ({
  subirDocumento: (...args: unknown[]) => subirDocumentoMock(...args),
  descargarDocumento: (...args: unknown[]) => descargarDocumentoMock(...args),
  eliminarDocumento: vi.fn()
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

describe("listaPreciosWeb — comportamiento ante un fallo del generador de PDF", () => {
  let ctx: TestDb & { usuarioId: number };
  let listaId: number;

  beforeEach(async () => {
    subirDocumentoMock.mockReset();
    descargarDocumentoMock.mockReset();
    generarPdfWebMock.mockClear();
    subirDocumentoMock.mockImplementation(async (carpeta: string, nombre: string) => `${carpeta}/${nombre}`);

    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Lista PDF Falla Test", listaPrecioId: listaId });
    void odontologoId;
    const categoriaId = await crearCategoria(db, "PROTESIS LISTA FALLA");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 900000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("caso de éxito: sube el PDF a Storage y devuelve el path del objeto", async () => {
    const { generarListaPreciosWeb } = await import("../../src/server/listaPreciosWeb");
    const resultado = await generarListaPreciosWeb(ctx.db, { listaId });
    expect(resultado.pdfPath).toMatch(/^listas-precio\//);
    expect(subirDocumentoMock).toHaveBeenCalledTimes(1);
  });

  it("caso de fallo del PDF: generarListaPreciosWeb rechaza limpio, nunca intenta subir nada a Storage", async () => {
    generarPdfWebMock.mockImplementationOnce(async () => {
      throw new Error("No se pudo lanzar el navegador (Chromium) — fallo simulado de Puppeteer.");
    });
    const { generarListaPreciosWeb } = await import("../../src/server/listaPreciosWeb");

    await expect(generarListaPreciosWeb(ctx.db, { listaId })).rejects.toThrow(/Puppeteer/);
    expect(subirDocumentoMock).not.toHaveBeenCalled();
  });
});
