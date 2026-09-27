import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import {
  crearResumenMensual,
  obtenerResumenMensual,
  listarResumenesMensuales
} from "../../src/main/db/repositories/resumenesMensualesRepo";

const AHORA = new Date();
const ANIO_TEST = AHORA.getUTCFullYear();
const MES_TEST = AHORA.getUTCMonth() + 1;

const pdfFalso = async () => {};

// --- Mocks de Storage y del generador de PDF web: nunca tocan Supabase ni
// Puppeteer reales (ver Fase 8D — el único bucket real es el de
// PRODUCCIÓN, así que la lógica se prueba con fakes; solo el "smoke test"
// mínimo al final de la fase toca Storage real, autosupervisado). ---
const subirDocumentoMock = vi.fn();
const descargarDocumentoMock = vi.fn();
const eliminarDocumentoMock = vi.fn();
vi.mock("../../src/server/storage", () => ({
  subirDocumento: (...args: unknown[]) => subirDocumentoMock(...args),
  descargarDocumento: (...args: unknown[]) => descargarDocumentoMock(...args),
  eliminarDocumento: (...args: unknown[]) => eliminarDocumentoMock(...args)
}));

const generarPdfDesdeHtmlWebMock = vi.fn(async (_html: string, outputPath: string) => {
  const fs = await import("node:fs");
  fs.writeFileSync(outputPath, "PDF-FALSO-PARA-TEST");
});
vi.mock("../../src/server/pdf", () => ({
  generarPdfDesdeHtmlWeb: (...args: [string, string]) => generarPdfDesdeHtmlWebMock(...args)
}));

