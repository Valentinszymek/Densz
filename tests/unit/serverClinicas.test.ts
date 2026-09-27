import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterClinicas } from "../../src/server/routes/clinicas.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/clinicas", crearRouterClinicas(db));
  return app;
}

const NOMBRE_TEST = "Clinica Test Bloque2";

/**
 * Pruebas HTTP de /clinicas (Bloque 2) — no existía ningún test a nivel
 * HTTP para esta ruta todavía. Cubre puntualmente los dos endpoints
 * nuevos de este bloque (GET /:id/uso, DELETE /:id) — la lectura/escritura
 * de Fase 5A/5B no tenía cobertura HTTP tampoco, así que se agrega un
 * mínimo de contexto (401) para no dejarla completamente sin probar.
 */
describe("HTTP /clinicas — uso y eliminación (Bloque 2)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let cookieAdmin: string;
  let sesionAdminId: string;
  let clinicaId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-clinicas-bloque2",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;

    const crear = await request(app).post("/clinicas").set("Cookie", cookieAdmin).send({ nombre: NOMBRE_TEST });
    clinicaId = crear.body as number;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      const { rows } = await verificacion.db.query("SELECT id FROM clinicas WHERE nombre = $1", [NOMBRE_TEST]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) uso y eliminación", async () => {
    const resultados = await Promise.all([
      request(app).get(`/clinicas/${clinicaId}/uso`),
      request(app).delete(`/clinicas/${clinicaId}`)
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("GET /:id/uso devuelve el contrato real (sin uso, clínica recién creada)", async () => {
    const res = await request(app).get(`/clinicas/${clinicaId}/uso`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cantidadProfesionales: 0,
      cantidadTrabajos: 0,
      cantidadComprobantes: 0,
      cantidadPagos: 0,
      cantidadMovimientos: 0
    });
  });

  it("elimina físicamente una clínica sin ningún historial asociado, y queda en Auditoría", async () => {
    const res = await request(app).delete(`/clinicas/${clinicaId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    const { rows } = await ctx.db.query("SELECT id FROM clinicas WHERE id = $1", [clinicaId]);
    expect(rows).toHaveLength(0);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'clinicas' AND entidad_id = $1 AND accion = 'eliminar'",
      [clinicaId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("eliminar una clínica inexistente no rompe (0 filas de uso, DELETE sin efecto, mismo comportamiento que el repositorio)", async () => {
    const res = await request(app).delete("/clinicas/999999999").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
  });
});
