import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearRouterDeudas } from "../../src/server/routes/deudas.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/deudas", crearRouterDeudas(db));
  return app;
}

/**
 * Pruebas HTTP de /deudas (deuda agregada a mano, sin ninguna orden
 * detrás). Mismo patrón que serverPagos.test.ts: todo corre dentro de una
 * única transacción contra el proyecto de Supabase de TESTS (nunca
 * producción), con ROLLBACK real en afterAll, y una verificación final por
 * SQL (conexión nueva) de que no quedó nada.
 */
describe("HTTP /deudas", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let clinicaId: number;
  let sesionAdminId: string;
  let sesionRecepcionId: string;
  let cookieAdmin: string;
  let cookieRecepcion: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Deudas Test", listaPrecioId: listaId });
    clinicaId = await crearClinica(db, { nombre: "Clinica Deudas Test" });

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-deudas",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sesión SIN ningún permiso "pagos.*"/"deudas.*" a propósito — misma
    // paridad que pagos.route.ts: hoy no se exige ninguno acá.
    sesionRecepcionId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-deudas",
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

    const verificacion = await createTestDb();
    try {
      const odontologo = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(odontologo.rowCount).toBe(0);
      const clinica = await verificacion.db.query("SELECT id FROM clinicas WHERE id = $1", [clinicaId]);
      expect(clinica.rowCount).toBe(0);
      const movimientos = await verificacion.db.query(
        "SELECT id FROM movimientos_cuenta WHERE odontologo_id = $1 OR clinica_id = $2",
        [odontologoId, clinicaId]
      );
      expect(movimientos.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  function datosDeudaValida(overrides: Record<string, unknown> = {}) {
    return {
      odontologoId,
      fecha: "2026-01-01",
      importeCentavos: 500000,
      moneda: "ARS",
      descripcion: "Deuda previa a Densz",
      ...overrides
    };
  }

  it("401 sin sesión", async () => {
    const res = await request(app).post("/deudas").send(datosDeudaValida());
    expect(res.status).toBe(401);
  });

  it("201 con sesión: crea el movimiento, sin ninguna orden ni pago detrás", async () => {
    const res = await request(app).post("/deudas").set("Cookie", cookieAdmin).send(datosDeudaValida());
    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe("debe");
    expect(res.body.ordenId).toBeNull();
    expect(res.body.pagoId).toBeNull();
    expect(res.body.importeCentavos).toBe(500000);
  });

  it("400 con un importe inválido (negativo), sin crear nada", async () => {
    const res = await request(app).post("/deudas").set("Cookie", cookieAdmin).send(datosDeudaValida({ importeCentavos: -100 }));
    expect(res.status).toBe(400);
  });

  it("400 si no se manda odontólogo ni clínica", async () => {
    const res = await request(app)
      .post("/deudas")
      .set("Cookie", cookieAdmin)
      .send(datosDeudaValida({ odontologoId: undefined }));
    expect(res.status).toBe(400);
  });

  it("no exige ningún permiso especial — misma paridad que /pagos", async () => {
    const res = await request(app).post("/deudas").set("Cookie", cookieRecepcion).send(datosDeudaValida());
    expect(res.status).toBe(201);
  });

  it("una deuda de clínica se puede anular, y después ya no se puede anular de nuevo", async () => {
    const creada = await request(app)
      .post("/deudas")
      .set("Cookie", cookieAdmin)
      .send(datosDeudaValida({ odontologoId: undefined, clinicaId }));
    expect(creada.status).toBe(201);

    const anulada = await request(app)
      .patch(`/deudas/${creada.body.id}/anular`)
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Motivo de prueba de anulación" });
    expect(anulada.status).toBe(200);

    const denuevo = await request(app)
      .patch(`/deudas/${creada.body.id}/anular`)
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Motivo de prueba de anulación 2" });
    expect(denuevo.status).toBe(400);
  });

  it("anular una deuda inexistente responde 404", async () => {
    const res = await request(app)
      .patch("/deudas/999999999/anular")
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Motivo de prueba" });
    expect(res.status).toBe(404);
  });
});
