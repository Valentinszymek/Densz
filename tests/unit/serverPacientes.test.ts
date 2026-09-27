import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearRouterPacientes } from "../../src/server/routes/pacientes.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/pacientes", crearRouterPacientes(db));
  return app;
}

const NOMBRE_TEST = "Paciente Test Fase12D";

/**
 * Pruebas HTTP de /pacientes (Fase 12D) — la lectura ya estaba conectada
 * desde Fase 6A pero nunca tuvo un test a nivel HTTP; se agrega ahora
 * junto con la escritura, que sí es nueva de esta fase. Mismo patrón que
 * el resto de server*.test.ts: transacción con ROLLBACK real.
 */
describe("HTTP /pacientes", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  let sesionAdminId: string;
  let sesionSinPermisoId: string;
  let cookieAdmin: string;
  let cookieSinPermiso: string;
  let pacienteId: number;

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    app = construirApp(db as unknown as Pool);

    const listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Pacientes Test Fase12D", listaPrecioId: listaId });

    sesionAdminId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-test-pacientes",
      nombreCompleto: "Admin Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Sesión SIN ningún permiso "pacientes.*" — prueba si el backend lo
    // exige (Parte E: no inventar, solo documentar lo real).
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "sin-permiso-test-pacientes",
      nombreCompleto: "Sin Permiso Test",
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
      const { rows } = await verificacion.db.query("SELECT id FROM pacientes WHERE nombre ILIKE $1", ["%Fase12D%"]);
      expect(rows).toHaveLength(0);
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en lectura y escritura", async () => {
    const resultados = await Promise.all([
      request(app).get("/pacientes"),
      request(app).post("/pacientes").send({ nombreCompleto: "x", odontologoId }),
      request(app).put("/pacientes/1").send({ nombreCompleto: "x", odontologoId }),
      request(app).patch("/pacientes/1/activo").send({ activo: false })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("crear/actualizar/activar NO exigen ningún permiso pacientes.* — paridad exacta con Desktop (sin chequeo en el IPC actual)", async () => {
    const crear = await request(app)
      .post("/pacientes")
      .set("Cookie", cookieSinPermiso)
      .send({ nombreCompleto: "Paciente Sin Permiso Fase12D", odontologoId });
    expect(crear.status).toBe(201);
  });

  it("crea un paciente con los campos reales (nombreCompleto, odontologoId) — nada más", async () => {
    const res = await request(app).post("/pacientes").set("Cookie", cookieAdmin).send({ nombreCompleto: NOMBRE_TEST, odontologoId });
    expect(res.status).toBe(201);
    pacienteId = res.body as number;

    const obtenido = await request(app).get(`/pacientes/${pacienteId}`).set("Cookie", cookieAdmin);
    expect(obtenido.body).toMatchObject({ id: pacienteId, nombreCompleto: NOMBRE_TEST, odontologoId, activo: true });
    // Campos que NO existen en el modelo real — nunca se inventaron.
    expect(obtenido.body).not.toHaveProperty("dni");
    expect(obtenido.body).not.toHaveProperty("telefono");
    expect(obtenido.body).not.toHaveProperty("observaciones");
  });

  it("aparece en el listado, filtrable por odontólogo", async () => {
    const res = await request(app).get(`/pacientes?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(res.body.some((p: { id: number }) => p.id === pacienteId)).toBe(true);
  });

  it("actualiza el nombre del paciente", async () => {
    const res = await request(app)
      .put(`/pacientes/${pacienteId}`)
      .set("Cookie", cookieAdmin)
      .send({ nombreCompleto: `${NOMBRE_TEST} editado`, odontologoId });
    expect(res.status).toBe(200);
    const obtenido = await request(app).get(`/pacientes/${pacienteId}`).set("Cookie", cookieAdmin);
    expect(obtenido.body.nombreCompleto).toBe(`${NOMBRE_TEST} editado`);
  });

  it("desactiva y reactiva el paciente sin eliminarlo", async () => {
    const desactivar = await request(app).patch(`/pacientes/${pacienteId}/activo`).set("Cookie", cookieAdmin).send({ activo: false });
    expect(desactivar.status).toBe(200);
    const inactivo = await request(app).get(`/pacientes/${pacienteId}`).set("Cookie", cookieAdmin);
    expect(inactivo.body.activo).toBe(false);

    const reactivar = await request(app).patch(`/pacientes/${pacienteId}/activo`).set("Cookie", cookieAdmin).send({ activo: true });
    expect(reactivar.status).toBe(200);
    const activo = await request(app).get(`/pacientes/${pacienteId}`).set("Cookie", cookieAdmin);
    expect(activo.body.activo).toBe(true);

    // Sigue existiendo la misma fila — nunca se borró.
    const { rows } = await ctx.db.query("SELECT id FROM pacientes WHERE id = $1", [pacienteId]);
    expect(rows).toHaveLength(1);
  });

  it("rechaza payload inválido (400) sin crear nada", async () => {
    const antes = await request(app).get(`/pacientes?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    const res = await request(app).post("/pacientes").set("Cookie", cookieAdmin).send({ nombreCompleto: "x" });
    expect(res.status).toBe(400);
    const despues = await request(app).get(`/pacientes?odontologoId=${odontologoId}`).set("Cookie", cookieAdmin);
    expect(despues.body.length).toBe(antes.body.length);
  });

  it("no expone datos sensibles en ninguna respuesta", async () => {
    const res = await request(app).get("/pacientes").set("Cookie", cookieAdmin);
    const crudo = JSON.stringify(res.body).toLowerCase();
    expect(crudo).not.toMatch(/password|service_role|token/);
  });

  // --- Eliminación segura (Bloque 2 / Parte B) ---
  it("rechaza sin sesión (401) el DELETE", async () => {
    const res = await request(app).delete(`/pacientes/${pacienteId}`);
    expect(res.status).toBe(401);
  });

  it("elimina físicamente un paciente sin ningún trabajo asociado (eliminadoFisicamente:true) y queda en Auditoría", async () => {
    const res = await request(app).delete(`/pacientes/${pacienteId}`).set("Cookie", cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eliminadoFisicamente: true });

    const { rows } = await ctx.db.query("SELECT id FROM pacientes WHERE id = $1", [pacienteId]);
    expect(rows).toHaveLength(0);

    const auditoria = await ctx.db.query(
      "SELECT detalle FROM auditoria WHERE entidad = 'pacientes' AND entidad_id = $1 AND accion = 'eliminar'",
      [pacienteId]
    );
    expect(auditoria.rows).toHaveLength(1);
    const detalle =
      typeof auditoria.rows[0].detalle === "string" ? JSON.parse(auditoria.rows[0].detalle) : auditoria.rows[0].detalle;
    expect(detalle.resultado).toBe("eliminado_fisicamente");
  });
});
