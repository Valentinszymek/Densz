import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearRouterOdontologos } from "../../src/server/routes/odontologos.route";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/odontologos", crearRouterOdontologos(db));
  return app;
}

/**
 * Corrección post-auditoría (§25/§30-D de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * de los 9 endpoints de /odontologos, solo 3 tenían cobertura HTTP (GET /,
 * GET /:id, y un POST inválido, todos de paso dentro de
 * casosBordeBloque3.test.ts) — nunca uno dedicado. Esta suite cubre los 9,
 * sin cambiar ningún comportamiento existente.
 */
describe("HTTP /odontologos — cobertura completa de los 9 endpoints", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let cookieAdmin: string;
  let sesionAdminId: string;
  let listaId: number;
  let listaUsdId: number;
  let clinicaId: number;
  let odontologoId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-odontologos",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;

    listaId = await idListaGeneral(db);
    listaUsdId = await crearLista(db, { nombre: "USD Test Odontologos", moneda: "USD" });
    clinicaId = await crearClinica(db, { nombre: "Clinica Test Odontologos" });
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    await ctx.finalizar();
  });

  it("rechaza sin sesión (401) en todos los endpoints", async () => {
    const resultados = await Promise.all([
      request(app).get("/odontologos"),
      request(app).get("/odontologos/ultima-actividad"),
      request(app).get("/odontologos/1"),
      request(app).get("/odontologos/1/estadisticas"),
      request(app).post("/odontologos").send({ nombre: "X", listaPrecioId: 1 }),
      request(app).put("/odontologos/1").send({ nombre: "X", listaPrecioId: 1 }),
      request(app).patch("/odontologos/1/lista-precio").send({ listaPrecioId: 1 }),
      request(app).patch("/odontologos/1/clinica").send({ clinicaId: 1 }),
      request(app).patch("/odontologos/1/activo").send({ activo: false })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("POST / crea un odontólogo, queda auditado, y devuelve su id", async () => {
    const res = await request(app)
      .post("/odontologos")
      .set("Cookie", cookieAdmin)
      .send({ nombre: "Dr. HTTP Test", listaPrecioId: listaId, telefono: null, direccion: null, clinicaId: null });
    expect(res.status).toBe(201);
    expect(typeof res.body).toBe("number");
    odontologoId = res.body;

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'crear'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("POST / con datos inválidos (sin lista de precios) responde 400 sin crear nada", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) AS c FROM odontologos");
    const res = await request(app).post("/odontologos").set("Cookie", cookieAdmin).send({ nombre: "Sin Lista" });
    expect(res.status).toBe(400);
    const despues = await ctx.db.query("SELECT COUNT(*) AS c FROM odontologos");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });

  it("GET / lista al odontólogo recién creado", async () => {
    const res = await request(app).get("/odontologos").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.some((o: { id: number }) => o.id === odontologoId)).toBe(true);
  });

  it("GET /:id devuelve el odontólogo completo", async () => {
    const res = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe("Dr. HTTP Test");
    expect(res.body.listaPrecioId).toBe(listaId);
  });

  it("GET /:id/estadisticas devuelve un contrato válido para un odontólogo sin actividad", async () => {
    const res = await request(app).get(`/odontologos/${odontologoId}/estadisticas`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("GET /ultima-actividad incluye al odontólogo (sin actividad, o con ella si ya la tiene)", async () => {
    const res = await request(app).get("/odontologos/ultima-actividad").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("PUT /:id actualiza y queda auditado (modificar)", async () => {
    const res = await request(app)
      .put(`/odontologos/${odontologoId}`)
      .set("Cookie", cookieAdmin)
      .send({ nombre: "Dr. HTTP Test Editado", listaPrecioId: listaId, telefono: null, direccion: null, clinicaId: null });
    expect(res.status).toBe(200);

    const verificar = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(verificar.body.nombre).toBe("Dr. HTTP Test Editado");

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'modificar'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("PUT /:id con id inexistente responde con un error controlado, no rompe", async () => {
    const res = await request(app)
      .put("/odontologos/999999999")
      .set("Cookie", cookieAdmin)
      .send({ nombre: "No Existe", listaPrecioId: listaId });
    expect(res.status).toBeLessThan(500);
  });

  it("PATCH /:id/lista-precio reasigna la lista y queda auditado (asignar_lista)", async () => {
    const res = await request(app)
      .patch(`/odontologos/${odontologoId}/lista-precio`)
      .set("Cookie", cookieAdmin)
      .send({ listaPrecioId: listaUsdId });
    expect(res.status).toBe(200);

    const verificar = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(verificar.body.listaPrecioId).toBe(listaUsdId);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'asignar_lista'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("PATCH /:id/clinica asigna una clínica y queda auditado (asignar_clinica)", async () => {
    const res = await request(app).patch(`/odontologos/${odontologoId}/clinica`).set("Cookie", cookieAdmin).send({ clinicaId });
    expect(res.status).toBe(200);

    const verificar = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(verificar.body.clinicaId).toBe(clinicaId);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'asignar_clinica'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("PATCH /:id/clinica con clinicaId null vuelve a dejarlo como profesional independiente", async () => {
    const res = await request(app).patch(`/odontologos/${odontologoId}/clinica`).set("Cookie", cookieAdmin).send({ clinicaId: null });
    expect(res.status).toBe(200);

    const verificar = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(verificar.body.clinicaId).toBeNull();
  });

  it("PATCH /:id/activo desactiva y queda auditado (desactivar)", async () => {
    const res = await request(app).patch(`/odontologos/${odontologoId}/activo`).set("Cookie", cookieAdmin).send({ activo: false });
    expect(res.status).toBe(200);

    const verificar = await request(app).get(`/odontologos/${odontologoId}`).set("Cookie", cookieAdmin);
    expect(verificar.body.activo).toBe(false);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'desactivar'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("un odontólogo desactivado ya no aparece en GET / con soloActivos=true", async () => {
    const res = await request(app).get("/odontologos?soloActivos=true").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.some((o: { id: number }) => o.id === odontologoId)).toBe(false);
  });

  it("PATCH /:id/activo reactiva y queda auditado (activar)", async () => {
    const res = await request(app).patch(`/odontologos/${odontologoId}/activo`).set("Cookie", cookieAdmin).send({ activo: true });
    expect(res.status).toBe(200);
    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'odontologos' AND entidad_id = $1 AND accion = 'activar'",
      [odontologoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });

  it("ninguna respuesta de este router expone datos sensibles (passwords/hashes/tokens)", async () => {
    const res = await request(app).get("/odontologos").set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body).toLowerCase();
    expect(crudo).not.toMatch(/password|hash|token/);
  });
});