describe("cuentasWeb (Storage con mocks — nunca toca Supabase real)", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let clinicaId: number;

  beforeEach(async () => {
    subirDocumentoMock.mockReset();
    descargarDocumentoMock.mockReset();
    eliminarDocumentoMock.mockReset();
    generarPdfDesdeHtmlWebMock.mockClear();
    subirDocumentoMock.mockImplementation(async (carpeta: string, nombre: string) => `${carpeta}/${nombre}`);

    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Cuentas Storage Test", listaPrecioId: listaId });
    clinicaId = await crearClinica(db, { nombre: "Clinica Cuentas Storage Test" });
    const odontologoClinicaId = await crearOdontologo(db, {
      nombre: "Dr. Cuentas Storage Test Clinica",
      listaPrecioId: listaId,
      clinicaId
    });

    const categoriaId = await crearCategoria(db, "CATEGORIA STORAGE CUENTAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Prestacion Storage Cuentas" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 400000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Storage Cuentas",
      fechaTrabajo: "2026-03-05",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: ctx.usuarioId
    });
    await generarComprobante(db, orden.id, ctx.usuarioId, pdfFalso);

    const ordenClinica = await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoClinicaId,
      pacienteNombreCompleto: "Paciente Storage Cuentas Clinica",
      fechaTrabajo: "2026-03-05",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [21] }],
      creadoPor: ctx.usuarioId
    });
    await generarComprobante(db, ordenClinica.id, ctx.usuarioId, pdfFalso);
  }, 30000);

  afterEach(async () => {
    await ctx.finalizar();
  });

  // --- A: todo correcto ---
  it("A: genera resumen de ODONTÓLOGO, sube el PDF y actualiza pdf_path al object path", async () => {
    const { generarResumenOdontologoWeb } = await import("../../src/server/cuentasWeb");
    const resumenes = await generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId);

    expect(resumenes.length).toBeGreaterThan(0);
    expect(subirDocumentoMock).toHaveBeenCalledTimes(1);
    expect(subirDocumentoMock).toHaveBeenCalledWith("estados-cuenta", expect.stringMatching(/^estado-cuenta-odontologo-.*\.pdf$/), expect.any(Buffer));

    for (const r of resumenes) {
      expect(r.pdfPath).toMatch(/^estados-cuenta\//);
      expect(r.pdfPath).not.toMatch(/^[A-Za-z]:\\/); // nunca una ruta Windows
      expect(r.pdfPath).not.toMatch(/^\//); // nunca una ruta absoluta de servidor
      const releido = await obtenerResumenMensual(ctx.db, r.id);
      expect(releido?.pdfPath).toBe(r.pdfPath);
    }
  });

  it("A: genera resumen de CLÍNICA, sube el PDF y actualiza pdf_path al object path", async () => {
    const { generarResumenClinicaWeb } = await import("../../src/server/cuentasWeb");
    const resumenes = await generarResumenClinicaWeb(ctx.db, clinicaId, ANIO_TEST, MES_TEST, ctx.usuarioId);

    expect(resumenes.length).toBeGreaterThan(0);
    expect(resumenes[0].clinicaId).toBe(clinicaId);
    expect(resumenes[0].odontologoId).toBeNull();
    expect(subirDocumentoMock).toHaveBeenCalledWith("estados-cuenta", expect.stringMatching(/^estado-cuenta-clinica-.*\.pdf$/), expect.any(Buffer));
    for (const r of resumenes) {
      expect(r.pdfPath).toMatch(/^estados-cuenta\//);
    }
  });

  it("A: descargarPdfResumenWeb devuelve el buffer real leído de Storage", async () => {
    const { generarResumenOdontologoWeb, descargarPdfResumenWeb } = await import("../../src/server/cuentasWeb");
    const resumenes = await generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId);
    descargarDocumentoMock.mockResolvedValueOnce(Buffer.from("contenido-pdf-simulado"));

    const buffer = await descargarPdfResumenWeb(ctx.db, resumenes[0].id);
    expect(buffer.toString()).toBe("contenido-pdf-simulado");
    expect(descargarDocumentoMock).toHaveBeenCalledWith(resumenes[0].pdfPath);
  });

  // --- B: falla la generación del PDF ---
  it("B: si el PDF falla, no queda ningún resumen creado ni se llama a Storage", async () => {
    generarPdfDesdeHtmlWebMock.mockRejectedValueOnce(new Error("Puppeteer explotó (simulado)"));
    const { generarResumenOdontologoWeb } = await import("../../src/server/cuentasWeb");

    await expect(generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId)).rejects.toThrow();

    expect(subirDocumentoMock).not.toHaveBeenCalled();
    const resumenes = await listarResumenesMensuales(ctx.db, { odontologoId, clinicaId: null });
    expect(resumenes).toHaveLength(0);
  });

  // --- C: la subida a Storage falla — CORREGIDO: nunca debe sobrevivir un
  // resumen Web con un path local (no hay "regenerar" para resúmenes, a
  // diferencia de Comprobantes) — se revierte la generación entera. ---
  it("C: si Storage falla al subir, NO queda ningún resumen Web nuevo (ni con path local, ni de ningún tipo)", async () => {
    subirDocumentoMock.mockRejectedValueOnce(new Error("Storage caído (simulado)"));
    const { generarResumenOdontologoWeb } = await import("../../src/server/cuentasWeb");

    await expect(generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId)).rejects.toThrow(
      "Storage caído (simulado)"
    );

    // No sobrevivió ninguna fila — ni con path local, ni apuntando a Storage.
    const resumenes = await listarResumenesMensuales(ctx.db, { odontologoId, clinicaId: null });
    expect(resumenes).toHaveLength(0);
    // Nunca se llegó a subir nada que limpiar como huérfano (la subida fue
    // justamente la que falló).
    expect(eliminarDocumentoMock).not.toHaveBeenCalled();
  });

  // --- D: Storage sube OK pero el UPDATE de pdf_path falla — CORREGIDO:
  // nunca debe sobrevivir un resumen Web apuntando a un objeto inexistente
  // (se borró) ni a un path local — se revierte la generación entera. ---
  it("D: si el UPDATE de pdf_path falla tras subir, se borra EXACTAMENTE el objeto recién subido y NO queda ningún resumen (ni con path local, ni roto), sin afectar otras generaciones", async () => {
    const { generarResumenOdontologoWeb } = await import("../../src/server/cuentasWeb");

    // Generación de CONTROL, exitosa, en otro período — para confirmar que
    // la reversión de abajo nunca la toca.
    const mesControl = MES_TEST === 1 ? 2 : MES_TEST - 1;
    const control = await generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, mesControl, ctx.usuarioId);
    subirDocumentoMock.mockClear();
    eliminarDocumentoMock.mockClear();

    const repo = await import("../../src/main/db/repositories/resumenesMensualesRepo");
    const actualizarSpy = vi.spyOn(repo, "actualizarPdfPathResumen").mockRejectedValueOnce(new Error("UPDATE falló (simulado)"));

    await expect(generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId)).rejects.toThrow(
      "UPDATE falló (simulado)"
    );

    // No sobrevivió ningún resumen del período que falló.
    const resumenesDelPeriodoFallido = await listarResumenesMensuales(ctx.db, { odontologoId, clinicaId: null });
    const idsFallidos = resumenesDelPeriodoFallido.filter((r) => r.mes === MES_TEST);
    expect(idsFallidos).toHaveLength(0);

    // Se subió un objeto...
    expect(subirDocumentoMock).toHaveBeenCalledTimes(1);
    const rutaSubida = await subirDocumentoMock.mock.results[0].value;
    // ...y se borró EXACTAMENTE ese mismo objeto, uno solo — nunca el de la
    // generación de control.
    expect(eliminarDocumentoMock).toHaveBeenCalledTimes(1);
    expect(eliminarDocumentoMock).toHaveBeenCalledWith(rutaSubida);
    expect(rutaSubida).not.toBe(control[0].pdfPath);

    // La generación de control sigue intacta, sin tocar.
    const controlReleido = await obtenerResumenMensual(ctx.db, control[0].id);
    expect(controlReleido?.pdfPath).toBe(control[0].pdfPath);
    expect(controlReleido?.pdfPath).toMatch(/^estados-cuenta\//);

    actualizarSpy.mockRestore();
  });

  // --- E: el resumen apunta a un pdf_path de Storage, pero el objeto no existe ---
  it("E: descargar un resumen cuyo objeto ya no existe en Storage da un error controlado, no rompe la app", async () => {
    const idResumen = await crearResumenMensual(ctx.db, { odontologoId, clinicaId: null }, {
      anio: ANIO_TEST,
      mes: MES_TEST,
      moneda: "ARS",
      saldoAnteriorCentavos: 0,
      totalTrabajosCentavos: 100000,
      totalPagosCentavos: 0,
      saldoPendienteCentavos: 100000,
      cantidadTrabajos: 1,
      pdfPath: "estados-cuenta/objeto-que-no-existe.pdf",
      generadoPor: ctx.usuarioId
    });
    descargarDocumentoMock.mockRejectedValueOnce(new Error("No se pudo descargar el documento de Storage: object not found"));

    const { descargarPdfResumenWeb } = await import("../../src/server/cuentasWeb");
    await expect(descargarPdfResumenWeb(ctx.db, idResumen)).rejects.toThrow();
  });

  // --- F: resumen sin pdf_path ---
  it("F: un resumen sin pdf_path da un error controlado al intentar descargarlo", async () => {
    const idResumen = await crearResumenMensual(ctx.db, { odontologoId, clinicaId: null }, {
      anio: ANIO_TEST,
      mes: MES_TEST,
      moneda: "ARS",
      saldoAnteriorCentavos: 0,
      totalTrabajosCentavos: 100000,
      totalPagosCentavos: 0,
      saldoPendienteCentavos: 100000,
      cantidadTrabajos: 1,
      pdfPath: null,
      generadoPor: ctx.usuarioId
    });

    const { descargarPdfResumenWeb } = await import("../../src/server/cuentasWeb");
    await expect(descargarPdfResumenWeb(ctx.db, idResumen)).rejects.toThrow(/no se encontró el pdf/i);
    expect(descargarDocumentoMock).not.toHaveBeenCalled();
  });

  // --- F bis: un pdf_path que NO es del prefijo estados-cuenta/ (ej. ruta
  // local vieja, de antes de esta integración, o de Desktop) tampoco se
  // intenta bajar de Storage — nunca se le pasa a Storage algo que no sea
  // exactamente ese prefijo (§8). ---
  it("F bis: un resumen con pdf_path local (no-Storage) da error controlado, nunca intenta Storage con ese path", async () => {
    const idResumen = await crearResumenMensual(ctx.db, { odontologoId, clinicaId: null }, {
      anio: ANIO_TEST,
      mes: MES_TEST,
      moneda: "ARS",
      saldoAnteriorCentavos: 0,
      totalTrabajosCentavos: 100000,
      totalPagosCentavos: 0,
      saldoPendienteCentavos: 100000,
      cantidadTrabajos: 1,
      pdfPath: "C:\\Users\\alguien\\AppData\\estados-cuenta\\viejo.pdf",
      generadoPor: ctx.usuarioId
    });

    const { descargarPdfResumenWeb } = await import("../../src/server/cuentasWeb");
    await expect(descargarPdfResumenWeb(ctx.db, idResumen)).rejects.toThrow();
    expect(descargarDocumentoMock).not.toHaveBeenCalled();
  });

  // --- §12: duplicados — dos generaciones del mismo período nunca
  // comparten nombre de archivo, ni siquiera si caen en el mismo
  // milisegundo (Date.now() solo no alcanza — ver el fix en cuentasWeb.ts). ---
  it("duplicados: generar el mismo período dos veces produce dos object paths distintos, nunca se pisan", async () => {
    const { generarResumenOdontologoWeb } = await import("../../src/server/cuentasWeb");
    const [primera, segunda] = await Promise.all([
      generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId),
      generarResumenOdontologoWeb(ctx.db, odontologoId, ANIO_TEST, MES_TEST, ctx.usuarioId)
    ]);

    expect(primera[0].id).not.toBe(segunda[0].id);
    expect(primera[0].pdfPath).not.toBe(segunda[0].pdfPath);
    expect(subirDocumentoMock).toHaveBeenCalledTimes(2);
    const nombres = subirDocumentoMock.mock.calls.map((c) => c[1]);
    expect(new Set(nombres).size).toBe(2); // nunca el mismo nombre de archivo
  });
});
