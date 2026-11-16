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
      // Si la sesión de este pedido no trae un laboratorio real (hoy,
      // siempre que sea un fixture de test armado a mano sin ese campo —
      // ver crearSesionHttp en los tests), NO se pisa el GUC: se deja el
      // que ya tenga la conexión, fijado por tests/helpers/testDb.ts al
      // armar su propio laboratorio de prueba. Si lo pisáramos a vacío
      // acá, RLS bloquearía toda la transacción del test (falla cerrado),
      // deshaciendo el aislamiento que el helper ya armó.
      if (sesion.laboratorioId !== null && sesion.laboratorioId !== undefined) {
        try {
          await fijarLaboratorioActual(pool, sesion.laboratorioId);
        } catch (err) {
          next(err);
          return;
        }
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
      // Ver el comentario largo en finalizar() más abajo: se descarta la
      // conexión (nunca se recicla "como sana") cuando algo salió mal.
      client.release(err instanceof Error ? err : new Error(String(err)));
      next(err);
      return;
    }

    (req as RequestConTenantDb).db = client;

    let terminado = false;
    async function finalizar(exito: boolean): Promise<void> {
      if (terminado) return;
      terminado = true;
      let errorDeCierre: unknown = null;
      try {
        await client.query(exito ? "COMMIT" : "ROLLBACK");
      } catch (err) {
        // Si el propio COMMIT/ROLLBACK falla (ej. conexión ya cortada a
        // mitad del pedido), no hay nada más para hacer con la
        // transacción — pero sí importa qué conexión vuelve al pool.
        errorDeCierre = err;
      }
      // Un ROLLBACK normal (ej. la ruta devolvió 400/404) es una
      // conexión perfectamente sana — nunca se descarta por eso solo.
      // Pasarle el error a release() (en vez de release() sin nada) le
      // dice al pool que DESCARTE esta conexión únicamente cuando el
      // COMMIT/ROLLBACK EN SÍ falló (ahí sí la conexión está rota de
      // verdad) en vez de devolverla "sana" para el próximo pedido — sin
      // esto, una conexión rota por un corte de red quedaba reciclada
      // igual, y el próximo pedido que la agarrara fallaba también,
      // hasta agotar de a poco las 10 conexiones del pool. Hallazgo real
      // (2026-11-16): el backend de Railway quedó "vivo" (respondía)
      // pero sin poder hablarle más a Postgres, y solo un reinicio del
      // proceso (pool nuevo de cero) lo recuperó — este es justamente el
      // mecanismo que debería evitar que vuelva a pasar solo.
      client.release(errorDeCierre instanceof Error ? errorDeCierre : errorDeCierre ? new Error(String(errorDeCierre)) : undefined);
    }
    res.on("finish", () => void finalizar(res.statusCode < 400));
    res.on("close", () => void finalizar(false));

    next();
  };
}
