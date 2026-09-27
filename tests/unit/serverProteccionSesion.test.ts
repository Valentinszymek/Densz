import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { setConfig } from "../../src/main/db/repositories/configRepo";
import {
  proteccionActivadaWeb,
  verificarPasswordProteccionWeb,
  requerirDesbloqueoProteccionWeb
} from "../../src/server/proteccion";
import { bloquearProteccionHttp } from "../../src/server/session";

/**
 * Prueba la propiedad de seguridad central de este bloque: el desbloqueo
 * de protección de una sesión NUNCA se filtra a otra — a diferencia de
 * src/main/services/proteccionService.ts (variable global, correcta para
 * Electron con un solo usuario por proceso), acá cada "navegador" (session
 * id) tiene su propio estado. Corre contra el proyecto de Supabase de
 * TESTS, dentro de una transacción con ROLLBACK — nunca toca producción.
 */
describe("server/proteccion — aislamiento por sesión", () => {
  let ctx: TestDb;
  const sesionA = "test-sesion-A";
  const sesionB = "test-sesion-B";

  afterEach(async () => {
    bloquearProteccionHttp(sesionA);
    bloquearProteccionHttp(sesionB);
    await ctx.finalizar();
  });

  it("el desbloqueo de una sesión nunca desbloquea a otra", async () => {
    ctx = await createTestDb();
    const { db } = ctx;

    await setConfig(db, "proteccion.activada", "1");
    await setConfig(db, "proteccion.passwordHash", bcrypt.hashSync("clave-de-prueba", 10));

    expect(await proteccionActivadaWeb(db)).toBe(true);

    // Ninguna de las dos sesiones empieza desbloqueada.
    await expect(requerirDesbloqueoProteccionWeb(db, sesionA)).rejects.toThrow();
    await expect(requerirDesbloqueoProteccionWeb(db, sesionB)).rejects.toThrow();

    // Contraseña incorrecta: no desbloquea nada.
    expect(await verificarPasswordProteccionWeb(db, "clave-incorrecta", sesionA)).toBe(false);
    await expect(requerirDesbloqueoProteccionWeb(db, sesionA)).rejects.toThrow();

    // Contraseña correcta en la sesión A: desbloquea SOLO la sesión A.
    expect(await verificarPasswordProteccionWeb(db, "clave-de-prueba", sesionA)).toBe(true);
    await expect(requerirDesbloqueoProteccionWeb(db, sesionA)).resolves.toBeUndefined();

    // La sesión B sigue bloqueada — la prueba central de este bloque.
    await expect(requerirDesbloqueoProteccionWeb(db, sesionB)).rejects.toThrow();

    // Bloquear la sesión A (equivalente a logout) vuelve a exigir la contraseña.
    bloquearProteccionHttp(sesionA);
    await expect(requerirDesbloqueoProteccionWeb(db, sesionA)).rejects.toThrow();
  });

  it("si la protección no está activada, cualquier sesión se considera desbloqueada sin pedir contraseña", async () => {
    ctx = await createTestDb();
    const { db } = ctx;

    // Se fuerza explícitamente "no activada" (no asumir el estado previo
    // de la base de test) para que este test sea determinístico.
    await setConfig(db, "proteccion.activada", "0");
    expect(await proteccionActivadaWeb(db)).toBe(false);
    await expect(requerirDesbloqueoProteccionWeb(db, "cualquier-sesion")).resolves.toBeUndefined();
  });
});
