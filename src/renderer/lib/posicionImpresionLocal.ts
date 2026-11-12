import type { PosicionTicketA4 } from "@shared/types/entities";

/**
 * Esquina de la hoja A4 que le toca al PRÓXIMO comprobante en esta
 * computadora (localStorage, nunca la base — mismo criterio que
 * tamanoImpresionLocal.ts) — solo importa en modo "a4" (Configuración →
 * Tamaño de impresión): permite que una misma hoja A4 rinda hasta 4
 * comprobantes (se corta cada esquina ya impresa y se reinserta el resto
 * de la hoja) en vez de tirar 3/4 de la hoja por cada uno.
 *
 * Avanza SOLO al imprimir de verdad (nunca al mirar "Ver PDF" — eso no
 * gasta papel) — ver avanzarPosicionImpresionLocal. Si se desincroniza
 * con el papel real (ej. una impresión que se canceló a mitad), se puede
 * corregir a mano desde Configuración.
 */

const CLAVE = "densz.posicionImpresion.local";

const ORDEN: PosicionTicketA4[] = ["arriba-izquierda", "arriba-derecha", "abajo-izquierda", "abajo-derecha"];

function esPosicionValida(valor: string | null): valor is PosicionTicketA4 {
  return !!valor && (ORDEN as string[]).includes(valor);
}

/** La esquina que le toca al PRÓXIMO comprobante — arriba-izquierda por
 * defecto (primera vez, o storage no disponible). */
export function leerPosicionImpresionLocal(): PosicionTicketA4 {
  try {
    const valor = localStorage.getItem(CLAVE);
    return esPosicionValida(valor) ? valor : "arriba-izquierda";
  } catch {
    return "arriba-izquierda";
  }
}

export function guardarPosicionImpresionLocal(valor: PosicionTicketA4): void {
  try {
    localStorage.setItem(CLAVE, valor);
  } catch {
    // No es crítico si no se puede guardar — ver tamanoImpresionLocal.ts.
  }
}

/** Para "Imprimir": devuelve la esquina que le toca a ESTE comprobante
 * (la actual) y de paso deja guardada la siguiente, lista para el que
 * viene. "Ver PDF" nunca debe llamar a esto — usar leerPosicionImpresionLocal. */
export function avanzarPosicionImpresionLocal(): PosicionTicketA4 {
  const actual = leerPosicionImpresionLocal();
  const siguiente = ORDEN[(ORDEN.indexOf(actual) + 1) % ORDEN.length];
  guardarPosicionImpresionLocal(siguiente);
  return actual;
}

export const ETIQUETA_POSICION: Record<PosicionTicketA4, string> = {
  "arriba-izquierda": "Arriba a la izquierda",
  "arriba-derecha": "Arriba a la derecha",
  "abajo-izquierda": "Abajo a la izquierda",
  "abajo-derecha": "Abajo a la derecha"
};
