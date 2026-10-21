import type { Moneda } from "@shared/types/entities";

/** Default razonable sin geo-IP (no hay servicio de geolocalización
 * configurado): si el huso horario del navegador es de Argentina, ARS;
 * si no, USD — siempre con un toggle manual al lado para corregirlo.
 * Usado tanto en la landing (Bienvenida.tsx) como en la pantalla de
 * suscripción (SeccionSuscripcion.tsx). */
export function monedaPorDefecto(): Moneda {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith("America/Argentina") ? "ARS" : "USD";
  } catch {
    return "USD";
  }
}
