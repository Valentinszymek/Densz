import type { Queryable } from "../db/types";
import type { ResultadoBusqueda, TipoResultadoBusqueda } from "../../shared/types/ipc-contracts";

/**
 * Sanitiza el texto de búsqueda a tokens alfanuméricos seguros para
 * `to_tsquery` (evita que caracteres especiales de su sintaxis como
 * comillas, paréntesis o "&"/"|"/"!" literales rompan la consulta).
 */
function tokensSeguros(texto: string): string[] {
  return (texto.match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 0);
}

const LIMITE_POR_TIPO = 5;

export async function buscarGlobal(db: Queryable, texto: string): Promise<ResultadoBusqueda[]> {
  const tokens = tokensSeguros(texto);
  if (tokens.length === 0) return [];

  // Prefijo + AND entre tokens, igual comportamiento que la consulta FTS5
  // anterior ("token1* token2*" = AND implícito de prefijos).
  const consultaTsquery = tokens.map((t) => `${t}:*`).join(" & ");

  const { rows } = await db.query<{ tipo: TipoResultadoBusqueda; refId: number; texto: string }>(
    `SELECT tipo, ref_id AS "refId", texto
     FROM busqueda_global
     WHERE texto_tsv @@ to_tsquery('simple', $1)
     ORDER BY ts_rank(texto_tsv, to_tsquery('simple', $1)) DESC
     LIMIT 40`,
    [consultaTsquery]
  );

  const porTipo = new Map<TipoResultadoBusqueda, number>();
  const resultados: ResultadoBusqueda[] = [];

  for (const fila of rows) {
    const cantidadActual = porTipo.get(fila.tipo) ?? 0;
    if (cantidadActual >= LIMITE_POR_TIPO) continue;
    porTipo.set(fila.tipo, cantidadActual + 1);
    resultados.push({ tipo: fila.tipo, refId: fila.refId, texto: fila.texto });
  }

  return resultados;
}
