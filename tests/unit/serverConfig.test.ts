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
      facturacion: { plan: "professional", estadoSuscripcion: "active", trialTerminaEn: null, exentoFacturacion: true },
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-config",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "configuracion.editar") — para probar el permiso, no un set inventado.
    sesionSinPermisoId = crearSesionHttp({
      facturacion: { plan: "professional", estadoSuscripcion: "active", trialTerminaEn: null, exentoFacturacion: true },
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

  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/config/laboratorio"),
      request(app).put("/config/laboratorio").send({ nombre: "x" }),
      request(app).get("/config/tamano-impresion"),
      request(app).put("/config/tamano-impresion").send({ valor: "a4" }),
      request(app).get("/config/impresora"),
      request(app).put("/config/impresora").send({ nombreDispositivo: "x", nombreVisible: "x" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("rechaza (403) a una sesión sin el permiso CONFIGURACION_EDITAR (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).get("/config/laboratorio").set("Cookie", cookieSinPermiso),
      request(app).put("/config/laboratorio").set("Cookie", cookieSinPermiso).send({ nombre: "x" }),
      request(app).get("/config/tamano-impresion").set("Cookie", cookieSinPermiso),
      request(app).put("/config/tamano-impresion").set("Cookie", cookieSinPermiso).send({ valor: "a4" }),
      request(app).get("/config/impresora").set("Cookie", cookieSinPermiso),
      request(app).put("/config/impresora").set("Cookie", cookieSinPermiso).send({ nombreDispositivo: "x", nombreVisible: "x" })
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

  describe("GET/PUT /config/tamano-impresion", () => {
    it("GET devuelve 'ticket' cuando nunca se configuró nada (default)", async () => {
      const res = await request(app).get("/config/tamano-impresion").set("Cookie", cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toBe("ticket");
    });

    it("PUT guarda 'a4' y GET lo devuelve — ida y vuelta completa", async () => {
      const put = await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "a4" });
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ ok: true });

      const get = await request(app).get("/config/tamano-impresion").set("Cookie", cookieAdmin);
      expect(get.body).toBe("a4");
    });

    it("PUT se puede volver a 'ticket' explícitamente", async () => {
      await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "a4" });
      await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "ticket" });

      const get = await request(app).get("/config/tamano-impresion").set("Cookie", cookieAdmin);
      expect(get.body).toBe("ticket");
    });

    it("PUT rechaza un valor que no sea 'ticket'/'a4' (400) y no modifica lo guardado", async () => {
      await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "a4" });
      const res = await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "carta" });
      expect(res.status).toBe(400);

      const get = await request(app).get("/config/tamano-impresion").set("Cookie", cookieAdmin);
      expect(get.body).toBe("a4"); // no se tocó
    });

    it("PUT registra auditoría de la modificación", async () => {
      await request(app).put("/config/tamano-impresion").set("Cookie", cookieAdmin).send({ valor: "a4" });
      const { rows } = await ctx.db.query<{ accion: string; entidad: string; detalle: unknown }>(
        "SELECT accion, entidad, detalle FROM auditoria WHERE entidad = 'configuracion' ORDER BY id DESC LIMIT 1"
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].accion).toBe("modificar");
      expect(JSON.stringify(rows[0].detalle)).toContain("comprobante.tamanoImpresion");
    });
  });

  // Rutas nuevas (plan de seguridad del escritorio): único dato que el
  // escritorio persiste en Postgres hoy (el nombre de la impresora
  // elegida) — antes vía una conexión directa, ahora vía esta ruta, mismo
  // patrón exacto que /tamano-impresion de arriba.
  describe("GET/PUT /config/impresora", () => {
    it("GET devuelve null cuando nunca se configuró ninguna impresora", async () => {
      const res = await request(app).get("/config/impresora").set("Cookie", cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("PUT guarda el dispositivo elegido y GET lo devuelve — ida y vuelta completa", async () => {
      const put = await request(app)
        .put("/config/impresora")
        .set("Cookie", cookieAdmin)
        .send({ nombreDispositivo: "EPSON_TM_T20", nombreVisible: "Epson TM-T20 (mostrador)" });
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ ok: true });

      const get = await request(app).get("/config/impresora").set("Cookie", cookieAdmin);
      expect(get.status).toBe(200);
      expect(get.body).toEqual({ nombreDispositivo: "EPSON_TM_T20", nombreVisible: "Epson TM-T20 (mostrador)" });
    });

    it("PUT rechaza un cuerpo sin nombreDispositivo/nombreVisible (400) y no modifica lo guardado", async () => {
      await request(app)
        .put("/config/impresora")
        .set("Cookie", cookieAdmin)
        .send({ nombreDispositivo: "IMPRESORA_PREVIA", nombreVisible: "Previa" });

      const res = await request(app).put("/config/impresora").set("Cookie", cookieAdmin).send({ nombreDispositivo: "" });
      expect(res.status).toBe(400);

      const get = await request(app).get("/config/impresora").set("Cookie", cookieAdmin);
      expect(get.body).toEqual({ nombreDispositivo: "IMPRESORA_PREVIA", nombreVisible: "Previa" });
    });

    it("PUT registra auditoría de la selección", async () => {
      await request(app)
        .put("/config/impresora")
        .set("Cookie", cookieAdmin)
        .send({ nombreDispositivo: "EPSON_TM_T20", nombreVisible: "Epson TM-T20" });
      const { rows } = await ctx.db.query<{ accion: string; entidad: string; detalle: unknown }>(
        "SELECT accion, entidad, detalle FROM auditoria WHERE entidad = 'configuracion' ORDER BY id DESC LIMIT 1"
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].accion).toBe("seleccionar_impresora");
      expect(JSON.stringify(rows[0].detalle)).toContain("EPSON_TM_T20");
    });
  });
});
