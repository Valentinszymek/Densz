import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista, crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, editarOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import { obtenerSaldos, obtenerSaldosClinica, listarMovimientos, listarMovimientosClinica } from "../../src/main/db/repositories/movimientosRepo";
import { calcularBloquesMes } from "../../src/main/services/cuentaService";

/**
 * Corrección post-auditoría (§38.1 de docs/AUDITORIA_MAESTRA_DENSZ.md): al
 * editar una OT ya facturada, `editarOrdenConPrestaciones` anula el
 * movimiento DEBE viejo y crea uno nuevo — pero la orden sigue en estado
 * "facturado" (nunca pasa a "anulado"). El detalle mensual de Cuentas
 * (`listarTrabajosFacturadosPorMes`) derivaba antes el flag `anulado` de
 * CADA fila desde `orden.estado` en vez de desde el movimiento propio —
 * si la edición ocurría en el mismo mes de la facturación original, tanto
 * el movimiento viejo (ya anulado) como el nuevo aparecían como filas
 * "activas" y el importe se sumaba dos veces en el total del mes.
 *
 * La corrección usa el flag propio de cada movimiento (`movimientos_cuenta.anulado`)
 * como fuente de verdad — ya se mantenía correctamente en cada mutación,
 * solo no se estaba leyendo. Este archivo prueba específicamente ese
 * escenario (edición dentro del mismo mes de facturación), en todas las
 * variantes pedidas en el bloque de corrección post-auditoría.
 */

const pdfFalso = vi.fn(async () => {});

