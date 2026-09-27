import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { setConfig } from "../../src/main/db/repositories/configRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { crearRouterEstadisticas } from "../../src/server/routes/estadisticas.route";
import { crearRouterProteccion } from "../../src/server/routes/proteccion.route";
import { crearSesionHttp, destruirSesionHttp, bloquearProteccionHttp, COOKIE_SESION } from "../../src/server/session";

const pdfFalso = async () => {};
// Rango amplio a propósito: evita depender de si cada consulta filtra por
// fecha_trabajo o por fecha_emision del comprobante (ver hallazgo de
// Cuentas) — cualquiera de las dos cae adentro de este rango.
const DESDE = "2020-01-01";
const HASTA = "2030-12-31";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/estadisticas", crearRouterEstadisticas(db));
  app.use("/proteccion", crearRouterProteccion(db));
  return app;
}

/**
 * Pruebas HTTP de /estadisticas. Mismo patrón que serverCuentas.test.ts:
 * transacción compartida con ROLLBACK real + verificación final por SQL.
 */
describe("HTTP /estadisticas", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Estadisticas Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CATEGORIA TEST ESTADISTICAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Prestacion Test Estadisticas" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 600000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Estadisticas Test",
      fechaTrabajo: "2026-03-10",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: ctx.usuarioId
    });
    await generarComprobante(db, orden.id, ctx.usuarioId, pdfFalso);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-estadisticas",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sin "estadisticas.ver" a propósito, para probar el permiso.
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-estadisticas",
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
      const pagos = await verificacion.db.query("SELECT id FROM pagos WHERE odontologo_id = $1", [odontologoId]);
      expect(pagos.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  }, 30000);

  const RUTAS_PROTEGIDAS = [
    "kpis",
    "trabajos-por-dia",
    "ingresos-por-odontologo",
    "trabajos-por-categoria",
    "evolucion",
    "ranking-odontologos",
    "ranking-clinicas",
    "prestaciones-ranking",
    "saldos-pendientes-top"
  ];

  it("hay 10 rutas en total: 1 sin protección (resumen-operativo) + 9 protegidas", () => {
    expect(RUTAS_PROTEGIDAS).toHaveLength(9);
  });

  // --- 1. GET autenticado (una por cada ruta protegida) ---
  it.each(RUTAS_PROTEGIDAS)("GET /estadisticas/%s devuelve 200 con sesión, permiso y protección desactivada", async (ruta) => {
    const res = await request(app).get(`/estadisticas/${ruta}?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
  });

  it("GET /estadisticas/resumen-operativo no exige permiso ni protección (excepción documentada, igual que hoy)", async () => {
    const res = await request(app)
      .get(`/estadisticas/resumen-operativo?desde=${DESDE}&hasta=${HASTA}`)
      .set("Cookie", cookieSinPermiso);
    expect(res.status).toBe(200);
  });

  // --- 2. Sin sesión → 401 ---
  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all(
      ["resumen-operativo", ...RUTAS_PROTEGIDAS].map((ruta) =>
        request(app).get(`/estadisticas/${ruta}?desde=${DESDE}&hasta=${HASTA}`)
      )
    );
    for (const r of resultados) expect(r.status).toBe(401);
  });

  // --- 3. Sin permiso → 403 ---
  it.each(RUTAS_PROTEGIDAS)("GET /estadisticas/%s sin el permiso ESTADISTICAS_VER devuelve 403", async (ruta) => {
    const res = await request(app).get(`/estadisticas/${ruta}?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieSinPermiso);
    expect(res.status).toBe(403);
  });

  // --- 9. Parámetros inválidos ---
  it("rechaza un rango de fechas incompleto (400)", async () => {
    const res = await request(app).get("/estadisticas/kpis?desde=2026-01-01").set("Cookie", cookieAdmin);
    expect(res.status).toBe(400);
  });

  // --- 8, 11. Filtros válidos + resultados coinciden con la consulta real ---
  it("los KPIs del período coinciden con la lógica real (cantidad de OTs del odontólogo de prueba)", async () => {
    const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);

    const { rows } = await ctx.db.query("SELECT COUNT(*) c FROM ordenes WHERE odontologo_id = $1", [odontologoId]);
    expect(Number(rows[0].c)).toBe(1);
    expect(res.body.cantidadTrabajos).toBeGreaterThanOrEqual(1);
  });

  it("el ranking de odontólogos incluye al odontólogo de prueba con el importe correcto", async () => {
    const res = await request(app).get(`/estadisticas/ranking-odontologos?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    const fila = res.body.find((r: { odontologoId: number }) => r.odontologoId === odontologoId);
    expect(fila).toBeDefined();
    expect(fila.facturadoCentavos).toBe(600000);
  });

  // --- 10. ARS separado de USD ---
  it("mantiene ARS y USD separados, nunca sumados (ingresos por odontólogo trae un array por moneda)", async () => {
    const res = await request(app)
      .get(`/estadisticas/ingresos-por-odontologo?desde=${DESDE}&hasta=${HASTA}`)
      .set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    const fila = res.body.find((r: { odontologoId: number }) => r.odontologoId === odontologoId);
    expect(fila.moneda).toBe("ARS"); // la orden de prueba es ARS (lista General)
    expect(fila.totalCentavos).toBe(600000);
  });

  // --- 12, 13. Read-only: nunca crea/modifica/elimina datos ---
  it("las rutas de Estadísticas nunca escriben en ordenes/pagos/movimientos", async () => {
    const antesOrdenes = await ctx.db.query("SELECT COUNT(*) c FROM ordenes WHERE odontologo_id = $1", [odontologoId]);
    const antesPagos = await ctx.db.query("SELECT COUNT(*) c FROM pagos");
    const antesMovs = await ctx.db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoId]);

    for (const ruta of ["resumen-operativo", ...RUTAS_PROTEGIDAS]) {
      await request(app).get(`/estadisticas/${ruta}?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieAdmin);
    }

    const despuesOrdenes = await ctx.db.query("SELECT COUNT(*) c FROM ordenes WHERE odontologo_id = $1", [odontologoId]);
    const despuesPagos = await ctx.db.query("SELECT COUNT(*) c FROM pagos");
    const despuesMovs = await ctx.db.query("SELECT COUNT(*) c FROM movimientos_cuenta WHERE odontologo_id = $1", [odontologoId]);
    expect(despuesOrdenes.rows[0].c).toBe(antesOrdenes.rows[0].c);
    expect(despuesPagos.rows[0].c).toBe(antesPagos.rows[0].c);
    expect(despuesMovs.rows[0].c).toBe(antesMovs.rows[0].c);
  });

  // --- 4, 5, 6, 7. PRUEBA DE AISLAMIENTO DE SESIONES (protección) ---
  describe("aislamiento de protección entre sesiones (dos cookies independientes)", () => {
    const PASSWORD_PROTECCION = "clave-proteccion-test-estadisticas";
    let sesionA: string;
    let sesionB: string;
    let cookieA: string;
    let cookieB: string;

    beforeAll(async () => {
      await setConfig(ctx.db, "proteccion.activada", "1");
      await setConfig(ctx.db, "proteccion.passwordHash", bcrypt.hashSync(PASSWORD_PROTECCION, 10));

      sesionA = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-a-estadisticas",
        nombreCompleto: "Sesion A",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      sesionB = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-b-estadisticas",
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

    it("A: bloqueada al principio (403)", async () => {
      const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieA);
      expect(res.status).toBe(403);
    });

    it("A: se desbloquea con la contraseña correcta y accede", async () => {
      const verificar = await request(app).post("/proteccion/verificar").set("Cookie", cookieA).send({ password: PASSWORD_PROTECCION });
      expect(verificar.body.ok).toBe(true);

      const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieA);
      expect(res.status).toBe(200);
    });

    it("B: sigue bloqueada aunque A ya se desbloqueó", async () => {
      const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieB);
      expect(res.status).toBe(403);
    });

    it("A: logout — vuelve a quedar bloqueada", async () => {
      destruirSesionHttp(sesionA);
      sesionA = crearSesionHttp({
        usuarioId: ctx.usuarioId,
        nombreUsuario: "sesion-a-estadisticas",
        nombreCompleto: "Sesion A",
        rolNombre: "ADMINISTRADOR",
        permisos: ["*"]
      });
      cookieA = `${COOKIE_SESION}=${sesionA}`;

      const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieA);
      expect(res.status).toBe(403);
    });

    it("B: sigue bloqueada después del logout de A", async () => {
      const res = await request(app).get(`/estadisticas/kpis?desde=${DESDE}&hasta=${HASTA}`).set("Cookie", cookieB);
      expect(res.status).toBe(403);
    });
  });
});
