import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearRouterOdontologos } from "../../src/server/routes/odontologos.route";
import { crearRouterTrabajos } from "../../src/server/routes/trabajos.route";
import { crearRouterComprobantes } from "../../src/server/routes/comprobantes.route";
import * as storageModule from "../../src/server/storage";
import { crearSesionHttp, destruirSesionHttp, obtenerSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/odontologos", crearRouterOdontologos(db));
  app.use("/trabajos", crearRouterTrabajos(db));
  app.use("/comprobantes", crearRouterComprobantes(db));
  return app;
}

/**
 * Bloque 3 / Objetivo 4 — manejo de errores y casos borde que NO tenían
 * cobertura explícita todavía (los casos "estándar" de 401/403/400 por
 * dominio ya están probados en cada server*.test.ts — este archivo cubre
 * específicamente sesión revocada en vivo, doble envío concurrente e IDs
 * inexistentes/inválidos, contra Densz-Test).
 */
describe("Casos borde (Bloque 3)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  const rutasStorageASubir: string[] = [];

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);
    const listaId = await idListaGeneral(ctx.db);
    odontologoId = await crearOdontologo(ctx.db, { nombre: "Dr. Casos Borde Test", listaPrecioId: listaId });
  }, 30000);

  afterAll(async () => {
    // Storage no participa del ROLLBACK de Postgres — se limpia
    // explícitamente cualquier PDF real que haya subido algún test.
    for (const ruta of rutasStorageASubir) {
      await storageModule.eliminarDocumento(ruta);
    }
    await ctx.finalizar();
  });

  it("una sesión destruida (logout) deja de servir de inmediato, aunque la cookie siga siendo la misma", async () => {
    const sesionId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-casos-borde",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    const cookie = `${COOKIE_SESION}=${sesionId}`;

    const antes = await request(app).get("/odontologos").set("Cookie", cookie);
    expect(antes.status).toBe(200);

    destruirSesionHttp(sesionId);
    expect(obtenerSesionHttp(sesionId)).toBeNull();

    const despues = await request(app).get("/odontologos").set("Cookie", cookie);
    expect(despues.status).toBe(401);
  });

  it("una cookie con un id de sesión que nunca existió (inventado) también da 401, no un error 500", async () => {
    const res = await request(app).get("/odontologos").set("Cookie", `${COOKIE_SESION}=id-que-nunca-existio-12345`);
    expect(res.status).toBe(401);
  });

  describe("con una sesión válida", () => {
    let cookieAdmin: string;
    let sesionId: string;

    beforeAll(() => {
      sesionId = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "admin-test-casos-borde-2",
        nombreCompleto: "Admin Test",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      cookieAdmin = `${COOKIE_SESION}=${sesionId}`;
    });

    afterAll(() => destruirSesionHttp(sesionId));

    it("GET de un id inexistente en un recurso singular devuelve null (200), no un 500 ni un objeto inventado", async () => {
      const res = await request(app).get("/odontologos/999999999").set("Cookie", cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("un id no numérico da 400 controlado (nunca un 500 crudo de Postgres)", async () => {
      const res = await request(app).get("/odontologos/no-es-un-numero").set("Cookie", cookieAdmin);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
      // Nunca debe filtrar detalles internos (SQLSTATE, nombre de tabla en crudo, etc.)
      expect(res.body.error).not.toMatch(/SQLSTATE|invalid input syntax/i);
    });

    it("un id negativo o cero es rechazado (400) antes de tocar la base", async () => {
      const resultados = await Promise.all([
        request(app).get("/odontologos/0").set("Cookie", cookieAdmin),
        request(app).get("/odontologos/-5").set("Cookie", cookieAdmin)
      ]);
      for (const r of resultados) expect(r.status).toBe(400);
    });

    it("generar comprobante sobre una OT inexistente da un mensaje claro (400), no un 500", async () => {
      const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId: 999999999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("La orden no existe.");
    });

    it("un body vacío/malformado en un POST da 400 controlado, nunca crashea el servidor", async () => {
      const resultados = await Promise.all([
        request(app).post("/trabajos").set("Cookie", cookieAdmin).send({}),
        request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({}),
        request(app).post("/odontologos").set("Cookie", cookieAdmin).send({ nombre: 12345 }) // tipo incorrecto a propósito
      ]);
      for (const r of resultados) expect(r.status).toBe(400);
    });

    it("doble click (secuencial, simula el usuario clickeando dos veces rápido): la segunda generación de comprobante para la misma OT es rechazada, nunca hay dos", async () => {
      const listaId = await idListaGeneral(ctx.db);
      const odontologoDobleId = await crearOdontologo(ctx.db, { nombre: "Dr. Doble Click Test", listaPrecioId: listaId });
      const categoriaId = await crearCategoria(ctx.db, "Categoria Doble Click Test");
      const prestacionId = await crearPrestacion(ctx.db, { categoriaId, nombre: "Prestacion Doble Click Test" });
      await cambiarPrecioEnLista(ctx.db, listaId, prestacionId, 100000);

      const orden = await request(app)
        .post("/trabajos")
        .set("Cookie", cookieAdmin)
        .send({
          odontologoId: odontologoDobleId,
          pacienteNombreCompleto: "Paciente Doble Click Test",
          fechaTrabajo: "2026-03-01",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }]
        });
      expect(orden.status).toBe(201);
      const ordenId = orden.body.id;

      const primero = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(primero.status).toBe(201);
      if (primero.body.pdfPath) rutasStorageASubir.push(primero.body.pdfPath);
      const segundo = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(segundo.status).toBe(400);

      const { rows } = await ctx.db.query("SELECT COUNT(*) c FROM comprobantes WHERE orden_id = $1", [ordenId]);
      expect(Number(rows[0].c)).toBe(1);
    });

    // Nota metodológica: un doble click REALMENTE concurrente (dos requests
    // HTTP en simultáneo, cada uno con su propia conexión a la base) no se
    // pudo probar con el harness de tests actual, que comparte una única
    // conexión/transacción de Postgres por archivo (necesaria para el
    // ROLLBACK de aislamiento) — dos queries "concurrentes" sobre la misma
    // conexión física no son realmente concurrentes, se serializan. En
    // producción cada request HTTP toma su propia conexión del pool, así
    // que este caso queda documentado como limitación de testing, no
    // como algo verificado — ver informe del Bloque 3.
  });
});
