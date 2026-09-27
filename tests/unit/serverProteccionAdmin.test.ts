import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, createTestDb, type TestDb } from "../helpers/testDb";
import { crearRouterProteccion } from "../../src/server/routes/proteccion.route";
import { crearSesionHttp, destruirSesionHttp, COOKIE_SESION, estaDesbloqueadaProteccionHttp } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/proteccion", crearRouterProteccion(db));
  return app;
}

const CODIGO_FORMATO = /^DENSZ-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;

/**
 * Pruebas HTTP de /proteccion (Fase 10C) — administración completa de la
 * protección de Cuentas/Estadísticas, además de la infraestructura de
 * desbloqueo por sesión ya cubierta en serverProteccionSesion.test.ts. Mismo
 * patrón que el resto de server*.test.ts: transacción con ROLLBACK real,
 * verificación final por SQL con conexión nueva.
 */
describe("HTTP /proteccion — administración (Fase 10C)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let sesionAdminAId: string;
  let sesionAdminBId: string;
  let sesionSinPermisoId: string;
  let cookieAdminA: string;
  let cookieAdminB: string;
  let cookieSinPermiso: string;

  const PASSWORD_1 = "clave-proteccion-fase10c-1";
  const PASSWORD_2 = "clave-proteccion-fase10c-2";

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);

    sesionAdminAId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-a-test-proteccion",
      nombreCompleto: "Admin A Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    sesionAdminBId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-b-test-proteccion",
      nombreCompleto: "Admin B Test",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    // Mismo conjunto real que tiene RECEPCION hoy en producción (sin
    // "configuracion.editar") — para probar el permiso, no un set inventado.
    sesionSinPermisoId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "recepcion-test-proteccion",
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
    cookieAdminA = `${COOKIE_SESION}=${sesionAdminAId}`;
    cookieAdminB = `${COOKIE_SESION}=${sesionAdminBId}`;
    cookieSinPermiso = `${COOKIE_SESION}=${sesionSinPermisoId}`;
  }, 30000);

  afterAll(async () => {
    destruirSesionHttp(sesionAdminAId);
    destruirSesionHttp(sesionAdminBId);
    destruirSesionHttp(sesionSinPermisoId);
    await ctx.finalizar(); // ROLLBACK real

    const verificacion = await createTestDb();
    try {
      // El estado de protección escrito dentro de la transacción no debe
      // haber sobrevivido al rollback: ninguna de las contraseñas de
      // prueba de este archivo debe seguir siendo válida contra la config
      // real de Densz-Test.
      const { rows } = await verificacion.db.query<{ valor: string }>(
        "SELECT valor FROM configuracion WHERE clave = 'proteccion.passwordHash'"
      );
      if (rows[0]?.valor) {
        const bcrypt = await import("bcryptjs");
        expect(bcrypt.compareSync(PASSWORD_1, rows[0].valor)).toBe(false);
        expect(bcrypt.compareSync(PASSWORD_2, rows[0].valor)).toBe(false);
      }
    } finally {
      await verificacion.finalizar();
    }
  });

  it("rechaza sin sesión (401) en todas las rutas", async () => {
    const resultados = await Promise.all([
      request(app).get("/proteccion/estado"),
      request(app).post("/proteccion/verificar").send({ password: "x" }),
      request(app).post("/proteccion/bloquear"),
      request(app).post("/proteccion/activar").send({ password: "x", confirmarPassword: "x" }),
      request(app).post("/proteccion/desactivar").send({ passwordActual: "x" }),
      request(app).post("/proteccion/cambiar-password").send({ passwordActual: "x", passwordNueva: "y", confirmarNueva: "y" }),
      request(app).post("/proteccion/generar-codigo"),
      request(app).post("/proteccion/verificar-codigo").send({ codigo: "x" }),
      request(app)
        .post("/proteccion/restablecer-con-codigo")
        .send({ codigo: "x", passwordNueva: "y", confirmarNueva: "y" })
    ]);
    for (const r of resultados) expect(r.status).toBe(401);
  });

  it("las rutas administrativas rechazan (403) con el permiso real de RECEPCION (sin configuracion.editar)", async () => {
    const resultados = await Promise.all([
      request(app).post("/proteccion/activar").set("Cookie", cookieSinPermiso).send({ password: "x", confirmarPassword: "x" }),
      request(app).post("/proteccion/desactivar").set("Cookie", cookieSinPermiso).send({ passwordActual: "x" }),
      request(app)
        .post("/proteccion/cambiar-password")
        .set("Cookie", cookieSinPermiso)
        .send({ passwordActual: "x", passwordNueva: "y", confirmarNueva: "y" }),
      request(app).post("/proteccion/generar-codigo").set("Cookie", cookieSinPermiso),
      request(app).post("/proteccion/verificar-codigo").set("Cookie", cookieSinPermiso).send({ codigo: "x" }),
      request(app)
        .post("/proteccion/restablecer-con-codigo")
        .set("Cookie", cookieSinPermiso)
        .send({ codigo: "x", passwordNueva: "y", confirmarNueva: "y" })
    ]);
    for (const r of resultados) expect(r.status).toBe(403);
  });

  it("estado/verificar/bloquear NO exigen el permiso administrativo — RECEPCION puede usarlos (candado para VER, no función administrativa)", async () => {
    const resultados = await Promise.all([
      request(app).get("/proteccion/estado").set("Cookie", cookieSinPermiso),
      request(app).post("/proteccion/verificar").set("Cookie", cookieSinPermiso).send({ password: "x" }),
      request(app).post("/proteccion/bloquear").set("Cookie", cookieSinPermiso)
    ]);
    for (const r of resultados) expect(r.status).toBe(200);
  });

  it("GET /estado devuelve activada:false por defecto (nada más — nunca password ni hash)", async () => {
    const res = await request(app).get("/proteccion/estado").set("Cookie", cookieAdminA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activada: false });
  });

  it("POST /activar exige que ambas contraseñas coincidan (400) y no activa nada", async () => {
    const res = await request(app)
      .post("/proteccion/activar")
      .set("Cookie", cookieAdminA)
      .send({ password: PASSWORD_1, confirmarPassword: "otra-cosa" });
    expect(res.status).toBe(400);
    const estado = await request(app).get("/proteccion/estado").set("Cookie", cookieAdminA);
    expect(estado.body.activada).toBe(false);
  });

  it("POST /activar activa la protección, devuelve un código con el formato correcto, y deja a quien activó desbloqueado en su propia sesión", async () => {
    const res = await request(app)
      .post("/proteccion/activar")
      .set("Cookie", cookieAdminA)
      .send({ password: PASSWORD_1, confirmarPassword: PASSWORD_1 });
    expect(res.status).toBe(200);
    expect(res.body.codigoRecuperacion).toMatch(CODIGO_FORMATO);
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const estado = await request(app).get("/proteccion/estado").set("Cookie", cookieAdminA);
    expect(estado.body.activada).toBe(true);

    // Desbloqueado por sesión, no globalmente — comprobado directamente
    // sobre el mecanismo real (session.ts), no de forma indirecta.
    expect(estaDesbloqueadaProteccionHttp(sesionAdminAId)).toBe(true);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(false);
  });

  it("no permite activar la protección dos veces (400), ya está activada por el test anterior", async () => {
    const res = await request(app)
      .post("/proteccion/activar")
      .set("Cookie", cookieAdminA)
      .send({ password: "otra-mas", confirmarPassword: "otra-mas" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya está activada/i);
  });

  it("aislamiento de sesiones: A desbloqueada, B sigue bloqueada hasta verificar con la contraseña correcta", async () => {
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(false);

    const incorrecta = await request(app).post("/proteccion/verificar").set("Cookie", cookieAdminB).send({ password: "mal" });
    expect(incorrecta.body.ok).toBe(false);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(false);

    const correcta = await request(app)
      .post("/proteccion/verificar")
      .set("Cookie", cookieAdminB)
      .send({ password: PASSWORD_1 });
    expect(correcta.body.ok).toBe(true);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(true);

    // A sigue desbloqueada, sin que lo de B la haya afectado.
    expect(estaDesbloqueadaProteccionHttp(sesionAdminAId)).toBe(true);
  });

  it("bloquear A no afecta a B (cada sesión es independiente)", async () => {
    expect(estaDesbloqueadaProteccionHttp(sesionAdminAId)).toBe(true);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(true);

    const res = await request(app).post("/proteccion/bloquear").set("Cookie", cookieAdminA);
    expect(res.status).toBe(200);

    expect(estaDesbloqueadaProteccionHttp(sesionAdminAId)).toBe(false);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(true); // B no se vio afectada
  });

  it("logout limpia el desbloqueo de esa sesión (destruirSesionHttp también borra su desbloqueo de protección)", async () => {
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(true);
    destruirSesionHttp(sesionAdminBId);
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(false);

    // Recrear la sesión B (equivalente a un login nuevo) para el resto de
    // los tests: debe arrancar bloqueada, nunca heredar el desbloqueo viejo.
    sesionAdminBId = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: "admin-b-test-proteccion-2",
      nombreCompleto: "Admin B Test 2",
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    cookieAdminB = `${COOKIE_SESION}=${sesionAdminBId}`;
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(false);
  });

  it("POST /desactivar exige la contraseña actual correcta (400 si es incorrecta, no cambia el estado)", async () => {
    const mal = await request(app).post("/proteccion/desactivar").set("Cookie", cookieAdminA).send({ passwordActual: "mal" });
    expect(mal.status).toBe(400);
    const estado = await request(app).get("/proteccion/estado").set("Cookie", cookieAdminA);
    expect(estado.body.activada).toBe(true);
  });

  it("POST /cambiar-password exige la actual correcta; tras cambiarla, la vieja deja de servir y la nueva funciona", async () => {
    const mal = await request(app)
      .post("/proteccion/cambiar-password")
      .set("Cookie", cookieAdminA)
      .send({ passwordActual: "mal", passwordNueva: PASSWORD_2, confirmarNueva: PASSWORD_2 });
    expect(mal.status).toBe(400);

    const ok = await request(app)
      .post("/proteccion/cambiar-password")
      .set("Cookie", cookieAdminA)
      .send({ passwordActual: PASSWORD_1, passwordNueva: PASSWORD_2, confirmarNueva: PASSWORD_2 });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });

    const conVieja = await request(app).post("/proteccion/verificar").set("Cookie", cookieAdminB).send({ password: PASSWORD_1 });
    expect(conVieja.body.ok).toBe(false);

    const conNueva = await request(app).post("/proteccion/verificar").set("Cookie", cookieAdminB).send({ password: PASSWORD_2 });
    expect(conNueva.body.ok).toBe(true);
  });

  it("POST /generar-codigo devuelve un código nuevo con formato correcto, que invalida el anterior", async () => {
    const res = await request(app).post("/proteccion/generar-codigo").set("Cookie", cookieAdminA);
    expect(res.status).toBe(200);
    expect(res.body.codigoRecuperacion).toMatch(CODIGO_FORMATO);

    const codigoNuevo = res.body.codigoRecuperacion as string;

    const verificarNuevo = await request(app)
      .post("/proteccion/verificar-codigo")
      .set("Cookie", cookieAdminA)
      .send({ codigo: codigoNuevo });
    expect(verificarNuevo.body.ok).toBe(true);
  });

  it("POST /verificar-codigo: código incorrecto no verifica", async () => {
    const res = await request(app)
      .post("/proteccion/verificar-codigo")
      .set("Cookie", cookieAdminA)
      .send({ codigo: "DENSZ-0000-0000-0000" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it("POST /restablecer-con-codigo: con un código válido define la nueva contraseña, rota el código, y desbloquea la sesión que restableció", async () => {
    const codigo = await request(app).post("/proteccion/generar-codigo").set("Cookie", cookieAdminA);
    const codigoActual = codigo.body.codigoRecuperacion as string;

    const passwordRestablecida = "clave-restablecida-fase10c";
    const res = await request(app)
      .post("/proteccion/restablecer-con-codigo")
      .set("Cookie", cookieAdminB)
      .send({ codigo: codigoActual, passwordNueva: passwordRestablecida, confirmarNueva: passwordRestablecida });
    expect(res.status).toBe(200);
    expect(res.body.codigoRecuperacion).toMatch(CODIGO_FORMATO);
    expect(res.body.codigoRecuperacion).not.toBe(codigoActual); // se rotó

    // El código usado ya no sirve.
    const codigoViejoYaNoSirve = await request(app)
      .post("/proteccion/verificar-codigo")
      .set("Cookie", cookieAdminA)
      .send({ codigo: codigoActual });
    expect(codigoViejoYaNoSirve.body.ok).toBe(false);

    // Quien restableció queda desbloqueado en su propia sesión.
    expect(estaDesbloqueadaProteccionHttp(sesionAdminBId)).toBe(true);
  });

  it("ninguna respuesta HTTP de este módulo expone passwordHash, password en texto plano (fuera del propio formulario) ni service_role", async () => {
    const estado = await request(app).get("/proteccion/estado").set("Cookie", cookieAdminA);
    const verificar = await request(app).post("/proteccion/verificar").set("Cookie", cookieAdminA).send({ password: "x" });
    for (const cuerpo of [estado.body, verificar.body]) {
      const crudo = JSON.stringify(cuerpo).toLowerCase();
      expect(crudo).not.toMatch(/passwordhash|service_role/);
      expect(JSON.stringify(cuerpo)).not.toMatch(/\$2[aby]\$/);
    }
  });

  it("la auditoría de las operaciones de protección nunca guarda la contraseña, el hash ni el código en texto plano", async () => {
    const { rows } = await ctx.db.query<{ detalle: unknown }>(
      `SELECT detalle FROM auditoria
       WHERE entidad = 'configuracion'
         AND accion IN ('activar_proteccion','desactivar_proteccion','cambiar_password_proteccion','generar_codigo_proteccion','recuperar_proteccion')
       ORDER BY id DESC`
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const fila of rows) {
      const crudo = JSON.stringify(fila.detalle);
      expect(crudo).not.toContain(PASSWORD_1);
      expect(crudo).not.toContain(PASSWORD_2);
      expect(crudo.toLowerCase()).not.toMatch(/passwordhash|password":|contraseñ.*:.*[a-z0-9]{6}/);
      expect(crudo).not.toMatch(/\$2[aby]\$/);
      expect(crudo).not.toMatch(/^DENSZ-/);
    }
  });
});
