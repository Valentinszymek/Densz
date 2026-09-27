import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearRouterSearch } from "../../src/server/routes/search.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/search", crearRouterSearch(db));
  return app;
}

/**
 * Pruebas HTTP de /search (Fase 12D) — no existía ningún test a nivel
 * HTTP para esta ruta todavía. La búsqueda global depende de la vista
 * `busqueda_global` (poblada por triggers reales de Postgres), así que se
 * prueba contra un odontólogo de prueba realmente insertado en la
 * transacción — nunca se simula el resultado.
 */
describe("HTTP /search", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let cookieAdmin: string;
  const NOMBRE_UNICO = "Zzyxqvw Fase12D Test";

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    await crearOdontologo(db, { nombre: NOMBRE_UNICO, listaPrecioId: listaId });

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-search",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    await ctx.finalizar(); // ROLLBACK real
  });

  it("rechaza sin sesión (401)", async () => {
    const res = await request(app).get("/search?q=algo");
    expect(res.status).toBe(401);
  });

  it("sin texto (o muy corto) devuelve un array vacío, no un error", async () => {
    const res = await request(app).get("/search").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("encuentra al odontólogo de prueba real recién creado, con el tipo y refId correctos", async () => {
    const res = await request(app).get(`/search?q=${encodeURIComponent("Zzyxqvw")}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const match = res.body.find((r: { tipo: string; texto: string }) => r.texto.includes("Zzyxqvw"));
    expect(match).toBeDefined();
    expect(match.tipo).toBe("odontologo");
    expect(typeof match.refId).toBe("number");
  });

  it("una búsqueda sin resultados devuelve un array vacío, no un error ni null", async () => {
    const res = await request(app).get(`/search?q=${encodeURIComponent("noexisteestoenlabasedeprueba")}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("no expone datos sensibles en la respuesta", async () => {
    const res = await request(app).get(`/search?q=${encodeURIComponent("Zzyxqvw")}`).set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body).toLowerCase();
    expect(crudo).not.toMatch(/password|service_role|token/);
  });
});
