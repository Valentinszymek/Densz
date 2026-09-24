import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { listarRoles } from "../../src/main/db/repositories/usuariosRepo";
import { tienePermiso, PERMISOS } from "../../src/shared/constants/permisos";

/**
 * Verifica, contra las migraciones reales (no un mock), que los permisos
 * de cada rol coinciden con lo que el nuevo flujo de login/sidebar espera:
 * RECEPCION solo ve Inicio/Odontólogos/Clínicas/Pacientes/Trabajos, y el
 * backend (requerirPermiso, usado por cuentas.ipc.ts, estadisticas.ipc.ts,
 * precios.ipc.ts y config.ipc.ts) tiene que rechazarla en todo lo demás.
 */
describe("permisos por rol — RECEPCION vs ADMINISTRADOR", () => {
  let ctx: TestDb;
  let permisosRecepcion: string[];
  let permisosAdmin: string[];

  beforeEach(async () => {
    ctx = await createTestDb();
    const roles = await listarRoles(ctx.db);
    permisosRecepcion = roles.find((r) => r.nombre === "RECEPCION")!.permisos;
    permisosAdmin = roles.find((r) => r.nombre === "ADMINISTRADOR")!.permisos;
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("RECEPCION no tiene acceso a las secciones restringidas de este flujo", () => {
    expect(tienePermiso(permisosRecepcion, PERMISOS.CUENTAS_VER)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.ESTADISTICAS_VER)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.PRECIOS_EDITAR)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.CONFIGURACION_EDITAR)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.USUARIOS_GESTIONAR)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.AUDITORIA_VER)).toBe(false);
    expect(tienePermiso(permisosRecepcion, PERMISOS.BACKUPS_GESTIONAR)).toBe(false);
  });

  it("RECEPCION conserva lo que necesita para Inicio/Odontólogos/Clínicas/Pacientes/Trabajos", () => {
    expect(tienePermiso(permisosRecepcion, PERMISOS.ORDENES_CREAR)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.ORDENES_VER)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.PACIENTES_CREAR)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.PACIENTES_VER)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.ODONTOLOGOS_VER)).toBe(true);
    // Comprobantes: se mantiene el permiso ya probado (crear/ver el
    // comprobante de un trabajo) — solo se oculta la sección de listado
    // general del sidebar, no el backend.
    expect(tienePermiso(permisosRecepcion, PERMISOS.COMPROBANTES_CREAR)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.COMPROBANTES_VER)).toBe(true);
    // Pagos: necesarios para registrar un pago dentro de un trabajo — no
    // es lo mismo que "Cuentas" (el listado/resumen financiero completo).
    expect(tienePermiso(permisosRecepcion, PERMISOS.PAGOS_CREAR)).toBe(true);
    expect(tienePermiso(permisosRecepcion, PERMISOS.PAGOS_VER)).toBe(true);
  });

  it("ADMINISTRADOR tiene acceso total vía el permiso comodín", () => {
    expect(permisosAdmin).toContain("*");
    for (const permiso of Object.values(PERMISOS)) {
      expect(tienePermiso(permisosAdmin, permiso)).toBe(true);
    }
  });
});
