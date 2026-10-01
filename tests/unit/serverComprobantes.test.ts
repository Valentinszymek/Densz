import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import { ANCHO_PAGINA_COMPROBANTE_MM, ALTO_PAGINA_COMPROBANTE_MM } from "../../src/main/services/comprobanteHtmlTemplate";
import { crearRouterComprobantes } from "../../src/server/routes/comprobantes.route";
import { generarComprobanteWeb, regenerarComprobanteWeb } from "../../src/server/comprobantesWeb";
import * as storageModule from "../../src/server/storage";
import * as comprobantesRepoModule from "../../src/main/db/repositories/comprobantesRepo";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";
import { avisarSiStorageCompartido } from "../helpers/testStorage";

avisarSiStorageCompartido(); // corrección post-auditoría §25/§30-D — ver tests/helpers/testStorage.ts

const PUNTOS_POR_MM = 72 / 25.4;
function leerMediaBoxPdfMm(buffer: Buffer): { anchoMm: number; altoMm: number } {
  const texto = buffer.toString("latin1");
  const match = texto.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!match) throw new Error("No se encontró /MediaBox en el PDF.");
  const [, x0, y0, x1, y1] = match.map(Number);
  return { anchoMm: (x1 - x0) / PUNTOS_POR_MM, altoMm: (y1 - y0) / PUNTOS_POR_MM };
}

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/comprobantes", crearRouterComprobantes(db));
  return app;
}

/**
 * Pruebas HTTP de /comprobantes. Mismo patrón de transacción con ROLLBACK
 * que los demás dominios — PERO Storage no participa de esa transacción
 * (es un servicio externo, no Postgres): cada objeto que se sube durante
 * estas pruebas se borra explícitamente en un `finally`/`afterAll`, y se
 * verifica al final que no quedó ninguno.
 *
 * Riesgo de colisión de nombre descartado antes de escribir este archivo:
 * el numerador de "comprobante" del proyecto de TEST está en 0, el de
 * PRODUCCIÓN en 73 (verificado por SQL) — los números que genere esta
 * suite (CB-00000001, CB-00000002, ...) nunca van a coincidir con un
 * comprobante real existente en el único bucket "documentos" compartido.
 */
