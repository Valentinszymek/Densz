import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, crearLaboratorioDePrueba, type TestDb } from "../helpers/testDb";
import { crearRouterAuth } from "../../src/server/routes/auth.route";
import { crearUsuario, listarRoles } from "../../src/main/db/repositories/usuariosRepo";
import { errorHandler } from "../../src/server/middleware/errorHandler";
import * as googleAuthModule from "../../src/server/googleAuth";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", crearRouterAuth(db));
  app.use(errorHandler);
  return app;
}

/**
 * Pruebas HTTP de POST /auth/google-callback. Nunca se habla con Google
 * ni con Supabase Auth de verdad acá — se simula `verificarTokenGoogle`
 * (lo que SÍ hace esa verificación real, src/server/googleAuth.ts,
 * queda probado manualmente cuando haya credenciales reales de Google,
 * ver plan) con `vi.spyOn`, igual patrón que ya usan las pruebas de
 * Storage/Puppeteer de serverComprobantes.test.ts. Lo que SÍ se prueba
 * de punta a punta acá es todo lo que pasa DESPUÉS de verificar el
 * token: buscar/vincular el usuario, armar la sesión, la cookie.
 */
describe("HTTP /auth/google-callback", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let rolId: number;
  let usuarioId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    rolId = (await listarRoles(db)).find((r) => r.nombre === "ADMINISTRADOR")!.id;
    usuarioId = await crearUsuario(db, { nombreUsuario: "google-test", nombreCompleto: "Google Test" , rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["google-test@example.com", usuarioId]);
  });

  afterAll(async () => {
    await ctx.finalizar();
  });

  it("token válido (simulado) de un email ya cargado: responde 200, crea la cookie, y GET /auth/session la reconoce", async () => {
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockResolvedValueOnce({
      supabaseUserId: "sub-http-test-1",
      email: "google-test@example.com",
      nombreCompleto: "Google Test"
    });

    const res = await request(app).post("/auth/google-callback").send({ accessToken: "token-falso-de-test" });
    expect(res.status).toBe(200);
    expect(res.body.usuarioId).toBe(usuarioId);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);

    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(/densz_session=/);

    const sesionRes = await request(app).get("/auth/session").set("Cookie", cookie);
    expect(sesionRes.status).toBe(200);
    expect(sesionRes.body.usuarioId).toBe(usuarioId);
  });

  it("si la verificación del token falla, responde 401 sin crear ninguna sesión", async () => {
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockRejectedValueOnce(new Error("Token inválido"));

    const res = await request(app).post("/auth/google-callback").send({ accessToken: "token-malo" });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("token válido pero de un email sin cuenta en Densz: responde 401 con mensaje claro", async () => {
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockResolvedValueOnce({
      supabaseUserId: "sub-http-test-desconocido",
      email: "no-existe@example.com",
      nombreCompleto: "Nadie"
    });

    const res = await request(app).post("/auth/google-callback").send({ accessToken: "token-de-alguien-sin-cuenta" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no hay ninguna cuenta/i);
  });

  it("falta accessToken en el body: responde 401 (validación de Zod) sin siquiera intentar verificar nada", async () => {
    const espia = vi.spyOn(googleAuthModule, "verificarTokenGoogle");
    const res = await request(app).post("/auth/google-callback").send({});
    expect(res.status).toBe(401);
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("HTTP /auth/usuarios-del-laboratorio", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let rolId: number;
  let usuarioId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    rolId = (await listarRoles(db)).find((r) => r.nombre === "ADMINISTRADOR")!.id;
    usuarioId = await crearUsuario(db, { nombreUsuario: "google-lab-test", nombreCompleto: "Dueño Lab A", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["google-lab-test@example.com", usuarioId]);
  });

  afterAll(async () => {
    // Restaura el laboratorio actual de la conexión al que tenía antes de
    // estos tests (ver más abajo, dos de ellos lo pisan a propósito) —
    // nunca debe quedarle el de otro laboratorio a `ctx.db` para lo que
    // reste de su vida.
    await ctx.db.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [String(ctx.laboratorioId)]);
    await ctx.finalizar();
  });

  it("con una identidad de Google resuelta, devuelve SOLO los usuarios activos de SU laboratorio", async () => {
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockResolvedValueOnce({
      supabaseUserId: "sub-lab-a",
      email: "google-lab-test@example.com",
      nombreCompleto: "Dueño Lab A"
    });

    const res = await request(app).post("/auth/usuarios-del-laboratorio").send({ accessToken: "token-falso" });
    expect(res.status).toBe(200);
    // No se asume la cantidad exacta (createTestDbConUsuario también crea
    // un usuario de arranque en el mismo laboratorio) — solo que el
    // usuario resuelto por Google está en la lista.
    expect((res.body as Array<{ nombreUsuario: string }>).map((u) => u.nombreUsuario)).toContain("google-lab-test");
  });

  it("NUNCA devuelve usuarios de otro laboratorio, aunque esté activo al mismo tiempo", async () => {
    // Laboratorio B, con su propio usuario — totalmente aparte del de
    // arriba (lab A, el de `ctx`).
    const labBId = await crearLaboratorioDePrueba(ctx.db, "Laboratorio B (aislamiento)");
    await ctx.db.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [String(labBId)]);
    const usuarioB = await crearUsuario(
      ctx.db,
      { nombreUsuario: "usuario-lab-b", nombreCompleto: "Alguien del Lab B", rolId },
      bcrypt.hashSync("x", 10)
    );
    await ctx.db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["usuario-lab-b@example.com", usuarioB]);
    // Vuelve a dejar la conexión en el laboratorio A antes de seguir —
    // mismo espíritu que crearLaboratorioDePrueba, nunca se le deja el
    // contexto pisado a quien venía usando esta conexión.
    await ctx.db.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [String(ctx.laboratorioId)]);

    // Mismo supabaseUserId que el test anterior: la función de login real
    // VINCULA la cuenta de Google al primer uso (ver buscar_usuario_login_google),
    // así que un supabaseUserId distinto acá sería "otra cuenta de Google"
    // y el lookup lo rechazaría a propósito — no es lo que este test
    // quiere ejercitar.
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockResolvedValueOnce({
      supabaseUserId: "sub-lab-a",
      email: "google-lab-test@example.com",
      nombreCompleto: "Dueño Lab A"
    });

    const res = await request(app).post("/auth/usuarios-del-laboratorio").send({ accessToken: "token-falso-2" });
    expect(res.status).toBe(200);
    const nombres = (res.body as Array<{ nombreUsuario: string }>).map((u) => u.nombreUsuario);
    expect(nombres).toContain("google-lab-test");
    expect(nombres).not.toContain("usuario-lab-b");
  });

  it("identidad de Google real pero sin ningún laboratorio vinculado: devuelve lista vacía, nunca un error", async () => {
    vi.spyOn(googleAuthModule, "verificarTokenGoogle").mockResolvedValueOnce({
      supabaseUserId: "sub-sin-laboratorio",
      email: "nadie-vinculado@example.com",
      nombreCompleto: "Nadie"
    });

    const res = await request(app).post("/auth/usuarios-del-laboratorio").send({ accessToken: "token-falso-3" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
