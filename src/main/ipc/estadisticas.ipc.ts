import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { RangoFechas } from "../../shared/types/entities";

export function registrarHandlersEstadisticas(): void {
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RESUMEN_OPERATIVO, (_e, rango: RangoFechas) => apiClient.estadisticasResumenOperativo(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_KPIS, (_e, rango: RangoFechas) => apiClient.estadisticasKpis(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_DIA, (_e, rango: RangoFechas) => apiClient.estadisticasTrabajosPorDia(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_INGRESOS_POR_ODONTOLOGO, (_e, rango: RangoFechas) =>
    apiClient.estadisticasIngresosPorOdontologo(rango)
  );
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_CATEGORIA, (_e, rango: RangoFechas) =>
    apiClient.estadisticasTrabajosPorCategoria(rango)
  );
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_EVOLUCION, (_e, rango: RangoFechas) => apiClient.estadisticasEvolucion(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RANKING_ODONTOLOGOS, (_e, rango: RangoFechas) => apiClient.estadisticasRankingOdontologos(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RANKING_CLINICAS, (_e, rango: RangoFechas) => apiClient.estadisticasRankingClinicas(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_PRESTACIONES_RANKING, (_e, rango: RangoFechas) => apiClient.estadisticasPrestacionesRanking(rango));
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_SALDOS_PENDIENTES_TOP, (_e, limite?: number) => apiClient.estadisticasSaldosPendientesTop(limite));
}
