import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Pool } from "pg";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { setConfig } from "../../src/main/db/repositories/configRepo";
import { crearRouterCuentas } from "../../src/server/routes/cuentas.route";
import { crearRouterEstadisticas } from "../../src/server/routes/estadisticas.route";
import { crearRouterProteccion } from "../../src/server/routes/proteccion.route";
import { crearSesionHttp, destruirSesionHttp, bloquearProteccionHttp, COOKIE_SESION } from "../../src/server/session";

function construirApp(db: Pool): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/cuentas", crearRouterCuentas(db));
  app.use("/estadisticas", crearRouterEstadisticas(db));
  app.use("/proteccion", crearRouterProteccion(db));
  return app;
}

/**
 * Bloque 7 / mejora 3: Cuentas y Estadísticas comparten una sola
 * contraseña de protección — este archivo prueba, a nivel HTTP (con los
 * dos routers reales montados juntos, como en la app real), que
 * desbloquear cualquiera de las dos desbloquea también la otra, dentro de
 * la MISMA sesión — sin filtrarse nunca a otra sesión. El estado
 * compartido siempre vivió en el backend (un único flag por sesión en
 * session.ts) — lo que se corrigió fue el guard de React, que volvía a
 * pedir la contraseña al navegar entre ambas aunque el backend ya las
 * considerara desbloqueadas. Corre contra Densz-Test, con ROLLBACK real.
 */
describe("Protección compartida — Cuentas y Estadísticas (Bloque 7)", () => {
  let ctx: TestDb & { usuarioId: number };
  let app: Express;
  let odontologoId: number;
  const PASSWORD = "clave-compartida-test";

  const HOY = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    ctx = await createTestDbConUsuario();
    app = construirApp(ctx.db as unknown as Pool);
    const listaId = await idListaGeneral(ctx.db);
    odontologoId = await crearOdontologo(ctx.db, { nombre: "Dr. Proteccion Compartida Test", listaPrecioId: listaId });
    await setConfig(ctx.db, "proteccion.activada", "1");
    await setConfig(ctx.db, "proteccion.passwordHash", bcrypt.hashSync(PASSWORD, 10));
  }, 30000);

  afterAll(async () => {
    await setConfig(ctx.db, "proteccion.activada", "0");
    await ctx.finalizar();
  });

  function crearSesionAdmin(nombre: string) {
    const id = crearSesionHttp({
      usuarioId: ctx.usuarioId,
      nombreUsuario: nombre,
      nombreCompleto: nombre,
      rolNombre: "ADMINISTRADOR",
      permisos: ["*"]
    });
    return { id, cookie: `${COOKIE_SESION}=${id}` };
  }

  it("1-2. desbloquear desde Cuentas también da acceso a Estadísticas, en la misma sesión", async () => {
    const s = crearSesionAdmin("sesion-cuentas-primero");
    try {
      const bloqueada = await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie);
      expect(bloqueada.status).toBe(403);

      const verificar = await request(app).post("/proteccion/verificar").set("Cookie", s.cookie).send({ password: PASSWORD });
      expect(verificar.body.ok).toBe(true);

      const cuentas = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie);
      expect(cuentas.status).toBe(200);

      const estadisticas = await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie);
      expect(estadisticas.status).toBe(200);
    } finally {
      destruirSesionHttp(s.id);
      bloquearProteccionHttp(s.id);
    }
  });

  it("3-4. desbloquear desde Estadísticas también da acceso a Cuentas, en la misma sesión", async () => {
    const s = crearSesionAdmin("sesion-estadisticas-primero");
    try {
      const bloqueada = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie);
      expect(bloqueada.status).toBe(403);

      const verificar = await request(app).post("/proteccion/verificar").set("Cookie", s.cookie).send({ password: PASSWORD });
      expect(verificar.body.ok).toBe(true);

      const estadisticas = await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie);
      expect(estadisticas.status).toBe(200);

      const cuentas = await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie);
      expect(cuentas.status).toBe(200);
    } finally {
      destruirSesionHttp(s.id);
      bloquearProteccionHttp(s.id);
    }
  });

  it("5. bloquear la sesión vuelve a cerrar el acceso a AMBAS", async () => {
    const s = crearSesionAdmin("sesion-bloqueo");
    try {
      await request(app).post("/proteccion/verificar").set("Cookie", s.cookie).send({ password: PASSWORD });
      expect((await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie)).status).toBe(200);

      bloquearProteccionHttp(s.id);

      expect((await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie)).status).toBe(403);
      expect((await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie)).status).toBe(403);
    } finally {
      destruirSesionHttp(s.id);
      bloquearProteccionHttp(s.id);
    }
  });

  it("6. logout (destruir + recrear la sesión) vuelve a exigir la contraseña en ambas", async () => {
    let s = crearSesionAdmin("sesion-logout");
    await request(app).post("/proteccion/verificar").set("Cookie", s.cookie).send({ password: PASSWORD });
    expect((await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie)).status).toBe(200);

    // Logout real: la ruta /auth/logout llama a destruirSesionHttp, que
    // también bloquea la protección de esa sesión (session.ts).
    destruirSesionHttp(s.id);
    s = crearSesionAdmin("sesion-logout");
    try {
      expect((await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", s.cookie)).status).toBe(403);
      expect((await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", s.cookie)).status).toBe(403);
    } finally {
      destruirSesionHttp(s.id);
      bloquearProteccionHttp(s.id);
    }
  });

  it("7. aislamiento entre dos sesiones: desbloquear una no afecta a la otra en ninguna de las dos secciones", async () => {
    const a = crearSesionAdmin("sesion-aislamiento-a");
    const b = crearSesionAdmin("sesion-aislamiento-b");
    try {
      await request(app).post("/proteccion/verificar").set("Cookie", a.cookie).send({ password: PASSWORD });

      expect((await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", a.cookie)).status).toBe(200);
      expect((await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", a.cookie)).status).toBe(200);

      expect((await request(app).get(`/cuentas/${odontologoId}/saldos`).set("Cookie", b.cookie)).status).toBe(403);
      expect((await request(app).get(`/estadisticas/kpis?desde=${HOY}&hasta=${HOY}`).set("Cookie", b.cookie)).status).toBe(403);
    } finally {
      destruirSesionHttp(a.id);
      destruirSesionHttp(b.id);
      bloquearProteccionHttp(a.id);
      bloquearProteccionHttp(b.id);
    }
  });
});
