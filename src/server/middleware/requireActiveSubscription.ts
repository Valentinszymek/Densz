import type { Request, Response, NextFunction } from "express";
import type { RequestConSesion } from "./requireAuth";
import { suscripcionActiva } from "../../shared/utils/suscripcion";

/**
 * Exige que el laboratorio de la sesión tenga una suscripción vigente
 * (activa, en trial sin vencer, o exento — Dental Szymek) antes de dejar
 * pasar a una ruta de negocio. Va DESPUÉS de requireAuth (necesita
 * `req.sesion`) y nunca se aplica a `/auth/*`, `/billing/*` ni al panel
 * `/laboratorios` de superAdmin (ver server/index.ts).
 *
 * Un superAdmin (dueño del producto) siempre pasa, sin importar el estado
 * de SU PROPIO laboratorio — es una cuenta de operación interna, no un
 * cliente pagando.
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction): void {
  const sesion = (req as RequestConSesion).sesion;
  if (sesion.superAdmin) {
    next();
    return;
  }
  const facturacion = sesion.facturacion;
  if (!facturacion || !suscripcionActiva(facturacion)) {
    res.status(402).json({
      error: "Tu período de prueba terminó o tu suscripción no está activa. Activá un plan para seguir usando Densz.",
      codigo: "SUSCRIPCION_INACTIVA"
    });
    return;
  }
  next();
}

/** Exige que el plan del laboratorio sea uno de los permitidos — usada en
 * rutas exclusivas de Professional (Auditoría, Estadísticas, Export). Va
 * DESPUÉS de requireActiveSubscription (si la suscripción ya está
 * vencida, ese 402 es el error correcto, no un 403 de plan). Un trial
 * (`plan: 'trial'`) y un superAdmin siempre pasan — el trial da acceso
 * completo a todo mientras dura, decisión comercial ya tomada (30 días
 * para evaluar el producto entero, no una versión recortada). */
export function requirePlan(...planesPermitidos: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sesion = (req as RequestConSesion).sesion;
    if (sesion.superAdmin || sesion.facturacion?.exentoFacturacion) {
      next();
      return;
    }
    const plan = sesion.facturacion?.plan;
    if (plan === "trial" || (plan && planesPermitidos.includes(plan))) {
      next();
      return;
    }
    res.status(403).json({
      error: "Esta función no está disponible en tu plan actual.",
      codigo: "PLAN_INSUFICIENTE"
    });
  };
}
