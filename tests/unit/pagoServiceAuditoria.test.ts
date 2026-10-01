import { describe, it, expect, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { listarMediosPago } from "../../src/main/db/repositories/pagosRepo";
import { registrarPago, anularPago } from "../../src/main/services/pagoService";
import { listarAuditoriaFiltradaCompleta } from "../../src/main/db/repositories/auditoriaRepo";

/**
 * Corrección post-auditoría (§26/§30-D de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * pagoService.ts no registraba auditoría por sí mismo. Antes de corregirlo
 * se verificó el código real (no solo el documento): tanto pagos.ipc.ts
 * (Desktop) como pagos.route.ts (Web) YA llamaban a registrarAuditoria por
 * su cuenta, después de que el servicio terminaba — así que en la práctica
 * los pagos SÍ quedaban auditados, solo que fuera de la transacción (un
 * fallo justo después del commit dejaba un pago real sin rastro) y con el
 * mismo código duplicado en dos archivos. La corrección centraliza la
 * auditoría DENTRO de pagoService.ts (misma transacción que el pago/
 * movimiento) y saca las llamadas ahora redundantes de ambas capas.
 *
 * Esta suite prueba, contra el servicio directamente (sin pasar por HTTP
 * ni IPC): que registrar/anular un pago genera EXACTAMENTE una entrada de
 * auditoría (nunca cero, nunca duplicada), con la información relevante
 * (usuario, entidad, entidad_id, importe, moneda, medio de pago, motivo de
 * anulación) y sin ningún secreto.
 */
describe("pagoService — auditoría de registrar/anular pago", () => {
  let ctx: TestDb & { usuarioId: number };

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as typeof ctx;
    }
  });

  it("registrar un pago genera exactamente UNA entrada de auditoría 'crear' con usuario, importe, moneda y medio de pago", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Pagos Auditoria", listaPrecioId: listaId });
    const medioPagoId = (await listarMediosPago(db))[0].id;

    const resultado = await registrarPago(
      db,
      { odontologoId, clinicaId: null, fecha: "2026-01-15", importeCentavos: 500000, moneda: "ARS", medioPagoId, referencia: null },
      usuarioId
    );
    expect(resultado.creado).toBe(true);
    if (!resultado.creado) throw new Error("no debería llegar acá");

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "pagos" });
    const deEstePago = registros.filter((r) => r.entidadId === resultado.pago.id);
    expect(deEstePago).toHaveLength(1); // nunca cero, nunca duplicado

    const registro = deEstePago[0];
    expect(registro.accion).toBe("crear");
    expect(registro.usuarioId).toBe(usuarioId);
    expect(registro.detalle).toMatchObject({
      odontologoId,
      clinicaId: null,
      importeCentavos: 500000,
      moneda: "ARS",
      medioPagoId
    });
    // Nunca ningún secreto en el detalle de auditoría.
    const detalleTexto = JSON.stringify(registro.detalle);
    expect(detalleTexto).not.toMatch(/password|hash|token|secret/i);
  });

  it("un pago detectado como posible duplicado (sin confirmar) NO genera ninguna entrada de auditoría", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Pagos Auditoria 2", listaPrecioId: listaId });
    const medioPagoId = (await listarMediosPago(db))[0].id;
    const datosPago = { odontologoId, clinicaId: null, fecha: "2026-01-15", importeCentavos: 500000, moneda: "ARS" as const, medioPagoId, referencia: null };

    await registrarPago(db, datosPago, usuarioId);
    const resultadoDuplicado = await registrarPago(db, datosPago, usuarioId); // mismo pago, sin confirmarDuplicado
    expect(resultadoDuplicado.creado).toBe(false);

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "pagos" });
    // Solo el primero (real) quedó auditado — el intento detectado como
    // duplicado no crea nada (ni el pago ni su auditoría).
    expect(registros.filter((r) => r.accion === "crear")).toHaveLength(1);
  });

  it("anular un pago genera exactamente UNA entrada de auditoría 'anular' con el motivo, sin duplicar la de 'crear'", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    const listaId = await idListaGeneral(db);
    const clinicaId = await crearClinica(db, { nombre: "Clinica Pagos Auditoria" });
    const medioPagoId = (await listarMediosPago(db))[0].id;

    const resultado = await registrarPago(
      db,
      { odontologoId: null, clinicaId, fecha: "2026-02-01", importeCentavos: 250000, moneda: "USD", medioPagoId, referencia: "transferencia #1" },
      usuarioId
    );
    if (!resultado.creado) throw new Error("no debería llegar acá");

    await anularPago(db, resultado.pago.id, "el cliente pidió reversar el pago", usuarioId);

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "pagos" });
    const deEstePago = registros.filter((r) => r.entidadId === resultado.pago.id);
    expect(deEstePago).toHaveLength(2); // "crear" (del registro) + "anular" — nunca más de una de cada una

    const entradaCrear = deEstePago.find((r) => r.accion === "crear")!;
    const entradaAnular = deEstePago.find((r) => r.accion === "anular")!;
    expect(entradaCrear).toBeDefined();
    expect(entradaAnular).toBeDefined();
    expect(entradaAnular.usuarioId).toBe(usuarioId);
    expect(entradaAnular.detalle).toMatchObject({
      motivo: "el cliente pidió reversar el pago",
      clinicaId,
      odontologoId: null,
      importeCentavos: 250000,
      moneda: "USD",
      medioPagoId
    });
  });
});
