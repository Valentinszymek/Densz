// Única fuente de verdad de "¿esta suscripción está activa?" — la usan
// tanto el middleware del servidor (requireActiveSubscription.ts, la
// verificación real) como el guard del renderer (RutaSuscripcionActiva.tsx,
// solo para no mostrar una app que va a fallar en cada pedido). Si algún
// día cambia la regla, cambia en un solo lugar para los dos.

export interface EstadoFacturacion {
  estadoSuscripcion: string;
  trialTerminaEn: string | null;
  exentoFacturacion: boolean;
}

/** `trial_termina_en` se guarda como `'YYYY-MM-DD HH24:MI:SS'` en UTC sin
 * sufijo de zona — sin el 'Z', `new Date(...)` lo interpretaría como hora
 * LOCAL de quien lo evalúe (el server en Railway, o el navegador de cada
 * persona), corriendo el vencimiento real según ese huso horario. */
function fechaUtc(valor: string): Date {
  return new Date(valor.replace(" ", "T") + "Z");
}

export function trialVigente(trialTerminaEn: string | null): boolean {
  // Sin fecha cargada (no debería pasar): nunca se bloquea por un dato faltante.
  if (!trialTerminaEn) return true;
  return fechaUtc(trialTerminaEn) > new Date();
}

export function suscripcionActiva(f: EstadoFacturacion | null | undefined): boolean {
  if (!f) return false;
  if (f.exentoFacturacion) return true;
  if (f.estadoSuscripcion === "active") return true;
  if (f.estadoSuscripcion === "trialing") return trialVigente(f.trialTerminaEn);
  // 'past_due' | 'canceled' | cualquier valor futuro desconocido: nunca se
  // asume activo por un estado que no se reconoce.
  return false;
}
