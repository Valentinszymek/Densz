import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { registrarPago, editarPago, anularPago } from "../../src/main/services/pagoService";
import { registrarDeuda } from "../../src/main/services/deudaService";
import { obtenerSaldos, listarMovimientos } from "../../src/main/db/repositories/movimientosRepo";
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
    // Sin nada real pendiente (el único movimiento quedó anulado),
    // obtenerSaldos ya ni devuelve una fila ARS — ver el filtro de monedas
    // en $0,00 (2026-10-29).
    expect(await saldoArs()).toBeUndefined();
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

  it("guarda el mes elegido (periodoAnio/periodoMes) cuando se manda", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-11-15", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
    // Pagado en noviembre (fecha), pero asignado a octubre — justo el
    // caso real que motivó esto: cobrar tarde algo de un mes anterior.
    expect(resultado.pago.periodoAnio).toBe(2026);
    expect(resultado.pago.periodoMes).toBe(10);
    expect(resultado.pago.fecha).toBe("2026-11-15");
  });

  it("un pago sin mes elegido queda con periodoAnio/periodoMes en null (compatibilidad con lo ya cargado)", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
    expect(resultado.pago.periodoAnio).toBeNull();
    expect(resultado.pago.periodoMes).toBeNull();
  });

  it("rechaza mandar el año sin el mes (o viceversa)", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      registrarPago(db, { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026 }, usuarioId)
    ).rejects.toThrow();
  });

  it("rechaza un mes fuera de 1-12", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      registrarPago(
        db,
        { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 13 },
        usuarioId
      )
    ).rejects.toThrow();
  });

  it("editar un pago lo actualiza EN EL LUGAR — nunca anula uno y crea otro", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-11-15", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 11 },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

    const editado = await editarPago(
      db,
      resultado.pago.id,
      { fecha: "2026-11-15", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
      usuarioId
    );
    expect(editado.periodoMes).toBe(10);

    // Sigue siendo UN solo movimiento — no quedó ninguna fila fantasma.
    const movimientos = await listarMovimientos(db, odontologoId);
    const haberes = movimientos.filter((m) => m.tipo === "haber" && !m.anulado);
    expect(haberes).toHaveLength(1);
    expect(haberes[0].periodoMes).toBe(10);
  });

  it("no permite editar un pago ya anulado", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
    await anularPago(db, resultado.pago.id, "Motivo", usuarioId);

    await expect(
      editarPago(db, resultado.pago.id, { fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId }, usuarioId)
    ).rejects.toThrow();
  });

  it("editar rechaza un periodoMes fuera de 1-12", async () => {
    const { db, usuarioId } = ctx;
    const resultado = await registrarPago(
      db,
      { odontologoId, fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

    await expect(
      editarPago(
        db,
        resultado.pago.id,
        { fecha: "2026-01-01", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 15 },
        usuarioId
      )
    ).rejects.toThrow();
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

  describe("sobrante automático (el pago excede lo pendiente del mes elegido)", () => {
    it("un pago exacto al pendiente del mes no genera ningún pago adicional", async () => {
      const { db, usuarioId } = ctx;
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 900000, moneda: "ARS", fecha: "2026-10-05", descripcion: "Trabajo de octubre" },
        usuarioId
      );
      const resultado = await registrarPago(
        db,
        { odontologoId, fecha: "2026-10-20", importeCentavos: 900000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
        usuarioId
      );
      if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
      expect(resultado.pago.importeCentavos).toBe(900000);
      expect(resultado.pagosAdicionales).toHaveLength(0);
    });

    it("el sobrante del mes elegido pasa solo al próximo mes con saldo pendiente, con referencia clara", async () => {
      const { db, usuarioId } = ctx;
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 900000, moneda: "ARS", fecha: "2026-10-05", descripcion: "Trabajo de octubre" },
        usuarioId
      );
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 200000, moneda: "ARS", fecha: "2026-11-05", descripcion: "Trabajo de noviembre" },
        usuarioId
      );

      // Paga $1.000.000 "para hacer redondo" sobre una deuda de octubre de
      // $900.000 — exactamente el ejemplo que dio el dueño del producto.
      const resultado = await registrarPago(
        db,
        { odontologoId, fecha: "2026-10-20", importeCentavos: 1000000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
        usuarioId
      );
      if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

      expect(resultado.pago.importeCentavos).toBe(900000);
      expect(resultado.pago.periodoAnio).toBe(2026);
      expect(resultado.pago.periodoMes).toBe(10);

      expect(resultado.pagosAdicionales).toHaveLength(1);
      const sobrante = resultado.pagosAdicionales[0];
      expect(sobrante.importeCentavos).toBe(100000);
      expect(sobrante.periodoAnio).toBe(2026);
      expect(sobrante.periodoMes).toBe(11);
      expect(sobrante.referencia).toBe("Sobrante de Octubre 2026");

      // Noviembre queda con $100.000 pendiente ($200.000 - $100.000 ya cubiertos).
      const movimientos = await listarMovimientos(db, odontologoId);
      const haberNoviembre = movimientos.find((m) => m.tipo === "haber" && m.periodoMes === 11 && !m.anulado);
      expect(haberNoviembre?.importeCentavos).toBe(100000);
    });

    it("si noviembre ya está todo pago, el sobrante salta directo a diciembre", async () => {
      const { db, usuarioId } = ctx;
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 900000, moneda: "ARS", fecha: "2026-10-05", descripcion: "Trabajo de octubre" },
        usuarioId
      );
      // Noviembre: deuda y pago ya se cancelan entre sí — queda en $0.
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 200000, moneda: "ARS", fecha: "2026-11-05", descripcion: "Trabajo de noviembre" },
        usuarioId
      );
      await registrarPago(
        db,
        { odontologoId, fecha: "2026-11-05", importeCentavos: 200000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 11 },
        usuarioId
      );
      await registrarDeuda(
        db,
        { odontologoId, importeCentavos: 300000, moneda: "ARS", fecha: "2026-12-05", descripcion: "Trabajo de diciembre" },
        usuarioId
      );

      const resultado = await registrarPago(
        db,
        { odontologoId, fecha: "2026-10-20", importeCentavos: 1000000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
        usuarioId
      );
      if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

      expect(resultado.pago.importeCentavos).toBe(900000);
      // El tramo de noviembre nunca se crea (estaba en $0) — salta directo
      // a diciembre, sin dejar ninguna fila de $0 en el medio.
      expect(resultado.pagosAdicionales).toHaveLength(1);
      expect(resultado.pagosAdicionales[0].periodoMes).toBe(12);
      expect(resultado.pagosAdicionales[0].importeCentavos).toBe(100000);
      expect(resultado.pagosAdicionales[0].referencia).toBe("Sobrante de Octubre 2026");
    });

    it("si no encuentra ningún mes con pendiente, el sobrante vuelve al mes elegido como adelanto", async () => {
      const { db, usuarioId } = ctx;
      // El mes elegido (octubre) ya está totalmente al día (sin deuda
      // ninguna) y no hay NINGÚN mes futuro con pendiente — el pago entero
      // tiene que quedar en octubre, como si no existiera el reparto.
      const resultado = await registrarPago(
        db,
        { odontologoId, fecha: "2026-10-20", importeCentavos: 500000, moneda: "ARS", medioPagoId, periodoAnio: 2026, periodoMes: 10 },
        usuarioId
      );
      if (!resultado.creado) throw new Error("no debería marcarse como duplicado");

      expect(resultado.pago.importeCentavos).toBe(500000);
      expect(resultado.pago.periodoMes).toBe(10);
      expect(resultado.pagosAdicionales).toHaveLength(0);
    });

    it("sin mes elegido (periodoAnio/periodoMes ausentes), el pago se registra entero sin ningún reparto", async () => {
      const { db, usuarioId } = ctx;
      const resultado = await registrarPago(
        db,
        { odontologoId, fecha: "2026-10-20", importeCentavos: 500000, moneda: "ARS", medioPagoId },
        usuarioId
      );
      if (!resultado.creado) throw new Error("no debería marcarse como duplicado");
      expect(resultado.pago.importeCentavos).toBe(500000);
      expect(resultado.pagosAdicionales).toHaveLength(0);
    });
  });
});
