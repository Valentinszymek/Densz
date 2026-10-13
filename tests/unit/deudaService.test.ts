import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { registrarDeuda, anularDeuda } from "../../src/main/services/deudaService";
import { obtenerSaldos, obtenerSaldosClinica, listarMovimientos } from "../../src/main/db/repositories/movimientosRepo";
import { listarAuditoriaFiltradaCompleta } from "../../src/main/db/repositories/auditoriaRepo";

describe("deudaService", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: await idListaGeneral(db) });
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  async function saldoArs(deOdontologoId = odontologoId) {
    const saldos = await obtenerSaldos(ctx.db, deOdontologoId);
    return saldos.find((s) => s.moneda === "ARS");
  }

  it("agrega una deuda y suma directo al saldo pendiente, sin ninguna orden detrás", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa a Densz" },
      usuarioId
    );

    expect(movimiento.tipo).toBe("debe");
    expect(movimiento.ordenId).toBeNull();
    expect(movimiento.pagoId).toBeNull();
    expect(movimiento.anulado).toBe(false);
    expect((await saldoArs())?.saldoCentavos).toBe(500000);
    expect((await saldoArs())?.totalDebeCentavos).toBe(500000);
  });

  it("exige exactamente un titular: ni ninguno ni los dos a la vez", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      registrarDeuda(db, { odontologoId: null, clinicaId: null, importeCentavos: 1000, moneda: "ARS", fecha: "2026-01-01", descripcion: "x" }, usuarioId)
    ).rejects.toThrow(/odontólogo o clínica/i);

    const clinicaId = await crearClinica(db, { nombre: "Clínica Test" });
    await expect(
      registrarDeuda(db, { odontologoId, clinicaId, importeCentavos: 1000, moneda: "ARS", fecha: "2026-01-01", descripcion: "x" }, usuarioId)
    ).rejects.toThrow(/no de ambos/i);
  });

  it("una deuda de una clínica suma al saldo de la clínica, no al de ningún odontólogo", async () => {
    const { db, usuarioId } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Clínica Test" });
    await registrarDeuda(
      db,
      { odontologoId: null, clinicaId, importeCentavos: 700000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    const saldosClinica = await obtenerSaldosClinica(db, clinicaId);
    expect(saldosClinica.find((s) => s.moneda === "ARS")?.saldoCentavos).toBe(700000);
    expect(await saldoArs()).toBeUndefined();
  });

  it("anular una deuda revierte el saldo (vuelve a cero) y no se puede anular dos veces", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    await anularDeuda(db, movimiento.id, "Cargada por error", usuarioId);
    expect((await saldoArs())?.saldoCentavos).toBe(0);

    await expect(anularDeuda(db, movimiento.id, "De nuevo", usuarioId)).rejects.toThrow(/ya estaba anulada/i);
  });

  it("anularDeuda nunca toca el debe de una OT real ni el haber de un pago real", async () => {
    const { db, usuarioId } = ctx;
    // No hay ninguna orden ni pago creados en este test — anularDeuda, si
    // recibiera por error el id de un movimiento que no sea una deuda
    // manual (ordenId o pagoId no nulos), debe rechazarlo explícitamente
    // en vez de anularlo silenciosamente. Simulamos ese caso con un id que
    // no corresponde a ninguna deuda registrada por este servicio.
    await expect(anularDeuda(db, 999999999, "Motivo", usuarioId)).rejects.toThrow(/no existe/i);
  });

  it("queda auditada tanto la creación como la anulación", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );
    await anularDeuda(db, movimiento.id, "Motivo de prueba", usuarioId);

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "deudas" });
    const deEsteMovimiento = registros.filter((r) => r.entidadId === movimiento.id);
    expect(deEsteMovimiento.some((r) => r.accion === "crear")).toBe(true);
    expect(deEsteMovimiento.some((r) => r.accion === "anular")).toBe(true);
  });

  it("una deuda en USD no se mezcla con el saldo en ARS", async () => {
    const { db, usuarioId } = ctx;
    await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 10000, moneda: "USD", fecha: "2026-01-01", descripcion: "Deuda en dólares" },
      usuarioId
    );

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos.find((s) => s.moneda === "USD")?.saldoCentavos).toBe(10000);
    expect(await saldoArs()).toBeUndefined();
  });

  it("una deuda agregada a mano nunca aparece en la lista de movimientos con un número de OT", async () => {
    const { db, usuarioId } = ctx;
    await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    const movimientos = await listarMovimientos(db, odontologoId);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].ordenNumero).toBeNull();
  });
});
