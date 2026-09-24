// Orden de dibujo del odontograma, de izquierda a derecha de la pantalla
// (vista del profesional mirando de frente al paciente).
export const FILA_SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const FILA_INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export const TODAS_LAS_PIEZAS = [...FILA_SUPERIOR, ...FILA_INFERIOR];

export interface Cuadrante {
  id: 1 | 2 | 3 | 4;
  etiqueta: string;
  piezas: number[];
}

export const CUADRANTES: Cuadrante[] = [
  { id: 1, etiqueta: "Sup. der.", piezas: [18, 17, 16, 15, 14, 13, 12, 11] },
  { id: 2, etiqueta: "Sup. izq.", piezas: [21, 22, 23, 24, 25, 26, 27, 28] },
  { id: 4, etiqueta: "Inf. der.", piezas: [48, 47, 46, 45, 44, 43, 42, 41] },
  { id: 3, etiqueta: "Inf. izq.", piezas: [31, 32, 33, 34, 35, 36, 37, 38] }
];

export function alternarPieza(seleccionadas: number[], pieza: number): number[] {
  return seleccionadas.includes(pieza)
    ? seleccionadas.filter((p) => p !== pieza)
    : [...seleccionadas, pieza].sort((a, b) => a - b);
}

/** Selecciona/deselecciona un cuadrante completo de un solo golpe: si ya
 * está todo seleccionado, lo deselecciona; si no, completa lo que falte. */
export function alternarCuadrante(seleccionadas: number[], piezasCuadrante: number[]): number[] {
  const set = new Set(seleccionadas);
  const todasSeleccionadas = piezasCuadrante.every((p) => set.has(p));
  if (todasSeleccionadas) {
    piezasCuadrante.forEach((p) => set.delete(p));
  } else {
    piezasCuadrante.forEach((p) => set.add(p));
  }
  return Array.from(set).sort((a, b) => a - b);
}
