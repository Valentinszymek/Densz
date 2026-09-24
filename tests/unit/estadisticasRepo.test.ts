import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { registrarPago } from "../../src/main/services/pagoService";
import { listarMediosPago } from "../../src/main/db/repositories/pagosRepo";

const pdfFalso = vi.fn(async () => {});
import {
  obtenerKpisPeriodo,
  ingresosPorOdontologo,
  trabajosPorCategoria,
  obtenerEvolucion,
  rankingOdontologos,
  rankingClinicas,
  prestacionesRanking,
  saldosPendientesTop
} from "../../src/main/db/repositories/estadisticasRepo";

describe("estadisticasRepo", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let listaId: number;
  let prestacionId: number;

  function crearOrdenSimple(fechaTrabajo: string, cantidad = 1) {
    return crearOrdenConPrestaciones(ctx.db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Gómez",
      fechaTrabajo,
      prestaciones: [{ prestacionId, cantidad, piezasFdi: [] }],
      creadoPor: ctx.usuarioId
    });
  }

  async function arsDelPeriodo(rango: { desde: string; hasta: string }) {
    const kpis = await obtenerKpisPeriodo(ctx.db, rango);
    return kpis.porMoneda.find((k) => k.moneda === "ARS");
  }

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 1000000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("cuenta trabajos y suma el total solo dentro del rango de fechas", async () => {
    await crearOrdenSimple("2026-01-05");
    await crearOrdenSimple("2026-02-15");

    const kpis = await obtenerKpisPeriodo(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadTrabajos).toBe(1);
    expect((await arsDelPeriodo({ desde: "2026-01-01", hasta: "2026-01-31" }))?.totalRegistradoCentavos).toBe(1000000);
  });

  it("una orden anulada no cuenta en los KPIs del período", async () => {
    const orden = await crearOrdenSimple("2026-01-05");
    await anularOrden(ctx.db, orden.id, "Error", ctx.usuarioId);

    const kpis = await obtenerKpisPeriodo(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadTrabajos).toBe(0);
  });

  it("el pendiente de cobro es un saldo global, no acotado al período", async () => {
    const { db } = ctx;
    const orden = await crearOrdenSimple("2025-06-01");
    await db.query(
      "INSERT INTO movimientos_cuenta (odontologo_id, tipo, orden_id, importe_centavos, moneda, fecha, descripcion) VALUES ($1, 'debe', $2, 1000000, 'ARS', '2025-06-01', 'x')",
      [odontologoId, orden.id]
    );

    const pendiente = (await arsDelPeriodo({ desde: "2026-01-01", hasta: "2026-01-31" }))?.pendienteCobroCentavos;
    expect(pendiente).toBe(1000000);
  });

  it("suma los pagos recibidos dentro del período", async () => {
    const { db, usuarioId } = ctx;
    const medioPagoId = (await listarMediosPago(db))[0].id;
    await registrarPago(db, { odontologoId, fecha: "2026-01-10", importeCentavos: 200000, moneda: "ARS", medioPagoId }, usuarioId);
    await registrarPago(db, { odontologoId, fecha: "2026-03-10", importeCentavos: 999999, moneda: "ARS", medioPagoId }, usuarioId);

    expect((await arsDelPeriodo({ desde: "2026-01-01", hasta: "2026-01-31" }))?.pagosRecibidosCentavos).toBe(200000);
  });

  it("separa los KPIs por moneda: un odontólogo en USD no se mezcla con los de ARS", async () => {
    const { db, usuarioId } = ctx;
    const { rows } = await db.query<{ id: number }>("INSERT INTO listas_precio (nombre, moneda) VALUES ('Dólares', 'USD') RETURNING id");
    const listaUsdId = rows[0].id;
    await db.query("INSERT INTO lista_precio_items (lista_id, prestacion_id, precio_centavos) VALUES ($1, $2, 10000)", [
      listaUsdId,
      prestacionId
    ]);
    const odontologoUsd = await crearOdontologo(db, { nombre: "Dr. USD", listaPrecioId: listaUsdId });

    await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoUsd,
      pacienteNombreCompleto: "Cliente USD",
      fechaTrabajo: "2026-01-05",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await crearOrdenSimple("2026-01-05");

    const kpis = await obtenerKpisPeriodo(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    const ars = kpis.porMoneda.find((k) => k.moneda === "ARS");
    const usd = kpis.porMoneda.find((k) => k.moneda === "USD");
    expect(ars?.totalRegistradoCentavos).toBe(1000000);
    expect(usd?.totalRegistradoCentavos).toBe(10000);
  });

  it("agrupa ingresos por odontólogo dentro del período", async () => {
    const { db, usuarioId } = ctx;
    const otroOdontologo = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });

    await crearOrdenSimple("2026-01-05", 2);
    await crearOrdenConPrestaciones(db, {
      odontologoId: otroOdontologo,
      pacienteNombreCompleto: "Ana Ruiz",
      fechaTrabajo: "2026-01-06",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const ingresos = await ingresosPorOdontologo(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(ingresos.length).toBe(2);
    expect(ingresos[0].totalCentavos).toBe(2000000); // el mayor primero
  });

  it("agrupa trabajos por categoría", async () => {
    await crearOrdenSimple("2026-01-05");
    const porCategoria = await trabajosPorCategoria(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(porCategoria.length).toBe(1);
    expect(porCategoria[0].categoriaNombre).toBe("CORONAS");
  });

  it("cuenta odontólogos y clínicas distintos con trabajos en el período", async () => {
    const { db, usuarioId } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Clínica Sonrisa" });
    const odontologoClinica = await crearOdontologo(db, { nombre: "Dr. Clínica", listaPrecioId: listaId, clinicaId });

    await crearOrdenSimple("2026-01-05");
    await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoClinica,
      pacienteNombreCompleto: "Paciente Clínica",
      fechaTrabajo: "2026-01-06",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const kpis = await obtenerKpisPeriodo(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadOdontologosConTrabajos).toBe(2);
    expect(kpis.cantidadClinicasConTrabajos).toBe(1);
  });

  it("evolución: agrupa por día cuando el rango es corto, y separa ARS de USD", async () => {
    const { db, usuarioId } = ctx;
    await crearOrdenSimple("2026-01-05");
    await crearOrdenSimple("2026-01-05");
    await crearOrdenSimple("2026-01-06");

    const medioPagoId = (await listarMediosPago(db))[0].id;
    await registrarPago(db, { odontologoId, fecha: "2026-01-05", importeCentavos: 300000, moneda: "ARS", medioPagoId }, usuarioId);

    const evolucion = await obtenerEvolucion(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(evolucion.granularidad).toBe("dia");

    const dia5 = evolucion.puntos.find((p) => p.bucket === "2026-01-05" && p.moneda === "ARS");
    expect(dia5?.cantidadTrabajos).toBe(2);
    expect(dia5?.facturadoCentavos).toBe(2000000);
    expect(dia5?.cobradoCentavos).toBe(300000);

    const dia6 = evolucion.puntos.find((p) => p.bucket === "2026-01-06" && p.moneda === "ARS");
    expect(dia6?.cantidadTrabajos).toBe(1);
    expect(dia6?.cobradoCentavos).toBe(0);
  });

  it("evolución: agrupa por mes cuando el rango es largo (más de ~2 meses)", async () => {
    await crearOrdenSimple("2026-01-05");
    await crearOrdenSimple("2026-03-10");

    const evolucion = await obtenerEvolucion(ctx.db, { desde: "2026-01-01", hasta: "2026-06-30" });
    expect(evolucion.granularidad).toBe("mes");
    expect(evolucion.puntos.map((p) => p.bucket).sort()).toEqual(["2026-01", "2026-03"]);
  });

  it("ranking de odontólogos: trabajos/facturado del período + saldo pendiente actual, separado por moneda", async () => {
    const { db, usuarioId } = ctx;
    const otroOdontologo = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });
    await crearOrdenSimple("2026-01-05", 2);
    await crearOrdenConPrestaciones(db, {
      odontologoId: otroOdontologo,
      pacienteNombreCompleto: "Paciente Otro",
      fechaTrabajo: "2026-01-06",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    const medioPagoId = (await listarMediosPago(db))[0].id;
    await registrarPago(db, { odontologoId, fecha: "2026-01-10", importeCentavos: 500000, moneda: "ARS", medioPagoId }, usuarioId);

    const ranking = await rankingOdontologos(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(ranking).toHaveLength(2);

    const filaPrincipal = ranking.find((r) => r.odontologoId === odontologoId)!;
    expect(filaPrincipal.cantidadTrabajos).toBe(1);
    expect(filaPrincipal.facturadoCentavos).toBe(2000000);
    expect(filaPrincipal.cobradoCentavos).toBe(500000);
    expect(filaPrincipal.moneda).toBe("ARS");
  });

  it("ranking de clínicas: la deuda y la facturación quedan a nombre de la clínica", async () => {
    const { db, usuarioId } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Clínica Test" });
    const odontologoClinica = await crearOdontologo(db, { nombre: "Dr. Clínica", listaPrecioId: listaId, clinicaId });
    await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoClinica,
      pacienteNombreCompleto: "Paciente X",
      fechaTrabajo: "2026-01-05",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const ranking = await rankingClinicas(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(ranking).toHaveLength(1);
    expect(ranking[0].clinicaNombre).toBe("Clínica Test");
    expect(ranking[0].cantidadTrabajos).toBe(1);
    expect(ranking[0].facturadoCentavos).toBe(1000000);
  });

  it("prestaciones más realizadas y facturación por prestación usan el nombre congelado, no el catálogo actual", async () => {
    await crearOrdenSimple("2026-01-05", 2);

    const ranking = await prestacionesRanking(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(ranking).toHaveLength(1);
    expect(ranking[0].prestacionNombre).toBe("Corona");
    expect(ranking[0].cantidad).toBe(2);
    expect(ranking[0].totalCentavos).toBe(2000000);
  });

  it("saldos pendientes top: combina odontólogos y clínicas, ordenados de mayor a menor", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenSimple("2025-06-01");
    await db.query(
      "INSERT INTO movimientos_cuenta (odontologo_id, tipo, orden_id, importe_centavos, moneda, fecha, descripcion) VALUES ($1, 'debe', $2, 700000, 'ARS', '2025-06-01', 'x')",
      [odontologoId, orden.id]
    );

    const clinicaId = await crearClinica(db, { nombre: "Clínica Deudora" });
    const medioPagoId = (await listarMediosPago(db))[0].id;
    const { rows: pagoRows } = await db.query<{ id: number }>(
      "INSERT INTO pagos (clinica_id, fecha, importe_centavos, moneda, medio_pago_id, creado_por) VALUES ($1, '2025-06-01', 1, 'ARS', $2, $3) RETURNING id",
      [clinicaId, medioPagoId, usuarioId]
    );
    await db.query(
      "INSERT INTO movimientos_cuenta (clinica_id, tipo, pago_id, importe_centavos, moneda, fecha, descripcion) VALUES ($1, 'debe', $2, 900000, 'ARS', '2025-06-01', 'x')",
      [clinicaId, pagoRows[0].id]
    );

    const top = await saldosPendientesTop(db, 10);
    expect(top[0]).toMatchObject({ tipo: "clinica", nombre: "Clínica Deudora", saldoCentavos: 900000 });
    expect(top[1]).toMatchObject({ tipo: "odontologo", nombre: "Dr. Test", saldoCentavos: 700000 });
  });

  it("cuenta el total de piezas dentales trabajadas en el período (no confunde con cantidad de servicio)", async () => {
    const { db, usuarioId } = ctx;
    await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Con Piezas",
      fechaTrabajo: "2026-01-05",
      prestaciones: [{ prestacionId, cantidad: 3, piezasFdi: [11, 12, 13] }],
      creadoPor: usuarioId
    });
    // Una prestación sin piezas (ej. un modelo) no debe sumar piezas falsas.
    await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Sin Piezas",
      fechaTrabajo: "2026-01-06",
      prestaciones: [{ prestacionId, cantidad: 2, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const kpis = await obtenerKpisPeriodo(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadPiezasTotal).toBe(3);
  });

  it("calcula el ticket promedio por moneda sin dividir por cero cuando no hay trabajos en esa moneda", async () => {
    await crearOrdenSimple("2026-01-05"); // $10.000,00 (1000000 centavos), 1 trabajo
    await crearOrdenSimple("2026-01-06"); // otro de $10.000,00

    const ars = await arsDelPeriodo({ desde: "2026-01-01", hasta: "2026-01-31" });
    expect(ars?.cantidadTrabajos).toBe(2);
    expect(ars?.ticketPromedioCentavos).toBe(1000000); // (1000000+1000000)/2

    const kpis = await obtenerKpisPeriodo(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    const usd = kpis.porMoneda.find((k) => k.moneda === "USD");
    // Sin ningún trabajo en USD en este período: 0, nunca NaN ni un error.
    expect(usd === undefined || usd.ticketPromedioCentavos === 0).toBe(true);
  });

  it("desglosa la cantidad de OT del período por estado (pendiente/facturado/anulado), sin importes", async () => {
    const { db, usuarioId } = ctx;
    await crearOrdenSimple("2026-01-05"); // queda pendiente_facturar
    await crearOrdenSimple("2026-01-06"); // queda pendiente_facturar
    const facturada = await crearOrdenSimple("2026-01-07");
    await generarComprobante(db, facturada.id, usuarioId, pdfFalso);
    const anulada = await crearOrdenSimple("2026-01-08");
    await anularOrden(db, anulada.id, "Cargada por error", usuarioId);

    const kpis = await obtenerKpisPeriodo(db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadPendientesFacturar).toBe(2);
    expect(kpis.cantidadFacturados).toBe(1);
    expect(kpis.cantidadAnulados).toBe(1);
  });

  it("el desglose por estado es 0/0/0 cuando no hay trabajos en el período (nunca undefined ni NaN)", async () => {
    const kpis = await obtenerKpisPeriodo(ctx.db, { desde: "2026-01-01", hasta: "2026-01-31" });
    expect(kpis.cantidadPendientesFacturar).toBe(0);
    expect(kpis.cantidadFacturados).toBe(0);
    expect(kpis.cantidadAnulados).toBe(0);
  });
});
