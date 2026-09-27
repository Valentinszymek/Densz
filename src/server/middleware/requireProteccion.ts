import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import { requerirDesbloqueoProteccionWeb } from "../proteccion";
import type { RequestConSesion } from "./requireAuth";

/**
 * Exige que la protección opcional de Cuentas/Estadísticas esté
 * desbloqueada PARA ESTA SESIÓN (requireAuth debe correr antes, para
 * tener req.sesionId disponible) — nunca lee ningún estado global
 * compartido entre navegadores. Ver src/server/proteccion.ts y
 * src/server/session.ts (marcarDesbloqueoProteccionHttp/
 * estaDesbloqueadaProteccionHttp), que son la reimplementación web,
 * separada, de src/main/services/proteccionService.ts.
 */
export function requireProteccion(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sesionId } = req as unknown as RequestConSesion;
      await requerirDesbloqueoProteccionWeb(db, sesionId);
      next();
    } catch {
      res.status(403).json({ error: "Esta sección está protegida por contraseña." });
    }
  };
}
