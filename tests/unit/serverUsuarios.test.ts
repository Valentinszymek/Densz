import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

/**
 * Pruebas HTTP de /usuarios (Fase 10A) — mismo patrón que el resto de
 * server*.test.ts: transacción compartida con ROLLBACK real, verificación
 * final por SQL con conexión nueva. No existía ningún test a nivel HTTP
 * para esta ruta todavía (solo usuariosRepo.test.ts, a nivel de servicio).
 */
describe("HTTP /usuarios", () => {
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
      nombreUsuario: "admin-test-usuarios",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "usuarios.gestionar") — para probar el permiso, no un set inventado.
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-usuarios",
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
      // Esta suite es 100% lectura — no debería haber quedado ningún
      // usuario nuevo (el único que existe es el admin de arranque, ya
      // revertido por el ROLLBACK de arriba).
      const { rows } = await verificacion.db.query(
        "SELECT id FROM usuarios WHERE nombre_usuario IN ('admin-test-usuarios', 'recepcion-test-usuarios')"
      );
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en ambas rutas", async () => {
    const resultados = await Promise.all([request(app).get("/usuarios"), request(app).get("/usuarios/roles")]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("rechaza (403) a una sesión sin el permiso USUARIOS_GESTIONAR (mismo set real que RECEPCION)", async () => {
    const resultados = await Promise.all([
      request(app).get("/usuarios").set("Cookie", cookieSinPermiso),
      request(app).get("/usuarios/roles").set("Cookie", cookieSinPermiso)
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("GET /usuarios devuelve 200 con el permiso correcto, e incluye al usuario de arranque", async () => {
    const res = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((u: { id: number }) => u.id === ctx.usuarioId)).toBe(true);
  });

  // --- Seguridad de datos: el requisito más importante de esta fase ---
  it("NUNCA devuelve passwordHash (ni ningún campo de contraseña) en ninguna fila", async () => {
    const res = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const usuario of res.body) {
      expect(usuario).not.toHaveProperty("passwordHash");
      expect(usuario).not.toHaveProperty("password_hash");
      expect(usuario).not.toHaveProperty("password");
      // Ningún valor del objeto es literalmente el hash bcrypt (por si
      // viajara bajo otro nombre de campo por error).
      const valores = JSON.stringify(usuario);
      expect(valores).not.toMatch(/\$2[aby]\$/); // prefijo típico de un hash bcrypt
    }
  });

  it("cada usuario trae exactamente los campos esperados (nombre, rol, estado) — nada de más", async () => {
    const res = await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    const usuario = res.body.find((u: { id: number }) => u.id === ctx.usuarioId);
    expect(usuario).toMatchObject({
      id: ctx.usuarioId,
      nombreUsuario: expect.any(String),
      nombreCompleto: expect.any(String),
      rolId: expect.any(Number),
      rolNombre: expect.any(String),
      activo: expect.any(Boolean)
    });
  });

  it("GET /usuarios/roles devuelve 200 con los roles reales, permisos incluidos (no son secretos)", async () => {
    const res = await request(app).get("/usuarios/roles").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const admin = res.body.find((r: { nombre: string }) => r.nombre === "ADMINISTRADOR");
    expect(admin).toBeDefined();
    expect(admin.permisos).toContain("*");
  });

  it("es de solo lectura: nunca escribe en la tabla usuarios", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) c FROM usuarios");
    await request(app).get("/usuarios").set("Cookie", cookieAdmin);
    await request(app).get("/usuarios/roles").set("Cookie", cookieAdmin);
    const despues = await ctx.db.query("SELECT COUNT(*) c FROM usuarios");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });
});
