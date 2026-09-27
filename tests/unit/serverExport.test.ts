import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearRouterExport } from "../../src/server/routes/export.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/export", crearRouterExport(db));
  return app;
}

/**
 * Pruebas HTTP de /export (Bloque 2 / Parte A) — no existía ninguna ruta
 * HTTP de exportación todavía. Reutiliza exportService.ts sin modificar su
 * lógica de datos — estos tests verifican la entrega (headers, contenido
 * binario), no vuelven a probar cada columna de cada tipo (ya cubierto por
 * exportService.test.ts).
 */
describe("HTTP /export", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminId: string;
  let sesionSinAuditoriaId: string;
  let cookieAdmin: string;
  let cookieSinAuditoria: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    const listaId = await idListaGeneral(ctx.db);
    await crearOdontologo(ctx.db, { nombre: "Dr. Export Test Bloque2", listaPrecioId: listaId });

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-export",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "auditoria.ver") — prueba que exportar auditoría lo exige.
    sesionSinAuditoriaId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-export",
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
    cookieSinAuditoria = `${COOKIE_SESION}=${sesionSinAuditoriaId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionSinAuditoriaId);
    await ctx.finalizar(); // ROLLBACK real
  });

  it("rechaza sin sesión (401)", async () => {
    const res = await request(app).post("/export").send({ tipo: "odontologos", formato: "csv", nombreSugerido: "x" });
    expect(res.status).toBe(401);
  });

  it("exportar odontólogos a CSV: 200, Content-Type y Content-Disposition correctos, contenido real", async () => {
    const res = await request(app)
      .post("/export")
      .set("Cookie", cookieAdmin)
      .send({ tipo: "odontologos", formato: "csv", nombreSugerido: "Odontólogos Test" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename=".+\.csv"$/);
    const texto = res.text;
    expect(texto).toContain("Dr. Export Test Bloque2");
  });

  it("exportar odontólogos a XLSX: 200, Content-Type correcto, es un archivo .xlsx real (firma ZIP)", async () => {
    const res = await request(app)
      .post("/export")
      .set("Cookie", cookieAdmin)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .send({ tipo: "odontologos", formato: "xlsx", nombreSugerido: "odontologos" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const buffer = res.body as Buffer;
    // .xlsx es un ZIP — firma "PK".
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("exportar trabajos a PDF: 200, Content-Type correcto, PDF real", async () => {
    const res = await request(app)
      .post("/export")
      .set("Cookie", cookieAdmin)
      .send({ tipo: "trabajos", formato: "pdf", nombreSugerido: "trabajos" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const buffer = Buffer.from(res.body);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("exportar cuenta sin odontólogo ni clínica falla con un error claro (400)", async () => {
    const res = await request(app).post("/export").set("Cookie", cookieAdmin).send({ tipo: "cuenta", formato: "csv", nombreSugerido: "cuenta" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/falta indicar/i);
  });

  it("exportar auditoría exige AUDITORIA_VER — 403 con el permiso real de RECEPCION, 200 con Administrador", async () => {
    const sinPermiso = await request(app)
      .post("/export")
      .set("Cookie", cookieSinAuditoria)
      .send({ tipo: "auditoria", formato: "csv", nombreSugerido: "auditoria" });
    expect(sinPermiso.status).toBe(403);

    const conPermiso = await request(app)
      .post("/export")
      .set("Cookie", cookieAdmin)
      .send({ tipo: "auditoria", formato: "csv", nombreSugerido: "auditoria" });
    expect(conPermiso.status).toBe(200);
  });

  it("exportar sin ese permiso (auditoría) no deja rastro de auditoría 'exportar'", async () => {
    const antes = await ctx.db.query("SELECT COUNT(*) c FROM auditoria WHERE entidad = 'auditoria' AND accion = 'exportar'");
    await request(app)
      .post("/export")
      .set("Cookie", cookieSinAuditoria)
      .send({ tipo: "auditoria", formato: "csv", nombreSugerido: "auditoria" });
    const despues = await ctx.db.query("SELECT COUNT(*) c FROM auditoria WHERE entidad = 'auditoria' AND accion = 'exportar'");
    expect(despues.rows[0].c).toBe(antes.rows[0].c);
  });

  it("cada exportación exitosa queda registrada en Auditoría (accion='exportar'), sin exponer datos sensibles", async () => {
    await request(app).post("/export").set("Cookie", cookieAdmin).send({ tipo: "clinicas", formato: "csv", nombreSugerido: "clinicas" });
    const { rows } = await ctx.db.query(
      "SELECT accion, entidad, detalle FROM auditoria WHERE entidad = 'clinicas' AND accion = 'exportar' ORDER BY id DESC LIMIT 1"
    );
    expect(rows).toHaveLength(1);
    const crudo = JSON.stringify(rows[0].detalle).toLowerCase();
    expect(crudo).not.toMatch(/password|service_role|token/);
  });

  it("rechaza un tipo inválido (400)", async () => {
    const res = await request(app).post("/export").set("Cookie", cookieAdmin).send({ tipo: "no-existe", formato: "csv", nombreSugerido: "x" });
    expect(res.status).toBe(400);
  });
});
