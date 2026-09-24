import { create } from "zustand";
import type { SesionActualDto } from "@shared/types/entities";

interface AuthStore {
  sesion: SesionActualDto | null;
  cargando: boolean;
  setSesion: (s: SesionActualDto | null) => void;
  setCargando: (c: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  sesion: null,
  cargando: true,
  setSesion: (sesion) => set({ sesion }),
  setCargando: (cargando) => set({ cargando })
}));

export function esAdministrador(): boolean {
  return useAuthStore.getState().sesion?.rolNombre === "ADMINISTRADOR";
}
