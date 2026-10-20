import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { crearUsuario, listarRoles, obtenerUsuarioPorSupabaseId } from "../../src/main/db/repositories/usuariosRepo";
import { loginConGoogle, registrarseConGoogle } from "../../src/main/services/googleAuthService";
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

  it("la sesión arma laboratorioId desde usuarios.laboratorio_id (el laboratorio de prueba del test, vía el DEFAULT de la columna)", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "conlab", nombreCompleto: "Con Lab", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1 WHERE id = $2", ["conlab@example.com", id]);

    const sesion = await loginConGoogle(db, { supabaseUserId: "google-sub-conlab", email: "conlab@example.com", nombreCompleto: "Con Lab" });
    expect(sesion.laboratorioId).toBe(ctx.laboratorioId);
  });
});

/**
 * registrarseConGoogle (alta de laboratorio nuevo, "Crear mi
 * laboratorio") — ver plan §8. Nunca necesita una migración nueva: crea
 * todo (laboratorio + usuario admin + seed mínimo) en una transacción,
 * reutilizando exactamente el mismo patrón que
 * tests/helpers/testDb.ts's `crearLaboratorioDePrueba`.
 */
describe("googleAuthService.registrarseConGoogle", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
    limpiarSesion();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("da de alta un laboratorio nuevo con el seed completo (usuario admin vinculado, lista General, numeradores en 0)", async () => {
    const { db } = ctx;

    const sesion = await registrarseConGoogle(
      db,
      { supabaseUserId: "google-sub-nuevo-lab", email: "nuevo@laboratorio.com", nombreCompleto: "Nueva Persona" },
      "Laboratorio Nuevo SRL"
    );

    expect(sesion.nombreUsuario).toBe("admin");
    expect(sesion.nombreCompleto).toBe("Nueva Persona");
    expect(sesion.rolNombre).toBe("ADMINISTRADOR");
    expect(sesion.laboratorioId).not.toBe(ctx.laboratorioId);

    const { rows: labRows } = await db.query<{ nombre: string; estado_suscripcion: string; email_contacto: string }>(
      "SELECT nombre, estado_suscripcion, email_contacto FROM laboratorios WHERE id = $1",
      [sesion.laboratorioId]
    );
    expect(labRows[0]).toEqual({
      nombre: "Laboratorio Nuevo SRL",
      estado_suscripcion: "trialing",
      email_contacto: "nuevo@laboratorio.com"
    });

    const vinculado = await obtenerUsuarioPorSupabaseId(db, "google-sub-nuevo-lab");
    expect(vinculado?.id).toBe(sesion.usuarioId);

    // El GUC quedó fijado en el laboratorio nuevo tras el alta — estas
    // consultas, filtradas por RLS, solo pueden ver lo que se acaba de
    // crear para ESE laboratorio, nunca lo del laboratorio de prueba
    // original de este test (ctx.laboratorioId).
    const { rows: listas } = await db.query<{ nombre: string; moneda: string }>("SELECT nombre, moneda FROM listas_precio");
    expect(listas).toEqual([{ nombre: "General", moneda: "ARS" }]);

    const { rows: numeradores } = await db.query<{ tipo: string; ultimo_numero: number }>(
      "SELECT tipo, ultimo_numero FROM numeradores ORDER BY tipo"
    );
    expect(numeradores).toEqual([
      { tipo: "comprobante", ultimo_numero: 0 },
      { tipo: "orden", ultimo_numero: 0 }
    ]);
  });

  it("si la identidad de Google ya pertenece a un laboratorio existente, no crea uno nuevo: loguea directo al existente", async () => {
    const { db } = ctx;
    const rolId = (await listarRoles(db)).find((r) => r.nombre === "ADMINISTRADOR")!.id;
    const id = await crearUsuario(db, { nombreUsuario: "yaexiste", nombreCompleto: "Ya Existe", rolId }, bcrypt.hashSync("x", 10));
    await db.query("UPDATE usuarios SET email = $1, supabase_user_id = $2 WHERE id = $3", [
      "yaexiste@example.com",
      "google-sub-existente",
      id
    ]);

    const { rows: antes } = await db.query<{ total: string }>("SELECT count(*)::text AS total FROM laboratorios");

    const sesion = await registrarseConGoogle(
      db,
      { supabaseUserId: "google-sub-existente", email: "yaexiste@example.com", nombreCompleto: "Ya Existe" },
      "Un nombre que debería ignorarse por completo"
    );

    expect(sesion.usuarioId).toBe(id);
    expect(sesion.laboratorioId).toBe(ctx.laboratorioId);

    const { rows: despues } = await db.query<{ total: string }>("SELECT count(*)::text AS total FROM laboratorios");
    expect(despues[0].total).toBe(antes[0].total);
  });

  it("exige un nombre de laboratorio para un alta nueva (nunca crea uno sin nombre)", async () => {
    const { db } = ctx;
    await expect(
      registrarseConGoogle(
        db,
        { supabaseUserId: "google-sub-sinnombre", email: "sinnombre@example.com", nombreCompleto: "Sin Nombre" },
        "   "
      )
    ).rejects.toThrow(/nombre de tu laboratorio/i);
  });

  it("dos altas de laboratorio seguidas no chocan en numeradores ni listas de precios (claves compuestas por laboratorio)", async () => {
    const { db } = ctx;

    const sesionA = await registrarseConGoogle(
      db,
      { supabaseUserId: "google-sub-lab-a", email: "labA@example.com", nombreCompleto: "Lab A" },
      "Laboratorio A"
    );
    // Se lee ACÁ, con el GUC todavía apuntando al laboratorio A recién
    // creado — después del segundo alta, RLS ya no dejaría ver estas
    // filas desde esta misma conexión (quedaría fijada en el laboratorio B).
    const { rows: numeradoresA } = await db.query<{ tipo: string; ultimo_numero: number }>(
      "SELECT tipo, ultimo_numero FROM numeradores ORDER BY tipo"
    );

    const sesionB = await registrarseConGoogle(
      db,
      { supabaseUserId: "google-sub-lab-b", email: "labB@example.com", nombreCompleto: "Lab B" },
      "Laboratorio B"
    );
    const { rows: numeradoresB } = await db.query<{ tipo: string; ultimo_numero: number }>(
      "SELECT tipo, ultimo_numero FROM numeradores ORDER BY tipo"
    );

    expect(sesionA.laboratorioId).not.toBe(sesionB.laboratorioId);

    const esperado = [
      { tipo: "comprobante", ultimo_numero: 0 },
      { tipo: "orden", ultimo_numero: 0 }
    ];
    expect(numeradoresA).toEqual(esperado);
    expect(numeradoresB).toEqual(esperado);
  });
});
