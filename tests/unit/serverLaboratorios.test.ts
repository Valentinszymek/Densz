import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, crearLaboratorioDePrueba, type TestDb } from "../helpers/testDb";
import { crearRouterLaboratorios } from "../../src/server/routes/laboratorios.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/laboratorios", crearRouterLaboratorios(db));
  return app;
}

/**
 * Pruebas HTTP de /laboratorios — el panel privado del dueño de Densz
 * (plan multi-laboratorio, punto 4 del pedido de pre-lanzamiento,
 * 2026-10-20). A diferencia del resto de las rutas, esta NUNCA pasa por
 * attachTenantDb a propósito (necesita ver todos los laboratorios a la
 * vez) — por eso el foco de estas pruebas es confirmar que
 * requireSuperAdmin es una barrera real, no que el scoping de tenant
 * funcione (acá no hay ninguno).
 */
describe("HTTP /laboratorios", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let segundoLaboratorioId: number;
  let sesionSuperAdminId: string;
  let sesionNormalId: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    // Un SEGUNDO laboratorio, aparte del de ctx — confirma que el panel
    // ve a través de todos los tenants, no solo el de la sesión actual.
    segundoLaboratorioId = await crearLaboratorioDePrueba(db, "Laboratorio Panel Test 2");

    sesionSuperAdminId = crearSesionHttp({
      facturacion: { plan: "professional", estadoSuscripcion: "active", trialTerminaEn: null, exentoFacturacion: true },
      usuarioId: ctx.usuarioId,
      nombreUsuario: "dueno-densz-test",
      nombreCompleto: "Dueño Densz Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"],
      laboratorioId: ctx.laboratorioId,
      superAdmin: true
    });
    sesionNormalId = crearSesionHttp({
      facturacion: { plan: "professional", estadoSuscripcion: "active", trialTerminaEn: null, exentoFacturacion: true },
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-laboratorio-cliente",
      nombreCompleto: "Admin De Un Laboratorio Cliente",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"],
      laboratorioId: ctx.laboratorioId,
      superAdmin: false
    });
  });

  afterAll(async () => {
    destruirSesionHttp(sesionSuperAdminId);
    destruirSesionHttp(sesionNormalId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      const lab2 = await verificacion.db.query("SELECT id FROM laboratorios WHERE id = $1", [segundoLaboratorioId]);
      expect(lab2.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401)", async () => {
    const res = await request(app).get("/laboratorios");
    expect(res.status).toBe(401);
  });

  it("rechaza una sesión que no es superAdmin, aunque tenga el permiso comodín de su propio laboratorio (403)", async () => {
    const res = await request(app).get("/laboratorios").set("Cookie", `${COOKIE_SESION}=${sesionNormalId}`);
    expect(res.status).toBe(403);
  });

  it("una sesión superAdmin ve TODOS los laboratorios, no solo el suyo", async () => {
    const res = await request(app).get("/laboratorios").set("Cookie", `${COOKIE_SESION}=${sesionSuperAdminId}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: number }[]).map((l) => l.id);
    expect(ids).toContain(ctx.laboratorioId);
    expect(ids).toContain(segundoLaboratorioId);

    const propio = (res.body as { id: number; nombre: string; estadoSuscripcion: string }[]).find(
      (l) => l.id === segundoLaboratorioId
    );
    expect(propio?.nombre).toBe("Laboratorio Panel Test 2");
    expect(propio?.estadoSuscripcion).toBe("active");
  });
});
