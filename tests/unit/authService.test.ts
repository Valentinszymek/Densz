import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { crearUsuario, listarRoles, setActivoUsuario } from "../../src/main/db/repositories/usuariosRepo";
import { listarAuditoria } from "../../src/main/db/repositories/auditoriaRepo";
import { login, logout } from "../../src/main/services/authService";
import { getSesionActual, limpiarSesion } from "../../src/main/services/sessionService";

describe("authService", () => {
  let ctx: TestDb;
  let rolAdminId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    const { db } = ctx;
    limpiarSesion();
    rolAdminId = (await listarRoles(db)).find((r) => r.nombre === "ADMINISTRADOR")!.id;
    await crearUsuario(
      db,
      { nombreUsuario: "maria", nombreCompleto: "María Recepción", rolId: rolAdminId },
      bcrypt.hashSync("clave123", 10)
    );
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("permite iniciar sesión con credenciales correctas", async () => {
    const sesion = await login(ctx.db, "maria", "clave123");
    expect(sesion.nombreUsuario).toBe("maria");
    expect(getSesionActual()?.usuarioId).toBe(sesion.usuarioId);
  });

  it("rechaza una contraseña incorrecta con un mensaje genérico", async () => {
    await expect(login(ctx.db, "maria", "clave-mala")).rejects.toThrow(/usuario o contraseña/i);
    expect(getSesionActual()).toBeNull();
  });

  it("rechaza un usuario inexistente con el mismo mensaje genérico (no revela si el usuario existe)", async () => {
    let mensajeInexistente = "";
    let mensajeClaveMala = "";
    try {
      await login(ctx.db, "no-existe", "cualquiera");
    } catch (e) {
      mensajeInexistente = (e as Error).message;
    }
    try {
      await login(ctx.db, "maria", "clave-mala");
    } catch (e) {
      mensajeClaveMala = (e as Error).message;
    }
    expect(mensajeInexistente).toBe(mensajeClaveMala);
  });

  it("rechaza el login de un usuario desactivado", async () => {
    const { db } = ctx;
    const usuario = await crearUsuario(
      db,
      { nombreUsuario: "inactivo", nombreCompleto: "Usuario Inactivo", rolId: rolAdminId },
      bcrypt.hashSync("clave123", 10)
    );
    await setActivoUsuario(db, usuario, false);
    await expect(login(db, "inactivo", "clave123")).rejects.toThrow();
  });

  it("logout limpia la sesión activa", async () => {
    const sesion = await login(ctx.db, "maria", "clave123");
    await logout(ctx.db, sesion.usuarioId);
    expect(getSesionActual()).toBeNull();
  });

  it("registra en Auditoría un intento de login fallido por contraseña incorrecta", async () => {
    await expect(login(ctx.db, "maria", "clave-mala")).rejects.toThrow();
    const eventos = await listarAuditoria(ctx.db, { entidad: "usuarios" });
    const fallo = eventos.find((e) => e.accion === "login_fallido");
    expect(fallo).toBeDefined();
    expect(fallo?.detalle).toEqual({ nombreUsuario: "maria" });
  });

  it("registra en Auditoría un intento de login fallido con usuario inexistente, sin usuarioId", async () => {
    await expect(login(ctx.db, "no-existe", "cualquiera")).rejects.toThrow();
    const eventos = await listarAuditoria(ctx.db, { entidad: "usuarios" });
    const fallo = eventos.find((e) => e.accion === "login_fallido" && e.detalle?.nombreUsuario === "no-existe");
    expect(fallo).toBeDefined();
    expect(fallo?.usuarioId).toBeNull();
  });

  it("registra en Auditoría un intento de login fallido de un usuario desactivado, sin loguearlo como éxito", async () => {
    const { db } = ctx;
    const usuario = await crearUsuario(
      db,
      { nombreUsuario: "inactivo2", nombreCompleto: "Usuario Inactivo Dos", rolId: rolAdminId },
      bcrypt.hashSync("clave123", 10)
    );
    await setActivoUsuario(db, usuario, false);
    await expect(login(db, "inactivo2", "clave123")).rejects.toThrow();
    const eventos = await listarAuditoria(db, { entidad: "usuarios" });
    const exito = eventos.find((e) => e.accion === "login" && e.usuarioId === usuario);
    const fallo = eventos.find((e) => e.accion === "login_fallido" && e.usuarioId === usuario);
    expect(exito).toBeUndefined();
    expect(fallo).toBeDefined();
  });

  it("un login exitoso no deja rastro de login_fallido", async () => {
    await login(ctx.db, "maria", "clave123");
    const eventos = await listarAuditoria(ctx.db, { entidad: "usuarios" });
    expect(eventos.some((e) => e.accion === "login_fallido")).toBe(false);
  });
});
