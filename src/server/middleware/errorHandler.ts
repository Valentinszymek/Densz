import type { Request, Response, NextFunction } from "express";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { logger } from "../../main/utils/logger";

/**
 * Manejador de errores global de Express — corrección post-auditoría
 * (§23.7/§38.2 de docs/AUDITORIA_MAESTRA_DENSZ.md): antes, un handler
 * async que dejaba escapar un error (por ejemplo un `.parse()` de Zod sin
 * try/catch) dejaba el pedido sin respuesta hasta que el cliente/proxy
 * hiciera timeout, en vez de un 400 claro. Junto con `express-async-errors`
 * (que reenvía cualquier rechazo de un handler async hasta acá), este es
 * el único lugar que decide la respuesta cuando algo falla y nadie más lo
 * manejó.
 *
 * Mismo formato que usa cada ruta individualmente (`traducirErrorPostgres`
 * + `{ error: mensaje }`), para que no haya DOS estilos de error distintos
 * conviviendo — nunca expone el stack trace ni SQL crudo. Debe registrarse
 * DESPUÉS de montar todos los routers (Express solo lo reconoce como
 * error-handler por tener 4 parámetros).
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  // Corrección (encontrada investigando el bug real de "Ver PDF" en
  // producción, 2026-10-01): este handler nunca logueaba el error
  // original — devolvía el mensaje genérico al cliente (a propósito,
  // nunca expone detalles técnicos) pero no dejaba ningún rastro server-side,
  // así que un fallo real (ej. Puppeteer) era invisible en los logs de
  // Railway. Acá sí se loguea completo, nunca se envía al cliente.
  logger.error(`Error no manejado en ${req.method} ${req.path}:`, err);
  const error = traducirErrorPostgres(err);
  res.status(400).json({ error: error.message });
}
