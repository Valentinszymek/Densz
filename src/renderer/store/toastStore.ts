import { create } from "zustand";

export type TonoToast = "info" | "exito" | "error";

export interface ToastItem {
  id: number;
  titulo: string;
  descripcion?: string;
  tono: TonoToast;
}

interface ToastStore {
  toasts: ToastItem[];
  agregar: (t: Omit<ToastItem, "id">) => void;
  quitar: (id: number) => void;
}

let siguienteId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  agregar: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: siguienteId++ }] })),
  quitar: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}));

/** API imperativa: toast({ titulo, descripcion, tono }) — usable desde cualquier módulo. */
export function toast(opts: { titulo: string; descripcion?: string; tono?: TonoToast }): void {
  useToastStore.getState().agregar({ tono: "info", ...opts });
}
