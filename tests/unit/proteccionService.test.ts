import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
import {
  obtenerEstadoProteccion,
  activarProteccion,
  desactivarProteccion,
  cambiarPasswordProteccion,
  verificarPasswordProteccion,
  requerirDesbloqueoProteccion,
  estaDesbloqueadoEnEstaSesion,
  bloquearProteccion,
  generarNuevoCodigoRecuperacion,
  verificarCodigoRecuperacion,
  restablecerPasswordConCodigo
} from "../../src/main/services/proteccionService";

describe("proteccionService", () => {
  let ctx: TestDb & { usuarioId: number };

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    // El desbloqueo es un flag en memoria de todo el proceso (no por
    // base de datos de test) — hay que resetearlo manualmente entre
    // pruebas para que no se filtre estado de una a la otra.
    bloquearProteccion();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("por defecto la protección está desactivada", async () => {
    expect(await obtenerEstadoProteccion(ctx.db)).toEqual({ activada: false });
    expect(estaDesbloqueadoEnEstaSesion()).toBe(false);
  });

  it("sin protección activada, requerirDesbloqueoProteccion nunca bloquea", async () => {
    await expect(requerirDesbloqueoProteccion(ctx.db)).resolves.not.toThrow();
  });

  it("sin protección activada, cualquier password 'verifica' (no hay nada que proteger)", async () => {
    expect(await verificarPasswordProteccion(ctx.db, "cualquier-cosa")).toBe(true);
  });

  it("activar la protección exige password no vacía", async () => {
    const { db, usuarioId } = ctx;
    await expect(activarProteccion(db, { password: "", confirmarPassword: "", usuarioId })).rejects.toThrow(/vacía/i);
  });

  it("activar la protección exige que ambas contraseñas coincidan", async () => {
    const { db, usuarioId } = ctx;
    await expect(activarProteccion(db, { password: "abc123", confirmarPassword: "xyz789", usuarioId })).rejects.toThrow(
      /no coinciden/i
    );
  });

  it("activar la protección genera un código con el formato DENSZ-XXXX-XXXX-XXXX, guarda el estado y desbloquea la sesión actual", async () => {
    const { db, usuarioId } = ctx;
    const { codigoRecuperacion } = await activarProteccion(db, { password: "secreta123", confirmarPassword: "secreta123", usuarioId });

    expect(codigoRecuperacion).toMatch(/^DENSZ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(await obtenerEstadoProteccion(db)).toEqual({ activada: true });
    expect(estaDesbloqueadoEnEstaSesion()).toBe(true);
  });

  it("no permite activar la protección dos veces", async () => {
    const { db, usuarioId } = ctx;
    await activarProteccion(db, { password: "secreta123", confirmarPassword: "secreta123", usuarioId });
    await expect(activarProteccion(db, { password: "otra", confirmarPassword: "otra", usuarioId })).rejects.toThrow(/ya está activada/i);
  });

  it("la contraseña y el código de recuperación NUNCA se guardan en texto plano en configuracion", async () => {
    const { db, usuarioId } = ctx;
    const { codigoRecuperacion } = await activarProteccion(db, { password: "secreta123", confirmarPassword: "secreta123", usuarioId });

    const { rows: filas } = await db.query<{ clave: string; valor: string }>(
      "SELECT clave, valor FROM configuracion WHERE clave LIKE 'proteccion.%'"
    );
    for (const fila of filas) {
      expect(fila.valor).not.toBe("secreta123");
      expect(fila.valor).not.toContain(codigoRecuperacion);
      if (fila.clave.endsWith("Hash")) {
        // bcrypt: siempre arranca con $2
        expect(fila.valor.startsWith("$2")).toBe(true);
      }
    }
  });

  it("activar queda registrado en Auditoría sin exponer la contraseña ni el código", async () => {
    const { db, usuarioId } = ctx;
    const { codigoRecuperacion } = await activarProteccion(db, { password: "secreta123", confirmarPassword: "secreta123", usuarioId });

    const { rows } = await db.query<{ usuario_id: number; detalle: string }>(
      "SELECT * FROM auditoria WHERE accion = 'activar_proteccion'"
    );
    const evento = rows[0];
    expect(evento.usuario_id).toBe(usuarioId);
    expect(evento.detalle).not.toContain("secreta123");
    expect(evento.detalle).not.toContain(codigoRecuperacion);
  });

  describe("con la protección ya activada", () => {
    let codigoInicial: string;

    beforeEach(async () => {
      const r = await activarProteccion(ctx.db, { password: "secreta123", confirmarPassword: "secreta123", usuarioId: ctx.usuarioId });
      codigoInicial = r.codigoRecuperacion;
      bloquearProteccion(); // activar() desbloquea automáticamente — para probar el candado, se vuelve a bloquear
    });

    it("requerirDesbloqueoProteccion bloquea hasta que se verifique la contraseña correcta", async () => {
      const { db } = ctx;
      await expect(requerirDesbloqueoProteccion(db)).rejects.toThrow(/protegida/i);
      expect(await verificarPasswordProteccion(db, "secreta123")).toBe(true);
      await expect(requerirDesbloqueoProteccion(db)).resolves.not.toThrow();
    });

    it("una contraseña incorrecta no desbloquea la sesión", async () => {
      const { db } = ctx;
      expect(await verificarPasswordProteccion(db, "incorrecta")).toBe(false);
      expect(estaDesbloqueadoEnEstaSesion()).toBe(false);
      await expect(requerirDesbloqueoProteccion(db)).rejects.toThrow();
    });

    it("una vez desbloqueada la sesión, Estadísticas y Cuentas comparten el mismo desbloqueo (una sola verificación)", async () => {
      const { db } = ctx;
      await verificarPasswordProteccion(db, "secreta123");
      // Nada específico de "Estadísticas" ni "Cuentas" acá: el mismo
      // flag de sesión es el que consultan ambos módulos.
      expect(estaDesbloqueadoEnEstaSesion()).toBe(true);
      await expect(requerirDesbloqueoProteccion(db)).resolves.not.toThrow();
      await expect(requerirDesbloqueoProteccion(db)).resolves.not.toThrow(); // segunda vez, sin volver a pedir nada
    });

    it("cerrar sesión (bloquearProteccion) vuelve a exigir la contraseña", async () => {
      const { db } = ctx;
      await verificarPasswordProteccion(db, "secreta123");
      expect(estaDesbloqueadoEnEstaSesion()).toBe(true);
      bloquearProteccion(); // simula reinicio de Densz / logout
      expect(estaDesbloqueadoEnEstaSesion()).toBe(false);
      await expect(requerirDesbloqueoProteccion(db)).rejects.toThrow();
    });

    it("cambiar la contraseña exige la actual correcta", async () => {
      const { db, usuarioId } = ctx;
      await expect(
        cambiarPasswordProteccion(db, {
          passwordActual: "incorrecta",
          passwordNueva: "nueva123",
          confirmarNueva: "nueva123",
          usuarioId
        })
      ).rejects.toThrow(/incorrecta/i);
    });

    it("cambiar la contraseña exige que las nuevas coincidan y no estén vacías", async () => {
      const { db, usuarioId } = ctx;
      await expect(
        cambiarPasswordProteccion(db, { passwordActual: "secreta123", passwordNueva: "a", confirmarNueva: "b", usuarioId })
      ).rejects.toThrow(/no coinciden/i);
      await expect(
        cambiarPasswordProteccion(db, { passwordActual: "secreta123", passwordNueva: "", confirmarNueva: "", usuarioId })
      ).rejects.toThrow(/vacía/i);
    });

    it("después de cambiar la contraseña, la vieja deja de servir y la nueva funciona", async () => {
      const { db, usuarioId } = ctx;
      await cambiarPasswordProteccion(db, {
        passwordActual: "secreta123",
        passwordNueva: "nuevaSegura456",
        confirmarNueva: "nuevaSegura456",
        usuarioId
      });

      expect(await verificarPasswordProteccion(db, "secreta123")).toBe(false);
      expect(await verificarPasswordProteccion(db, "nuevaSegura456")).toBe(true);
    });

    it("desactivar exige la contraseña actual correcta", async () => {
      const { db, usuarioId } = ctx;
      await expect(desactivarProteccion(db, { passwordActual: "incorrecta", usuarioId })).rejects.toThrow(/incorrecta/i);
      expect((await obtenerEstadoProteccion(db)).activada).toBe(true);
    });

    it("al desactivar, Estadísticas y Cuentas dejan de pedir contraseña", async () => {
      const { db, usuarioId } = ctx;
      await desactivarProteccion(db, { passwordActual: "secreta123", usuarioId });
      expect((await obtenerEstadoProteccion(db)).activada).toBe(false);
      await expect(requerirDesbloqueoProteccion(db)).resolves.not.toThrow();
    });

    it("generar un nuevo código invalida el anterior", async () => {
      const { db, usuarioId } = ctx;
      expect(await verificarCodigoRecuperacion(db, codigoInicial)).toBe(true);

      const { codigoRecuperacion: nuevo } = await generarNuevoCodigoRecuperacion(db, { usuarioId });

      expect(await verificarCodigoRecuperacion(db, codigoInicial)).toBe(false);
      expect(await verificarCodigoRecuperacion(db, nuevo)).toBe(true);
      expect(nuevo).not.toBe(codigoInicial);
    });

    it("un código de recuperación incorrecto no verifica", async () => {
      expect(await verificarCodigoRecuperacion(ctx.db, "DENSZ-0000-0000-0000")).toBe(false);
    });

    it("restablecer con un código incorrecto falla con un mensaje claro y no cambia nada", async () => {
      const { db, usuarioId } = ctx;
      await expect(
        restablecerPasswordConCodigo(db, {
          codigo: "DENSZ-0000-0000-0000",
          passwordNueva: "otra123",
          confirmarNueva: "otra123",
          usuarioId
        })
      ).rejects.toThrow(/no pudimos verificar/i);
      // La contraseña original sigue funcionando: nada cambió.
      expect(await verificarPasswordProteccion(db, "secreta123")).toBe(true);
    });

    it("restablecer con el código correcto define la nueva contraseña, rota el código y desbloquea la sesión", async () => {
      const { db, usuarioId } = ctx;
      bloquearProteccion();
      const { codigoRecuperacion: nuevoCodigo } = await restablecerPasswordConCodigo(db, {
        codigo: codigoInicial,
        passwordNueva: "restablecida789",
        confirmarNueva: "restablecida789",
        usuarioId
      });

      // Contraseña vieja ya no sirve, la nueva sí.
      bloquearProteccion();
      expect(await verificarPasswordProteccion(db, "secreta123")).toBe(false);
      expect(await verificarPasswordProteccion(db, "restablecida789")).toBe(true);

      // El código usado queda invalidado; el nuevo, vigente.
      expect(await verificarCodigoRecuperacion(db, codigoInicial)).toBe(false);
      expect(await verificarCodigoRecuperacion(db, nuevoCodigo)).toBe(true);

      // La recuperación deja la sesión ya desbloqueada.
      expect(estaDesbloqueadoEnEstaSesion()).toBe(true);
    });

    it("recuperar queda registrado en Auditoría sin exponer la contraseña ni el código", async () => {
      const { db, usuarioId } = ctx;
      await restablecerPasswordConCodigo(db, {
        codigo: codigoInicial,
        passwordNueva: "restablecida789",
        confirmarNueva: "restablecida789",
        usuarioId
      });

      const { rows } = await db.query<{ detalle: string }>("SELECT * FROM auditoria WHERE accion = 'recuperar_proteccion'");
      const evento = rows[0];
      expect(evento.detalle).not.toContain("restablecida789");
      expect(evento.detalle).not.toContain(codigoInicial);
    });
  });
});
