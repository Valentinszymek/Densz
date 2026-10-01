import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterOdontologos } from "../../src/server/routes/odontologos.route";
import { crearRouterClinicas } from "../../src/server/routes/clinicas.route";
import { crearRouterPacientes } from "../../src/server/routes/pacientes.route";
import { crearRouterPrecios } from "../../src/server/routes/precios.route";
import { crearRouterListasPrecio } from "../../src/server/routes/listasPrecio.route";
import { crearRouterTrabajos } from "../../src/server/routes/trabajos.route";
import { crearRouterComprobantes } from "../../src/server/routes/comprobantes.route";
import { crearRouterCuentas } from "../../src/server/routes/cuentas.route";
import { crearRouterPagos } from "../../src/server/routes/pagos.route";
import * as storageModule from "../../src/server/storage";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";
import { avisarSiStorageCompartido } from "../helpers/testStorage";

avisarSiStorageCompartido(); // corrección post-auditoría §25/§30-D — ver tests/helpers/testStorage.ts

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/odontologos", crearRouterOdontologos(db));
  app.use("/clinicas", crearRouterClinicas(db));
  app.use("/pacientes", crearRouterPacientes(db));
  app.use("/precios", crearRouterPrecios(db));
  app.use("/listas-precio", crearRouterListasPrecio(db));
  app.use("/trabajos", crearRouterTrabajos(db));
  app.use("/comprobantes", crearRouterComprobantes(db));
  app.use("/cuentas", crearRouterCuentas(db));
  app.use("/pagos", crearRouterPagos(db));
  return app;
}

/**
 * Bloque 3 / Objetivo 3 — flujo integral de negocio de punta a punta,
 * contra Densz-Test exclusivamente (nunca producción): Odontólogo →
 * Paciente → Trabajo/OT → Prestación/precio → Facturación → Comprobante →
 * Cuenta → Pago → Saldo. Cubre ARS y USD, odontólogo individual y
 * clínica+profesional, múltiples prestaciones, historial de precios,
 * anulación, PDF real y ambos movimientos (DEBE/HABER). Cada paso reutiliza
 * exactamente las rutas HTTP ya probadas por separado en sus propios
 * archivos — acá se verifica que la CADENA completa sea consistente de
 * punta a punta, no cada pieza aislada de nuevo.
 */
