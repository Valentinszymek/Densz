import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { generarComprobante } from "../../src/main/services/comprobanteService";
import { crearRouterTrabajos } from "../../src/server/routes/trabajos.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

// No genera un PDF real (Puppeteer) para las pruebas que solo necesitan un
// comprobante ya generado como fixture — mismo criterio que
// comprobanteService.test.ts. La ruta HTTP real (trabajos.route.ts) sigue
// usando el generador real de Puppeteer; eso ya está probado aparte en
// tests/unit/serverPdf.test.ts.
const pdfFalso = async () => {};

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/trabajos", crearRouterTrabajos(db));
  return app;
}

/**
 * Pruebas HTTP de /trabajos (Trabajos/Órdenes de Trabajo). Corren TODAS
 * dentro de una única transacción Postgres contra el proyecto de Supabase
 * de TESTS (nunca producción), abierta en beforeAll y revertida (ROLLBACK)
 * en afterAll — el mismo truco que usan los 215 tests existentes: el
 * router recibe el PoolClient de la transacción "disfrazado" de Pool, y
 * withTransaction() (ver src/main/db/withTransaction.ts) detecta que ya
 * está dentro de una transacción y no abre una nueva, así que CREAR/
 * EDITAR/ANULAR/ELIMINAR una OT durante estas pruebas nunca se commitea de
 * verdad. Al final se abre una conexión NUEVA (no la de la transacción) y
 * se confirma por SQL que no quedó ninguna fila — no se asume, se verifica.
 */
