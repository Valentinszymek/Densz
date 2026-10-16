import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
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
