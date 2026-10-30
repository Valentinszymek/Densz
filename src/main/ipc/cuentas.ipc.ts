import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { abrirPdfDescargado } from "../services/pdfLocalViewer";
import { IPC_CHANNELS, type PeriodoMesDto } from "../../shared/types/ipc-contracts";

export function registrarHandlersCuentas(): void {
  ipcMain.handle(
    IPC_CHANNELS.CUENTAS_TIENE_PAGOS,
    (_e, titular: { odontologoId?: number | null; clinicaId?: number | null }) => apiClient.cuentasTienePagos(titular)
  );

  ipcMain.handle(IPC_CHANNELS.CUENTAS_SALDOS, (_e, odontologoId: number) => apiClient.cuentasSaldos(odontologoId));
  ipcMain.handle(IPC_CHANNELS.CUENTAS_SALDOS_CLINICA, (_e, clinicaId: number) => apiClient.cuentasSaldosClinica(clinicaId));
  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS, () => apiClient.cuentasListarSaldos());
  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_SALDOS_CLINICAS, () => apiClient.cuentasListarSaldosClinicas());
  ipcMain.handle(IPC_CHANNELS.CUENTAS_MOVIMIENTOS, (_e, odontologoId: number) => apiClient.cuentasMovimientos(odontologoId));
  ipcMain.handle(IPC_CHANNELS.CUENTAS_MOVIMIENTOS_CLINICA, (_e, clinicaId: number) => apiClient.cuentasMovimientosClinica(clinicaId));
  ipcMain.handle(IPC_CHANNELS.CUENTAS_RESUMEN_MES, (_e, odontologoId: number, periodo: PeriodoMesDto) =>
    apiClient.cuentasResumenMes(odontologoId, periodo)
  );
  ipcMain.handle(IPC_CHANNELS.CUENTAS_RESUMEN_MES_CLINICA, (_e, clinicaId: number, periodo: PeriodoMesDto) =>
    apiClient.cuentasResumenMesClinica(clinicaId, periodo)
  );

  // Antes abría el PDF en una ventana nativa de inmediato, apenas
  // generado; la UI compartida (useImprimirEstadoDeCuenta, igual en las
  // dos plataformas) nunca esperó ese efecto — solo muestra un toast y
  // deja que la persona abra el PDF que quiera desde la lista de
  // resúmenes (CUENTAS_VER_PDF_RESUMEN), igual que ya funciona en la web.
  ipcMain.handle(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO, (_e, odontologoId: number, periodo: PeriodoMesDto) =>
    apiClient.cuentasImprimirEstadoDeCuenta(odontologoId, periodo)
  );
  ipcMain.handle(IPC_CHANNELS.CUENTAS_IMPRIMIR_ESTADO_CLINICA, (_e, clinicaId: number, periodo: PeriodoMesDto) =>
    apiClient.cuentasImprimirEstadoDeCuentaClinica(clinicaId, periodo)
  );

  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES, (_e, odontologoId: number) => apiClient.cuentasListarResumenes(odontologoId));
  ipcMain.handle(IPC_CHANNELS.CUENTAS_LISTAR_RESUMENES_CLINICA, (_e, clinicaId: number) =>
    apiClient.cuentasListarResumenesClinica(clinicaId)
  );

  ipcMain.handle(IPC_CHANNELS.CUENTAS_VER_PDF_RESUMEN, (_e, resumenId: number) =>
    abrirPdfDescargado(`/cuentas/resumenes/${resumenId}/pdf`, `resumen-${resumenId}.pdf`, "Resumen mensual")
  );
}
