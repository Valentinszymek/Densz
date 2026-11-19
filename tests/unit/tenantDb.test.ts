import { describe, it, expect, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { attachTenantDb, type RequestConTenantDb } from "../../src/server/middleware/tenantDb";
import type { RequestConSesion } from "../../src/server/middleware/requireAuth";

function sesionFalsa(): RequestConSesion["sesion"] {
  return {
    usuarioId: 1,
    nombreUsuario: "admin",
    nombreCompleto: "Admin",
    rolNombre: "ADMINISTRADOR",
    permisos: [],
    laboratorioId: 1
  };
}

/**
 * attachTenantDb corre en CADA pedido autenticado (odontólogos, cuentas,
 * trabajos, todo) — a diferencia de withTransaction (probado contra un Pool
 * real en connection.test.ts), acá lo que importa es un caso que un Pool
 * real no puede forzar de forma confiable en un test: que pool.connect()
 * EN SÍ falle (pool agotado, timeout real contra el pooler). Hallazgo real
 * (2026-11-19): esa línea no tenía try/catch — un rechazo ahí, en un
 * middleware async montado con router.use(...), podía terminar sin
 * manejar. Esto prueba que ahora SIEMPRE cae en next(err), nunca escapa.
 */
describe("attachTenantDb", () => {
  it("si pool.connect() rechaza, llama a next(err) en vez de dejar la promesa sin manejar", async () => {
    const errorDeConexion = new Error("timeout: no hay conexiones libres en el pool");
    const poolFalso = { connect: vi.fn().mockRejectedValue(errorDeConexion) } as unknown as Pool;

    const middleware = attachTenantDb(poolFalso);
    const req = { sesion: sesionFalsa() } as unknown as RequestConSesion;
    const res = { on: vi.fn() } as never;
    const next = vi.fn();

    await expect(middleware(req as never, res, next)).resolves.toBeUndefined();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(errorDeConexion);
    expect((req as unknown as RequestConTenantDb).db).toBeUndefined();
  });

  it("si la conexión se obtiene bien, no llama a next con error y deja db fijado", async () => {
    const clientFalso = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn()
    } as unknown as PoolClient;
    const poolFalso = { connect: vi.fn().mockResolvedValue(clientFalso) } as unknown as Pool;

    const middleware = attachTenantDb(poolFalso);
    const req = { sesion: sesionFalsa() } as unknown as RequestConSesion;
    const res = { on: vi.fn() } as never;
    const next = vi.fn();

    await middleware(req as never, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as unknown as RequestConTenantDb).db).toBe(clientFalso);
  });
});
