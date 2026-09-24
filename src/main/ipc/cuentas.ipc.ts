import { ipcMain, BrowserWindow } from "electron";
import type { Pool } from "pg";
import {
  obtenerSaldos,
  obtenerSaldosClinica,
  listarMovimientos,
  listarMovimientosClinica,
  listarSaldosTodos,
  listarSaldosClinicasTodas,
  tienePagosRegistrados
} from "../db/repositories/movimientosRepo";
import { listarResumenesMensuales, obtenerResumenMensual } from "../db/repositories/resumenesMensualesRepo";
import { generarPdfEstadoCuenta, generarPdfEstadoCuentaClinica, calcularBloquesMes } from "../services/cuentaService";
import { requerirDesbloqueoProteccion } from "../services/proteccionService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres, DenszError } from "../utils/errors";
import { IPC_CHANNELS, type PeriodoMesDto } from "../../shared/types/ipc-contracts";

function abrirVentanaPdf(pdfPath: string, titulo = "Estado de cuenta"): void {
  const ventana = new BrowserWindow({
    width: 760,
    height: 900,
    title: titulo,
    webPreferences: { sandbox: true }
  });
  ventana.loadURL(`file://${pdfPath.replace(/\\/g, "/")}`);
}

export function registrarHandlersCuentas(db: Pool): void {
  // Único canal de este archivo sin protección: devuelve solo un booleano
  // (nunca un importe) y lo usa Nuevo Trabajo para la advertencia de "esta
  // cuenta tiene pagos registrados" al editar una OT facturada — eso no es
  // "entrar a Cuentas".
  ipcMain.handle(IPC_CHANNELS.CUENTAS_TIENE_PAGOS, (_e, titular: { odontologoId?: number | null; clinicaId?: number | null }) =>
    tienePagosRegistrados(db, { odontologoId: titular.odontologoId ?? null, clinicaId: titular.clinicaId ?? null })
  );

  // El resto de Cuentas sí queda detrás de la protección opcional (§4,
  // §10): se aplica en cada canal, no solo ocultando el componente.
  ipcMain.handle(IPC_CHANNELS.CUENTAS_SALDOS, async (_e, odontologoId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await obtenerSaldos(db, odontologoId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CUENTAS_SALDOS_CLINICA, async (_e, clinicaId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await obtenerSaldosClinica(db, clinicaId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS, async () => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarSaldosTodos(db);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS_CLINICAS, async () => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarSaldosClinicasTodas(db);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_MOVIMIENTOS, async (_e, odontologoId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarMovimientos(db, odontologoId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CUENTAS_MOVIMIENTOS_CLINICA, async (_e, clinicaId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarMovimientosClinica(db, clinicaId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_RESUMEN_MES, async (_e, odontologoId: number, periodo: PeriodoMesDto) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await calcularBloquesMes(db, { odontologoId, clinicaId: null }, periodo.anio, periodo.mes);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CUENTAS_RESUMEN_MES_CLINICA, async (_e, clinicaId: number, periodo: PeriodoMesDto) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await calcularBloquesMes(db, { odontologoId: null, clinicaId }, periodo.anio, periodo.mes);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO, async (_e, odontologoId: number, periodo: PeriodoMesDto) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      const usuarioId = getUsuarioActualId();
      const { pdfPath, resumenes } = await generarPdfEstadoCuenta(db, odontologoId, periodo.anio, periodo.mes, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar_resumen_mensual",
        entidad: "odontologos",
        entidadId: odontologoId,
        detalle: { anio: periodo.anio, mes: periodo.mes, resumenIds: resumenes.map((r) => r.id) }
      });
      abrirVentanaPdf(pdfPath, "Resumen mensual");
      return resumenes;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO_CLINICA, async (_e, clinicaId: number, periodo: PeriodoMesDto) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      const usuarioId = getUsuarioActualId();
      const { pdfPath, resumenes } = await generarPdfEstadoCuentaClinica(db, clinicaId, periodo.anio, periodo.mes, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar_resumen_mensual",
        entidad: "clinicas",
        entidadId: clinicaId,
        detalle: { anio: periodo.anio, mes: periodo.mes, resumenIds: resumenes.map((r) => r.id) }
      });
      abrirVentanaPdf(pdfPath, "Resumen mensual");
      return resumenes;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES, async (_e, odontologoId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarResumenesMensuales(db, { odontologoId, clinicaId: null });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES_CLINICA, async (_e, clinicaId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      return await listarResumenesMensuales(db, { odontologoId: null, clinicaId });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CUENTAS_VER_PDF_RESUMEN, async (_e, resumenId: number) => {
    try {
      requerirPermiso(PERMISOS.CUENTAS_VER);
      await requerirDesbloqueoProteccion(db);
      const resumen = await obtenerResumenMensual(db, resumenId);
      if (!resumen || !resumen.pdfPath) throw new DenszError("No se encontró el PDF de ese resumen.");
      abrirVentanaPdf(resumen.pdfPath, "Resumen mensual");
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
