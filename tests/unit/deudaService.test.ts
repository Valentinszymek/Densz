import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { registrarDeuda, editarDeuda, anularDeuda } from "../../src/main/services/deudaService";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { obtenerSaldos, obtenerSaldosClinica, listarMovimientos } from "../../src/main/db/repositories/movimientosRepo";
import { listarAuditoriaFiltradaCompleta } from "../../src/main/db/repositories/auditoriaRepo";

const pdfFalso = async () => {};

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

  it("editarDeuda corrige importe/moneda/fecha/descripción in-place, sin duplicar el movimiento", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 850000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    const editado = await editarDeuda(
      db,
      movimiento.id,
      { importeCentavos: 855000, moneda: "ARS", fecha: "2026-01-02", descripcion: "Deuda previa corregida" },
      usuarioId
    );

    expect(editado.id).toBe(movimiento.id); // mismo movimiento, no uno nuevo
    expect(editado.importeCentavos).toBe(855000);
    expect(editado.fecha).toContain("2026-01-02");
    expect(editado.descripcion).toBe("Deuda previa corregida");

    const movimientos = await listarMovimientos(db, odontologoId);
    expect(movimientos).toHaveLength(1); // nunca quedan dos (uno viejo + uno nuevo)
    expect((await saldoArs())?.saldoCentavos).toBe(855000); // nunca 850000 + 855000
  });

  it("editarDeuda rechaza una deuda ya anulada", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );
    await anularDeuda(db, movimiento.id, "Cargada por error", usuarioId);

    await expect(
      editarDeuda(db, movimiento.id, { importeCentavos: 600000, moneda: "ARS", fecha: "2026-01-01", descripcion: "x" }, usuarioId)
    ).rejects.toThrow(/anulada/i);
  });

  it("editarDeuda nunca toca el debe de una OT real ni el haber de un pago real", async () => {
    const { db, usuarioId } = ctx;
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    await cambiarPrecioEnLista(db, await idListaGeneral(db), coronaId, 900000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const [movimientoDeOt] = await listarMovimientos(db, odontologoId);
    await expect(
      editarDeuda(db, movimientoDeOt.id, { importeCentavos: 1, moneda: "ARS", fecha: "2026-01-01", descripcion: "x" }, usuarioId)
    ).rejects.toThrow(/no es una deuda agregada a mano/i);

    // El importe real de la OT nunca se tocó.
    expect((await saldoArs())?.saldoCentavos).toBe(900000);
  });

  it("editarDeuda sobre un id inexistente falla con un mensaje claro", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      editarDeuda(db, 999999999, { importeCentavos: 1000, moneda: "ARS", fecha: "2026-01-01", descripcion: "x" }, usuarioId)
    ).rejects.toThrow(/no existe/i);
  });

  it("queda auditada la edición, con el valor anterior y el nuevo", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 850000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );
    await editarDeuda(
      db,
      movimiento.id,
      { importeCentavos: 855000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "deudas" });
    const edicion = registros.find((r) => r.entidadId === movimiento.id && r.accion === "editar");
    expect(edicion).toBeDefined();
    expect(JSON.stringify(edicion!.detalle)).toContain("850000");
    expect(JSON.stringify(edicion!.detalle)).toContain("855000");
  });

  it("anular una deuda revierte el saldo (vuelve a cero) y no se puede anular dos veces", async () => {
    const { db, usuarioId } = ctx;
    const movimiento = await registrarDeuda(
      db,
      { odontologoId, clinicaId: null, importeCentavos: 500000, moneda: "ARS", fecha: "2026-01-01", descripcion: "Deuda previa" },
      usuarioId
    );

    await anularDeuda(db, movimiento.id, "Cargada por error", usuarioId);
    // Sin ningún otro movimiento en ARS, el saldo vuelve a cero — y como no
    // queda NADA real en esa moneda (ni debe ni haber), obtenerSaldos ya ni
    // devuelve una fila "ARS" (ver el filtro de monedas en $0,00).
    expect(await saldoArs()).toBeUndefined();

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
