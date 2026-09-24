import { types } from "pg";

/**
 * Postgres devuelve BIGINT (OID 20) — incluido el resultado de COUNT(*) sin
 * cast — como string en node-postgres, porque un bigint puede exceder
 * Number.MAX_SAFE_INTEGER. En Densz nunca se acerca a ese rango (conteos y
 * totales en centavos de una base chica), así que se parsea siempre como
 * number para no romper los sitios que esperan `{ c: number }`.
 *
 * Se registra en un módulo separado (en vez de directamente en
 * connection.ts) porque el registro de `pg.types` es global por proceso:
 * tanto la app real (connection.ts) como los tests (tests/helpers/testDb.ts,
 * que abre su propio Pool contra el proyecto Supabase de tests) necesitan
 * llamarlo, y así ninguno de los dos se olvida.
 */
export function registrarParsersPostgres(): void {
  types.setTypeParser(20, (val: string) => Number.parseInt(val, 10)); // BIGINT (ej. COUNT(*))
  // SUM(bigint) devuelve NUMERIC (OID 1700), no BIGINT — Postgres lo hace
  // a propósito para nunca perder precisión en una suma grande. Acá nunca
  // se acerca a ese rango (son sumas de centavos de una base chica), así
  // que también se parsea siempre como number.
  types.setTypeParser(1700, (val: string) => Number.parseFloat(val));
}
