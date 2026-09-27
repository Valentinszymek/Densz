import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearClinica } from "../../src/main/db/repositories/clinicasRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { setConfig } from "../../src/main/db/repositories/configRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { crearRouterCuentas } from "../../src/server/routes/cuentas.route";
import { crearRouterProteccion } from "../../src/server/routes/proteccion.route";
import { crearSesionHttp, destruirSesionHttp, bloquearProteccionHttp, COOKIE_SESION } from "../../src/server/session";

const pdfFalso = async () => {};

// Fase 8D: las rutas de generar-resumen ahora suben el PDF a Storage vía
// cuentasWeb.ts (ver cuentasWebStorage.test.ts para esa lógica en detalle,
// con todos los escenarios de error). Acá se mockea storage.ts para que
// estos tests de la ruta HTTP (heredados de la Fase 8C) sigan sin tocar el
// bucket real de producción — es el único bucket configurado, no hay uno
// de test separado. El PDF sigue siendo Puppeteer real (sin cambios).
vi.mock("../../src/server/storage", () => ({
  subirDocumento: vi.fn(async (carpeta: string, nombre: string) => `${carpeta}/${nombre}`),
  descargarDocumento: vi.fn(async () => Buffer.from("pdf-falso")),
  eliminarDocumento: vi.fn(async () => {})
}));

// El período de "resumen del mes" se filtra por la fecha de EMISIÓN del
// comprobante (columna fecha_emision, valor por defecto de la base — hoy),
// no por orden.fecha_trabajo — ver listarTrabajosFacturadosPorMes() en
// movimientosRepo.ts. Se usa el mes/año reales para que el comprobante de
// prueba (generado "ahora") caiga dentro del período consultado.
const AHORA = new Date();
const ANIO_TEST = AHORA.getUTCFullYear();
const MES_TEST = AHORA.getUTCMonth() + 1;

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/cuentas", crearRouterCuentas(db));
  app.use("/proteccion", crearRouterProteccion(db));
  return app;
}

/**
 * Pruebas HTTP de /cuentas. Mismo patrón que serverTrabajos.test.ts y
 * serverPagos.test.ts: transacción compartida con ROLLBACK real,
 * verificación final por SQL con conexión nueva.
 */
