import type { Request, Response, NextFunction } from "express";
import { tienePermiso, type Permiso } from "../../shared/constants/permisos";
import type { RequestConSesion } from "./requireAuth";

/**
 * Exige, además de sesión válida (requireAuth debe correr antes), el mismo
 * permiso que hoy exige el equivalente IPC de escritorio — usa la misma
 * función `tienePermiso` que usa sessionService.ts, sobre los permisos que
 * ya trae la sesión de la cookie (nunca la variable global).
 */
export function requirePermission(permiso: Permiso) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sesion = (req as RequestConSesion).sesion;
    if (!sesion || !tienePermiso(sesion.permisos, permiso)) {
      res.status(403).json({ error: "No tenés permiso para realizar esta acción." });
      return;
    }
    next();
  };
}