describe("Flujo completo de negocio (Bloque 3)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let cookieAdmin: string;
  let sesionAdminId: string;
  const rutasStorageASubir: string[] = [];

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);
    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-flujo-completo",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    for (const ruta of rutasStorageASubir) {
      await storageModule.eliminarDocumento(ruta);
    }
    await ctx.finalizar(); // ROLLBACK real de todo Postgres

    const verificacion = await createTestDb();
    try {
      const { rows } = await verificacion.db.query(
        "SELECT id FROM odontologos WHERE nombre ILIKE $1",
        ["%Flujo Completo Test%"]
      );
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  // ============================================================
  // CASO A: odontólogo individual, ARS, múltiples prestaciones
  // ============================================================
  describe("Caso A — odontólogo individual, ARS, múltiples prestaciones", () => {
    let listaId: number;
    let odontologoId: number;
    let pacienteId: number;
    let categoriaId: number;
    let prestacion1Id: number;
    let prestacion2Id: number;
    let ordenId: number;
    let comprobanteId: number;
    let numeroComprobante: string;
    let pagoId: number;

    it("1. crea una lista de precios propia en ARS", async () => {
      const res = await request(app).post("/listas-precio").set("Cookie", cookieAdmin).send({ nombre: "Lista Flujo Completo Test A", moneda: "ARS" });
      expect(res.status).toBe(201);
      listaId = res.body as number;
    });

    it("2. crea el odontólogo, asignado a esa lista", async () => {
      const res = await request(app)
        .post("/odontologos")
        .set("Cookie", cookieAdmin)
        .send({ nombre: "Dr. Flujo Completo Test A", listaPrecioId: listaId });
      expect(res.status).toBe(201);
      odontologoId = res.body as number;
    });

    it("3. crea el paciente asociado al odontólogo", async () => {
      const res = await request(app)
        .post("/pacientes")
        .set("Cookie", cookieAdmin)
        .send({ nombreCompleto: "Paciente Flujo Completo Test A", odontologoId });
      expect(res.status).toBe(201);
      pacienteId = res.body as number;
    });

    it("4. crea categoría + 2 prestaciones, con precios distintos en la lista", async () => {
      const cat = await request(app).post("/precios/categorias").set("Cookie", cookieAdmin).send({ nombre: "Categoria Flujo Completo Test A" });
      categoriaId = cat.body as number;

      const p1 = await request(app).post("/precios/prestaciones").set("Cookie", cookieAdmin).send({ categoriaId, nombre: "Prestacion Flujo A1" });
      prestacion1Id = p1.body as number;
      const p2 = await request(app).post("/precios/prestaciones").set("Cookie", cookieAdmin).send({ categoriaId, nombre: "Prestacion Flujo A2" });
      prestacion2Id = p2.body as number;

      const precio1 = await request(app)
        .patch(`/listas-precio/${listaId}/items/${prestacion1Id}/precio`)
        .set("Cookie", cookieAdmin)
        .send({ nuevoPrecioCentavos: 500000 }); // $5.000,00
      expect(precio1.status).toBe(200);

      const precio2 = await request(app)
        .patch(`/listas-precio/${listaId}/items/${prestacion2Id}/precio`)
        .set("Cookie", cookieAdmin)
        .send({ nuevoPrecioCentavos: 300000 }); // $3.000,00
      expect(precio2.status).toBe(200);

      // Historial de precios: cambiar de nuevo y confirmar que queda una fila cerrada + la vigente.
      await request(app)
        .patch(`/listas-precio/${listaId}/items/${prestacion1Id}/precio`)
        .set("Cookie", cookieAdmin)
        .send({ nuevoPrecioCentavos: 550000 }); // sube a $5.500,00
      const historial = await request(app)
        .get(`/listas-precio/${listaId}/items/${prestacion1Id}/historial`)
        .set("Cookie", cookieAdmin);
      expect(historial.body.length).toBeGreaterThanOrEqual(2);
    });

    it("5. Nuevo Trabajo: crea la OT con 2 prestaciones, distintas cantidades y piezas", async () => {
      const res = await request(app)
        .post("/trabajos")
        .set("Cookie", cookieAdmin)
        .send({
          odontologoId,
          pacienteId,
          fechaTrabajo: "2026-01-15",
          prestaciones: [
            { prestacionId: prestacion1Id, cantidad: 1, piezasFdi: [11] },
            { prestacionId: prestacion2Id, cantidad: 2, piezasFdi: [21, 22] }
          ]
        });
      expect(res.status).toBe(201);
      ordenId = res.body.id;
      // 1×$5.500,00 (precio vigente al momento de facturar) + 2×$3.000,00 = $11.500,00
      expect(res.body.totalCentavos).toBe(1150000);
      expect(res.body.moneda).toBe("ARS");
      expect(res.body.estado).toBe("pendiente_facturar");
    });

    it("6. Genera el comprobante: numera, factura la OT, registra el DEBE, y sube el PDF real a Storage", async () => {
      const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(res.status).toBe(201);
      comprobanteId = res.body.id;
      numeroComprobante = res.body.numero;
      expect(numeroComprobante).toMatch(/^CB-\d{8}$/);
      if (res.body.pdfPath) rutasStorageASubir.push(res.body.pdfPath);

      const orden = await request(app).get(`/trabajos/${ordenId}`).set("Cookie", cookieAdmin);
      expect(orden.body.estado).toBe("facturado");

      const { rows: movRows } = await ctx.db.query(
        "SELECT tipo, importe_centavos, moneda, odontologo_id, clinica_id FROM movimientos_cuenta WHERE orden_id = $1",
        [ordenId]
      );
      expect(movRows).toHaveLength(1);
      expect(movRows[0].tipo).toBe("debe");
      expect(movRows[0].importe_centavos).toBe(1150000);
      expect(movRows[0].moneda).toBe("ARS");
      expect(movRows[0].odontologo_id).toBe(odontologoId); // individual, no clínica

      const pdf = await request(app).get(`/comprobantes/${comprobanteId}/pdf`).set("Cookie", cookieAdmin);
      expect(pdf.status).toBe(200);
      expect(Buffer.from(pdf.body).subarray(0, 4).toString("ascii")).toBe("%PDF");
    });

    it("7. Cuenta: el saldo del odontólogo refleja el DEBE (aún sin pagos)", async () => {
      const saldos = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
      const ars = saldos.body.find((s: { moneda: string }) => s.moneda === "ARS");
      expect(ars.saldoCentavos).toBe(1150000);
    });

    it("8. Registra un pago PARCIAL: crea el HABER, el saldo baja pero no llega a cero", async () => {
      const res = await request(app)
        .post("/pagos")
        .set("Cookie", cookieAdmin)
        .send({ odontologoId, fecha: "2026-01-20", importeCentavos: 700000, moneda: "ARS", medioPagoId: (await request(app).get("/pagos/medios").set("Cookie", cookieAdmin)).body[0].id });
      expect(res.status).toBe(201);
      pagoId = res.body.pago.id;

      const saldos = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
      const ars = saldos.body.find((s: { moneda: string }) => s.moneda === "ARS");
      expect(ars.saldoCentavos).toBe(450000); // 1.150.000 - 700.000
    });

    it("9. Anula el pago: el HABER se revierte, el saldo vuelve a subir a la deuda total", async () => {
      const res = await request(app).patch(`/pagos/${pagoId}/anular`).set("Cookie", cookieAdmin).send({ motivo: "Prueba flujo completo" });
      expect(res.status).toBe(200);

      const saldos = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
      const ars = saldos.body.find((s: { moneda: string }) => s.moneda === "ARS");
      expect(ars.saldoCentavos).toBe(1150000); // vuelve al total, como si no se hubiera pagado
    });
  });

  // ============================================================
  // CASO B: clínica + profesional, USD
  // ============================================================
  describe("Caso B — clínica + profesional, USD", () => {
    let listaUsdId: number;
    let clinicaId: number;
    let odontologoId: number;
    let prestacionId: number;
    let ordenId: number;

    it("1. crea clínica, lista USD, odontólogo asociado a la clínica", async () => {
      const clinica = await request(app).post("/clinicas").set("Cookie", cookieAdmin).send({ nombre: "Clinica Flujo Completo Test B" });
      clinicaId = clinica.body as number;

      const lista = await request(app).post("/listas-precio").set("Cookie", cookieAdmin).send({ nombre: "Lista Flujo Completo Test B", moneda: "USD" });
      listaUsdId = lista.body as number;

      const odontologo = await request(app)
        .post("/odontologos")
        .set("Cookie", cookieAdmin)
        .send({ nombre: "Dr. Flujo Completo Test B", listaPrecioId: listaUsdId, clinicaId });
      odontologoId = odontologo.body as number;

      const categoria = await request(app).post("/precios/categorias").set("Cookie", cookieAdmin).send({ nombre: "Categoria Flujo Completo Test B" });
      const prestacion = await request(app)
        .post("/precios/prestaciones")
        .set("Cookie", cookieAdmin)
        .send({ categoriaId: categoria.body, nombre: "Prestacion Flujo B1" });
      prestacionId = prestacion.body as number;
      await request(app).patch(`/listas-precio/${listaUsdId}/items/${prestacionId}/precio`).set("Cookie", cookieAdmin).send({ nuevoPrecioCentavos: 20000 }); // USD 200.00
    });

    it("2. Nuevo Trabajo con paciente inline (sin pacienteId, solo el nombre)", async () => {
      const res = await request(app)
        .post("/trabajos")
        .set("Cookie", cookieAdmin)
        .send({
          odontologoId,
          pacienteNombreCompleto: "Paciente Flujo Completo Test B",
          fechaTrabajo: "2026-02-01",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [31] }]
        });
      expect(res.status).toBe(201);
      ordenId = res.body.id;
      expect(res.body.moneda).toBe("USD");
      expect(res.body.totalCentavos).toBe(20000);
      expect(res.body.clinicaId).toBe(clinicaId);
    });

    it("3. el comprobante y el movimiento DEBE quedan a nombre de la CLÍNICA, no del odontólogo", async () => {
      const comprobante = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(comprobante.status).toBe(201);
      if (comprobante.body.pdfPath) rutasStorageASubir.push(comprobante.body.pdfPath);

      const { rows } = await ctx.db.query(
        "SELECT odontologo_id, clinica_id, moneda, importe_centavos FROM movimientos_cuenta WHERE orden_id = $1",
        [ordenId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].clinica_id).toBe(clinicaId);
      expect(rows[0].odontologo_id).toBeNull(); // la deuda es de la clínica, no del profesional
      expect(rows[0].moneda).toBe("USD");
      expect(rows[0].importe_centavos).toBe(20000);
    });

    it("4. el saldo de la CLÍNICA (no del odontólogo individual) refleja la deuda en USD, separado de cualquier ARS", async () => {
      const saldosClinica = await request(app).get(`/cuentas/clinica/${clinicaId}/saldos`).set("Cookie", cookieAdmin);
      const usd = saldosClinica.body.find((s: { moneda: string }) => s.moneda === "USD");
      expect(usd.saldoCentavos).toBe(20000);
      expect(saldosClinica.body.some((s: { moneda: string }) => s.moneda === "ARS")).toBe(false);
    });

    it("5. un pago en USD a la clínica genera HABER en USD, y el saldo de esa moneda baja a cero — nunca se mezcla con ARS", async () => {
      const medios = await request(app).get("/pagos/medios").set("Cookie", cookieAdmin);
      const pago = await request(app)
        .post("/pagos")
        .set("Cookie", cookieAdmin)
        .send({ clinicaId, fecha: "2026-02-05", importeCentavos: 20000, moneda: "USD", medioPagoId: medios.body[0].id });
      expect(pago.status).toBe(201);

      const saldos = await request(app).get(`/cuentas/clinica/${clinicaId}/saldos`).set("Cookie", cookieAdmin);
      const usd = saldos.body.find((s: { moneda: string }) => s.moneda === "USD");
      expect(usd.saldoCentavos).toBe(0);
    });
  });

  it("no quedó ningún residuo cruzado: los movimientos del Caso A y B nunca se mezclaron entre sí", async () => {
    const { rows } = await ctx.db.query(
      `SELECT COUNT(DISTINCT m.moneda) c FROM movimientos_cuenta m
       JOIN ordenes o ON o.id = m.orden_id
       WHERE o.odontologo_id IN (SELECT id FROM odontologos WHERE nombre ILIKE 'Dr. Flujo Completo Test A')`
    );
    expect(Number(rows[0].c)).toBe(1); // solo ARS para el Caso A
  });
});
