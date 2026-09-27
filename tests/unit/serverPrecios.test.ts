import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterPrecios } from "../../src/server/routes/precios.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/precios", crearRouterPrecios(db));
  return app;
}

const ENTIDAD_TEST = "Categoria Test Fase12A";

/**
 * Pruebas HTTP de /precios (Fase 12A) — mismo patrón que el resto de
 * server*.test.ts: transacción compartida con ROLLBACK real, verificación
 * final por SQL con conexión nueva. No existía ningún test a nivel HTTP
 * para esta ruta todavía (solo preciosRepo.test.ts, a nivel de repositorio).
 */
describe("HTTP /precios", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;
  let categoriaId: number;
  let prestacionId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-precios",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "precios.editar").
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-precios",
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
      const { rows } = await verificacion.db.query("SELECT id FROM categorias_precio WHERE nombre = $1", [ENTIDAD_TEST]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en lectura y escritura", async () => {
    const resultados = await Promise.all([
      request(app).get("/precios/categorias"),
      request(app).get("/precios/prestaciones"),
      request(app).post("/precios/categorias").send({ nombre: "x" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("lectura (categorias/prestaciones) permitida sin el permiso precios.editar — mismo criterio que Desktop", async () => {
    const resultados = await Promise.all([
      request(app).get("/precios/categorias").set("Cookie", cookieSinPermiso),
      request(app).get("/precios/prestaciones").set("Cookie", cookieSinPermiso)
    ]);
    for (const r of resultados) expect(r.status).toBe(200);
  });

  it("escritura rechaza (403) sin el permiso real precios.editar (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).post("/precios/categorias").set("Cookie", cookieSinPermiso).send({ nombre: "x" }),
      request(app).post("/precios/prestaciones").set("Cookie", cookieSinPermiso).send({ categoriaId: 1, nombre: "x" })
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("crea una categoría, la lista, la actualiza y la desactiva", async () => {
    const crear = await request(app).post("/precios/categorias").set("Cookie", cookieAdmin).send({ nombre: ENTIDAD_TEST });
    expect(crear.status).toBe(201);
    categoriaId = crear.body as number;

    const listar = await request(app).get("/precios/categorias").set("Cookie", cookieAdmin);
    expect(listar.body.some((c: { id: number; nombre: string }) => c.id === categoriaId && c.nombre === ENTIDAD_TEST)).toBe(
      true
    );

    const actualizar = await request(app)
      .put(`/precios/categorias/${categoriaId}`)
      .set("Cookie", cookieAdmin)
      .send({ nombre: `${ENTIDAD_TEST} editada` });
    expect(actualizar.status).toBe(200);

    const desactivar = await request(app)
      .patch(`/precios/categorias/${categoriaId}/activo`)
      .set("Cookie", cookieAdmin)
      .send({ activo: false });
    expect(desactivar.status).toBe(200);

    const soloActivas = await request(app).get("/precios/categorias?soloActivas=true").set("Cookie", cookieAdmin);
    expect(soloActivas.body.some((c: { id: number }) => c.id === categoriaId)).toBe(false);

    // Reactivar para el resto de los tests.
    await request(app).patch(`/precios/categorias/${categoriaId}/activo`).set("Cookie", cookieAdmin).send({ activo: true });
  });

  it("GET /precios/categorias/:id/uso responde 200 (sin uso todavía, categoría recién creada)", async () => {
    const res = await request(app).get(`/precios/categorias/${categoriaId}/uso`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cantidadPrestaciones: expect.any(Number), prestacionesConHistorial: expect.any(Number) });
  });

  it("crea una prestación en la categoría de prueba, la lista, la actualiza y consulta su uso", async () => {
    const crear = await request(app)
      .post("/precios/prestaciones")
      .set("Cookie", cookieAdmin)
      .send({ categoriaId, nombre: "Prestacion Test Fase12A" });
    expect(crear.status).toBe(201);
    prestacionId = crear.body as number;

    const obtener = await request(app).get(`/precios/prestaciones/${prestacionId}`).set("Cookie", cookieAdmin);
    expect(obtener.status).toBe(200);
    expect(obtener.body.nombre).toBe("Prestacion Test Fase12A");
    expect(obtener.body.categoriaId).toBe(categoriaId);

    const listar = await request(app).get(`/precios/prestaciones?categoriaId=${categoriaId}`).set("Cookie", cookieAdmin);
    expect(listar.body.some((p: { id: number }) => p.id === prestacionId)).toBe(true);

    const actualizar = await request(app)
      .put(`/precios/prestaciones/${prestacionId}`)
      .set("Cookie", cookieAdmin)
      .send({ categoriaId, nombre: "Prestacion Test Fase12A editada" });
    expect(actualizar.status).toBe(200);

    const uso = await request(app).get(`/precios/prestaciones/${prestacionId}/uso`).set("Cookie", cookieAdmin);
    expect(uso.status).toBe(200);
  });

  it("categoriasMover cambia el orden (200) sin romper nada", async () => {
    const res = await request(app).patch(`/precios/categorias/${categoriaId}/mover`).set("Cookie", cookieAdmin).send({ direccion: "arriba" });
    expect(res.status).toBe(200);
  });

  it("rechaza payload inválido al crear (400) sin crear nada", async () => {
    const res = await request(app).post("/precios/categorias").set("Cookie", cookieAdmin).send({ nombre: "" });
    expect(res.status).toBe(400);
  });

  it("ninguna respuesta expone datos sensibles", async () => {
    const res = await request(app).get("/precios/categorias").set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body).toLowerCase();
    expect(crudo).not.toMatch(/password|service_role|token/);
  });

  // --- Eliminación segura (Bloque 2 / Parte B) ---
  it("DELETE de prestación/categoría rechaza (403) sin el permiso real precios.editar", async () => {
    const resultados = await Promise.all([
      request(app).delete(`/precios/prestaciones/${prestacionId}`).set("Cookie", cookieSinPermiso),
      request(app).delete(`/precios/categorias/${categoriaId}`).set("Cookie", cookieSinPermiso)
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("elimina físicamente una prestación sin ningún uso histórico, y luego la categoría que queda vacía", async () => {
    const eliminarPrestacion = await request(app).delete(`/precios/prestaciones/${prestacionId}`).set("Cookie", cookieAdmin);
    expect(eliminarPrestacion.status).toBe(200);
    const { rows: prestacionRows } = await ctx.db.query("SELECT id FROM prestaciones WHERE id = $1", [prestacionId]);
    expect(prestacionRows).toHaveLength(0);

    const eliminarCategoria = await request(app).delete(`/precios/categorias/${categoriaId}`).set("Cookie", cookieAdmin);
    expect(eliminarCategoria.status).toBe(200);
    const { rows: categoriaRows } = await ctx.db.query("SELECT id FROM categorias_precio WHERE id = $1", [categoriaId]);
    expect(categoriaRows).toHaveLength(0);
  });

  it("las eliminaciones quedan en Auditoría", async () => {
    const { rows } = await ctx.db.query(
      "SELECT entidad, accion FROM auditoria WHERE entidad IN ('prestaciones','categorias_precio') AND accion = 'eliminar' ORDER BY id"
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
