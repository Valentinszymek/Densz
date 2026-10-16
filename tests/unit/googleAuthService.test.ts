import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { crearUsuario, listarRoles, obtenerUsuarioPorSupabaseId } from "../../src/main/db/repositories/usuariosRepo";
import { loginConGoogle } from "../../src/main/services/googleAuthService";
import { limpiarSesion } from "../../src/main/services/sessionService";

/**
 * loginConGoogle (plan multi-laboratorio, Etapa 4) — todavía NO da de
 * alta un laboratorio nuevo (eso es una etapa aparte, con Stripe de por
 * medio): solo vincula/reconoce un usuario YA EXISTENTE cargado con su
 * email. Estos tests no usan ningún token real de Google — eso es
 * responsabilidad de src/server/googleAuth.ts (verificarTokenGoogle),
 * probado aparte; acá se asume que la identidad ya está verificada
 * (misma separación que ya tiene la ruta HTTP).
 */
describe("googleAuthService.loginConGoogle", () => {
  let ctx: TestDb;
  let rolId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    limpiarSesion();
    rolId = (await listarRoles(ctx.db)).find((r) => r.nombre === "ADMINISTRADOR")!.id;
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("primer login con Google de un usuario existente (con email cargado) lo vincula y arma la sesión", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "valen", nombreCompleto: "Valentín", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["valen@example.com", id]);

    const sesion = await loginConGoogle(db, {
      supabaseUserId: "google-sub-123",
      email: "VALEN@Example.com", // mayúsculas/espacios no deberían importar
      nombreCompleto: "Valentín Szymek"
    });

    expect(sesion.usuarioId).toBe(id);
    expect(sesion.nombreUsuario).toBe("valen");

    const vinculado = await obtenerUsuarioPorSupabaseId(db, "google-sub-123");
    expect(vinculado?.id).toBe(id);
  });

  it("un segundo login ya vinculado entra directo por supabase_user_id, sin volver a mirar el email", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "valen2", nombreCompleto: "Valentín Dos", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1, supabase_user_id = $2 WHERE id = $3", [
      "valen2@example.com",
      "google-sub-456",
      id
    ]);

    const sesion = await loginConGoogle(db, {
      supabaseUserId: "google-sub-456",
      email: "un-email-distinto@example.com", // a propósito: no debería ni consultarse
      nombreCompleto: "Lo que sea"
    });
    expect(sesion.usuarioId).toBe(id);
  });

  it("rechaza un email que no corresponde a ningún usuario de Densz", async () => {
    const { db } = ctx;
    await expect(
      loginConGoogle(db, { supabaseUserId: "google-sub-x", email: "nadie@example.com", nombreCompleto: "Nadie" })
    ).rejects.toThrow(/no hay ninguna cuenta/i);
  });

  it("rechaza un usuario desactivado aunque el email coincida", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "inactivo", nombreCompleto: "Inactivo", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1, activo = 0 WHERE id = $2", ["inactivo@example.com", id]);

    await expect(
      loginConGoogle(db, { supabaseUserId: "google-sub-inactivo", email: "inactivo@example.com", nombreCompleto: "Inactivo" })
    ).rejects.toThrow(/no hay ninguna cuenta/i);
  });

  it("rechaza si ese email ya está vinculado a OTRA cuenta de Google (nunca re-vincula silenciosamente)", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "ya-vinculado", nombreCompleto: "Ya Vinculado", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1, supabase_user_id = $2 WHERE id = $3", [
      "yavinculado@example.com",
      "google-sub-original",
      id
    ]);

    await expect(
      loginConGoogle(db, { supabaseUserId: "google-sub-otro", email: "yavinculado@example.com", nombreCompleto: "Otro" })
    ).rejects.toThrow(/no hay ninguna cuenta/i);
  });

  it("la sesión arma laboratorioId desde usuarios.laboratorio_id (null por ahora, sin backfill)", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "sinlab", nombreCompleto: "Sin Lab", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["sinlab@example.com", id]);

    const sesion = await loginConGoogle(db, { supabaseUserId: "google-sub-sinlab", email: "sinlab@example.com", nombreCompleto: "Sin Lab" });
    expect(sesion.laboratorioId).toBeNull();
  });
});
