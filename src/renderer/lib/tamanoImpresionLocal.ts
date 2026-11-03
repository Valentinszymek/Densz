import type { TamanoImpresionComprobante } from "@shared/types/entities";

/**
 * Preferencia de tamaño de impresión del comprobante, pero LOCAL a esta
 * computadora/navegador (localStorage, nunca la base) — pisa puntualmente
 * la preferencia del laboratorio (Configuración → Tamaño de impresión,
 * compartida por todos) solo para los pedidos de PDF que salen de acá.
 *
 * Por qué existe (2026-11-03): la preferencia del laboratorio es una sola
 * para todo el mundo, pero qué tamaño sale bien de verdad depende de cómo
 * esté configurada CADA impresora en CADA computadora en Windows — una
 * compu puede tener su impresora bien configurada para el tamaño del
 * ticket (ver guía en Configuración) y otra no. Esto permite que cada
 * compu elija "ticket" o "a4" para sí misma, sin afectar lo que ve
 * cualquier otra persona/compu que abra el mismo comprobante.
 */

const CLAVE = "densz.tamanoImpresion.local";

export function leerTamanoImpresionLocal(): TamanoImpresionComprobante | null {
  try {
    const valor = localStorage.getItem(CLAVE);
    return valor === "ticket" || valor === "a4" ? valor : null;
  } catch {
    // localStorage puede no estar disponible (ventana privada, storage
    // bloqueado) — sin preferencia local, se usa la del laboratorio.
    return null;
  }
}

export function guardarTamanoImpresionLocal(valor: TamanoImpresionComprobante | null): void {
  try {
    if (valor) localStorage.setItem(CLAVE, valor);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Ver comentario arriba — no es crítico si no se puede guardar.
  }
}
