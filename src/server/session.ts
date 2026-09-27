import crypto from "node:crypto";
import type { SesionActual } from "../main/services/sessionService";

/**
 * Sesiones del servidor web: un mapa en memoria por proceso, una entrada
 * por navegador conectado (identificada por un id aleatorio en cookie).
 *
 * A diferencia de `sessionService.ts` (pensado para un único proceso
 * Electron con una sola persona usándolo a la vez), acá puede haber muchas
 * sesiones simultáneas — nunca hay que usar un solo valor "global" para
 * saber quién es el usuario actual, sino leer siempre a partir del id de
 * sesión que llega en la cookie de cada pedido.
 */
const sesiones = new Map<string, SesionActual>();

/**
 * Desbloqueo de la protección opcional de Cuentas/Estadísticas (ver
 * proteccion.ts), por sesión — NUNCA una variable global compartida como
 * `desbloqueadoEnEstaSesion` en src/main/services/proteccionService.ts
 * (esa es correcta para Electron, un solo usuario por proceso; acá hay
 * muchos navegadores a la vez, cada uno con su propio desbloqueo).
 */
const desbloqueosProteccion = new Set<string>();

export const COOKIE_SESION = "densz_session";

export function crearSesionHttp(sesion: SesionActual): string {
  const id = crypto.randomUUID();
  sesiones.set(id, sesion);
  return id;
}

export function obtenerSesionHttp(id: string | undefined): SesionActual | null {
  if (!id) return null;
  return sesiones.get(id) ?? null;
}

export function destruirSesionHttp(id: string | undefined): void {
  if (!id) return;
  sesiones.delete(id);
  // El cierre de sesión también vuelve a exigir la contraseña de
  // protección — mismo criterio que authService.logout() -> bloquearProteccion()
  // en el escritorio, aplicado por sesión en vez de globalmente.
  desbloqueosProteccion.delete(id);
}

export function marcarDesbloqueoProteccionHttp(id: string): void {
  desbloqueosProteccion.add(id);
}

export function estaDesbloqueadaProteccionHttp(id: string | undefined): boolean {
  return !!id && desbloqueosProteccion.has(id);
}

export function bloquearProteccionHttp(id: string | undefined): void {
  if (id) desbloqueosProteccion.delete(id);
}
