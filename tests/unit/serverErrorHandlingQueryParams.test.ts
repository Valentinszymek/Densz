import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
import { crearRouterPrecios } from "../../src/server/routes/precios.route";
import { crearRouterListasPrecio } from "../../src/server/routes/listasPrecio.route";
import { crearRouterEstadisticas } from "../../src/server/routes/estadisticas.route";
import { crearRouterPagos } from "../../src/server/routes/pagos.route";
import { crearRouterCuentas } from "../../src/server/routes/cuentas.route";
import { errorHandler } from "../../src/server/middleware/errorHandler";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

/**
 * Corrección post-auditoría (§23.7/§38.2 de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * estas 5 rutas parseaban un query param con Zod SIN try/catch — un valor
 * inválido dejaba el pedido colgado (sin respuesta) en vez de devolver un
 * 400 claro, porque Express 4 no reenvía por sí solo el rechazo de una
 * promesa de un handler `async` a ningún manejador de errores.
 *
 * Esta suite arma la app real (mismos routers + el mismo errorHandler +
 * express-async-errors que usa src/server/index.ts) y prueba, para cada
 * una de las 5 rutas: parámetro válido → 200; parámetro inválido → 400
 * (nunca cuelga, nunca 500, nunca expone SQL/stack); con sesión válida.
 *
 * "Que no quede colgada" se prueba implícitamente: si el fix no
 * funcionara, `await request(app).get(...)` nunca resolvería y el test
 * fallaría por timeout de Vitest en vez de por una aserción — el timeout
 * default de Vitest (5s) es la propia prueba de "no cuelga".
 */
function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/precios", crearRouterPrecios(db));
  app.use("/listas-precio", crearRouterListasPrecio(db));
  app.use("/estadisticas", crearRouterEstadisticas(db));
  app.use("/pagos", crearRouterPagos(db));
  app.use("/cuentas", crearRouterCuentas(db));
  app.use(errorHandler);
  return app;
}

describe("HTTP — las 5 rutas que antes podían quedar colgadas ante un parámetro inválido", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionId: string;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);
    sesionId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-errores",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookie = `${COOKIE_SESION}=${sesionId}`;
  });

  afterAll(async () => {
    destruirSesionHttp(sesionId);
    await ctx.finalizar();
  });

  function esperarMensajeSeguro(mensaje: string) {
    expect(mensaje).not.toMatch(/SQLSTATE|at Object|at Module|node_modules|postgresql:\/\//i);
    expect(typeof mensaje).toBe("string");
    expect(mensaje.length).toBeGreaterThan(0);
  }

  it("GET /precios/categorias — sin parámetro (válido, es opcional) responde 200 con sesión", async () => {
    const res = await request(app).get("/precios/categorias").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /precios/categorias — soloActivas inválido responde 400 (nunca se cuelga, nunca 500)", async () => {
    const res = await request(app).get("/precios/categorias?soloActivas=si-porfavor").set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    esperarMensajeSeguro(res.body.error);
  });

  it("GET /precios/categorias — sin sesión responde 401, no 400 ni cuelga", async () => {
    const res = await request(app).get("/precios/categorias");
    expect(res.status).toBe(401);
  });

  it("GET /listas-precio/ — sin parámetro responde 200 con sesión", async () => {
    const res = await request(app).get("/listas-precio/").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /listas-precio/ — soloActivas inválido responde 400", async () => {
    const res = await request(app).get("/listas-precio/?soloActivas=tal-vez").set("Cookie", cookie);
    expect(res.status).toBe(400);
    esperarMensajeSeguro(res.body.error);
  });

  it("GET /estadisticas/saldos-pendientes-top — sin límite (usa el default) responde 200", async () => {
    const res = await request(app).get("/estadisticas/saldos-pendientes-top").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /estadisticas/saldos-pendientes-top — límite inválido (no numérico) responde 400", async () => {
    const res = await request(app).get("/estadisticas/saldos-pendientes-top?limite=muchos").set("Cookie", cookie);
    expect(res.status).toBe(400);
    esperarMensajeSeguro(res.body.error);
  });

  it("GET /estadisticas/saldos-pendientes-top — límite negativo responde 400", async () => {
    const res = await request(app).get("/estadisticas/saldos-pendientes-top?limite=-5").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("GET /pagos/ultimos — sin límite (usa el default) responde 200", async () => {
    const res = await request(app).get("/pagos/ultimos").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /pagos/ultimos — límite inválido responde 400", async () => {
    const res = await request(app).get("/pagos/ultimos?limite=ninguno").set("Cookie", cookie);
    expect(res.status).toBe(400);
    esperarMensajeSeguro(res.body.error);
  });

  it("GET /cuentas/tiene-pagos — sin parámetros (ambos opcionales) responde 200", async () => {
    const res = await request(app).get("/cuentas/tiene-pagos").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("boolean");
  });

  it("GET /cuentas/tiene-pagos — odontologoId inválido responde 400", async () => {
    const res = await request(app).get("/cuentas/tiene-pagos?odontologoId=no-es-un-numero").set("Cookie", cookie);
    expect(res.status).toBe(400);
    esperarMensajeSeguro(res.body.error);
  });

  it("GET /cuentas/tiene-pagos — clinicaId inválido responde 400", async () => {
    const res = await request(app).get("/cuentas/tiene-pagos?clinicaId=0").set("Cookie", cookie); // 0 no es positivo
    expect(res.status).toBe(400);
  });

  it("un body JSON malformado en cualquier POST responde 400 en vez de colgarse (protegido por el mismo error handler global)", async () => {
    const res = await request(app)
      .post("/pagos")
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .send("{ esto no es JSON válido");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    esperarMensajeSeguro(res.body.error);
  });
});
