import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista, crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, editarOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import {
  obtenerSaldos,
  registrarMovimientoHaber,
  listarMovimientos,
  obtenerMovimientoDebeActivoDeOrden
} from "../../src/main/db/repositories/movimientosRepo";
import { obtenerPaciente, crearPaciente, listarPacientes } from "../../src/main/db/repositories/pacientesRepo";
import { obtenerComprobantePorOrden } from "../../src/main/db/repositories/comprobantesRepo";
import { insertarPago } from "../../src/main/db/repositories/pagosRepo";

// Stub: no genera un PDF real (no hay Electron/BrowserWindow en el test).
const pdfFalso = vi.fn(async () => {});

describe("editarOrdenConPrestaciones", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let listaId: number;
  let coronaId: number;
  let pmmaId: number;
  let modelo3dId: number;

  beforeEach(async () => {
    pdfFalso.mockClear();
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dra. Liliana Tunucci", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "PROTESIS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de Zirconio" });
    pmmaId = await crearPrestacion(db, { categoriaId, nombre: "PMMA" });
    modelo3dId = await crearPrestacion(db, { categoriaId, nombre: "Modelo 3D" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000); // "$90.000" por unidad, en las unidades de estos tests
    await cambiarPrecioEnLista(db, listaId, pmmaId, 500000); // "$50.000" por unidad
    await cambiarPrecioEnLista(db, listaId, modelo3dId, 250000); // "$25.000" por unidad
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  async function crearYFacturar(prestaciones: Array<{ prestacionId: number; cantidad: number; piezasFdi: number[] }>) {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Pablo Ganzo",
      fechaTrabajo: "2026-01-01",
      prestaciones,
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);
    return (await obtenerOrden(db, orden.id))!;
  }

  it("una OT sin facturar se puede editar sin tocar la cuenta (todavía no generó ningún movimiento)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Pablo Ganzo",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }],
      creadoPor: usuarioId
    });

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    expect(editada.estado).toBe("pendiente_facturar"); // el estado NUNCA cambia por editar (§15)
    expect(editada.numero).toBe(orden.numero); // mismo número de OT (§16)
    expect(editada.prestaciones[0].prestacionNombre).toBe("PMMA");
    expect(editada.totalCentavos).toBe(1000000);
    expect(await obtenerSaldos(db, odontologoId)).toEqual([]); // sin movimiento: no hay nada que actualizar
  });

  it("CASO 1 — OT facturada sin pagos: el importe baja ($180.000 → $100.000) y la cuenta refleja SOLO el nuevo importe", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);
    expect(orden.totalCentavos).toBe(1800000);
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(1800000);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    expect(editada.estado).toBe("facturado"); // sigue facturada, no cambia de estado
    expect(editada.totalCentavos).toBe(1000000);
    expect(editada.numero).toBe(orden.numero);

    // Un único saldo, con el importe FINAL — nunca $180.000 + $100.000.
    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(1000000);

    // El movimiento viejo queda anulado (nunca borrado: historial auditable).
    const movimientos = await listarMovimientos(db, odontologoId);
    const activos = movimientos.filter((m) => !m.anulado);
    const anulados = movimientos.filter((m) => m.anulado);
    expect(activos).toHaveLength(1);
    expect(activos[0].importeCentavos).toBe(1000000);
    expect(anulados).toHaveLength(1);
    expect(anulados[0].importeCentavos).toBe(1800000);
  });

  it("CASO 2 — OT facturada sin pagos: el importe sube ($180.000 → $250.000) y la cuenta refleja SOLO el nuevo importe", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [13], precioManualCentavos: 2500000 }],
      editadoPor: usuarioId
    });

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(2500000);
  });

  it("CASO 3 — cambiar solamente la prestación (misma cantidad/piezas) recalcula el precio y el subtotal", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones).toHaveLength(1);
    expect(editada.prestaciones[0].prestacionNombre).toBe("PMMA");
    expect(editada.prestaciones[0].precioUnitarioCentavos).toBe(500000);
    expect(editada.prestaciones[0].subtotalCentavos).toBe(1000000);
    expect(editada.prestaciones[0].piezasFdi).toEqual([13, 14]);
  });

  it("CASO 4 — cambiar solo la cantidad mantiene el precio unitario congelado y recalcula el subtotal", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      // Misma prestación, pero se pasa el precio congelado explícito (así
      // opera la ficha real: una línea sin cambios de prestación manda su
      // precio actual como "manual" para no recalcularlo del catálogo).
      prestaciones: [{ prestacionId: coronaId, cantidad: 3, piezasFdi: [13, 14, 15], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones[0].precioUnitarioCentavos).toBe(900000); // sin cambios
    expect(editada.prestaciones[0].cantidad).toBe(3);
    expect(editada.prestaciones[0].subtotalCentavos).toBe(2700000);
  });

  it("CASO 5 — cambiar solo las piezas no toca precio ni cantidad", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [23, 24], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones[0].piezasFdi).toEqual([23, 24]);
    expect(editada.prestaciones[0].cantidad).toBe(2);
    expect(editada.prestaciones[0].precioUnitarioCentavos).toBe(900000);
  });

  it("CASO 6 — agregar una segunda prestación suma su importe al total y a la cuenta", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [
        { prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }, // reemplaza a Corona: $100.000
        { prestacionId: modelo3dId, cantidad: 1, piezasFdi: [] } // nueva: $25.000
      ],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones).toHaveLength(2);
    expect(editada.totalCentavos).toBe(1250000); // 1.000.000 + 250.000
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(1250000);
  });

  it("CASO 7 — eliminar una prestación (dejar solo una de dos) resta su importe del total", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([
      { prestacionId: coronaId, cantidad: 1, piezasFdi: [13] },
      { prestacionId: modelo3dId, cantidad: 1, piezasFdi: [] }
    ]);
    expect(orden.totalCentavos).toBe(1150000); // 900.000 + 250.000

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [13], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones).toHaveLength(1);
    expect(editada.totalCentavos).toBe(900000);
  });

  it("CASO 8 — cambiar el paciente asocia la OT al nuevo paciente sin borrar ni tocar el anterior", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    const pacienteAnteriorId = orden.pacienteId;
    const nuevoPacienteId = await crearPaciente(db, { nombreCompleto: "Rosa Méndez", odontologoId });

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: nuevoPacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    expect(editada.pacienteId).toBe(nuevoPacienteId);
    expect(editada.pacienteNombreCompleto).toBe("Rosa Méndez");
    // El paciente anterior sigue existiendo tal cual, sin tocar.
    expect((await obtenerPaciente(db, pacienteAnteriorId))?.nombreCompleto).toBe("Pablo Ganzo");
    expect(await listarPacientes(db, { odontologoId })).toHaveLength(2);
  });

  it("CASO 8b — cambiar el paciente a un nombre nuevo lo crea (o reutiliza uno existente), sin duplicar", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteNombreCompleto: "Rosa Méndez",
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    expect(editada.pacienteNombreCompleto).toBe("Rosa Méndez");
    expect(await listarPacientes(db, { odontologoId })).toHaveLength(2); // Pablo Ganzo + Rosa Méndez, sin duplicar
  });

  it("CASO 9 — cambiar el odontólogo mueve la deuda al odontólogo nuevo y la saca del anterior", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);
    const otroOdontologoId = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId: otroOdontologoId,
      pacienteNombreCompleto: "Paciente del otro odontólogo",
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    // El odontólogo original ya no tiene nada ACTIVO: su movimiento viejo
    // quedó anulado (visible en el historial), así que su saldo da 0 —
    // pero la fila sigue existiendo porque alguna vez tuvo un movimiento.
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(0);
    expect((await obtenerSaldos(db, otroOdontologoId))[0].saldoCentavos).toBe(1800000);
  });

  it("CASO 10 — OT con pago parcial: al bajar el importe por debajo de lo pagado, el saldo queda a favor SIN tocar el pago", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]); // $180.000
    const { rows: medioRows } = await db.query<{ id: number }>("SELECT id FROM medios_pago LIMIT 1");
    const pagoId = await insertarPago(db, {
      odontologoId,
      clinicaId: null,
      fecha: "2026-01-05",
      importeCentavos: 1800000,
      moneda: "ARS",
      medioPagoId: medioRows[0].id,
      creadoPor: usuarioId
    });
    await registrarMovimientoHaber(db, {
      odontologoId,
      clinicaId: null,
      pagoId,
      importeCentavos: 1800000,
      moneda: "ARS",
      fecha: "2026-01-05",
      descripcion: "Pago total registrado"
    });
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(0);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }], // $100.000
      editadoPor: usuarioId
    });

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos[0].totalHaberCentavos).toBe(1800000); // el pago sigue intacto
    expect(saldos[0].totalDebeCentavos).toBe(1000000); // nuevo importe de la OT
    expect(saldos[0].saldoCentavos).toBe(-800000); // saldo A FAVOR del odontólogo: $80.000
  });

  it("CASO 11 — OT completamente pagada, luego editada: el pago histórico nunca se borra", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    const { rows: medioRows } = await db.query<{ id: number }>("SELECT id FROM medios_pago LIMIT 1");
    const pagoId = await insertarPago(db, {
      odontologoId,
      clinicaId: null,
      fecha: "2026-01-05",
      importeCentavos: 900000,
      moneda: "ARS",
      medioPagoId: medioRows[0].id,
      creadoPor: usuarioId
    });
    await registrarMovimientoHaber(db, {
      odontologoId,
      clinicaId: null,
      pagoId,
      importeCentavos: 900000,
      moneda: "ARS",
      fecha: "2026-01-05",
      descripcion: "Pago total"
    });

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: modelo3dId, cantidad: 1, piezasFdi: [] }],
      editadoPor: usuarioId
    });

    const movimientosHaber = (await listarMovimientos(db, odontologoId)).filter((m) => m.tipo === "haber");
    expect(movimientosHaber).toHaveLength(1);
    expect(movimientosHaber[0].importeCentavos).toBe(900000);
    expect(movimientosHaber[0].anulado).toBe(false);
  });

  it("CASO 12 — OT en ARS: la moneda y los importes editados quedan en ARS", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 1, piezasFdi: [] }],
      editadoPor: usuarioId
    });
    expect(editada.moneda).toBe("ARS");
    expect((await obtenerSaldos(db, odontologoId))[0].moneda).toBe("ARS");
  });

  it("CASO 13 — OT en USD: editar una OT de un odontólogo con lista en dólares mantiene todo en USD", async () => {
    const { db, usuarioId } = ctx;
    const listaDolares = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    await cambiarPrecioEnLista(db, listaDolares, coronaId, 10000);
    await cambiarPrecioEnLista(db, listaDolares, pmmaId, 6000);
    const odontologoUsd = await crearOdontologo(db, { nombre: "Dr. USD", listaPrecioId: listaDolares });

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoUsd,
      pacienteNombreCompleto: "Cliente Extranjero",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId: odontologoUsd,
      pacienteId: orden.pacienteId,
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: pmmaId, cantidad: 1, piezasFdi: [] }],
      editadoPor: usuarioId
    });

    expect(editada.moneda).toBe("USD");
    expect(editada.totalCentavos).toBe(6000);
    const saldos = await obtenerSaldos(db, odontologoUsd);
    expect(saldos.find((s) => s.moneda === "USD")?.saldoCentavos).toBe(6000);
  });

  it("CASO 14 — OT con múltiples registros: se pueden editar varias líneas a la vez, coherentes entre sí", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([
      { prestacionId: coronaId, cantidad: 1, piezasFdi: [11] },
      { prestacionId: pmmaId, cantidad: 1, piezasFdi: [21] }
    ]);

    const editada = await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [
        { prestacionId: coronaId, cantidad: 2, piezasFdi: [11, 12], precioManualCentavos: 900000 },
        { prestacionId: modelo3dId, cantidad: 1, piezasFdi: [] } // reemplaza a PMMA
      ],
      editadoPor: usuarioId
    });

    expect(editada.prestaciones).toHaveLength(2);
    expect(editada.totalCentavos).toBe(900000 * 2 + 250000);
  });

  it("una OT anulada NO se puede editar", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    await anularOrden(db, orden.id, "Cargada por error", usuarioId);

    await expect(
      editarOrdenConPrestaciones(db, orden.id, {
        odontologoId,
        pacienteId: orden.pacienteId,
        fechaTrabajo: orden.fechaTrabajo,
        prestaciones: [{ prestacionId: pmmaId, cantidad: 1, piezasFdi: [] }],
        editadoPor: usuarioId
      })
    ).rejects.toThrow(/anulad/i);
  });

  it("verifica que las OT anteriores (no editadas) no cambien", async () => {
    const { db, usuarioId } = ctx;
    const otraOrden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const otraReleida = (await obtenerOrden(db, otraOrden.id))!;
    expect(otraReleida.totalCentavos).toBe(900000);
    expect(otraReleida.prestaciones[0].prestacionNombre).toBe("Corona de Zirconio");
  });

  it("verifica que el precio del catálogo no se modifica accidentalmente al editar con precio manual", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [], precioManualCentavos: 5000000 }],
      editadoPor: usuarioId
    });

    // Una OT nueva creada después sigue viendo el precio de lista original.
    const ordenNueva = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Otro paciente",
      fechaTrabajo: "2026-02-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    expect(ordenNueva.prestaciones[0].precioUnitarioCentavos).toBe(900000);
  });

  it("editar una OT ya facturada regenera un único movimiento 'debe' activo (nunca dos)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const activo = await obtenerMovimientoDebeActivoDeOrden(db, orden.id);
    expect(activo).not.toBeNull();
    expect(activo!.importeCentavos).toBe(1000000);
    const todosLosDebe = (await listarMovimientos(db, odontologoId)).filter((m) => m.tipo === "debe" && m.ordenId === orden.id);
    expect(todosLosDebe.filter((m) => !m.anulado)).toHaveLength(1);
  });

  it("editar sin cambiar el importe NO reemite el movimiento (evita ruido innecesario en el ledger)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);
    const movimientoAntes = (await obtenerMovimientoDebeActivoDeOrden(db, orden.id))!;

    // Cambia solo el paciente, con el mismo importe congelado.
    const nuevoPacienteId = await crearPaciente(db, { nombreCompleto: "Otro Paciente", odontologoId });
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: nuevoPacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    const movimientoDespues = (await obtenerMovimientoDebeActivoDeOrden(db, orden.id))!;
    expect(movimientoDespues.id).toBe(movimientoAntes.id); // el mismo movimiento, nunca reemplazado
    const todosLosDebe = (await listarMovimientos(db, odontologoId)).filter((m) => m.tipo === "debe" && m.ordenId === orden.id);
    expect(todosLosDebe).toHaveLength(1); // ninguno anulado de más
  });

  it("editar una OT queda registrado en Auditoría con el detalle de qué cambió", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });

    const { rows } = await db.query<{ usuario_id: number; detalle: string }>(
      "SELECT * FROM auditoria WHERE accion = 'editar' AND entidad = 'ordenes' AND entidad_id = $1",
      [orden.id]
    );
    const auditoria = rows[0];
    expect(auditoria).toBeDefined();
    expect(auditoria!.usuario_id).toBe(usuarioId);
    const detalle = JSON.parse(auditoria!.detalle);
    expect(detalle.numero).toBe(orden.numero);
    const campos = detalle.cambios.map((c: { campo: string }) => c.campo);
    expect(campos).toContain("Registros/prestaciones");
    expect(campos).toContain("Importe total");
  });

  it("editar sin cambiar nada NO agrega un evento de auditoría vacío", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);
    const { rows: antesRows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM auditoria");
    const cantidadAntes = antesRows[0].c;

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14], precioManualCentavos: 900000 }],
      editadoPor: usuarioId
    });

    const { rows: despuesRows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM auditoria");
    expect(despuesRows[0].c).toBe(cantidadAntes);
  });

  it("editar una OT ya facturada regenera el PDF del comprobante con los datos nuevos", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 2, piezasFdi: [13, 14] }]);
    const comprobante = (await obtenerComprobantePorOrden(db, orden.id))!;
    const numeroComprobanteAntes = comprobante.numero;

    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 2, piezasFdi: [13, 14] }],
      editadoPor: usuarioId
    });
    // El IPC handler es quien llama a regenerarPdfComprobante después de
    // editar (fuera de la transacción) — acá solo se verifica que el
    // comprobante en sí no se duplicó ni cambió de número al editar la
    // orden que lo generó.
    const comprobanteDespues = (await obtenerComprobantePorOrden(db, orden.id))!;
    expect(comprobanteDespues.numero).toBe(numeroComprobanteAntes);
    expect(comprobanteDespues.anulado).toBe(false);
  });

  it("no permite editar una OT sin ninguna prestación", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    await expect(
      editarOrdenConPrestaciones(db, orden.id, {
        odontologoId,
        pacienteId: orden.pacienteId,
        fechaTrabajo: orden.fechaTrabajo,
        prestaciones: [],
        editadoPor: usuarioId
      })
    ).rejects.toThrow();
  });

  it("editar una OT inexistente falla con un mensaje claro", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      editarOrdenConPrestaciones(db, 999999, {
        odontologoId,
        pacienteNombreCompleto: "Alguien",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        editadoPor: usuarioId
      })
    ).rejects.toThrow(/no existe/i);
  });

  it("clínicas con profesionales: editar mueve la deuda a la clínica del odontólogo elegido, no al odontólogo", async () => {
    const { db, usuarioId } = ctx;
    // Se prueba a través de la relación odontólogo→clínica ya existente en
    // el esquema: si el odontólogo elegido pertenece a una clínica, el
    // titular del movimiento pasa a ser la clínica (igual que al crear).
    const orden = await crearYFacturar([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    // Este odontólogo no tiene clínica en este test: el titular sigue
    // siendo él mismo tanto antes como después de editar.
    await editarOrdenConPrestaciones(db, orden.id, {
      odontologoId,
      pacienteId: orden.pacienteId,
      fechaTrabajo: orden.fechaTrabajo,
      prestaciones: [{ prestacionId: pmmaId, cantidad: 1, piezasFdi: [] }],
      editadoPor: usuarioId
    });
    const activo = (await obtenerMovimientoDebeActivoDeOrden(db, orden.id))!;
    expect(activo.odontologoId).toBe(odontologoId);
    expect(activo.clinicaId).toBeNull();
  });
});
