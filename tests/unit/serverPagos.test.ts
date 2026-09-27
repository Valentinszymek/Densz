import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearMedioPago } from "../../src/main/db/repositories/pagosRepo";
import { crearRouterPagos } from "../../src/server/routes/pagos.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/pagos", crearRouterPagos(db));
  return app;
}

/**
 * Pruebas HTTP de /pagos. Mismo patrón que tests/unit/serverTrabajos.test.ts:
 * TODO corre dentro de una única transacción contra el proyecto de
 * Supabase de TESTS (nunca producción), con ROLLBACK real en afterAll, y
 * una verificación final por SQL (conexión nueva) de que no quedó nada —
 * nunca se asume, se comprueba.
 */
describe("HTTP /pagos", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let clinicaId: number;
  let medioPagoId: number;
  let sesionAdminId: string;
  let sesionRecepcionId: string;
  let cookieAdmin: string;
  let cookieRecepcion: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Pagos Test", listaPrecioId: listaId });
    clinicaId = await crearClinica(db, { nombre: "Clinica Pagos Test" });
    medioPagoId = await crearMedioPago(db, "MEDIO TEST PAGOS");

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-pagos",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sesión SIN ningún permiso "pagos.*" a propósito — sirve para probar
    // el punto 13 (permisos): hoy el escritorio no exige ninguno acá.
    sesionRecepcionId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-pagos",
      nombreCompleto: "Recepcion Test",
      rolNombre: "RECEPCION",
      permisos: ["odontologos.ver"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
    cookieRecepcion = `${COOKIE_SESION}=${sesionRecepcionId}`;
  });

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionRecepcionId);
    await ctx.finalizar(); // ROLLBACK real

    // Punto 14: verificación real, no asumida — conexión nueva, después
    // del ROLLBACK.
    const verificacion = await createTestDb();
    try {
      const odontologo = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(odontologo.rowCount).toBe(0);
      const clinica = await verificacion.db.query("SELECT id FROM clinicas WHERE id = $1", [clinicaId]);
      expect(clinica.rowCount).toBe(0);
      const pagos = await verificacion.db.query(
        "SELECT id FROM pagos WHERE odontologo_id = $1 OR clinica_id = $2",
        [odontologoId, clinicaId]
      );
      expect(pagos.rowCount).toBe(0);
      const movimientos = await verificacion.db.query(
        "SELECT id FROM movimientos_cuenta WHERE odontologo_id = $1 OR clinica_id = $2",
        [odontologoId, clinicaId]
      );
      expect(movimientos.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  function datosPagoValido(overrides: Record<string, unknown> = {}) {
    return {
      odontologoId,
      fecha: "2026-01-20",
      importeCentavos: 500000,
      moneda: "ARS",
      medioPagoId,
      referencia: "TEST - pago sintético",
      ...overrides
    };
  }

  // --- 1. GET listado autenticado ---
  it("GET /pagos?odontologoId= devuelve 200 con sesión válida", async () => {
    const res = await request(app).get(`/pagos?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- 2. GET sin sesión → 401 (todas las rutas) ---
  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get(`/pagos?odontologoId=${odontologoId}`),
      request(app).get(`/pagos/clinica/${clinicaId}`),
      request(app).get("/pagos/ultimos"),
      request(app).get("/pagos/medios"),
      request(app).post("/pagos").send(datosPagoValido()),
      request(app).patch("/pagos/1/anular").send({ motivo: "sin sesión" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  // --- 3. GET clínica autenticado ---
  it("GET /pagos/clinica/:clinicaId devuelve 200 con sesión válida", async () => {
    const res = await request(app).get(`/pagos/clinica/${clinicaId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- 4. GET último pago ---
  it("GET /pagos/ultimos devuelve 200 con sesión válida", async () => {
    const res = await request(app).get("/pagos/ultimos").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /pagos/medios devuelve 200 con sesión válida", async () => {
    const res = await request(app).get("/pagos/medios").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.some((m: { id: number }) => m.id === medioPagoId)).toBe(true);
  });

  // --- 5. POST registrar pago válido ---
  it("registra un pago válido y queda reflejado en el listado", async () => {
    const res = await request(app).post("/pagos").set("Cookie", cookieAdmin).send(datosPagoValido({ fecha: "2026-02-01" }));
    expect(res.status).toBe(201);
    expect(res.body.creado).toBe(true);
    expect(res.body.pago.importeCentavos).toBe(500000);

    const listado = await request(app).get(`/pagos?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(listado.body.some((p: { id: number }) => p.id === res.body.pago.id)).toBe(true);
  });

  // --- 6. POST con payload inválido → 400 ---
  it("rechaza un payload inválido (400) sin registrar nada", async () => {
    const antes = await request(app).get(`/pagos?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    const res = await request(app)
      .post("/pagos")
      .set("Cookie", cookieAdmin)
      .send({ odontologoId, fecha: "2026-02-02", importeCentavos: -100, moneda: "ARS", medioPagoId });
    expect(res.status).toBe(400);
    const despues = await request(app).get(`/pagos?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(despues.body.length).toBe(antes.body.length);
  });

  // --- 7, 8. Duplicado → requiere confirmación → confirmarDuplicado=true lo registra ---
  it("detecta un pago duplicado y lo registra recién con confirmarDuplicado=true", async () => {
    const datos = datosPagoValido({ fecha: "2026-02-10", importeCentavos: 750000 });

    const primero = await request(app).post("/pagos").set("Cookie", cookieAdmin).send(datos);
    expect(primero.status).toBe(201);
    expect(primero.body.creado).toBe(true);

    const duplicado = await request(app).post("/pagos").set("Cookie", cookieAdmin).send(datos);
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.creado).toBe(false);
    expect(duplicado.body.posibleDuplicado).toBe(true);

    const confirmado = await request(app)
      .post("/pagos")
      .set("Cookie", cookieAdmin)
      .send({ ...datos, confirmarDuplicado: true });
    expect(confirmado.status).toBe(201);
    expect(confirmado.body.creado).toBe(true);
    expect(confirmado.body.pago.id).not.toBe(primero.body.pago.id);
  });

  // --- 9. Anular pago ---
  it("anula un pago y su movimiento asociado queda anulado también", async () => {
    const creado = await request(app).post("/pagos").set("Cookie", cookieAdmin).send(datosPagoValido({ fecha: "2026-02-15" }));
    const pagoId = creado.body.pago.id;

    const anulado = await request(app).patch(`/pagos/${pagoId}/anular`).set("Cookie", cookieAdmin).send({ motivo: "Motivo de prueba" });
    expect(anulado.status).toBe(200);

    const { rows } = await ctx.db.query("SELECT anulado FROM pagos WHERE id = $1", [pagoId]);
    expect(rows[0].anulado).toBe(1);
    const movimiento = await ctx.db.query("SELECT anulado FROM movimientos_cuenta WHERE pago_id = $1", [pagoId]);
    expect(movimiento.rows[0].anulado).toBe(1);
  });

  // --- 10. Anular un pago inexistente ---
  it("anular un pago inexistente devuelve 404 con mensaje claro", async () => {
    const res = await request(app).patch("/pagos/999999999/anular").set("Cookie", cookieAdmin).send({ motivo: "No existe" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("El pago no existe.");
  });

  // --- 11. Atomicidad de registrar pago ---
  it("registrar pago es atómico: un medio de pago inexistente no crea ni pago ni movimiento", async () => {
    // Transacción TOTALMENTE aparte: forzar una violación real de FK en
    // Postgres deja la transacción "abortada" (comportamiento normal de
    // Postgres, no un bug) hasta el próximo ROLLBACK — no se puede
    // compartir con el resto de las pruebas de este archivo.
    const aislado = await createTestDb();
    try {
      const { db } = aislado;
      const listaId = await idListaGeneral(db);
      const odontologoAislado = await crearOdontologo(db, { nombre: "Dr. Pagos Test Atomicidad", listaPrecioId: listaId });
      const appAislada = construirApp(db as unknown as Pool);

      const antesPagos = await db.query("SELECT COUNT(*) c FROM pagos WHERE odontologo_id = $1", [odontologoAislado]);
      const antesMovs = await db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoAislado]);

      // SAVEPOINT: una violación real de FK aborta la transacción entera
      // hasta el próximo ROLLBACK — se vuelve al savepoint para poder
      // seguir usando esta misma conexión después del error esperado.
      await db.query("SAVEPOINT antes_de_fallar");
      const res = await request(appAislada)
        .post("/pagos")
        .set("Cookie", cookieAdmin)
        .send(datosPagoValido({ odontologoId: odontologoAislado, fecha: "2026-02-20", medioPagoId: 999999999 }));
      expect(res.status).toBe(400);
      await db.query("ROLLBACK TO SAVEPOINT antes_de_fallar");

      const despuesPagos = await db.query("SELECT COUNT(*) c FROM pagos WHERE odontologo_id = $1", [odontologoAislado]);
      const despuesMovs = await db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoAislado]);
      expect(despuesPagos.rows[0].c).toBe(antesPagos.rows[0].c);
      expect(despuesMovs.rows[0].c).toBe(antesMovs.rows[0].c);
    } finally {
      await aislado.finalizar();
    }
  });

  // --- 12. Atomicidad de anular pago ---
  it("anular pago es atómico: pago y movimiento quedan anulados juntos, nunca solo uno", async () => {
    const creado = await request(app).post("/pagos").set("Cookie", cookieAdmin).send(datosPagoValido({ fecha: "2026-02-25" }));
    const pagoId = creado.body.pago.id;

    await request(app).patch(`/pagos/${pagoId}/anular`).set("Cookie", cookieAdmin).send({ motivo: "Prueba atomicidad" });

    const pago = await ctx.db.query("SELECT anulado FROM pagos WHERE id = $1", [pagoId]);
    const movimiento = await ctx.db.query("SELECT anulado FROM movimientos_cuenta WHERE pago_id = $1", [pagoId]);
    expect(pago.rows[0].anulado).toBe(movimiento.rows[0].anulado);
    expect(pago.rows[0].anulado).toBe(1);
  });

  // --- 13. Permisos: hoy no hay ningún chequeo, se prueba explícitamente ---
  it("no exige ningún permiso 'pagos.*' — paridad exacta con el escritorio (sin chequeo en el IPC actual)", async () => {
    const listado = await request(app).get(`/pagos?odontologoId=${odontologoId}`).set("Cookie", cookieRecepcion);
    expect(listado.status).toBe(200);

    const registrado = await request(app)
      .post("/pagos")
      .set("Cookie", cookieRecepcion)
      .send(datosPagoValido({ fecha: "2026-03-01", importeCentavos: 100000 }));
    expect(registrado.status).toBe(201);

    const anulado = await request(app)
      .patch(`/pagos/${registrado.body.pago.id}/anular`)
      .set("Cookie", cookieRecepcion)
      .send({ motivo: "RECEPCION anulando sin pagos.anular" });
    expect(anulado.status).toBe(200);
  });

  // --- Bloque 2 / Parte D: mediosPagoCrear, conectado en el barrido final ---
  it("POST /pagos/medios crea un medio de pago nuevo y aparece en el listado", async () => {
    const crear = await request(app).post("/pagos/medios").set("Cookie", cookieAdmin).send({ nombre: "Medio Test Bloque2" });
    expect(crear.status).toBe(201);
    const medioId = crear.body as number;

    const listado = await request(app).get("/pagos/medios").set("Cookie", cookieAdmin);
    expect(listado.body.some((m: { id: number; nombre: string }) => m.id === medioId && m.nombre === "Medio Test Bloque2")).toBe(
      true
    );
  });

  // --- 14. Verificado en afterAll (ver arriba) ---
});