describe("cuentaService — edición de OT facturada en el mismo mes (bug de doble conteo)", () => {
  let ctx: TestDb & { usuarioId: number };

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as typeof ctx;
    }
  });

  async function prepararOdontologoIndependiente(moneda: "ARS" | "USD" = "ARS") {
    const { db } = ctx;
    const listaId = moneda === "ARS" ? await idListaGeneral(db) : await crearLista(db, { nombre: "USD", moneda: "USD" });
    const odontologoId = await crearOdontologo(db, { nombre: "Dra. Estela Ríos", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "PROTESIS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    const pmmaId = await crearPrestacion(db, { categoriaId, nombre: "PMMA" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
    await cambiarPrecioEnLista(db, listaId, pmmaId, 500000);
    return { listaId, odontologoId, coronaId, pmmaId };
  }

  async function prepararClinica() {
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const clinicaId = await crearClinica(db, { nombre: "Dental M3" });
    const odontologoId = await crearOdontologo(db, { nombre: "Juan Cruz Orellano", listaPrecioId: listaId, clinicaId });
    const categoriaId = await crearCategoria(db, "PROTESIS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    const pmmaId = await crearPrestacion(db, { categoriaId, nombre: "PMMA" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
    await cambiarPrecioEnLista(db, listaId, pmmaId, 500000);
    return { listaId, clinicaId, odontologoId, coronaId, pmmaId };
  }

  async function facturarHoy(odontologoId: number, prestacionId: number, cantidad = 2) {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Pablo Ganzo",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId, cantidad, piezasFdi: [13, 14].slice(0, cantidad) }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);
    return (await obtenerOrden(db, orden.id))!;
  }

  it("CASO REPRODUCIDO — editar una OT facturada en el mismo mes NO duplica la fila ni el importe en el detalle mensual (odontólogo independiente)", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente();

    const orden = await facturarHoy(odontologoId, coronaId); // 2 × $90.000 = $180.000
    expect(orden.totalCentavos).toBe(1800000);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }], // 2 × $50.000 = $100.000
      editadoPor: usuarioId
    });

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;

    // Antes de la corrección: 2 filas "activas" (la vieja y la nueva) y
    // totalTrabajosCentavos = 1.800.000 + 1.000.000 = 2.800.000 (INCORRECTO).
    // Con la corrección: la OT aparece en el detalle UNA vez activa y otra
    // histórica/tachada (nunca desaparece), y el total es solo el vigente.
    const filasDeEstaOt = bloque.trabajos.filter((t) => t.ordenId === orden.id);
    expect(filasDeEstaOt).toHaveLength(2); // vieja (anulada) + nueva (activa) — ambas visibles, nunca se borran
    const activas = filasDeEstaOt.filter((t) => !t.anulado);
    const historicas = filasDeEstaOt.filter((t) => t.anulado);
    expect(activas).toHaveLength(1);
    expect(activas[0].importeCentavos).toBe(1000000);
    expect(historicas).toHaveLength(1);
    expect(historicas[0].importeCentavos).toBe(1800000);

    expect(bloque.totalTrabajosCentavos).toBe(1000000); // NUNCA 2.800.000
    expect(bloque.saldoPendienteCentavos).toBe(1000000);
  });

  it("el movimiento DEBE viejo queda anulado/histórico y el nuevo es el único activo (obtenerSaldos general también correcto)", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente();

    const orden = await facturarHoy(odontologoId, coronaId);
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const movimientos = await listarMovimientos(db, odontologoId);
    const activos = movimientos.filter((m) => !m.anulado);
    const anulados = movimientos.filter((m) => m.anulado);
    expect(activos).toHaveLength(1);
    expect(activos[0].importeCentavos).toBe(1000000);
    expect(anulados).toHaveLength(1);
    expect(anulados[0].importeCentavos).toBe(1800000);

    // El saldo general (fuera de cualquier ventana mensual) también da el valor final único.
    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(1000000);
  });

  it("funciona igual en USD", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente("USD");

    const orden = await facturarHoy(odontologoId, coronaId);
    expect(orden.moneda).toBe("USD");

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "USD")!;
    expect(bloque.totalTrabajosCentavos).toBe(1000000);
    // Nunca aparece un bloque ARS fantasma para un odontólogo 100% USD.
    expect(bloques.find((b) => b.moneda === "ARS")).toBeUndefined();
  });

  it("una OT facturada a través de una clínica: editar en el mismo mes no duplica el detalle de la cuenta de la clínica", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { clinicaId, odontologoId, coronaId, pmmaId } = await prepararClinica();

    const orden = await facturarHoy(odontologoId, coronaId);
    expect(orden.clinicaId).toBe(clinicaId);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId: null, clinicaId }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;

    expect(bloque.totalTrabajosCentavos).toBe(1000000); // nunca 2.800.000
    const activas = bloque.trabajos.filter((t) => t.ordenId === orden.id && !t.anulado);
    expect(activas).toHaveLength(1);
    expect(activas[0].profesionalNombre).toBe("Juan Cruz Orellano"); // el profesional se conserva aunque la deuda sea de la clínica

    const saldosClinica = await obtenerSaldosClinica(db, clinicaId);
    expect(saldosClinica[0].saldoCentavos).toBe(1000000);

    const movimientosClinica = await listarMovimientosClinica(db, clinicaId);
    expect(movimientosClinica.filter((m) => !m.anulado)).toHaveLength(1);
    expect(movimientosClinica.filter((m) => m.anulado)).toHaveLength(1);
  });

  it("una edición que CAMBIA el importe (sube) no duplica el trabajo del mes", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente();

    const orden = await facturarHoy(odontologoId, pmmaId); // 2 × $50.000 = $100.000
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }], // sube a $180.000
      editadoPor: usuarioId
    });

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;
    expect(bloque.totalTrabajosCentavos).toBe(1800000);
    expect(bloque.trabajos.filter((t) => !t.anulado)).toHaveLength(1);
  });

  it("una edición que cambia solo las prestaciones (con el MISMO importe total) no genera un movimiento nuevo ni duplica nada", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente();

    // Corona ×1 ($90.000) + PMMA ×0... en vez, armamos dos combinaciones con igual total: $100.000.
    const orden = await facturarHoy(odontologoId, pmmaId, 2); // 2 × $50.000 = $100.000
    const movimientosAntes = await listarMovimientos(db, odontologoId);
    expect(movimientosAntes).toHaveLength(1);
    const movimientoOriginalId = movimientosAntes[0].id;

    // Se cambia la prestación cargada por error (PMMA → Corona) pero se
    // ajusta la cantidad para que el total total quede IGUAL ($100.000
    // no es divisible exacto por $90.000, así que usamos un manual):
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [13], precioManualCentavos: 1000000 }],
      editadoPor: usuarioId
    });

    const movimientosDespues = await listarMovimientos(db, odontologoId);
    // Mismo importe total → editarOrdenConPrestaciones NO crea un movimiento
    // nuevo (comentario explícito del servicio: "nunca se duplica el DEBE").
    expect(movimientosDespues).toHaveLength(1);
    expect(movimientosDespues[0].id).toBe(movimientoOriginalId);
    expect(movimientosDespues[0].anulado).toBe(false);

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;
    expect(bloque.trabajos).toHaveLength(1);
    expect(bloque.trabajos[0].anulado).toBe(false);
    expect(bloque.totalTrabajosCentavos).toBe(1000000);
    // La prestación mostrada sí refleja la edición, aunque el movimiento contable no haya cambiado.
    expect(bloque.trabajos[0].prestacionesResumen).toContain("Corona de Zirconio");
  });

  it("una OT anulada después de haber sido editada (facturada) sigue funcionando correctamente: todo queda anulado, nada duplicado", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const { odontologoId, coronaId, pmmaId } = await prepararOdontologoIndependiente();

    const orden = await facturarHoy(odontologoId, coronaId);
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    await anularOrden(db, orden.id, "cargado por error, se anula tras la corrección", usuarioId);

    const ahora = new Date();
    const bloques = await calcularBloquesMes(db, { odontologoId, clinicaId: null }, ahora.getFullYear(), ahora.getMonth() + 1);
    const bloque = bloques.find((b) => b.moneda === "ARS")!;

    // Ningún movimiento de esta OT (ni el viejo ni el editado) suma al total.
    expect(bloque.totalTrabajosCentavos).toBe(0);
    const filasDeEstaOt = bloque.trabajos.filter((t) => t.ordenId === orden.id);
    expect(filasDeEstaOt.every((t) => t.anulado)).toBe(true);

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(0); // todo anulado → saldo neto cero, nunca negativo ni duplicado
  });
});
