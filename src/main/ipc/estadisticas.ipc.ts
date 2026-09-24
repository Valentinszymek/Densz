import { ipcMain } from "electron";
import type { Pool } from "pg";
import {
  obtenerKpisPeriodo,
  obtenerResumenOperativo,
  trabajosPorDia,
  ingresosPorOdontologo,
  trabajosPorCategoria,
  obtenerEvolucion,
  rankingOdontologos,
  rankingClinicas,
  prestacionesRanking,
  saldosPendientesTop
} from "../db/repositories/estadisticasRepo";
import { requerirDesbloqueoProteccion } from "../services/proteccionService";
import { requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import type { RangoFechas } from "../../shared/types/entities";

export function registrarHandlersEstadisticas(db: Pool): void {
  // Resumen operativo: a propósito el ÚNICO canal de este archivo sin
  // protección — es el que alimenta el "Resumen operativo" de Inicio, y
  // no devuelve ningún importe (§ Inicio nunca queda detrás de la
  // protección opcional por contraseña).
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RESUMEN_OPERATIVO, (_e, rango: RangoFechas) => obtenerResumenOperativo(db, rango));

  // El resto de Estadísticas sí queda detrás de la protección opcional
  // (§3, §10): cuando está activada y la sesión no se desbloqueó todavía,
  // cualquiera de estos canales rechaza la llamada — la protección se
  // aplica al acceso real a los datos, no solo a ocultar el componente.
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_KPIS, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await obtenerKpisPeriodo(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_DIA, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await trabajosPorDia(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_INGRESOS_POR_ODONTOLOGO, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await ingresosPorOdontologo(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_TRABAJOS_POR_CATEGORIA, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await trabajosPorCategoria(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_EVOLUCION, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await obtenerEvolucion(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RANKING_ODONTOLOGOS, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await rankingOdontologos(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_RANKING_CLINICAS, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await rankingClinicas(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_PRESTACIONES_RANKING, async (_e, rango: RangoFechas) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await prestacionesRanking(db, rango);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.ESTADISTICAS_SALDOS_PENDIENTES_TOP, async (_e, limite?: number) => {
    try {
      requerirPermiso(PERMISOS.ESTADISTICAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await saldosPendientesTop(db, limite ?? 20);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
