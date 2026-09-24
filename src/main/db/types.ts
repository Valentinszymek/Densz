import type { Pool, PoolClient } from "pg";

/**
 * Superficie común entre `Pool` y `PoolClient`: todos los repositorios
 * reciben esto en vez de un tipo concreto, para poder correr tanto sobre
 * una conexión suelta del pool como dentro de una transacción explícita
 * (ver `withTransaction`) sin duplicar código.
 */
export type Queryable = Pool | PoolClient;
