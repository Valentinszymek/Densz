import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterListasPrecio } from "../../src/server/routes/listasPrecio.route";
import { crearRouterPrecios } from "../../src/server/routes/precios.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/listas-precio", crearRouterListasPrecio(db));
  app.use("/precios", crearRouterPrecios(db));
  return app;
}

const NOMBRE_LISTA = "Lista Test Fase12A";
const NOMBRE_PRESTACION = "Prestacion Test Fase12A Lista";

/**
 * Pruebas HTTP de /listas-precio (Fase 12A) — mismo patrón que el resto de
 * server*.test.ts. No existía ningún test a nivel HTTP para esta ruta
 * todavía (solo listasPrecioRepo.test.ts, a nivel de repositorio).
 */
describe("HTTP /listas-precio", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let cookieAdmin: string;
  let listaArsId: number;
  let listaUsdId: number;
  let categoriaId: number;
  let prestacionId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-listasprecio",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;

    // Una categoría + prestación de prueba para poder ejercitar items/precio/historial.
    const categoria = await request(app)
      .post("/precios/categorias")
      .set("Cookie", cookieAdmin)
      .send({ nombre: "Categoria Test Fase12A Lista" });
    categoriaId = categoria.body as number;
    const prestacion = await request(app)
      .post("/precios/prestaciones")
      .set("Cookie", cookieAdmin)
      .send({ categoriaId, nombre: NOMBRE_PRESTACION });
    prestacionId = prestacion.body as number;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      const { rows } = await verificacion.db.query("SELECT id FROM listas_precio WHERE nombre = $1", [NOMBRE_LISTA]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401)", async () => {
    const resultados = await Promise.all([
      request(app).get("/listas-precio"),
      request(app).post("/listas-precio").send({ nombre: "x", moneda: "ARS" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("crea una lista en ARS y otra en USD, sin conversión entre monedas", async () => {
    const ars = await request(app)
      .post("/listas-precio")
      .set("Cookie", cookieAdmin)
      .send({ nombre: NOMBRE_LISTA, moneda: "ARS" });
    expect(ars.status).toBe(201);
    listaArsId = ars.body as number;

    const usd = await request(app)
      .post("/listas-precio")
      .set("Cookie", cookieAdmin)
      .send({ nombre: `${NOMBRE_LISTA} USD`, moneda: "USD" });
    expect(usd.status).toBe(201);
    listaUsdId = usd.body as number;

    const detalleArs = await request(app).get(`/listas-precio/${listaArsId}`).set("Cookie", cookieAdmin);
    expect(detalleArs.body.moneda).toBe("ARS");
    const detalleUsd = await request(app).get(`/listas-precio/${listaUsdId}`).set("Cookie", cookieAdmin);
    expect(detalleUsd.body.moneda).toBe("USD");
  });

  it("la lista aparece en el listado general", async () => {
    const res = await request(app).get("/listas-precio").set("Cookie", cookieAdmin);
    expect(res.body.some((l: { id: number }) => l.id === listaArsId)).toBe(true);
  });

  it("una prestación sin precio en la lista aparece con precioCentavos null", async () => {
    const res = await request(app).get(`/listas-precio/${listaArsId}/items`).set("Cookie", cookieAdmin);
    const item = res.body.find((i: { id: number }) => i.id === prestacionId);
    expect(item).toBeDefined();
    expect(item.precioCentavos).toBeNull();
  });

  it("PATCH cambiar-precio define el precio vigente sin pisar el histórico, y la moneda no se mezcla entre listas", async () => {
    const primerPrecio = await request(app)
      .patch(`/listas-precio/${listaArsId}/items/${prestacionId}/precio`)
      .set("Cookie", cookieAdmin)
      .send({ nuevoPrecioCentavos: 10000 });
    expect(primerPrecio.status).toBe(200);

    const segundoPrecio = await request(app)
      .patch(`/listas-precio/${listaArsId}/items/${prestacionId}/precio`)
      .set("Cookie", cookieAdmin)
      .send({ nuevoPrecioCentavos: 15000 });
    expect(segundoPrecio.status).toBe(200);

    const itemsAhora = await request(app).get(`/listas-precio/${listaArsId}/items`).set("Cookie", cookieAdmin);
    const item = itemsAhora.body.find((i: { id: number }) => i.id === prestacionId);
    expect(item.precioCentavos).toBe(15000);

    const historial = await request(app)
      .get(`/listas-precio/${listaArsId}/items/${prestacionId}/historial`)
      .set("Cookie", cookieAdmin);
    expect(historial.status).toBe(200);
    // Dos precios cargados => al menos un registro cerrado + el vigente.
    expect(historial.body.length).toBeGreaterThanOrEqual(2);
    expect(historial.body.every((h: { precioCentavos: number }) => typeof h.precioCentavos === "number")).toBe(true);

    // La lista en USD nunca recibió un precio para esta prestación: sigue null.
    const itemsUsd = await request(app).get(`/listas-precio/${listaUsdId}/items`).set("Cookie", cookieAdmin);
    const itemUsd = itemsUsd.body.find((i: { id: number }) => i.id === prestacionId);
    expect(itemUsd.precioCentavos).toBeNull();
  });

  it("GET /listas-precio/:id/uso responde 200", async () => {
    const res = await request(app).get(`/listas-precio/${listaArsId}/uso`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ odontologosAsignados: expect.any(Number), usosHistoricos: expect.any(Number) });
  });

  it("actualizar el nombre no cambia la moneda (PUT solo acepta nombre)", async () => {
    const res = await request(app).put(`/listas-precio/${listaArsId}`).set("Cookie", cookieAdmin).send({ nombre: `${NOMBRE_LISTA} renombrada` });
    expect(res.status).toBe(200);
    const detalle = await request(app).get(`/listas-precio/${listaArsId}`).set("Cookie", cookieAdmin);
    expect(detalle.body.moneda).toBe("ARS");
  });

  it("SetActiva desactiva sin borrar los precios históricos", async () => {
    const desactivar = await request(app).patch(`/listas-precio/${listaArsId}/activo`).set("Cookie", cookieAdmin).send({ activo: false });
    expect(desactivar.status).toBe(200);
    const historial = await request(app)
      .get(`/listas-precio/${listaArsId}/items/${prestacionId}/historial`)
      .set("Cookie", cookieAdmin);
    expect(historial.body.length).toBeGreaterThanOrEqual(2);
  });

  it("es de solo lectura fuera de sus propias escrituras: nunca modifica otras listas", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) c FROM listas_precio");
    await request(app).get("/listas-precio").set("Cookie", cookieAdmin);
    await request(app).get(`/listas-precio/${listaArsId}/items`).set("Cookie", cookieAdmin);
    const despues = await ctx.db.query("SELECT COUNT(*) c FROM listas_precio");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });

  // --- Eliminación segura (Bloque 2 / Parte B) ---
  it("rechaza sin sesión (401) el DELETE", async () => {
    const res = await request(app).delete(`/listas-precio/${listaUsdId}`);
    expect(res.status).toBe(401);
  });

  it("elimina físicamente la lista USD (sin odontólogos asignados ni uso histórico) y queda en Auditoría", async () => {
    const res = await request(app).delete(`/listas-precio/${listaUsdId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    const { rows } = await ctx.db.query("SELECT id FROM listas_precio WHERE id = $1", [listaUsdId]);
    expect(rows).toHaveLength(0);

    const auditoria = await ctx.db.query(
      "SELECT accion FROM auditoria WHERE entidad = 'listas_precio' AND entidad_id = $1 AND accion = 'eliminar'",
      [listaUsdId]
    );
    expect(auditoria.rows).toHaveLength(1);
  });
});
