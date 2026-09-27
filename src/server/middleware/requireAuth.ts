import type { Request, Response, NextFunction } from "express";
import { obtenerSesionHttp, COOKIE_SESION } from "../session";
import type { SesionActual } from "../../main/services/sessionService";

export interface RequestConSesion extends Request {
  sesion: SesionActual;
  /** Id crudo de la sesión (cookie) — lo necesitan las rutas de Cuentas/
   * Estadísticas para consultar el desbloqueo de protección por sesión
   * (ver proteccion.ts), sin depender de ningún estado global. */
  sesionId: string;
}

/**
 * Exige una sesión válida (por cookie, ver session.ts) antes de dejar pasar
 * a una ruta. Nunca lee la variable global de sessionService.ts — cada
 * pedido HTTP resuelve su propio usuario a partir de su propia cookie, para
 * soportar varios navegadores conectados a la vez.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const idSesion = req.cookies?.[COOKIE_SESION] as string | undefined;
  const sesion = obtenerSesionHttp(idSesion);
  if (!sesion || !idSesion) {
    res.status(401).json({ error: "No hay una sesión activa. Iniciá sesión para continuar." });
    return;
  }
  (req as RequestConSesion).sesion = sesion;
  (req as RequestConSesion).sesionId = idSesion;
  next();
}
