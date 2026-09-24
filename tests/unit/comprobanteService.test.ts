import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import { obtenerSaldos } from "../../src/main/db/repositories/movimientosRepo";

// Stub: no genera un PDF real (no hay Electron/BrowserWindow en el test),
// solo simula la escritura para poder probar el resto de la lógica.
const pdfFalso = vi.fn(async () => {});

describe("comprobanteService", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let coronaId: number;
  let carillaId: number;

  beforeEach(async () => {
    pdfFalso.mockClear();
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    carillaId = await crearPrestacion(db, { categoriaId, nombre: "Carilla" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 2200000);
    await cambiarPrecioEnLista(db, listaId, carillaId, 800000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  function crearOrdenDePrueba(prestaciones: Array<{ prestacionId: number; cantidad: number; piezasFdi: number[] }>) {
    return crearOrdenConPrestaciones(ctx.db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones,
      creadoPor: ctx.usuarioId
    });
  }

  it("genera un comprobante numerado, pasa la orden a facturado y registra un único movimiento de cuenta con el total", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [16] }]);

    const comprobante = await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    expect(comprobante.numero).toMatch(/^CB-\d{8}$/);
    expect(comprobante.ordenId).toBe(orden.id);
    expect(pdfFalso).toHaveBeenCalledTimes(1);

    const ordenActualizada = (await obtenerOrden(db, orden.id))!;
    expect(ordenActualizada.estado).toBe("facturado");

    const saldos = await obtenerSaldos(db, odontologoId);
    expect(saldos).toHaveLength(1);
    expect(saldos[0].saldoCentavos).toBe(2200000);
  });

  it("una OT con varias prestaciones genera UN SOLO comprobante y UN SOLO movimiento por el total combinado", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([
      { prestacionId: coronaId, cantidad: 1, piezasFdi: [11] },
      { prestacionId: carillaId, cantidad: 1, piezasFdi: [21] }
    ]);

    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const { rows: movimientos } = await db.query("SELECT * FROM movimientos_cuenta WHERE orden_id = $1", [orden.id]);
    expect(movimientos).toHaveLength(1);
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(3000000);

    const { rows: comprobantesRows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM comprobantes WHERE orden_id = $1", [
      orden.id
    ]);
    expect(comprobantesRows[0].c).toBe(1);
  });

  it("no permite generar dos comprobantes para la misma orden", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    await expect(generarComprobante(db, orden.id, usuarioId, pdfFalso)).rejects.toThrow(/ya tiene un comprobante/i);
  });

  it("no permite generar un comprobante de una orden anulada", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    await anularOrden(db, orden.id, "Error de carga", usuarioId);

    await expect(generarComprobante(db, orden.id, usuarioId, pdfFalso)).rejects.toThrow(/anulada/i);
  });

  it("anular una orden ya facturada anula también su comprobante y revierte el saldo", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);
    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(2200000);

    await anularOrden(db, orden.id, "Trabajo cancelado", usuarioId);

    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(0);
  });

  // "Ver PDF" e "Imprimir" comparten una sola plantilla y un solo tamaño
  // físico de página: la hoja "DENSZ" de 110×150mm (109.982×150.114mm
  // exactos, el mismo tamaño que ya usa la impresión física en
  // impresoraService.ts). Regresión importante: printToPDF espera ese
  // tamaño a medida en PULGADAS ({width, height}), no en micrones (a
  // diferencia de webContents.print(), que sí usa micrones) — pasar el
  // valor en micrones por error generaría una página de ~2700 km y el
  // PDF saldría en blanco.
  it("genera el PDF del comprobante con el tamaño físico de 110×150mm, en pulgadas", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    expect(pdfFalso).toHaveBeenCalledTimes(1);
    const [, , pageSize] = pdfFalso.mock.calls[0];
    expect(pageSize).toEqual({
      width: 109.982 / 25.4,
      height: 150.114 / 25.4
    });
  });
});
