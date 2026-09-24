import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { registrarPago, anularPago } from "../../src/main/services/pagoService";
import { obtenerSaldos } from "../../src/main/db/repositories/movimientosRepo";
import { listarMediosPago } from "../../src/main/db/repositories/pagosRepo";

describe("pagoService", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let medioPagoId: number;

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: await idListaGeneral(db) });
    medioPagoId = (await listarMediosPago(db))[0].id;
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  async function saldoArs(deOdontologoId = odontologoId) {
    const saldos = await obtenerSaldos(ctx.db, deOdontologoId);
    return saldos.find((s) => s.moneda === "ARS");
  }

  it("registra un pago y genera el movimiento haber correspondiente", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    expect(resultado.creado).toBe(true);
    expect((await saldoArs())?.saldoCentavos).toBe(-500000);
    expect((await saldoArs())?.totalHaberCentavos).toBe(500000);
  });

  it("detecta un posible pago duplicado y NO lo inserta sin confirmación", async () => {
    const { db, usuarioId } = ctx;
    await registrarPago(db, { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId }, usuarioId);
    const segundo = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );

    expect(segundo.creado).toBe(false);
    if (!segundo.creado) expect(segundo.posibleDuplicado).toBe(true);
    expect((await saldoArs())?.totalHaberCentavos).toBe(500000);
  });

  it("permite confirmar explícitamente un pago que parece duplicado", async () => {
    const { db, usuarioId } = ctx;
    await registrarPago(db, { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId }, usuarioId);
    const segundo = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId,
      true
    );
    expect(segundo.creado).toBe(true);
    expect((await saldoArs())?.totalHaberCentavos).toBe(1000000);
  });

  it("anular un pago revierte su movimiento (el saldo vuelve a subir)", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

    await anularPago(db, resultado.pago.id, "Cheque rechazado", usuarioId);
    expect((await saldoArs())?.saldoCentavos).toBe(0);
  });

  it("no permite anular un pago ya anulado", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
    await anularPago(db, resultado.pago.id, "Motivo 1", usuarioId);
    await expect(anularPago(db, resultado.pago.id, "Motivo 2", usuarioId)).rejects.toThrow();
  });

  it("un pago con distinto importe el mismo día NO se marca como duplicado", async () => {
    const { db, usuarioId } = ctx;
    await registrarPago(db, { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId }, usuarioId);
    const segundo = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 300000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    expect(segundo.creado).toBe(true);
  });

  it("un pago en USD no se mezcla con el saldo en ARS: cada moneda tiene su propio saldo", async () => {
    const { db, usuarioId } = ctx;
    const listaDolares = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    const odontologoUsd = await crearOdontologo(db, { nombre: "Dr. USD", listaPrecioId: listaDolares });

    await registrarPago(db, { odontologoId: odontologoUsd, fecha: "2026-01-01", importeCentavos: 10000, moneda: "USD", medioPagoId }, usuarioId);

    const saldos = await obtenerSaldos(db, odontologoUsd);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].moneda).toBe("USD");
    expect(saldos[0].totalHaberCentavos).toBe(10000);
  });
});
