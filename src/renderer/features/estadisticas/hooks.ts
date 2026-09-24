import { useQuery } from "@tanstack/react-query";
import type { RangoFechas } from "@shared/types/entities";

const CLAVE = "estadisticas";

export function useKpisPeriodo(rango: RangoFechas) {
  return useQuery({ queryKey: [CLAVE, "kpis", rango], queryFn: () => window.densz.estadisticasKpis(rango) });
}

/** Sin ningún importe — la usa Inicio, que nunca queda detrás de la
 * protección opcional por contraseña (a diferencia del resto de este
 * archivo, que solo alimenta la pantalla de Estadísticas). */
export function useResumenOperativo(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "resumen-operativo", rango],
    queryFn: () => window.densz.estadisticasResumenOperativo(rango)
  });
}

export function useTrabajosPorDia(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "trabajos-por-dia", rango],
    queryFn: () => window.densz.estadisticasTrabajosPorDia(rango)
  });
}

export function useIngresosPorOdontologo(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "ingresos-por-odontologo", rango],
    queryFn: () => window.densz.estadisticasIngresosPorOdontologo(rango)
  });
}

export function useTrabajosPorCategoria(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "trabajos-por-categoria", rango],
    queryFn: () => window.densz.estadisticasTrabajosPorCategoria(rango)
  });
}

export function useEvolucion(rango: RangoFechas) {
  return useQuery({ queryKey: [CLAVE, "evolucion", rango], queryFn: () => window.densz.estadisticasEvolucion(rango) });
}

export function useRankingOdontologos(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "ranking-odontologos", rango],
    queryFn: () => window.densz.estadisticasRankingOdontologos(rango)
  });
}

export function useRankingClinicas(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "ranking-clinicas", rango],
    queryFn: () => window.densz.estadisticasRankingClinicas(rango)
  });
}

export function usePrestacionesRanking(rango: RangoFechas) {
  return useQuery({
    queryKey: [CLAVE, "prestaciones-ranking", rango],
    queryFn: () => window.densz.estadisticasPrestacionesRanking(rango)
  });
}

export function useSaldosPendientesTop(limite = 20) {
  return useQuery({
    queryKey: [CLAVE, "saldos-pendientes-top", limite],
    queryFn: () => window.densz.estadisticasSaldosPendientesTop(limite)
  });
}
