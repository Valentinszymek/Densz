import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, anularOrden } from "../../src/main/services/ordenService";
import { generarComprobante, guardarTamanoImpresionComprobante } from "../../src/main/services/comprobanteService";
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

  it("una OT que nace en $0 (repetición sin cargo) genera el comprobante igual, sin movimiento de cuenta", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [
        { prestacionId: coronaId, cantidad: 1, piezasFdi: [16], precioManualCentavos: 0, nombre: "Repetición Corona" }
      ],
      creadoPor: usuarioId
    });
    expect(orden.totalCentavos).toBe(0);

    const comprobante = await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    expect(comprobante.numero).toMatch(/^CB-\d{8}$/);
    const ordenActualizada = (await obtenerOrden(db, orden.id))!;
    expect(ordenActualizada.estado).toBe("facturado");

    // Sin deuda: un movimiento de $0 no existe por diseño.
    expect(await obtenerSaldos(db, odontologoId)).toHaveLength(0);
    const { rows: movimientos } = await db.query("SELECT * FROM movimientos_cuenta WHERE orden_id = $1", [orden.id]);
    expect(movimientos).toHaveLength(0);
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

    // Sin nada real pendiente (el único movimiento quedó anulado),
    // obtenerSaldos ya ni devuelve una fila — ver el filtro de monedas en
    // $0,00 (2026-10-29).
    expect(await obtenerSaldos(db, odontologoId)).toHaveLength(0);
  });

  // "Ver PDF" e "Imprimir" comparten una sola plantilla, y el tamaño
  // físico de página sigue la preferencia del laboratorio (Configuración
  // → Tamaño de impresión): el tamaño real del ticket (105×148.5mm) por
  // defecto, para quien ya imprime en papel precortado a ese tamaño; A4
  // completa (210×297mm, con el ticket en una esquina y guía de corte)
  // para quien prefiere cortar después — ver historial largo en
  // comprobanteHtmlTemplate.ts e impresoraService.ts. Regresión
  // importante: printToPDF espera ese tamaño a medida en PULGADAS
  // ({width, height}), no en micrones (a diferencia de webContents.print(),
  // que sí usa micrones) — pasar el valor en micrones por error generaría
  // una página de ~2700 km y el PDF saldría en blanco.
  it("por defecto (sin configurar nada) genera el PDF al tamaño real del ticket, en pulgadas", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    expect(pdfFalso).toHaveBeenCalledTimes(1);
    const [, , pageSize] = pdfFalso.mock.calls[0];
    expect(pageSize).toEqual({
      width: 105 / 25.4,
      height: 148.5 / 25.4
    });
  });

  it("si el laboratorio eligió 'a4' (Configuración → Tamaño de impresión), genera el PDF en hoja A4 completa", async () => {
    const { db, usuarioId } = ctx;
    await guardarTamanoImpresionComprobante(db, "a4");
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    expect(pdfFalso).toHaveBeenCalledTimes(1);
    const [, , pageSize] = pdfFalso.mock.calls[0];
    expect(pageSize).toEqual({
      width: 210 / 25.4,
      height: 297 / 25.4
    });
  });

  it("un pageSize explícito pasado a generarComprobante siempre gana, sin mirar la configuración", async () => {
    const { db, usuarioId } = ctx;
    await guardarTamanoImpresionComprobante(db, "a4");
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso, "A5");

    const [, , pageSize] = pdfFalso.mock.calls[0];
    expect(pageSize).toBe("A5");
  });

  // Regresión real (2026-11-03): el `pageSize` que se le pasa a
  // generarPdf/print() NO alcanza por sí solo — el documento HTML en sí
  // declaraba `@page { size: 210mm 297mm }` siempre, sin importar la
  // preferencia, y esa declaración es la que de verdad manda al imprimir
  // con Electron (ver el historial largo en comprobanteHtmlTemplate.ts).
  // Estos dos tests inspeccionan el HTML real (no solo el parámetro
  // pasado a un mock) para que esto no pueda volver a pasar en silencio.
  it("por defecto ('ticket'), el HTML real declara @page al tamaño del ticket y sin guía de corte", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const [html] = pdfFalso.mock.calls[0];
    expect(html).toContain("@page { size: 105mm 148.5mm; margin: 0; }");
    expect(html).not.toContain("border-right: 1px dashed");
  });

  it("si el laboratorio eligió 'a4', el HTML real declara @page a hoja A4 completa y con guía de corte", async () => {
    const { db, usuarioId } = ctx;
    await guardarTamanoImpresionComprobante(db, "a4");
    const orden = await crearOrdenDePrueba([{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }]);
    await generarComprobante(db, orden.id, usuarioId, pdfFalso);

    const [html] = pdfFalso.mock.calls[0];
    expect(html).toContain("@page { size: 210mm 297mm; margin: 0; }");
    expect(html).toContain("border-right: 1px dashed");
  });
});
