import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
import { crearRouterAuth } from "../../src/server/routes/auth.route";
import { crearUsuario, setActivoUsuario, listarRoles } from "../../src/main/db/repositories/usuariosRepo";
import { listarAuditoriaFiltradaCompleta } from "../../src/main/db/repositories/auditoriaRepo";
import { reiniciarLimiteDeIntentos } from "../../src/server/loginRateLimit";
import { errorHandler } from "../../src/server/middleware/errorHandler";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", crearRouterAuth(db));
  app.use(errorHandler);
  return app;
}

/**
 * Corrección post-auditoría (§23.5/§25/§30-D-E de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * `POST /auth/login` no tenía NINGÚN test HTTP dedicado (todos los demás
 * tests HTTP se saltaban el login de verdad, creando la sesión con un
 * helper interno) — Bloque 8. Tampoco tenía límite de intentos — Bloque 6.
 * Esta suite cubre ambos, contra el router Express real (supertest).
 */
describe("HTTP /auth/login", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let rolRecepcionId: number;
  let usuarioActivoId: number;
  let usuarioInactivoId: number;
  const PASSWORD_CORRECTA = "clave-de-test-segura-123";

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const roles = await listarRoles(db);
    rolRecepcionId = roles.find((r) => r.nombre === "RECEPCION")!.id;

    const hash = bcrypt.hashSync(PASSWORD_CORRECTA, 10);
    usuarioActivoId = await crearUsuario(
      db,
      { nombreUsuario: "usuario-login-test", nombreCompleto: "Usuario Login Test", rolId: rolRecepcionId },
      hash
    );
    usuarioInactivoId = await crearUsuario(
      db,
      { nombreUsuario: "usuario-inactivo-test", nombreCompleto: "Usuario Inactivo Test", rolId: rolRecepcionId },
      hash
    );
    await setActivoUsuario(db, usuarioInactivoId, false);
  });

  beforeEach(() => {
    // El límite de intentos vive en memoria del proceso, no en la
    // transacción de test — se reinicia entre tests para que no se
    // contaminen entre sí (cada test prueba su propio escenario).
    reiniciarLimiteDeIntentos();
  });

  afterAll(async () => {
    await ctx.finalizar();
  });

  it("usuario y contraseña correctos: responde 200, crea la cookie de sesión, y GET /auth/session la reconoce después", async () => {
    const res = await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: PASSWORD_CORRECTA });
    expect(res.status).toBe(200);
    expect(res.body.usuarioId).toBe(usuarioActivoId);
    expect(res.body.nombreUsuario).toBe("usuario-login-test");
    // Nunca se devuelve el hash ni nada parecido a una contraseña.
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);

    const cookieHeader = res.headers["set-cookie"];
    expect(cookieHeader).toBeDefined();
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    expect(cookie).toMatch(/densz_session=/);
    expect(cookie).toMatch(/HttpOnly/i);

    const sesionRes = await request(app).get("/auth/session").set("Cookie", cookie);
    expect(sesionRes.status).toBe(200);
    expect(sesionRes.body.usuarioId).toBe(usuarioActivoId);
  });

  it("contraseña incorrecta: responde 401 con el mensaje genérico de siempre", async () => {
    const res = await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: "contraseña-equivocada" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Usuario o contraseña incorrectos.");
  });

  it("usuario inexistente: responde 401 con EXACTAMENTE el mismo mensaje que una contraseña incorrecta (nunca revela si el usuario existe)", async () => {
    const res = await request(app).post("/auth/login").send({ nombreUsuario: "este-usuario-no-existe", password: "cualquiera" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Usuario o contraseña incorrectos.");
  });

  it("usuario inactivo: responde 401 con el mismo mensaje genérico (nunca revela que está desactivado)", async () => {
    const res = await request(app).post("/auth/login").send({ nombreUsuario: "usuario-inactivo-test", password: PASSWORD_CORRECTA });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Usuario o contraseña incorrectos.");
  });

  it("logout borra la sesión: GET /auth/session ya no la reconoce después", async () => {
    const login = await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: PASSWORD_CORRECTA });
    const cookie = login.headers["set-cookie"][0];

    const logout = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });

    const sesionRes = await request(app).get("/auth/session").set("Cookie", cookie);
    expect(sesionRes.body).toBeNull();
  });

  it("cada login correcto y cada intento fallido quedan auditados (login / login_fallido)", async () => {
    const { db } = ctx;
    await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: "mal" });
    await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: PASSWORD_CORRECTA });

    const registros = await listarAuditoriaFiltradaCompleta(db, { entidad: "usuarios" });
    const deEsteUsuario = registros.filter((r) => r.entidadId === usuarioActivoId);
    expect(deEsteUsuario.some((r) => r.accion === "login_fallido")).toBe(true);
    expect(deEsteUsuario.some((r) => r.accion === "login")).toBe(true);
  });

  // --- Límite de intentos (Bloque 6) ---

  it("login normal (sin intentos previos) nunca se ve afectado por el límite", async () => {
    const res = await request(app).post("/auth/login").send({ nombreUsuario: "usuario-login-test", password: PASSWORD_CORRECTA });
    expect(res.status).toBe(200);
  });

  it("varios intentos fallidos seguidos terminan en 429 con un mensaje genérico, antes de llegar al límite todo sigue siendo 401", async () => {
    const usuario = "usuario-limite-test";
    const hash = bcrypt.hashSync(PASSWORD_CORRECTA, 10);
    await crearUsuario(ctx.db, { nombreUsuario: usuario, nombreCompleto: "Usuario Limite Test", rolId: rolRecepcionId }, hash);

    // 5 intentos fallidos: los 5 son 401 (todavía no se llegó al límite en
    // el momento de CADA intento — el límite se evalúa ANTES de intentar).
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: "mal" });
      expect(res.status).toBe(401);
    }

    // El 6º, ya bloqueado, ni siquiera llega a chequear la contraseña.
    const bloqueado = await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: "mal" });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/demasiados intentos/i);

    // Ni siquiera con la contraseña CORRECTA se puede entrar mientras está bloqueado.
    const bloqueadoConCorrecta = await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: PASSWORD_CORRECTA });
    expect(bloqueadoConCorrecta.status).toBe(429);
  });

  it("un login correcto limpia el contador: dos fallos + uno correcto + un fallo más NO llega a bloquear", async () => {
    const usuario = "usuario-recupera-test";
    const hash = bcrypt.hashSync(PASSWORD_CORRECTA, 10);
    await crearUsuario(ctx.db, { nombreUsuario: usuario, nombreCompleto: "Usuario Recupera Test", rolId: rolRecepcionId }, hash);

    await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: "mal" });
    await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: "mal" });
    const correcto = await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: PASSWORD_CORRECTA });
    expect(correcto.status).toBe(200);

    // El contador se reinició: este tercer fallo es el "primero" de nuevo.
    const otroFallo = await request(app).post("/auth/login").send({ nombreUsuario: usuario, password: "mal" });
    expect(otroFallo.status).toBe(401); // no 429 — sigue lejos del límite
  });

  it("el límite es POR USUARIO: bloquear a uno no afecta el login normal de otro", async () => {
    const usuarioA = "usuario-bloqueado-a";
    const usuarioB = "usuario-libre-b";
    const hash = bcrypt.hashSync(PASSWORD_CORRECTA, 10);
    await crearUsuario(ctx.db, { nombreUsuario: usuarioA, nombreCompleto: "A", rolId: rolRecepcionId }, hash);
    await crearUsuario(ctx.db, { nombreUsuario: usuarioB, nombreCompleto: "B", rolId: rolRecepcionId }, hash);

    for (let i = 0; i < 5; i++) {
      await request(app).post("/auth/login").send({ nombreUsuario: usuarioA, password: "mal" });
    }
    const aBloqueado = await request(app).post("/auth/login").send({ nombreUsuario: usuarioA, password: PASSWORD_CORRECTA });
    expect(aBloqueado.status).toBe(429);

    const bNormal = await request(app).post("/auth/login").send({ nombreUsuario: usuarioB, password: PASSWORD_CORRECTA });
    expect(bNormal.status).toBe(200);
  });
});
