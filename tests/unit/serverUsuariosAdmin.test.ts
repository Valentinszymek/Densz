import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterUsuarios } from "../../src/server/routes/usuarios.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/usuarios", crearRouterUsuarios(db));
  return app;
}

const NOMBRE_TEST = "usuario-test-bloque1";

/**
 * Pruebas HTTP de las escrituras de /usuarios (Bloque 1) — la lectura ya
 * tenía cobertura (serverUsuarios.test.ts, Fase 10A); este archivo cubre
 * crear/actualizar/cambiar-password/activar-desactivar, que no existían
 * como ruta HTTP hasta este bloque. Mismo patrón: transacción con
 * ROLLBACK real, verificación final por SQL con conexión nueva.
 */
describe("HTTP /usuarios — administración (Bloque 1)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;
  let rolId: number;
  let usuarioCreadoId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    const { rows } = await ctx.db.query<{ id: number }>("SELECT id FROM roles WHERE nombre = 'RECEPCION'");
    rolId = rows[0].id;

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-a-test-usuarios-admin",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "usuarios.gestionar").
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-usuarios-admin",
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
      const { rows } = await verificacion.db.query("SELECT id FROM usuarios WHERE nombre_usuario ILIKE $1", [`%${NOMBRE_TEST}%`]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en las 4 rutas de escritura", async () => {
    const resultados = await Promise.all([
      request(app).post("/usuarios").send({ nombreUsuario: "x", rolId, password: "123456" }),
      request(app).put("/usuarios/1").send({ nombreUsuario: "x", nombreCompleto: "x", rolId }),
      request(app).patch("/usuarios/1/password").send({ nuevaPassword: "123456" }),
      request(app).patch("/usuarios/1/activo").send({ activo: false })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("rechaza (403) sin el permiso real usuarios.gestionar (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).post("/usuarios").set("Cookie", cookieSinPermiso).send({ nombreUsuario: "x", rolId, password: "123456" }),
      request(app).put("/usuarios/1").set("Cookie", cookieSinPermiso).send({ nombreUsuario: "x", nombreCompleto: "x", rolId }),
      request(app).patch("/usuarios/1/password").set("Cookie", cookieSinPermiso).send({ nuevaPassword: "123456" }),
      request(app).patch("/usuarios/1/activo").set("Cookie", cookieSinPermiso).send({ activo: false })
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("crea un usuario, nunca devuelve la contraseña ni el hash en la respuesta", async () => {
    const res = await request(app)
      .post("/usuarios")
      .set("Cookie", cookieAdmin)
      .send({ nombreUsuario: NOMBRE_TEST, rolId, password: "clave-inicial-123" });
    expect(res.status).toBe(201);
    usuarioCreadoId = res.body as number;
    expect(typeof usuarioCreadoId).toBe("number");

    const crudo = JSON.stringify(res.body);
    expect(crudo.toLowerCase()).not.toMatch(/password|hash/);
  });

  it("no permite crear un segundo usuario con el mismo nombre (400)", async () => {
    const res = await request(app)
      .post("/usuarios")
      .set("Cookie", cookieAdmin)
      .send({ nombreUsuario: NOMBRE_TEST, rolId, password: "otra-clave-123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya existe/i);
  });

  it("el usuario creado aparece en GET /usuarios, sin passwordHash, con el nombre completado automáticamente", async () => {
    const res = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    const usuario = res.body.find((u: { id: number }) => u.id === usuarioCreadoId);
    expect(usuario).toBeDefined();
    expect(usuario).not.toHaveProperty("passwordHash");
    expect(usuario.nombreUsuario).toBe(NOMBRE_TEST);
    expect(usuario.nombreCompleto).toBe(NOMBRE_TEST);
    expect(usuario.rolId).toBe(rolId);
    expect(usuario.activo).toBe(true);
  });

  it("PUT actualiza nombreUsuario/nombreCompleto/rol", async () => {
    const res = await request(app)
      .put(`/usuarios/${usuarioCreadoId}`)
      .set("Cookie", cookieAdmin)
      .send({ nombreUsuario: NOMBRE_TEST, nombreCompleto: `${NOMBRE_TEST} editado`, rolId });
    expect(res.status).toBe(200);

    const listado = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    const usuario = listado.body.find((u: { id: number }) => u.id === usuarioCreadoId);
    expect(usuario.nombreCompleto).toBe(`${NOMBRE_TEST} editado`);
  });

  it("PATCH /password cambia el hash real (verificado directo contra la base) y nunca devuelve la contraseña", async () => {
    const res = await request(app)
      .patch(`/usuarios/${usuarioCreadoId}/password`)
      .set("Cookie", cookieAdmin)
      .send({ nuevaPassword: "clave-nueva-456" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const { rows } = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [
      usuarioCreadoId
    ]);
    expect(bcrypt.compareSync("clave-nueva-456", rows[0].password_hash)).toBe(true);
    expect(bcrypt.compareSync("clave-inicial-123", rows[0].password_hash)).toBe(false);
  });

  it("rechaza una contraseña de menos de 6 caracteres (400), sin cambiar el hash", async () => {
    const antes = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [usuarioCreadoId]);
    const res = await request(app).patch(`/usuarios/${usuarioCreadoId}/password`).set("Cookie", cookieAdmin).send({ nuevaPassword: "123" });
    expect(res.status).toBe(400);
    const despues = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [usuarioCreadoId]);
    expect(despues.rows[0].password_hash).toBe(antes.rows[0].password_hash);
  });

  it("desactiva y reactiva el usuario sin eliminarlo", async () => {
    const desactivar = await request(app).patch(`/usuarios/${usuarioCreadoId}/activo`).set("Cookie", cookieAdmin).send({ activo: false });
    expect(desactivar.status).toBe(200);
    const inactivo = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    expect(inactivo.body.find((u: { id: number }) => u.id === usuarioCreadoId).activo).toBe(false);

    const reactivar = await request(app).patch(`/usuarios/${usuarioCreadoId}/activo`).set("Cookie", cookieAdmin).send({ activo: true });
    expect(reactivar.status).toBe(200);

    const { rows } = await ctx.db.query("SELECT id FROM usuarios WHERE id = $1", [usuarioCreadoId]);
    expect(rows).toHaveLength(1); // sigue existiendo, nunca se borró
  });

  it("no permite que un administrador se desactive a sí mismo (400), mismo mensaje que Desktop", async () => {
    const res = await request(app)
      .patch(`/usuarios/${ctx.usuarioId}/activo`)
      .set("Cookie", cookieAdmin)
      .send({ activo: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no podés desactivar tu propio usuario/i);

    const { rows } = await ctx.db.query("SELECT activo FROM usuarios WHERE id = $1", [ctx.usuarioId]);
    expect(rows[0].activo).toBe(1);
  });

  it("cada operación administrativa queda en Auditoría, sin la contraseña ni el hash en el detalle", async () => {
    const { rows } = await ctx.db.query<{ accion: string; detalle: unknown }>(
      "SELECT accion, detalle FROM auditoria WHERE entidad = 'usuarios' AND entidad_id = $1 ORDER BY id",
      [usuarioCreadoId]
    );
    const acciones = rows.map((r) => r.accion);
    expect(acciones).toEqual(expect.arrayContaining(["crear", "modificar", "cambiar_password", "desactivar", "activar"]));
    for (const fila of rows) {
      const crudo = JSON.stringify(fila.detalle);
      expect(crudo).not.toContain("clave-inicial-123");
      expect(crudo).not.toContain("clave-nueva-456");
      expect(crudo.toLowerCase()).not.toMatch(/passwordhash|"password"/);
      expect(crudo).not.toMatch(/\$2[aby]\$/);
    }
  });

  // --- Eliminación segura (Bloque 2 / Parte B) ---
  it("rechaza sin sesión (401) y sin permiso (403) el DELETE", async () => {
    const sinSesion = await request(app).delete(`/usuarios/${usuarioCreadoId}`);
    expect(sinSesion.status).toBe(401);
    const sinPermiso = await request(app).delete(`/usuarios/${usuarioCreadoId}`).set("Cookie", cookieSinPermiso);
    expect(sinPermiso.status).toBe(403);
  });

  it("no permite que un administrador se elimine a sí mismo (400)", async () => {
    const res = await request(app).delete(`/usuarios/${ctx.usuarioId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no podés eliminar el usuario con el que estás conectado/i);
    const { rows } = await ctx.db.query("SELECT id FROM usuarios WHERE id = $1", [ctx.usuarioId]);
    expect(rows).toHaveLength(1);
  });

  it("elimina físicamente un usuario sin ningún historial de actividad, y queda en Auditoría", async () => {
    const res = await request(app).delete(`/usuarios/${usuarioCreadoId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    const { rows } = await ctx.db.query("SELECT id FROM usuarios WHERE id = $1", [usuarioCreadoId]);
    expect(rows).toHaveLength(0);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'usuarios' AND entidad_id = $1 AND accion = 'eliminar'",
      [usuarioCreadoId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });
});
