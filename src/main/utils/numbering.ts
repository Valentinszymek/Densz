import type { Queryable } from "../db/types";

/**
 * Incrementa atómicamente el numerador del tipo dado y devuelve el número
 * formateado (prefijo + dígitos con cero-padding). El `UPDATE ... RETURNING`
 * es una única sentencia atómica en Postgres — a diferencia del viejo
 * SELECT+UPDATE de SQLite (seguro solo porque SQLite serializaba
 * transacciones de una única instancia local), esto es correcto incluso
 * con varias instalaciones de Densz escribiendo a la vez contra la misma
 * base compartida. Debe llamarse siempre dentro de una transacción de
 * escritura (ver `withTransaction`).
 */
export async function siguienteNumero(db: Queryable, tipo: "orden" | "comprobante"): Promise<string> {
  const { rows } = await db.query<{ prefijo: string; digitos: number; ultimo_numero: number }>(
    "UPDATE numeradores SET ultimo_numero = ultimo_numero + 1 WHERE tipo = $1 RETURNING prefijo, digitos, ultimo_numero",
    [tipo]
  );

  const fila = rows[0];
  if (!fila) {
    throw new Error(`No existe un numerador configurado para el tipo "${tipo}".`);
  }

  return `${fila.prefijo}${String(fila.ultimo_numero).padStart(fila.digitos, "0")}`;
}
