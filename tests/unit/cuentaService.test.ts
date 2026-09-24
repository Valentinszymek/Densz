import { describe, it, expect, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { registrarPago } from "../../src/main/services/pagoService";
import { listarMediosPago } from "../../src/main/db/repositories/pagosRepo";
import { generarPdfEstadoCuenta, generarPdfEstadoCuentaClinica, calcularBloquesMes } from "../../src/main/services/cuentaService";
import { listarResumenesMensuales } from "../../src/main/db/repositories/resumenesMensualesRepo";

const pdfFalso = async () => {};

describe("cuentaService", () => {
  let ctx: TestDb;

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("el resumen mensual incluye la OT facturada ese mes, con su paciente, prestaciones, comprobante e importe", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    // El comprobante se facturó "ahora" (fecha_emision = densz_now() en la
    // base) — se usa el mes/año reales para no depender de una fecha fija.
    const ahora = new Date();
    let htmlCapturado = "";
    const { pdfPath, resumenes } = await generarPdfEstadoCuenta(
      db,
      odontologoId,
      ahora.getFullYear(),
      ahora.getMonth() + 1,
      usuarioId,
      async (html) => {
        htmlCapturado = html;
      }
    );

    expect(pdfPath).toContain("estado-cuenta");
    expect(htmlCapturado).toContain("Dra. Rinaldi");
    expect(htmlCapturado).toContain("Juan Pérez");
    expect(htmlCapturado).toContain(orden.numero);
    expect(htmlCapturado).toContain("Corona de zirconio");
    expect(htmlCapturado).toContain("9.000,00");

    // Y quedó un registro congelado en resumenes_mensuales.
    expect(resumenes).toHaveLength(1);
    expect(resumenes[0].totalTrabajosCentavos).toBe(900000);
    expect(resumenes[0].saldoPendienteCentavos).toBe(900000);
    expect(resumenes[0].cantidadTrabajos).toBe(1);
  });

  it("el resumen de un mes sin facturación no incluye trabajos de otros meses", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const ahora = new Date();
    let htmlCapturado = "";
    // Un año antes del mes real de facturación: no debería aparecer nada.
    await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear() - 1, ahora.getMonth() + 1, usuarioId, async (html) => {
      htmlCapturado = html;
    });

    expect(htmlCapturado).not.toContain("Juan Pérez");
    expect(htmlCapturado).toContain("Sin trabajos facturados este mes");
  });

  it("rechaza un mes fuera de 1-12 con un mensaje claro", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });

    await expect(calcularBloquesMes(db, { odontologoId, clinicaId: null }, 2026, 13)).rejects.toThrow(/mes/i);
  });

  it("una OT anulada aparece en el detalle pero no suma al total del mes", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);

    const ordenBuena = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, ordenBuena.id, usuarioId, pdfFalso);

    const ordenPorError = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "María López",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [21] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, ordenPorError.id, usuarioId, pdfFalso);
    await anularOrden(db, ordenPorError.id, "cargado por error", usuarioId);

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;

    // Las dos OT están en el detalle (la anulada no "desaparece")...
    expect(bloque.trabajos).toHaveLength(2);
    const anulada = bloque.trabajos.find((t) => t.ordenId === ordenPorError.id)!;
    expect(anulada.anulado).toBe(true);
    expect(anulada.estado).toBe("anulado");
    // ...pero el total del mes solo cuenta la vigente.
    expect(bloque.totalTrabajosCentavos).toBe(900000);
  });

  it("el saldo anterior arrastra lo facturado/pagado antes del período, y el saldo pendiente lo suma correctamente", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
    const medioPagoId = (await listarMediosPago(db))[0].id;

    // Se factura hoy (queda con fecha_emision = ahora) y se registra un
    // pago parcial hoy también — todo "antes" del período que vamos a
    // consultar (el mes que viene).
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);
    await registrarPago(
      db,
      { odontologoId, fecha: new Date().toISOString().slice(0, 10), importeCentavos: 300000, moneda: "ARS", medioPagoId },
      usuarioId
    );

    const ahora = new Date();
    const mesSiguienteIndice0 = (ahora.getMonth() + 1) % 12; // 0-based del mes siguiente
    const anioMesSiguiente = ahora.getMonth() === 11 ? ahora.getFullYear() + 1 : ahora.getFullYear();

    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, anioMesSiguiente, mesSiguienteIndice0 + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;

    expect(bloque.saldoAnteriorCentavos).toBe(600000); // 900000 facturado - 300000 pagado
    expect(bloque.trabajos).toHaveLength(0); // nada facturado en el mes siguiente
    expect(bloque.totalPagosCentavos).toBe(0); // nada pagado en el mes siguiente
    expect(bloque.saldoPendienteCentavos).toBe(600000);
  });

  it("generar el resumen del mismo período dos veces NO sobrescribe: queda una fila nueva por cada generación", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const ahora = new Date();
    const primera = await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, pdfFalso);
    expect(primera.resumenes[0].totalTrabajosCentavos).toBe(900000);

    // Se agrega OTRO trabajo facturado en el mismo mes...
    const orden2 = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "María López",
      fechaTrabajo: "2026-01-02",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [21] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden2.id, usuarioId, pdfFalso);

    // ...y se vuelve a generar el resumen del MISMO período.
    const segunda = await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, pdfFalso);
    expect(segunda.resumenes[0].totalTrabajosCentavos).toBe(1800000);
    expect(segunda.resumenes[0].id).not.toBe(primera.resumenes[0].id);

    // Las DOS generaciones quedan en el historial — la primera no se tocó.
    const historial = await listarResumenesMensuales(db, { odontologoId, clinicaId: null });
    expect(historial).toHaveLength(2);
    const primeraEnHistorial = historial.find((r) => r.id === primera.resumenes[0].id)!;
    expect(primeraEnHistorial.totalTrabajosCentavos).toBe(900000); // sigue congelada como estaba
  });

  it("la cuenta de una clínica muestra la deuda a nombre de la clínica pero conserva el profesional en cada trabajo", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const clinicaId = await crearClinica(db, { nombre: "Dental M3" });
    const odontologoId = await crearOdontologo(db, { nombre: "Juan Cruz Orellano", listaPrecioId: listaId, clinicaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 1000000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    expect(orden.clinicaId).toBe(clinicaId);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const ahora = new Date();
    let htmlCapturado = "";
    const { resumenes } = await generarPdfEstadoCuentaClinica(db, clinicaId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, async (html) => {
      htmlCapturado = html;
    });

    expect(resumenes[0].clinicaId).toBe(clinicaId);
    expect(resumenes[0].odontologoId).toBeNull();
    expect(htmlCapturado).toContain("Dental M3");
    expect(htmlCapturado).toContain("Juan Cruz Orellano"); // el profesional queda visible
    expect(htmlCapturado).toContain("Juan Pérez");

    const bloques = await calcularBloquesMes(db, { odontologoId: null, clinicaId }, ahora.getFullYear(), ahora.getMonth() + 1);
    expect(bloques[0].trabajos[0].profesionalNombre).toBe("Juan Cruz Orellano");
  });

  it("una prestación CON piezas seleccionadas muestra 'piezas N' en el PDF (nunca 'cantidad')", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 50000);

    // 10 piezas dentales reales seleccionadas — cantidad sigue a las piezas,
    // como ya hace la UI, pero son conceptos distintos igual (§17).
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Pichea Liore",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 10, piezasFdi: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const trabajo = bloques.find((b) => b.moneda === "ARS")!.trabajos[0];

    expect(trabajo.prestacionesDetalle).toEqual([{ nombre: "Corona de zirconio", cantidad: 10, cantidadPiezas: 10 }]);

    let htmlCapturado = "";
    await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, async (html) => {
      htmlCapturado = html;
    });
    expect(htmlCapturado).toContain("Corona de zirconio — piezas 10");
    expect(htmlCapturado).not.toContain("cantidad 10");
  });

  it("una prestación SIN piezas (ej. un modelo) muestra 'cantidad N' en vez de piezas, y varias prestaciones quedan cada una en su línea", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    const modeloId = await crearPrestacion(db, { categoriaId, nombre: "Modelo 3D" });
    const tBaseId = await crearPrestacion(db, { categoriaId, nombre: "T base" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 50000);
    await cambiarPrecioEnLista(db, listaId, modeloId, 20000);
    await cambiarPrecioEnLista(db, listaId, tBaseId, 30000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Monica Paez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [
        { prestacionId: coronaId, cantidad: 10, piezasFdi: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22] },
        { prestacionId: modeloId, cantidad: 2, piezasFdi: [] }, // sin piezas — es un servicio, no un diente puntual
        { prestacionId: tBaseId, cantidad: 1, piezasFdi: [31] }
      ],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const trabajo = bloques.find((b) => b.moneda === "ARS")!.trabajos[0];

    // Cada prestación con SU PROPIA cantidad de piezas — nunca la suma de la OT completa.
    expect(trabajo.prestacionesDetalle).toEqual([
      { nombre: "Corona de zirconio", cantidad: 10, cantidadPiezas: 10 },
      { nombre: "Modelo 3D", cantidad: 2, cantidadPiezas: 0 },
      { nombre: "T base", cantidad: 1, cantidadPiezas: 1 }
    ]);

    let htmlCapturado = "";
    await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, async (html) => {
      htmlCapturado = html;
    });
    // Corona: piezas (10). Modelo 3D: sin piezas, usa cantidad (2). T base: 1 sola pieza, no hace falta aclarar "cantidad 1".
    expect(htmlCapturado).toContain("Corona de zirconio — piezas 10<br/>Modelo 3D — cantidad 2<br/>T base — piezas 1");
  });

  it("el precio del resumen mensual usa el precio congelado de la OT, no el precio actual del catálogo", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Rinaldi", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    // El precio de catálogo sube DESPUÉS de facturado — el resumen no debe enterarse.
    await cambiarPrecioEnLista(db, listaId, coronaId, 1500000);

    const ahora = new Date();
    let htmlCapturado = "";
    await generarPdfEstadoCuenta(db, odontologoId, ahora.getFullYear(), ahora.getMonth() + 1, usuarioId, async (html) => {
      htmlCapturado = html;
    });
    expect(htmlCapturado).toContain("9.000,00");
    expect(htmlCapturado).not.toContain("15.000,00");
  });
});