describe("HTTP /trabajos", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let coronaId: number;
  let sesionAdminId: string;
  let sesionRecepcionId: string;
  let cookieAdmin: string;
  let cookieRecepcion: string;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Trabajos Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CATEGORIA TEST TRABAJOS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona Test" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 1000000);

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-trabajos",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo set de permisos que el rol RECEPCION real (ver seed de roles) —
    // a propósito SIN "ordenes.eliminar", para probar el permiso.
    sesionRecepcionId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-trabajos",
      nombreCompleto: "Recepcion Test",
      rolNombre: "RECEPCION",
      permisos: ["ordenes.crear", "ordenes.ver", "pacientes.crear", "pacientes.ver"]
    });
    cookieAdmin = `${COOKIE_SESION}=${sesionAdminId}`;
    cookieRecepcion = `${COOKIE_SESION}=${sesionRecepcionId}`;
  });

  afterAll(async () => {
    destruirSesionHttp(sesionAdminId);
    destruirSesionHttp(sesionRecepcionId);
    await ctx.finalizar(); // ROLLBACK real de todo lo que hicieron estas pruebas

    // Verificación independiente (conexión nueva, fuera de la transacción
    // ya revertida): confirma que no quedó ninguna fila real, no lo asume.
    const verificacion = await createTestDb();
    try {
      const { rows } = await verificacion.db.query("SELECT COUNT(*) AS c FROM ordenes WHERE odontologo_id = $1", [odontologoId]);
      expect(Number(rows[0].c)).toBe(0);
      const odontologo = await verificacion.db.query("SELECT id FROM odontologos WHERE id = $1", [odontologoId]);
      expect(odontologo.rowCount).toBe(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  function datosOrdenValida(overrides: Record<string, unknown> = {}) {
    return {
      odontologoId,
      pacienteNombreCompleto: "Paciente Trabajos Test",
      fechaTrabajo: "2026-01-15",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [16] }],
      ...overrides
    };
  }

  // --- 1. GET listado autenticado ---
  it("GET /trabajos devuelve 200 con sesión válida", async () => {
    const res = await request(app).get("/trabajos").set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // --- 2. GET detalle autenticado ---
  it("GET /trabajos/:id devuelve el detalle con sesión válida", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());
    expect(creada.status).toBe(201);

    const res = await request(app).get(`/trabajos/${creada.body.id}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(creada.body.id);
    expect(res.body.estado).toBe("pendiente_facturar");
  });

  // --- 3. 401 sin sesión, en las siete rutas ---
  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/trabajos"),
      request(app).get("/trabajos/1"),
      request(app).post("/trabajos").send(datosOrdenValida()),
      request(app).put("/trabajos/1").send(datosOrdenValida()),
      request(app).patch("/trabajos/1/anular").send({ motivo: "sin sesión" }),
      request(app).patch("/trabajos/1/fecha").send({ fechaTrabajo: "2026-01-01" }),
      request(app).delete("/trabajos/1").send({ motivo: "sin sesión" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  // --- 4. Validación de payload inválido ---
  it("rechaza un payload inválido (400) sin crear ninguna OT", async () => {
    const antes = await request(app).get("/trabajos").set("Cookie", cookieAdmin);
    const res = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send({ odontologoId }); // sin paciente ni prestaciones
    expect(res.status).toBe(400);
    const despues = await request(app).get("/trabajos").set("Cookie", cookieAdmin);
    expect(despues.body.length).toBe(antes.body.length);
  });

  // --- 5, 6, 7. Crear con datos sintéticos, leerla, editarla ---
  it("crea una OT sintética, la lee y la edita (precio histórico/numeración/moneda respetados)", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());
    expect(creada.status).toBe(201);
    expect(typeof creada.body.numero).toBe("string");
    expect(creada.body.numero.length).toBeGreaterThan(0);
    expect(creada.body.moneda).toBe("ARS");
    expect(creada.body.totalCentavos).toBe(1000000); // 1 corona a $10.000,00

    const leida = await request(app).get(`/trabajos/${creada.body.id}`).set("Cookie", cookieAdmin);
    expect(leida.status).toBe(200);
    expect(leida.body.totalCentavos).toBe(1000000);
    expect(leida.body.prestaciones).toHaveLength(1);

    const editada = await request(app)
      .put(`/trabajos/${creada.body.id}`)
      .set("Cookie", cookieAdmin)
      .send(datosOrdenValida({ prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [16, 17] }] }));
    expect(editada.status).toBe(200);
    expect(editada.body.totalCentavos).toBe(2000000); // 2 coronas, mismo precio histórico
  });

  // --- 8. Anularla ---
  it("anula una OT y su estado pasa a 'anulado'", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());
    const anulada = await request(app)
      .patch(`/trabajos/${creada.body.id}/anular`)
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Motivo de prueba de anulación" });
    expect(anulada.status).toBe(200);

    const leida = await request(app).get(`/trabajos/${creada.body.id}`).set("Cookie", cookieAdmin);
    expect(leida.body.estado).toBe("anulado");
  });

  // --- 8b. Editar fecha: cambia SOLO la fecha, nada más (sin UI que la
  // use todavía — ver Fase 7B — pero el endpoint y el método de DenszApi
  // ya están conectados, así que necesita su propia prueba de contrato). ---
  it("PATCH /trabajos/:id/fecha cambia únicamente la fecha del trabajo", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());
    expect(creada.body.fechaTrabajo).toBe("2026-01-15");

    const editada = await request(app)
      .patch(`/trabajos/${creada.body.id}/fecha`)
      .set("Cookie", cookieAdmin)
      .send({ fechaTrabajo: "2026-02-20" });
    expect(editada.status).toBe(200);

    const leida = await request(app).get(`/trabajos/${creada.body.id}`).set("Cookie", cookieAdmin);
    expect(leida.body.fechaTrabajo).toBe("2026-02-20");
    // Nada más se tocó: mismo número, mismo total, mismas prestaciones/piezas,
    // mismo paciente/odontólogo/clínica, mismo estado.
    expect(leida.body.numero).toBe(creada.body.numero);
    expect(leida.body.totalCentavos).toBe(creada.body.totalCentavos);
    expect(leida.body.estado).toBe(creada.body.estado);
    expect(leida.body.odontologoId).toBe(creada.body.odontologoId);
    expect(leida.body.pacienteId).toBe(creada.body.pacienteId);
    expect(leida.body.clinicaId).toBe(creada.body.clinicaId);
    expect(leida.body.prestaciones).toEqual(creada.body.prestaciones);
  });

  // --- 9. Transaccional: nada a medias si falla ---
  it("es transaccional: una prestación inexistente no deja ninguna OT a medias", async () => {
    const antes = await request(app).get("/trabajos").set("Cookie", cookieAdmin);
    const res = await request(app)
      .post("/trabajos")
      .set("Cookie", cookieAdmin)
      .send(datosOrdenValida({ prestaciones: [{ prestacionId: 999999999, cantidad: 1, piezasFdi: [] }] }));
    expect(res.status).toBe(400);
    const despues = await request(app).get("/trabajos").set("Cookie", cookieAdmin);
    expect(despues.body.length).toBe(antes.body.length);
  });

  // --- 10. Permisos: ORDENES_ELIMINAR, exactamente como hoy ---
  it("respeta el permiso ORDENES_ELIMINAR: RECEPCION recibe 403, ADMIN puede eliminar", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());

    const rechazo = await request(app)
      .delete(`/trabajos/${creada.body.id}`)
      .set("Cookie", cookieRecepcion)
      .send({ motivo: "Intento sin permiso" });
    expect(rechazo.status).toBe(403);

    const permitido = await request(app)
      .delete(`/trabajos/${creada.body.id}`)
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Eliminación de prueba con permiso" });
    expect(permitido.status).toBe(200);
  });

  // --- 11. Eliminación: comportamiento REAL (cascada, sin bloqueo por
  // dependencias — ordenService.eliminarOrdenDefinitivo no bloquea si hay
  // comprobante/movimientos, los borra en cascada dentro de la misma
  // transacción; a diferencia de pacientes/usuarios, Órdenes no tiene una
  // regla de "bloquear si tiene historial". No se inventó ninguna regla
  // nueva: se prueba exactamente el comportamiento que ya existe.) ---
  it("elimina en cascada una OT ya facturada (borra también su comprobante y movimiento)", async () => {
    const creada = await request(app).post("/trabajos").set("Cookie", cookieAdmin).send(datosOrdenValida());
    await generarComprobante(ctx.db, creada.body.id, ctx.usuarioId, pdfFalso);

    const { rows: antesComprobante } = await ctx.db.query("SELECT id FROM comprobantes WHERE orden_id = $1", [creada.body.id]);
    expect(antesComprobante.length).toBe(1);

    const eliminada = await request(app)
      .delete(`/trabajos/${creada.body.id}`)
      .set("Cookie", cookieAdmin)
      .send({ motivo: "Eliminación de prueba de OT facturada" });
    expect(eliminada.status).toBe(200);

    const leida = await request(app).get(`/trabajos/${creada.body.id}`).set("Cookie", cookieAdmin);
    expect(leida.body).toBeNull();

    const { rows: despuesComprobante } = await ctx.db.query("SELECT id FROM comprobantes WHERE orden_id = $1", [creada.body.id]);
    expect(despuesComprobante.length).toBe(0);
    const { rows: despuesMovimientos } = await ctx.db.query("SELECT id FROM movimientos_cuenta WHERE orden_id = $1", [creada.body.id]);
    expect(despuesMovimientos.length).toBe(0);
  });

  // --- 12. Ninguna prueba modifica datos reales de forma permanente ---
  // Verificado de forma rigurosa (no solo declarado) en afterAll: una
  // conexión NUEVA, después del ROLLBACK, confirma por SQL que no quedó
  // ninguna fila de odontologos/ordenes de estas pruebas.
});
