import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { getConfig } from "../../src/main/db/repositories/configRepo";
import { crearRouterConfig } from "../../src/server/routes/config.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/config", crearRouterConfig(db));
  return app;
}

const CLAVE_LABORATORIO_NOMBRE = "laboratorio.nombre";

/**
 * Pruebas HTTP de /config (Fase 10B) — mismo patrón que serverUsuarios /
 * serverAuditoria: transacción compartida con ROLLBACK real, verificación
 * final por SQL con conexión nueva. No existía ningún test a nivel HTTP
 * para esta ruta todavía.
 */
describe("HTTP /config", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-config",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "configuracion.editar") — para probar el permiso, no un set inventado.
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-config",
      nombreCompleto: "Recepcion Test",
      rolNombre: "RECEPCION",
      permisos: [
        "ordenes.crear",
        "ordenes.ver",
        "pacientes.crear",
        "pacientes.ver",
        "odontologos.ver",
        "pagos.crear",
        "pagos.ver",
        "comprobantes.crear",
        "comprobantes.ver",
        "clinicas.crear",
        "clinicas.ver"
      ]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
    cookieSinPermiso = `${COOKIE_SESION}=${sesionSinPermisoId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionSinPermisoId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      // El valor de "laboratorio.nombre" escrito dentro de la transacción
      // (si lo hubo) no debe haber sobrevivido al rollback.
      const valor = await getConfig(verificacion.db, CLAVE_LABORATORIO_NOMBRE);
      expect(valor).not.toBe("Laboratorio De Prueba Fase10B");
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en ambas rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/config/laboratorio"),
      request(app).put("/config/laboratorio").send({ nombre: "x" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("rechaza (403) a una sesión sin el permiso CONFIGURACION_EDITAR (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).get("/config/laboratorio").set("Cookie", cookieSinPermiso),
      request(app).put("/config/laboratorio").set("Cookie", cookieSinPermiso).send({ nombre: "x" })
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("GET /config/laboratorio devuelve null cuando nunca se configuró (valor de fábrica)", async () => {
    const res = await request(app).get("/config/laboratorio").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("PUT /config/laboratorio guarda el nombre, y GET lo devuelve — ida y vuelta completa", async () => {
    const put = await request(app)
      .put("/config/laboratorio")
      .set("Cookie", cookieAdmin)
      .send({ nombre: "Laboratorio De Prueba Fase10B" });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await request(app).get("/config/laboratorio").set("Cookie", cookieAdmin);
    expect(get.status).toBe(200);
    expect(get.body).toBe("Laboratorio De Prueba Fase10B");
  });

  it("PUT /config/laboratorio registra auditoría de la modificación", async () => {
    await request(app).put("/config/laboratorio").set("Cookie", cookieAdmin).send({ nombre: "Otro Nombre Fase10B" });
    const { rows } = await ctx.db.query<{ accion: string; entidad: string; detalle: unknown }>(
      "SELECT accion, entidad, detalle FROM auditoria WHERE entidad = 'configuracion' ORDER BY id DESC LIMIT 1"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accion).toBe("modificar");
    expect(JSON.stringify(rows[0].detalle)).toContain("Otro Nombre Fase10B");
  });

  it("PUT /config/laboratorio rechaza un nombre vacío (400) y no modifica el valor guardado", async () => {
    await request(app).put("/config/laboratorio").set("Cookie", cookieAdmin).send({ nombre: "Valor Previo Fase10B" });
    const res = await request(app).put("/config/laboratorio").set("Cookie", cookieAdmin).send({ nombre: "" });
    expect(res.status).toBe(400);
    const get = await request(app).get("/config/laboratorio").set("Cookie", cookieAdmin);
    expect(get.body).toBe("Valor Previo Fase10B");
  });

  it("la respuesta nunca incluye datos sensibles (nunca hay password/hash/token en /config)", async () => {
    const res = await request(app).get("/config/laboratorio").set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body);
    expect(crudo.toLowerCase()).not.toMatch(/password|contraseñ|service_role|token/);
  });
});
