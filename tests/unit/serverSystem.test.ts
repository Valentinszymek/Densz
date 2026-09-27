import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
import { crearRouterSystem } from "../../src/server/routes/system.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/system", crearRouterSystem(db));
  return app;
}

/**
 * Pruebas HTTP de /system (Fase 12D) — no existía ningún test a nivel
 * HTTP para esta ruta todavía.
 */
describe("HTTP /system", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let cookieAdmin: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-system",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    await ctx.finalizar(); // ROLLBACK real
  });

  it("rechaza sin sesión (401)", async () => {
    const res = await request(app).get("/system/status");
    expect(res.status).toBe(401);
  });

  it("GET /system/status devuelve el contrato real: dbPath, migracionesAplicadas, integridadOk, conteos, appVersion", async () => {
    const res = await request(app).get("/system/status").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(typeof res.body.dbPath).toBe("string");
    expect(res.body.dbPath).toContain("Supabase");
    expect(Array.isArray(res.body.migracionesAplicadas)).toBe(true);
    expect(typeof res.body.integridadOk).toBe("boolean");
    expect(res.body.integridadOk).toBe(true);
    expect(Array.isArray(res.body.conteos)).toBe(true);
    expect(res.body.conteos.some((c: { tabla: string }) => c.tabla === "odontologos")).toBe(true);
    expect(typeof res.body.appVersion).toBe("string");
  });

  it("dbPath nunca expone la cadena de conexión completa (solo el hostname)", async () => {
    const res = await request(app).get("/system/status").set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body);
    expect(crudo).not.toMatch(/postgres(ql)?:\/\//i);
    expect(crudo.toLowerCase()).not.toMatch(/password|service_role/);
  });

  it("no expone las tablas internas excluidas (schema_migrations, busqueda_global)", async () => {
    const res = await request(app).get("/system/status").set("Cookie", cookieAdmin);
    const tablas = res.body.conteos.map((c: { tabla: string }) => c.tabla);
    expect(tablas).not.toContain("schema_migrations");
    expect(tablas).not.toContain("busqueda_global");
  });

  it("es de solo lectura: nunca escribe nada", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) c FROM odontologos");
    await request(app).get("/system/status").set("Cookie", cookieAdmin);
    const despues = await ctx.db.query("SELECT COUNT(*) c FROM odontologos");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });
});
