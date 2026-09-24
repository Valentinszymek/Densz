/**
 * Nomenclatura FDI de piezas dentales, agrupada por cuadrante,
 * en el orden en que se dibuja el odontograma (de "afuera hacia adentro"
 * para los cuadrantes superiores, y viceversa para los inferiores).
 */
export const CUADRANTE_SUPERIOR_DERECHO = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const CUADRANTE_SUPERIOR_IZQUIERDO = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const CUADRANTE_INFERIOR_IZQUIERDO = [38, 37, 36, 35, 34, 33, 32, 31] as const;
export const CUADRANTE_INFERIOR_DERECHO = [41, 42, 43, 44, 45, 46, 47, 48] as const;

export const TODAS_LAS_PIEZAS_FDI: number[] = [
  ...CUADRANTE_SUPERIOR_DERECHO,
  ...CUADRANTE_SUPERIOR_IZQUIERDO,
  ...CUADRANTE_INFERIOR_IZQUIERDO,
  ...CUADRANTE_INFERIOR_DERECHO
];

export function esPiezaFdiValida(pieza: number): boolean {
  return TODAS_LAS_PIEZAS_FDI.includes(pieza);
}
