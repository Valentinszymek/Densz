import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { registrarAuditoria } from "../../src/main/db/repositories/auditoriaRepo";
import { crearRouterAuditoria } from "../../src/server/routes/auditoria.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auditoria", crearRouterAuditoria(db));
  return app;
}

const ENTIDAD_TEST = "entidad_test_fase10a";

/**
 * Pruebas HTTP de /auditoria (Fase 10A) — mismo patrón que el resto de
 * server*.test.ts. No existía ningún test a nivel HTTP para esta ruta
 * todavía (solo auditoriaRepo.test.ts, a nivel de repositorio).
 */
describe("HTTP /auditoria", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;
  let idPrimero: number;
  let idSegundo: number;
  let idTercero: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx;
    app = construirApp(db as unknown as Pool);

    // Tres eventos sintéticos, con una entidad claramente marcada como de
    // prueba, para poder aislarlos del resto de auditoría real que ya
    // exista en la transacción (el usuario de arranque, etc.) — creados en
    // secuencia para poder verificar el orden "más reciente primero" por
    // id, sin depender de manipular `fecha` (columna con default propio).
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: ENTIDAD_TEST, entidadId: 1, detalle: { nota: "primero" } });
    const { rows: r1Rows } = await db.query<{ id: number }>(
      "SELECT id FROM auditoria WHERE entidad = $1 ORDER BY id DESC LIMIT 1",
      [ENTIDAD_TEST]
    );
    idPrimero = r1Rows[0].id;

    await registrarAuditoria(db, { usuarioId, accion: "modificar", entidad: ENTIDAD_TEST, entidadId: 2, detalle: { nota: "segundo" } });
    const { rows: r2Rows } = await db.query<{ id: number }>(
      "SELECT id FROM auditoria WHERE entidad = $1 ORDER BY id DESC LIMIT 1",
      [ENTIDAD_TEST]
    );
    idSegundo = r2Rows[0].id;

    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: ENTIDAD_TEST, entidadId: 3, detalle: { nota: "tercero" } });
    const { rows: r3Rows } = await db.query<{ id: number }>(
      "SELECT id FROM auditoria WHERE entidad = $1 ORDER BY id DESC LIMIT 1",
      [ENTIDAD_TEST]
    );
    idTercero = r3Rows[0].id;

    sesionAdminId = crearSesionHttp({
      usuarioId,
      nombreUsuario: "admin-test-auditoria",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "auditoria.ver").
    sesionSinPermisoId = crearSesionHttp({
      usuarioId,
      nombreUsuario: "recepcion-test-auditoria",
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
      const { rows } = await verificacion.db.query("SELECT id FROM auditoria WHERE entidad = $1", [ENTIDAD_TEST]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en ambas rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/auditoria"),
      request(app).get("/auditoria/opciones-filtro")
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("rechaza (403) a una sesión sin el permiso AUDITORIA_VER (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).get("/auditoria").set("Cookie", cookieSinPermiso),
      request(app).get("/auditoria/opciones-filtro").set("Cookie", cookieSinPermiso)
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("GET /auditoria filtrado por la entidad de prueba: orden más reciente primero (por fecha, desempate por id)", async () => {
    const res = await request(app).get(`/auditoria?entidad=${ENTIDAD_TEST}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.map((e: { id: number }) => e.id)).toEqual([idTercero, idSegundo, idPrimero]);
    expect(res.body.pagina).toBe(1);
    expect(res.body.tamanoPagina).toBeGreaterThan(0);
  });

  it("cada evento trae actor, acción, entidad, fecha y detalle — nunca contraseñas ni hashes", async () => {
    const res = await request(app).get(`/auditoria?entidad=${ENTIDAD_TEST}`).set("Cookie", cookieAdmin);
    for (const evento of res.body.items) {
      expect(evento).toMatchObject({
        id: expect.any(Number),
        usuarioId: ctx.usuarioId,
        fecha: expect.any(String),
        accion: expect.any(String),
        entidad: ENTIDAD_TEST
      });
      expect(evento.usuarioNombre).toBeTruthy();
      const crudo = JSON.stringify(evento);
      expect(crudo.toLowerCase()).not.toMatch(/password|contraseñ|passwordhash|service_role|token/);
      expect(crudo).not.toMatch(/\$2[aby]\$/);
    }
  });

  it("filtra por acción y por búsqueda de texto (nota del detalle)", async () => {
    const porAccion = await request(app).get(`/auditoria?entidad=${ENTIDAD_TEST}&accion=eliminar`).set("Cookie", cookieAdmin);
    expect(porAccion.body.total).toBe(1);
    expect(porAccion.body.items[0].id).toBe(idTercero);

    const porBusqueda = await request(app).get(`/auditoria?entidad=${ENTIDAD_TEST}&busqueda=segundo`).set("Cookie", cookieAdmin);
    expect(porBusqueda.body.total).toBe(1);
    expect(porBusqueda.body.items[0].id).toBe(idSegundo);
  });

  it("filtra por usuarioId", async () => {
    const res = await request(app)
      .get(`/auditoria?entidad=${ENTIDAD_TEST}&usuarioId=${ctx.usuarioId}`)
      .set("Cookie", cookieAdmin);
    expect(res.body.total).toBe(3);
  });

  it("paginación: una página fuera de rango no rompe, devuelve items vacíos con el total real", async () => {
    const res = await request(app).get(`/auditoria?entidad=${ENTIDAD_TEST}&pagina=999`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.pagina).toBe(999);
  });

  it("rechaza un filtro inválido (400), ej. página negativa", async () => {
    const res = await request(app).get(`/auditoria?pagina=-1`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(400);
  });

  it("GET /auditoria/opciones-filtro incluye la entidad de prueba entre las entidades reales", async () => {
    const res = await request(app).get("/auditoria/opciones-filtro").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.entidades).toContain(ENTIDAD_TEST);
    expect(res.body.acciones).toEqual(expect.arrayContaining(["crear", "modificar", "eliminar"]));
    expect(res.body.usuarios.some((u: { id: number }) => u.id === ctx.usuarioId)).toBe(true);
  });

  it("es de solo lectura: nunca escribe en la tabla auditoria", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) c FROM auditoria");
    await request(app).get("/auditoria").set("Cookie", cookieAdmin);
    await request(app).get("/auditoria/opciones-filtro").set("Cookie", cookieAdmin);
    const despues = await ctx.db.query("SELECT COUNT(*) c FROM auditoria");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });
});
