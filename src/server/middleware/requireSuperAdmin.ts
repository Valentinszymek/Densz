import type { Request, Response, NextFunction } from "express";
import type { RequestConSesion } from "./requireAuth";

/**
 * Exige, además de sesión válida (requireAuth debe correr antes), que el
 * usuario sea el dueño del producto Densz — nunca el rol ADMINISTRADOR de
 * un laboratorio cliente, que es por-tenant y no tiene nada que ver con
 * esto. Protege el panel de laboratorios registrados (ver
 * laboratorios.route.ts), que lee `laboratorios` sin ningún scoping de
 * tenant (esa tabla no tiene RLS).
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const sesion = (req as RequestConSesion).sesion;
  if (!sesion?.superAdmin) {
    res.status(403).json({ error: "No tenés acceso a esta sección." });
    return;
  }
  next();
}