describe("HTTP /cuentas", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let clinicaId: number;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Cuentas Test", listaPrecioId: listaId });

    // Un movimiento "debe" real (vía OT + comprobante, mismo camino que
    // usa el escritorio) para poder cruzar el saldo contra la vista real.
    const categoriaId = await crearCategoria(db, "CATEGORIA TEST CUENTAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Prestacion Test Cuentas" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 300000);
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Cuentas Test",
      fechaTrabajo: "2026-03-01",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: ctx.usuarioId
    });
    await generarComprobante(db, orden.id, ctx.usuarioId, pdfFalso);

    // Misma idea, para una CLÍNICA (§5 del bloque de escrituras de
    // Cuentas): un profesional afiliado a la clínica, con su propia OT
    // facturada, para poder generar un resumen de clínica real.
    clinicaId = await crearClinica(db, { nombre: "Clinica Cuentas Test" });
    const odontologoClinicaId = await crearOdontologo(db, {
      nombre: "Dr. Cuentas Test Clinica",
      listaPrecioId: listaId,
      clinicaId
    });
    const ordenClinica = await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoClinicaId,
      pacienteNombreCompleto: "Paciente Clinica Cuentas Test",
      fechaTrabajo: "2026-03-01",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [21] }],
      creadoPor: ctx.usuarioId
    });
    await generarComprobante(db, ordenClinica.id, ctx.usuarioId, pdfFalso);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-cuentas",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sesión SIN "cuentas.ver" a propósito, para probar el permiso.
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-cuentas",
      nombreCompleto: "Recepcion Test",
      rolNombre: "RECEPCION",
      permisos: ["odontologos.ver"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
    cookieSinPermiso = `${COOKIE_SESION}=${sesionSinPermisoId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionSinPermisoId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      const odontologo = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(odontologo.rowCount).toBe(0);
      const movimientos = await verificacion.db.query("SELECT id FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoId]);
      expect(movimientos.rowCount).toBe(0);
      const resumenes = await verificacion.db.query("SELECT id FROM resumenes_mensuales WHERE odontologo_id = $1", [odontologoId]);
      expect(resumenes.rowCount).toBe(0);
      const clinica = await verificacion.db.query("SELECT id FROM clinicas WHERE id = $1", [clinicaId]);
      expect(clinica.rowCount).toBe(0);
      const resumenesClinica = await verificacion.db.query("SELECT id FROM resumenes_mensuales WHERE clinica_id = $1", [clinicaId]);
      expect(resumenesClinica.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  // --- 1. GET autenticado ---
  it("GET /cuentas/:odontologoId/saldos devuelve 200 con sesión válida y protección desactivada", async () => {
    const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- 2. GET sin sesión → 401 ---
  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get(`/cuentas/${odontologoId}/saldos`),
      request(app).get(`/cuentas/${odontologoId}/movimientos`),
      request(app).get(`/cuentas/${odontologoId}/resumen-mes?anio=${ANIO_TEST}&mes=${MES_TEST}`),
      request(app).get(`/cuentas/${odontologoId}/resumenes`),
      request(app).get("/cuentas/saldos"),
      request(app).get("/cuentas/tiene-pagos"),
      request(app).post(`/cuentas/${odontologoId}/generar-resumen`).send({ anio: ANIO_TEST, mes: MES_TEST }),
      request(app).get(`/cuentas/resumenes/1/pdf`)
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("GET /cuentas/tiene-pagos no exige permiso ni protección (igual que el escritorio)", async () => {
    const res = await request(app).get(`/cuentas/tiene-pagos?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("boolean");
  });

  // --- 3. Usuario sin permiso CUENTAS_VER → 403 ---
  it("rechaza (403) a un usuario sin el permiso CUENTAS_VER", async () => {
    const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieSinPermiso);
    expect(res.status).toBe(403);
  });

  // --- 9. Saldos coinciden con la vista real ---
  it("el saldo devuelto coincide exactamente con v_saldo_odontologo_moneda", async () => {
    const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);

    const { rows } = await ctx.db.query(
      "SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_odontologo_moneda WHERE odontologo_id = $1",
      [odontologoId]
    );
    expect(res.body).toHaveLength(rows.length);
    expect(res.body[0].saldoCentavos).toBe(rows[0].saldo_centavos);
    expect(res.body[0].saldoCentavos).toBe(300000);
  });

  // --- 10. Filtros/parámetros válidos ---
  it("acepta parámetros válidos de período en resumen-mes", async () => {
    const res = await request(app).get(`/cuentas/${odontologoId}/resumen-mes?anio=${ANIO_TEST}&mes=${MES_TEST}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].totalTrabajosCentavos).toBe(300000);
  });

  // --- 11. Parámetros inválidos → 400 ---
  it("rechaza un mes inválido (400)", async () => {
    const res = await request(app).get(`/cuentas/${odontologoId}/resumen-mes?anio=2026&mes=13`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(400);
  });

  // --- 12. Ninguna escritura financiera accidental ---
  it("las rutas GET nunca escriben en pagos/movimientos/ordenes", async () => {
    const antesPagos = await ctx.db.query("SELECT COUNT(*) c FROM pagos");
    const antesMovs = await ctx.db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoId]);

    await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieAdmin);
    await request(app).get(`/cuentas/${odontologoId}/movimientos`).set("Cookie", cookieAdmin);
    await request(app).get(`/cuentas/${odontologoId}/resumen-mes?anio=${ANIO_TEST}&mes=${MES_TEST}`).set("Cookie", cookieAdmin);
    await request(app).get(`/cuentas/${odontologoId}/resumenes`).set("Cookie", cookieAdmin);

    const despuesPagos = await ctx.db.query("SELECT COUNT(*) c FROM pagos");
    const despuesMovs = await ctx.db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoId]);
    expect(despuesPagos.rows[0].c).toBe(antesPagos.rows[0].c);
    expect(despuesMovs.rows[0].c).toBe(antesMovs.rows[0].c);
  });

  it("genera el resumen mensual (POST) y lo hace real, dentro de la transacción de prueba", async () => {
    const res = await request(app).post(`/cuentas/${odontologoId}/generar-resumen`).set("Cookie", cookieAdmin).send({ anio: ANIO_TEST, mes: MES_TEST });
    expect(res.status).toBe(201);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].totalTrabajosCentavos).toBe(300000);
    // Fase 8D: pdf_path ahora es el object path de Storage, no una ruta local.
    expect(res.body[0].pdfPath).toMatch(/^estados-cuenta\//);

    const resumenes = await request(app).get(`/cuentas/${odontologoId}/resumenes`).set("Cookie", cookieAdmin);
    expect(resumenes.body.some((r: { id: number }) => r.id === res.body[0].id)).toBe(true);
  });

  // --- Fase 8D §6-8: descarga del PDF por HTTP, nunca por path arbitrario ---
  it("GET /cuentas/resumenes/:id/pdf descarga el PDF del resumen ya generado", async () => {
    const creado = await request(app).post(`/cuentas/${odontologoId}/generar-resumen`).set("Cookie", cookieAdmin).send({ anio: ANIO_TEST, mes: MES_TEST });
    const resumenId = creado.body[0].id;

    const descarga = await request(app).get(`/cuentas/resumenes/${resumenId}/pdf`).set("Cookie", cookieAdmin);
    expect(descarga.status).toBe(200);
    expect(descarga.headers["content-type"]).toBe("application/pdf");
    expect(descarga.body.toString()).toBe("pdf-falso");
  });

  it("GET /cuentas/resumenes/:id/pdf con un id inexistente da un error controlado (400), no rompe", async () => {
    const res = await request(app).get(`/cuentas/resumenes/999999999/pdf`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  // --- Fase 8C §5: mismo flujo, para una CLÍNICA con movimientos reales ---
  it("genera el resumen mensual de una CLÍNICA (POST) y lo hace real, dentro de la transacción de prueba", async () => {
    const res = await request(app)
      .post(`/cuentas/clinica/${clinicaId}/generar-resumen`)
      .set("Cookie", cookieAdmin)
      .send({ anio: ANIO_TEST, mes: MES_TEST });
    expect(res.status).toBe(201);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].totalTrabajosCentavos).toBe(300000);
    expect(res.body[0].clinicaId).toBe(clinicaId);
    expect(res.body[0].odontologoId).toBeNull();

    const resumenes = await request(app).get(`/cuentas/clinica/${clinicaId}/resumenes`).set("Cookie", cookieAdmin);
    expect(resumenes.body.some((r: { id: number }) => r.id === res.body[0].id)).toBe(true);
  });

  // --- Fase 8C §7: generar dos veces el mismo período NO bloquea — el
  // propio código (crearResumenMensual) documenta que nunca actualiza una
  // fila existente, siempre inserta una nueva. Se prueba el comportamiento
  // real, sin asumirlo. ---
  it("generar el mismo resumen dos veces no bloquea: quedan dos filas independientes (paridad con Desktop)", async () => {
    const primera = await request(app)
      .post(`/cuentas/${odontologoId}/generar-resumen`)
      .set("Cookie", cookieAdmin)
      .send({ anio: ANIO_TEST, mes: MES_TEST });
    const segunda = await request(app)
      .post(`/cuentas/${odontologoId}/generar-resumen`)
      .set("Cookie", cookieAdmin)
      .send({ anio: ANIO_TEST, mes: MES_TEST });
    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body[0].id).not.toBe(primera.body[0].id);

    const resumenes = await request(app).get(`/cuentas/${odontologoId}/resumenes`).set("Cookie", cookieAdmin);
    const idsDeEstePeriodo = resumenes.body.filter(
      (r: { anio: number; mes: number }) => r.anio === ANIO_TEST && r.mes === MES_TEST
    );
    expect(idsDeEstePeriodo.length).toBeGreaterThanOrEqual(2);
  });

  // --- PRUEBA DE AISLAMIENTO DE SESIONES (4, 5, 6, 7, 8) ---
  // Dos cookies genuinamente independientes, nunca la misma sesión.
  describe("aislamiento de protección entre sesiones (dos cookies independientes)", () => {
    const PASSWORD_PROTECCION = "clave-proteccion-test-cuentas";
    let sesionA: string;
    let sesionB: string;
    let cookieA: string;
    let cookieB: string;

    beforeAll(async () => {
      await setConfig(ctx.db, "proteccion.activada", "1");
      await setConfig(ctx.db, "proteccion.passwordHash", bcrypt.hashSync(PASSWORD_PROTECCION, 10));

      sesionA = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-a-test",
        nombreCompleto: "Sesion A",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      sesionB = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-b-test",
        nombreCompleto: "Sesion B",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      cookieA = `${COOKIE_SESION}=${sesionA}`;
      cookieB = `${COOKIE_SESION}=${sesionB}`;
    });

    afterAll(async () => {
      destruirSesionHttp(sesionA);
      destruirSesionHttp(sesionB);
      bloquearProteccionHttp(sesionA);
      bloquearProteccionHttp(sesionB);
      await setConfig(ctx.db, "proteccion.activada", "0");
    });

    it("A: bloqueada al principio", async () => {
      const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieA);
      expect(res.status).toBe(403);
    });

    // Fase 8C §9: el gate de protección también cubre generar-resumen, no
    // solo las lecturas — misma sesión autenticada, mismo permiso, pero
    // Cuentas bloqueada.
    it("A: generar-resumen también rechaza (403) con Cuentas bloqueada", async () => {
      const res = await request(app)
        .post(`/cuentas/${odontologoId}/generar-resumen`)
        .set("Cookie", cookieA)
        .send({ anio: ANIO_TEST, mes: MES_TEST });
      expect(res.status).toBe(403);
    });

    // Fase 8D §9: la descarga del PDF también exige protección desbloqueada.
    it("A: GET resumenes/:id/pdf también rechaza (403) con Cuentas bloqueada", async () => {
      const res = await request(app).get(`/cuentas/resumenes/1/pdf`).set("Cookie", cookieA);
      expect(res.status).toBe(403);
    });

    it("A: se desbloquea con la contraseña correcta y accede", async () => {
      const verificar = await request(app).post("/proteccion/verificar").set("Cookie", cookieA).send({ password: PASSWORD_PROTECCION });
      expect(verificar.status).toBe(200);
      expect(verificar.body.ok).toBe(true);

      const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieA);
      expect(res.status).toBe(200);
    });

    it("B: sigue bloqueada aunque A ya se desbloqueó", async () => {
      const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieB);
      expect(res.status).toBe(403);
    });

    it("A: logout — vuelve a quedar bloqueada", async () => {
      // Simula el logout: la propia ruta /auth/logout llama a
      // destruirSesionHttp, que también bloquea la protección de esa
      // sesión (ver session.ts) — se invoca la misma función acá.
      destruirSesionHttp(sesionA);
      sesionA = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-a-test",
        nombreCompleto: "Sesion A",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      cookieA = `${COOKIE_SESION}=${sesionA}`;

      const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieA);
      expect(res.status).toBe(403);
    });

    it("B: sigue bloqueada después del logout de A (nunca se vieron afectadas entre sí)", async () => {
      const res = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", cookieB);
      expect(res.status).toBe(403);
    });
  });
});
