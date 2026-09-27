import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearRouterListasPrecio } from "../../src/server/routes/listasPrecio.route";
import * as storageModule from "../../src/server/storage";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/listas-precio", crearRouterListasPrecio(db));
  return app;
}

/**
 * Pruebas HTTP del PDF de listas de precio (Bloque 2 / Parte C) — nunca
 * existió antes. Igual que Comprobantes/Cuentas: Storage no participa de
 * la transacción de Postgres, así que cada objeto subido se borra
 * explícitamente al final y se verifica que no quedó ninguno.
 */
describe("HTTP /listas-precio/pdf", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let listaId: number;
  let odontologoId: number;
  let cookieAdmin: string;
  let sesionAdminId: string;
  const rutasStorageASubir: string[] = [];

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Lista PDF Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CATEGORIA TEST PDF LISTA");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Prestacion Test PDF Lista" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 123456);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-lista-pdf",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    for (const ruta of rutasStorageASubir) {
      await storageModule.eliminarDocumento(ruta);
    }
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      const { rows } = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401)", async () => {
    const resultados = await Promise.all([
      request(app).post("/listas-precio/pdf").send({ listaId }),
      request(app).get(`/listas-precio/pdf?path=listas-precio/x.pdf`)
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("exige elegir lista u odontólogo, nunca ambos ni ninguno (400)", async () => {
    const ninguno = await request(app).post("/listas-precio/pdf").set("Cookie", cookieAdmin).send({});
    expect(ninguno.status).toBe(400);

    const ambos = await request(app).post("/listas-precio/pdf").set("Cookie", cookieAdmin).send({ listaId, odontologoId });
    expect(ambos.status).toBe(400);
  });

  it("genera el PDF de una lista general: sube a Storage bajo listas-precio/, nunca una URL pública", async () => {
    const res = await request(app).post("/listas-precio/pdf").set("Cookie", cookieAdmin).send({ listaId });
    expect(res.status).toBe(200);
    expect(res.body.pdfPath).toMatch(/^listas-precio\/[0-9a-f-]+\.pdf$/);
    rutasStorageASubir.push(res.body.pdfPath);

    expect(res.body.pdfPath.startsWith("http")).toBe(false);
    expect(res.body.pdfPath.includes("supabase.co")).toBe(false);

    const url = process.env.SUPABASE_URL!;
    const respuestaPublica = await fetch(`${url}/storage/v1/object/public/documentos/${res.body.pdfPath}`);
    expect(respuestaPublica.status).not.toBe(200);
  });

  it("genera el PDF de la lista personalizada de un odontólogo (modo odontologoId)", async () => {
    const res = await request(app).post("/listas-precio/pdf").set("Cookie", cookieAdmin).send({ odontologoId });
    expect(res.status).toBe(200);
    expect(res.body.pdfPath).toMatch(/^listas-precio\/[0-9a-f-]+\.pdf$/);
    rutasStorageASubir.push(res.body.pdfPath);
  });

  it("descarga el PDF real generado, autenticada, con el mismo path devuelto", async () => {
    const generado = await request(app).post("/listas-precio/pdf").set("Cookie", cookieAdmin).send({ listaId });
    rutasStorageASubir.push(generado.body.pdfPath);

    const res = await request(app)
      .get(`/listas-precio/pdf?path=${encodeURIComponent(generado.body.pdfPath)}`)
      .set("Cookie", cookieAdmin)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const buffer = res.body as Buffer;
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("rechaza un path arbitrario que no tenga la forma listas-precio/<uuid>.pdf — nunca acepta otro prefijo del bucket", async () => {
    const resultados = await Promise.all([
      request(app).get("/listas-precio/pdf?path=comprobantes/CB-00000001.pdf").set("Cookie", cookieAdmin),
      request(app).get("/listas-precio/pdf?path=estados-cuenta/algo.pdf").set("Cookie", cookieAdmin),
      request(app).get("/listas-precio/pdf?path=listas-precio/../comprobantes/CB-00000001.pdf").set("Cookie", cookieAdmin),
      request(app).get("/listas-precio/pdf?path=listas-precio/no-es-un-uuid.pdf").set("Cookie", cookieAdmin)
    ]);
    for (const r of resultados) expect(r.status).toBe(400);
  });

  it("cada generación queda en Auditoría (accion='generar', entidad='lista_precios'), sin secretos", async () => {
    const { rows } = await ctx.db.query(
      "SELECT accion, entidad, detalle FROM auditoria WHERE entidad = 'lista_precios' ORDER BY id DESC LIMIT 1"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accion).toBe("generar");
    const crudo = JSON.stringify(rows[0].detalle).toLowerCase();
    expect(crudo).not.toMatch(/password|service_role|token/);
  });

  it("la lista de precios en ARS no mezcla monedas: no hay cotización ni total combinado en los datos usados", async () => {
    const lista = await request(app).get(`/listas-precio/${listaId}`).set("Cookie", cookieAdmin);
    expect(lista.body.moneda).toBe("ARS");
    // El PDF se genera a partir de esta misma lista — su moneda ya está
    // probada en listaPreciosService.test.ts (no se reescribe acá).
  });
});
