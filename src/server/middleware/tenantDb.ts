import type { Pool, PoolClient } from "pg";
import type { Request, Response, NextFunction } from "express";
import type { Queryable } from "../../main/db/types";
import type { RequestConSesion } from "./requireAuth";

export interface RequestConTenantDb extends RequestConSesion {
  /** Conexión propia de este pedido, con el laboratorio de la sesión ya
   * fijado como GUC de Postgres (`app.current_laboratorio_id`) — usar
   * esta en cada handler en vez del `Pool` cerrado por clausura del
   * router. Compatible sin cambios con toda la capa de repositorios
   * (`Queryable = Pool | PoolClient`, ver src/main/db/types.ts). */
  db: PoolClient;
}

/**
 * `PoolClient` también expone un método `.connect()` (lo hereda de la
 * clase `Client` de la que en verdad es instancia) — así que no sirve
 * para distinguirlo de un `Pool` real. `.release()`, en cambio, solo
 * existe en una conexión ya sacada del pool. Mismo chequeo que
 * `withTransaction` (src/main/db/withTransaction.ts) — necesario acá
 * porque los tests HTTP (`tests/unit/server*.test.ts`) le pasan a cada
 * router un `PoolClient` ya abierto, disfrazado de `Pool` (toda la
 * request de test corre dentro de esa misma transacción, que el test
 * revierte al final) — nunca un `Pool` real.
 */
function esPoolClient(db: Pool | PoolClient): db is PoolClient {
  return typeof (db as PoolClient).release === "function";
}

/** Fija el laboratorio actual como GUC en una conexión ya abierta —
 * parametrizado, nunca interpolado a mano. `laboratorioId` puede ser
 * `null` todavía (ningún login actual lo resuelve hasta que el login con
 * Google esté implementado): Postgres simplemente lo guarda como no
 * fijado, sin romper nada mientras RLS no esté activada. */
async function fijarLaboratorioActual(db: Queryable, laboratorioId: number | null | undefined): Promise<void> {
  // "undefined" además de "null": los fixtures de test arman la sesión a
  // mano con crearSesionHttp({...}) sin este campo (no hay chequeo de
  // tipos en runtime) — nunca debe terminar como la STRING "undefined".
  await db.query("SELECT set_config('app.current_laboratorio_id', $1, true)", [
    laboratorioId === null || laboratorioId === undefined ? "" : String(laboratorioId)
  ]);
}

/**
 * Arma, para TODO el pedido HTTP, una conexión propia con el laboratorio
 * de la sesión fijado — es el mecanismo que va a dejar que las políticas
 * de Row-Level Security filtren solas cada consulta por laboratorio
 * (Etapa 3 del plan multi-laboratorio; mientras RLS no esté activada en
 * la tabla correspondiente, fijar este valor no cambia el resultado de
 * ninguna consulta existente — este middleware es seguro de desplegar
 * antes de activar RLS).
 *
 * Debe montarse DESPUÉS de requireAuth en cada router (necesita
 * req.sesion ya resuelto).
 *
 * `pool` es casi siempre un `Pool` real (producción/desarrollo): acá se
 * abre una transacción propia que dura todo el pedido — COMMIT si la
 * respuesta termina en éxito (status < 400), ROLLBACK en cualquier otro
 * caso, incluida una conexión cortada a mitad de camino. Pero en los
 * tests HTTP (`tests/unit/server*.test.ts`) lo que llega acá es en
 * realidad un `PoolClient` ya abierto, disfrazado de `Pool` — toda la
 * request de un test corre a propósito dentro de esa misma transacción
 * (que el test revierte al final con su propio ROLLBACK), así que en ese
 * caso no se abre ninguna transacción nueva ni se toca COMMIT/ROLLBACK:
 * solo se fija el laboratorio sobre esa misma conexión, igual patrón que
 * `withTransaction` (src/main/db/withTransaction.ts).
 */
export function attachTenantDb(pool: Pool | PoolClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const sesion = (req as RequestConSesion).sesion;

    if (esPoolClient(pool)) {
      try {
        await fijarLaboratorioActual(pool, sesion.laboratorioId);
      } catch (err) {
        next(err);
        return;
      }
      (req as RequestConTenantDb).db = pool;
      next();
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fijarLaboratorioActual(client, sesion.laboratorioId);
    } catch (err) {
      client.release();
      next(err);
      return;
    }

    (req as RequestConTenantDb).db = client;

    let terminado = false;
    async function finalizar(exito: boolean): Promise<void> {
      if (terminado) return;
      terminado = true;
      try {
        await client.query(exito ? "COMMIT" : "ROLLBACK");
      } catch {
        // Si el propio COMMIT/ROLLBACK falla (ej. conexión ya cortada),
        // no hay nada más para hacer acá — se libera igual abajo.
      } finally {
        client.release();
      }
    }
    res.on("finish", () => void finalizar(res.statusCode < 400));
    res.on("close", () => void finalizar(false));

    next();
  };
}
