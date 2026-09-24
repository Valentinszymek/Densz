import { create } from "zustand";

interface UiStore {
  sidebarColapsado: boolean;
  alternarSidebar: () => void;
  busquedaAbierta: boolean;
  setBusquedaAbierta: (abierta: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarColapsado: false,
  alternarSidebar: () => set((s) => ({ sidebarColapsado: !s.sidebarColapsado })),
  busquedaAbierta: false,
  setBusquedaAbierta: (abierta) => set({ busquedaAbierta: abierta })
}));