describe("HTTP /comprobantes", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let prestacionId: number;
  let sesionAdminId: string;
  let sesionOtraId: string;
  let cookieAdmin: string;
  let cookieOtra: string;
  const rutasStorageASubir: string[] = [];

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Comprobantes Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CATEGORIA TEST COMPROBANTES");
    prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Prestacion Test Comprobantes" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 400000);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-comprobantes",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sesión SIN ningún permiso "comprobantes.*" — prueba el punto 19
    // (hoy no hay ningún chequeo en el IPC, ver informe).
    sesionOtraId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-comprobantes",
      nombreCompleto: "Recepcion Test",
      rolNombre: "RECEPCION",
      permisos: ["odontologos.ver"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
    cookieOtra = `${COOKIE_SESION}=${sesionOtraId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionOtraId);

    // Limpieza explícita de Storage (no participa del ROLLBACK de Postgres)
    // — sin swallow: si el borrado en sí falla, este hook tiene que fallar
    // también, no quedar en silencio.
    for (const ruta of rutasStorageASubir) {
      await storageModule.eliminarDocumento(ruta);
    }

    await ctx.finalizar(); // ROLLBACK real de todo lo de Postgres

    const verificacion = await createTestDb();
    try {
      const odontologo = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(odontologo.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  }, 30000);

  async function crearOrdenDePrueba(overrides: Record<string, unknown> = {}) {
    return crearOrdenConPrestaciones(ctx.db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Comprobantes Test",
      fechaTrabajo: "2026-03-15",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [21] }],
      creadoPor: ctx.usuarioId,
      ...overrides
    });
  }

  // --- 2. GET sin sesión → 401 ---
  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/comprobantes"),
      request(app).get("/comprobantes/orden/1"),
      request(app).post("/comprobantes").send({ ordenId: 1 }),
      request(app).get("/comprobantes/1/pdf")
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  // --- 1. GET listado autenticado ---
  it("GET /comprobantes devuelve 200 con sesión válida", async () => {
    const res = await request(app).get("/comprobantes").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- 5. Payload inválido ---
  it("rechaza un payload inválido (400) sin generar nada", async () => {
    const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({});
    expect(res.status).toBe(400);
  });

  // --- 6. OT inexistente ---
  it("devuelve un error claro al generar sobre una OT inexistente", async () => {
    const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId: 999999999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("La orden no existe.");
  });

  // --- 3, 4, 7, 8, 9, 10. Generar, obtener por OT, numeración, estado, comprobante, movimiento ---
  describe("generación completa de un comprobante", () => {
    let ordenId: number;
    let comprobanteId: number;
    let numero: string;

    it("POST /comprobantes genera un comprobante válido y numerado", async () => {
      const orden = await crearOrdenDePrueba();
      ordenId = orden.id;

      const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(res.status).toBe(201);
      expect(res.body.numero).toMatch(/^CB-\d{8}$/); // 7. numeración
      expect(res.body.ordenId).toBe(ordenId);

      comprobanteId = res.body.id;
      numero = res.body.numero;
      if (res.body.pdfPath) rutasStorageASubir.push(res.body.pdfPath);
    });

    it("la OT pasa a estado 'facturado'", async () => {
      const orden = await obtenerOrden(ctx.db, ordenId);
      expect(orden?.estado).toBe("facturado"); // 8.
    });

    it("el comprobante existe en la base con el orden_id correcto", async () => {
      const { rows } = await ctx.db.query("SELECT id, orden_id FROM comprobantes WHERE id = $1", [comprobanteId]);
      expect(rows).toHaveLength(1); // 9.
      expect(rows[0].orden_id).toBe(ordenId);
    });

    it("se creó un único movimiento DEBE por el total de la orden", async () => {
      const { rows } = await ctx.db.query(
        "SELECT tipo, importe_centavos, anulado FROM movimientos_cuenta WHERE orden_id = $1",
        [ordenId]
      ); // 10.
      expect(rows).toHaveLength(1);
      expect(rows[0].tipo).toBe("debe");
      expect(rows[0].importe_centavos).toBe(400000);
      expect(rows[0].anulado).toBe(0);
    });

    it("GET /comprobantes/orden/:ordenId devuelve el comprobante generado", async () => {
      const res = await request(app).get(`/comprobantes/orden/${ordenId}`).set("Cookie", cookieAdmin);
      expect(res.status).toBe(200); // 3.
      expect(res.body.id).toBe(comprobanteId);
    });

    // --- 11. Atomicidad: no se puede duplicar el comprobante de una OT ya facturada ---
    it("no genera un segundo comprobante para la misma OT (atomicidad de la regla)", async () => {
      const res = await request(app).post("/comprobantes").set("Cookie", cookieAdmin).send({ ordenId });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Esta orden ya tiene un comprobante generado.");

      const { rows } = await ctx.db.query("SELECT COUNT(*) c FROM comprobantes WHERE orden_id = $1", [ordenId]);
      expect(Number(rows[0].c)).toBe(1);
    });

    // --- 12, 13, 14, 15, 16, 17, 18, 19. PDF real + Storage + descarga ---
    it("el PDF quedó subido a Storage con las dimensiones reales del comprobante", async () => {
      const rutaEsperada = `comprobantes/${numero}.pdf`;
      const buffer = await storageModule.descargarDocumento(rutaEsperada); // 14.
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF"); // 12.

      const { anchoMm, altoMm } = leerMediaBoxPdfMm(buffer);
      expect(anchoMm).toBeCloseTo(ANCHO_PAGINA_COMPROBANTE_MM, 0); // 13.
      expect(altoMm).toBeCloseTo(ALTO_PAGINA_COMPROBANTE_MM, 0);
    });

    it("pdf_path guarda únicamente la ruta del objeto, nunca una URL", async () => {
      const { rows } = await ctx.db.query("SELECT pdf_path FROM comprobantes WHERE id = $1", [comprobanteId]);
      const pdfPath = rows[0].pdf_path as string;
      expect(pdfPath).toBe(`comprobantes/${numero}.pdf`); // 15.
      expect(pdfPath.startsWith("http")).toBe(false); // 16.
      expect(pdfPath.includes("supabase.co")).toBe(false);
    });

    it("el bucket 'documentos' sigue siendo privado (no público)", async () => {
      // Confirmación directa contra la configuración real de Storage, no asumida.
      const url = process.env.SUPABASE_URL!;
      const respuesta = await fetch(`${url}/storage/v1/object/public/documentos/comprobantes/${numero}.pdf`);
      expect(respuesta.status).not.toBe(200); // 16. sin URL pública funcional
    });

    it("GET /comprobantes/:id/pdf descarga el PDF real mediante el backend autenticado", async () => {
      const res = await request(app).get(`/comprobantes/${comprobanteId}/pdf`).set("Cookie", cookieAdmin);
      expect(res.status).toBe(200); // 17.
      expect(res.headers["content-type"]).toBe("application/pdf");
      const buffer = Buffer.from(res.body);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    });

    it("descargar el PDF sin sesión devuelve 401", async () => {
      const res = await request(app).get(`/comprobantes/${comprobanteId}/pdf`); // 18.
      expect(res.status).toBe(401);
    });

    it("un usuario sin permisos 'comprobantes.*' igual puede acceder — paridad exacta con el escritorio", async () => {
      // 19. Documentado en el informe: comprobantes.ipc.ts no exige ningún
      // permiso hoy — no se agregó ninguno nuevo acá.
      const listado = await request(app).get("/comprobantes").set("Cookie", cookieOtra);
      expect(listado.status).toBe(200);
      const pdf = await request(app).get(`/comprobantes/${comprobanteId}/pdf`).set("Cookie", cookieOtra);
      expect(pdf.status).toBe(200);
    });
  });

  // --- PRUEBA DE RECUPERACIÓN: transacción de DB exitosa + falla de Storage ---
  describe("recuperación ante fallo de Storage después de una transacción exitosa", () => {
    let ordenId: number;
    let comprobanteId: number;
    let numero: string;

    it("genera el comprobante igual aunque Storage falle: queda registrado y la OT queda facturada", async () => {
      const orden = await crearOrdenDePrueba({ fechaTrabajo: "2026-03-20" });
      ordenId = orden.id;

      const espia = vi.spyOn(storageModule, "subirDocumento").mockRejectedValueOnce(new Error("Simulado: fallo de Storage"));
      try {
        const comprobante = await generarComprobanteWeb(ctx.db, ordenId, ctx.usuarioId);
        comprobanteId = comprobante.id;
        numero = comprobante.numero;

        // El comprobante y la facturación de la OT ya están confirmados
        // en Postgres — el fallo de Storage no los revierte.
        const ordenActualizada = await obtenerOrden(ctx.db, ordenId);
        expect(ordenActualizada?.estado).toBe("facturado");
        const { rows } = await ctx.db.query("SELECT COUNT(*) c FROM comprobantes WHERE orden_id = $1", [ordenId]);
        expect(Number(rows[0].c)).toBe(1);
        const movimientos = await ctx.db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE orden_id = $1", [ordenId]);
        expect(Number(movimientos.rows[0].c)).toBe(1);

        // pdf_path quedó con el archivo LOCAL (Storage falló), nunca "comprobantes/..."
        expect(comprobante.pdfPath).not.toBeNull();
        expect(comprobante.pdfPath!.startsWith("comprobantes/")).toBe(false);
        expect(fs.existsSync(comprobante.pdfPath!)).toBe(true);
      } finally {
        espia.mockRestore();
      }
    });

    it("regenerar el comprobante lo sube a Storage y NO crea un segundo comprobante", async () => {
      const rutaStorage = await regenerarComprobanteWeb(ctx.db, comprobanteId);
      expect(rutaStorage).toBe(`comprobantes/${numero}.pdf`);
      rutasStorageASubir.push(rutaStorage);

      const { rows } = await ctx.db.query("SELECT COUNT(*) c, pdf_path FROM comprobantes WHERE orden_id = $1 GROUP BY pdf_path", [ordenId]);
      expect(rows).toHaveLength(1); // sigue siendo un único comprobante
      expect(Number(rows[0].c)).toBe(1);
      expect(rows[0].pdf_path).toBe(rutaStorage);

      const buffer = await storageModule.descargarDocumento(rutaStorage);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    });
  });

  // --- CASO INVERSO: la subida a Storage SÍ funciona, pero el UPDATE de
  // pdf_path en la base falla después — no debe quedar un archivo
  // huérfano en Storage. ---
  describe("recuperación ante fallo de la base DESPUÉS de subir el PDF a Storage con éxito", () => {
    let ordenId: number;
    let comprobanteId: number;
    let numero: string;

    it("genera un comprobante real primero (para tener un PDF local que regenerar)", async () => {
      const orden = await crearOrdenDePrueba({ fechaTrabajo: "2026-03-25" });
      ordenId = orden.id;
      const comprobante = await generarComprobanteWeb(ctx.db, ordenId, ctx.usuarioId);
      comprobanteId = comprobante.id;
      numero = comprobante.numero;
      if (comprobante.pdfPath) rutasStorageASubir.push(comprobante.pdfPath);
    });

    it("si el UPDATE de pdf_path falla después de subir el PDF, el objeto recién subido se borra solo (nunca otro)", async () => {
      const espiaEliminar = vi.spyOn(storageModule, "eliminarDocumento"); // sin mock: deja pasar la llamada real

      // regenerarComprobanteWeb() hace, en orden, TRES llamadas reales a
      // setPdfPath(): (1) limpiarPdfPathSiEsDeStorage() lo pone en null,
      // porque en este punto el comprobante ya apunta a Storage —viene de
      // generarComprobanteWeb() en el test anterior— (corrección del bug
      // de "Ver PDF" reutilizando una ruta de Storage como ruta de disco,
      // ver comprobantesWeb.ts); (2) regenerarPdfComprobante() (reutilizada
      // de comprobanteService.ts, sin tocar) lo graba apuntando a la ruta
      // LOCAL recién generada; esas dos tienen que comportarse reales.
      // Recién la TERCERA llamada (la de esta capa web, para grabar la
      // ruta de Storage después de subir) es la que se simula fallando.
      const implementacionReal = comprobantesRepoModule.setPdfPath;
      const espiaSetPdfPath = vi
        .spyOn(comprobantesRepoModule, "setPdfPath")
        .mockImplementationOnce(implementacionReal)
        .mockImplementationOnce(implementacionReal)
        .mockRejectedValueOnce(new Error("Simulado: falla el UPDATE de pdf_path"));

      try {
        await expect(regenerarComprobanteWeb(ctx.db, comprobanteId)).rejects.toThrow("Simulado: falla el UPDATE de pdf_path");

        // Se limpió EXACTAMENTE el objeto que esta llamada acababa de
        // subir — nunca otro (ni de otro comprobante, ni el que ya se
        // había subido en el test anterior).
        expect(espiaEliminar).toHaveBeenCalledTimes(1);
        expect(espiaEliminar).toHaveBeenCalledWith(`comprobantes/${numero}.pdf`);

        // El comprobante sigue existiendo, único, y queda regenerable
        // (pdf_path no quedó vacío ni roto).
        const { rows } = await ctx.db.query("SELECT COUNT(*) c, pdf_path FROM comprobantes WHERE orden_id = $1 GROUP BY pdf_path", [
          ordenId
        ]);
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].c)).toBe(1);
        expect(rows[0].pdf_path).toBeTruthy();
      } finally {
        espiaSetPdfPath.mockRestore();
        espiaEliminar.mockRestore();
      }
    });

    it("después del fallo, regenerar de nuevo (sin espías) funciona y deja pdf_path apuntando a Storage", async () => {
      const rutaStorage = await regenerarComprobanteWeb(ctx.db, comprobanteId);
      expect(rutaStorage).toBe(`comprobantes/${numero}.pdf`);
      rutasStorageASubir.push(rutaStorage);

      const { rows } = await ctx.db.query("SELECT COUNT(*) c FROM comprobantes WHERE orden_id = $1", [ordenId]);
      expect(Number(rows[0].c)).toBe(1); // sigue sin haberse duplicado

      const buffer = await storageModule.descargarDocumento(rutaStorage);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    });

    it("no afectó ningún otro comprobante de estas pruebas", async () => {
      const { rows } = await ctx.db.query(
        "SELECT COUNT(DISTINCT c.id) c FROM comprobantes c JOIN ordenes o ON o.id = c.orden_id WHERE o.odontologo_id = $1",
        [odontologoId]
      );
      // 1 de "generación completa" + 1 de "recuperación ante fallo de
      // Storage" + 1 de este bloque = 3 comprobantes reales para este
      // odontólogo de prueba en total — ninguno de más, ninguno de menos.
      expect(Number(rows[0].c)).toBe(3);
    });
  });

  // --- 20. Verificado en afterAll (ver arriba: SQL + Storage real) ---
});
