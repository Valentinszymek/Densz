import { useQuery } from "@tanstack/react-query";
import type { EstadoSistema } from "@shared/types/ipc-contracts";

export function useEstadoSistema() {
  return useQuery<EstadoSistema>({
    queryKey: ["system-status"],
    queryFn: () => window.densz.obtenerEstadoSistema(),
    refetchInterval: 60_000
  });
}
