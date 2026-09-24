import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { FiltroAuditoriaDto } from "@shared/types/entities";

export function useAuditoria(filtro: FiltroAuditoriaDto) {
  return useQuery({
    queryKey: ["auditoria", filtro],
    queryFn: () => window.densz.auditoriaListar(filtro),
    // Mantiene la página anterior en pantalla mientras llega la próxima
    // (cambiar de página/filtro no debe parpadear a una tabla vacía).
    placeholderData: keepPreviousData
  });
}

export function useOpcionesFiltroAuditoria() {
  return useQuery({
    queryKey: ["auditoria", "opcionesFiltro"],
    queryFn: () => window.densz.auditoriaOpcionesFiltro(),
    staleTime: 60_000
  });
}
